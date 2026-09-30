import httpStatus from "http-status";
import {
  HubStatus,
  PaymentStatus,
  Role,
  ShipmentStatus,
  UserStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
  type ICreateShipmentPayload,
  type IDeliveryChargeQuoteQuery,
  type IGetHubShipmentsQuery,
} from "./shipment.interface";
import { createBkashPayment, executeBkashPayment } from "../../lib/bkash";
import {
  calculateDeliveryCharge,
  getDeliveryChargeQuote as getQuote,
} from "../../lib/deliveryCharge";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";

/* ==========================================
   CONSTANTS
========================================== */

const BKASH_PAYMENT_METHOD = "bkash";
const BKASH_CALLBACK_PATH = "/shipments/payment/callback";
const FRONTEND_PAYMENT_PATH = "/dashboard/shipments/payment";

//  STATUSES A PARCEL CAN NO LONGER LEAVE

const CLOSED_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.DELIVERED,
  ShipmentStatus.FAILED_DELIVERY,
  ShipmentStatus.CANCELLED,
];

//  GATEWAY RESPONSE CONTAINS SENSITIVE TOKENIZED CHECKOUT DATA

const SAFE_PAYMENT_SELECT = {
  id: true,
  status: true,
  amount: true,
  currency: true,
  paymentGateway: true,
  merchantInvoiceNumber: true,
  bkashPaymentId: true,
  bkashTrxId: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SAFE_HUB_SELECT = {
  id: true,
  hubCode: true,
  name: true,
  city: true,
  district: true,
  division: true,
  address: true,
  phone: true,
} as const;

//  DECIMAL -> STRING SO THE FRONTEND NEVER LOSES PRECISION

const serializeShipment = <T extends {
  deliveryCharge: unknown;
  payment?: { amount: unknown } | null;
}>(shipment: T) => {
  return {
    ...shipment,
    deliveryCharge: String(shipment.deliveryCharge),
    payment: shipment.payment
      ? {
          ...shipment.payment,
          amount: String(shipment.payment.amount),
        }
      : shipment.payment,
  };
};

/* ==========================================
   GUARDS
========================================== */

const getActiveStaffWithHub = async (user: RequestUser) => {
  const staff = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
  });

  if (!staff || staff.role !== Role.STAFF) {
    throw new AppError(httpStatus.FORBIDDEN, "Only Staff Can Perform This Action");
  }

  if (staff.status !== UserStatus.ACTIVE) {
    throw new AppError(httpStatus.FORBIDDEN, "Your Account Is Not Active");
  }

  if (!staff.hubId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You Are Not Assigned To Any Hub",
    );
  }

  return staff;
};

const getStaffHubOrThrow = async (hubId: string) => {  const hub = await prisma.hub.findUnique({
    where: {
      id: hubId,
    },
  });

  if (!hub || hub.deletedAt || hub.status !== HubStatus.ACTIVE) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Your Hub Is Not Active. Please Contact An Admin.",
    );
  }

  return hub;
};

/* ==========================================
   DELIVERY CHARGE QUOTE (BACKEND AUTHORITATIVE)
========================================== */

const getDeliveryChargeQuote = async (
  query: IDeliveryChargeQuoteQuery,
  user: RequestUser,
) => {
  if (user.role !== Role.STAFF && user.role !== Role.CUSTOMER) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You Are Not Allowed To Check Delivery Charge",
    );
  }

  const hub = await prisma.hub.findUnique({
    where: {
      id: query.destinationHubId,
    },

    select: {
      id: true,
      hubCode: true,
      name: true,
      city: true,
      district: true,
      division: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!hub) {
    throw new AppError(httpStatus.NOT_FOUND, "Destination Hub Not Found");
  }

  if (hub.deletedAt || hub.status !== HubStatus.ACTIVE) {
    throw new AppError(httpStatus.BAD_REQUEST, "Destination Hub Is Not Active");
  }

  return {
    ...getQuote({
      division: hub.division,
      weightKg: query.weight,
    }),

    destinationHub: {
      id: hub.id,
      hubCode: hub.hubCode,
      name: hub.name,
      city: hub.city,
      district: hub.district,
      division: hub.division,
    },
  };
};

/* ==========================================
   CREATE SHIPMENT (STAFF)
========================================== */

const createShipment = async (
  payload: ICreateShipmentPayload,
  user: RequestUser,
) => {
  //  STAFF + ACTIVE ORIGIN HUB

  const staff = await getActiveStaffWithHub(user);
  const staffHubId = staff.hubId as string;
  const originHub = await getStaffHubOrThrow(staffHubId);

  //  SENDER

  const sender = await prisma.user.findUnique({
    where: {
      id: payload.senderId,
    },
  });

  if (!sender || sender.role !== Role.CUSTOMER) {
    throw new AppError(httpStatus.NOT_FOUND, "Customer Not Found");
  }

  if (sender.status !== UserStatus.ACTIVE || sender.deletedAt) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This Customer Is Not Active",
    );
  }

  //  DESTINATION HUB

  const destinationHub = await prisma.hub.findUnique({
    where: {
      id: payload.destinationHubId,
    },
  });

  if (!destinationHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Destination Hub Not Found");
  }

  if (destinationHub.deletedAt || destinationHub.status !== HubStatus.ACTIVE) {
    throw new AppError(httpStatus.BAD_REQUEST, "Destination Hub Is Not Active");
  }

  if (destinationHub.id === originHub.id) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Origin And Destination Hub Cannot Be The Same",
    );
  }

  //  BACKEND CALCULATES THE CHARGE (NEVER TRUST THE CLIENT)

  const deliveryCharge = calculateDeliveryCharge({
    division: destinationHub.division,
    weightKg: payload.weight,
  });

  const amount = deliveryCharge.toFixed(2);

  //  SHIPMENT + PAYMENT ARE CREATED TOGETHER

  const shipment = await prisma.$transaction(async (tx) => {
    const newShipment = await tx.shipment.create({
      data: {
        status: ShipmentStatus.PENDING,

        senderId: sender.id,

        senderName: sender.name,
        senderEmail: sender.email,
        senderPhone: sender.phone,

        receiverName: payload.receiverName,
        receiverEmail: payload.receiverEmail,
        receiverPhone: payload.receiverPhone,
        receiverAddress: payload.receiverAddress,
        receiverCity: payload.receiverCity,
        receiverDistrict: payload.receiverDistrict,
        receiverDivision: payload.receiverDivision,

        parcelName: payload.parcelName,
        weight: payload.weight,
        description: payload.description,

        originHubId: originHub.id,
        destinationHubId: destinationHub.id,

        createdById: staff.id,

        deliveryCharge: amount,
      },
    });

    await tx.payment.create({
      data: {
        shipmentId: newShipment.id,
        amount,
        paymentGateway: BKASH_PAYMENT_METHOD,
        merchantInvoiceNumber: newShipment.id,
        payerReference: sender.email,
      },
    });

    return newShipment;
  });

  //  START THE BKASH SESSION

  const session = await startBkashSession({
    shipmentId: shipment.id,
    amount,
    payerReference: sender.email,
  });

  return {
    shipmentId: shipment.id,
    amount,
    deliveryCharge,
    paymentId: session.paymentId,
    paymentUrl: session.paymentUrl,
    paymentStatus: session.paymentStatus,
    paymentError: session.paymentError,
    canRetryPayment: !session.paymentUrl,
  };
};

/* ==========================================
   BKASH SESSION (SHARED BY CREATE + RETRY)
========================================== */

const startBkashSession = async (input: {
  shipmentId: string;
  amount: string;
  payerReference: string;
}) => {
  //  A RETRY MUST NEVER CREATE A SECOND PAYMENT ROW

  const payment = await prisma.payment.findUnique({
    where: {
      shipmentId: input.shipmentId,
    },
  });

  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
  }

  if (payment.status === PaymentStatus.PAID) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This Shipment Is Already Paid",
    );
  }

  if (payment.status === PaymentStatus.REFUNDED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This Payment Has Already Been Refunded",
    );
  }

  try {
    const bkashResult = await createBkashPayment({
      amount: input.amount,
      merchantInvoiceNumber: input.shipmentId,
      intent: "Sale",
      callbackURL: `${config.bkash_callback_url}${BKASH_CALLBACK_PATH}`,
    });

    //  GATEWAY RESPONSE IS STORED FOR AUDIT, LOCAL INVOICE STAYS THE SHIPMENT ID

    await prisma.payment.update({
      where: {
        id: payment.id,
      },

      data: {
        status: PaymentStatus.PENDING,
        bkashPaymentId: bkashResult.paymentID,
        gatewayResponse: bkashResult as object,
      },
    });

    return {
      paymentId: payment.id,
      paymentUrl: bkashResult.bkashURL,
      paymentStatus: PaymentStatus.PENDING,
      paymentError: null,
    };
  } catch (error) {
    //  BKASH IS DOWN -> THE SHIPMENT STAYS AND CAN BE RETRIED
    //  THE REAL REASON IS RETURNED SO THE UI CAN EXPLAIN IT

    const paymentError =
      error instanceof AppError
        ? error.message
        : "Bkash Payment Session Could Not Be Created";

    console.error("Bkash session could not be started:", paymentError);

    await prisma.payment.update({
      where: {
        id: payment.id,
      },

      data: {
        status: PaymentStatus.FAILED,
      },
    });

    return {
      paymentId: payment.id,
      paymentUrl: null,
      paymentStatus: PaymentStatus.FAILED,
      paymentError,
    };
  }
};

/* ==========================================
   RETRY PAYMENT
========================================== */

const retryPayment = async (shipmentId: string, user: RequestUser) => {
  const shipment = await prisma.shipment.findUnique({
    where: {
      id: shipmentId,
    },

    include: {
      payment: true,
    },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  if (!shipment.payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
  }

  //  ONLY THE SENDER OR THE CREATING STAFF CAN PAY

  const isSender = user.role === Role.CUSTOMER && shipment.senderId === user.userId;
  const isCreator = user.role === Role.STAFF && shipment.createdById === user.userId;

  if (!isSender && !isCreator) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You Are Not Allowed To Pay For This Shipment",
    );
  }

  if (shipment.status === ShipmentStatus.CANCELLED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This Shipment Has Been Cancelled",
    );
  }

  const session = await startBkashSession({
    shipmentId: shipment.id,
    amount: shipment.payment.amount.toFixed(2),
    payerReference: shipment.senderEmail,
  });

  return {
    shipmentId: shipment.id,
    amount: shipment.payment.amount.toFixed(2),
    paymentId: session.paymentId,
    paymentUrl: session.paymentUrl,
    paymentStatus: session.paymentStatus,
    paymentError: session.paymentError,
    canRetryPayment: !session.paymentUrl,
  };
};

/* ==========================================
   BKASH CALLBACK (PUBLIC, IDEMPOTENT)
========================================== */

const buildFrontendRedirect = (params: Record<string, string>) => {
  const search = new URLSearchParams(params).toString();

  return `${config.frontend_url}${FRONTEND_PAYMENT_PATH}?${search}`;
};

const shipmentPaymentCallback = async (
  query: Record<string, string | undefined>,
) => {
  const paymentID = query.paymentID;
  const status = query.status;

  //  THE PAYER MUST ALWAYS LAND ON A PAGE, NEVER ON A JSON ERROR
  //  AN UNUSABLE PAYMENT ID STILL REDIRECTS, THE GATEWAY IS NOT OUR ERR PAGE

  if (!paymentID) {
    return {
      redirectUrl: buildFrontendRedirect({
        status: "failure",
        message: "Payment Id Missing",
      }),
    };
  }

  if (!status) {
    return {
      redirectUrl: buildFrontendRedirect({
        status: "failure",
        message: "Payment Status Is Missing",
      }),
    };
  }

  //  FIND THE LOCAL PAYMENT BY THE GATEWAY ID

  const payment = await prisma.payment.findUnique({
    where: {
      bkashPaymentId: paymentID,
    },

    include: {
      shipment: true,
    },
  });

  if (!payment) {
    return {
      redirectUrl: buildFrontendRedirect({
        status: "failure",
        message: "Payment Not Found",
      }),
    };
  }

  //  ALREADY VERIFIED -> REDIRECT WITHOUT CHARGING TWICE

  if (payment.status === PaymentStatus.PAID) {
    return {
      redirectUrl: buildFrontendRedirect({
        status: "success",
        shipmentId: payment.shipmentId,
        amount: payment.amount.toFixed(2),
      }),
    };
  }

  //  CANCELLED BY THE USER

  if (status === "cancel" || status === "failure") {
    await prisma.payment.update({
      where: {
        id: payment.id,
      },

      data: {
        status:
          status === "cancel"
            ? PaymentStatus.CANCELLED
            : PaymentStatus.FAILED,
      },
    });

    return {
      redirectUrl: buildFrontendRedirect({
        status: status === "cancel" ? "cancel" : "failure",
        shipmentId: payment.shipmentId,
        canRetryPayment: "true",
      }),
    };
  }

  //  VERIFY WITH BKASH BEFORE TRUSTING THE REDIRECT
  //  THE PAYMENT ID IS THE UNIQUE TOKEN WE STORED, THE AMOUNT MUST MATCH
  //  AMOUNTS ARE COMPARED NUMERICALLY, BKASH MAY SEND "100" OR "100.00"
  //  A GATEWAY OUTAGE MUST NOT LEAVE THE PAYER ON A JSON ERROR PAGE

  let executedResult: Awaited<ReturnType<typeof executeBkashPayment>> | null =
    null;

  try {
    executedResult = await executeBkashPayment(paymentID);
  } catch (error) {
    const reason = error instanceof AppError ? error.message : "Verification Failed";

    console.error("Bkash execute failed:", reason);

    //  THE MONEY MAY STILL BE COLLECTED, SO THE PAYMENT STAYS RETRYABLE
    //  AND IS NOT MARKED AS SUCCESSFUL

    return {
      redirectUrl: buildFrontendRedirect({
        status: "failure",
        shipmentId: payment.shipmentId,
        canRetryPayment: "true",
        message: reason,
      }),
    };
  }

  const executedAmount = Number(executedResult.amount);
  const expectedAmount = Number(payment.amount);

  const isVerified =
    executedResult.success === true &&
    executedResult.status === "Complete" &&
    executedResult.paymentID === paymentID &&
    Number.isFinite(executedAmount) &&
    executedAmount === expectedAmount &&
    Boolean(executedResult.trxID);

  if (!isVerified) {
    await prisma.payment.update({
      where: {
        id: payment.id,
      },

      data: {
        status: PaymentStatus.FAILED,
        gatewayResponse: executedResult as object,
      },
    });

    return {
      redirectUrl: buildFrontendRedirect({
        status: "failure",
        shipmentId: payment.shipmentId,
        canRetryPayment: "true",
      }),
    };
  }

  //  ATOMIC SO A DOUBLE CALLBACK CANNOT DOUBLE-APPLY

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: { not: PaymentStatus.PAID },
      },

      data: {
        status: PaymentStatus.PAID,
        bkashTrxId: executedResult.trxID,
        paidAt: new Date().toISOString(),
        gatewayResponse: executedResult as object,
      },
    });

    if (claimed.count === 0) {
      return false;
    }

    await tx.shipment.update({
      where: {
        id: payment.shipmentId,
      },

      data: {
        status: ShipmentStatus.PICKUP_SCHEDULED,
      },
    });

    return true;
  });

  if (updated) {
    //  EMAIL MUST NEVER BREAK A SUCCESSFUL PAYMENT

    try {
      await transporter.sendMail({
        from: config.email_sender,
        to: payment.shipment.senderEmail,
        subject: "Shipment Payment Successful - Courier Service",
        text:
          `Your payment was successful and the parcel is scheduled for pickup.\n\n` +
          `Shipment ID: ${payment.shipmentId}\n` +
          `Amount Paid: ${executedResult.amount} BDT\n` +
          `Payment Method: bKash\n` +
          `Transaction ID: ${executedResult.trxID}`,
      });
    } catch {
      //  IGNORE EMAIL FAILURES
    }
  }

  return {
    redirectUrl: buildFrontendRedirect({
      status: "success",
      shipmentId: payment.shipmentId,
      amount: payment.amount.toFixed(2),
      trxID: executedResult.trxID,
    }),
  };
};

/* ==========================================
   LIFECYCLE
========================================== */

const receiveShipment = async (shipmentId: string, user: RequestUser) => {
  const staff = await getActiveStaffWithHub(user);

  const shipment = await prisma.shipment.findUnique({
    where: {
      id: shipmentId,
    },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  if (shipment.destinationHubId !== staff.hubId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "This Shipment Does Not Belong To Your Hub",
    );
  }

  //  IDEMPOTENT: ALREADY RECEIVED PARCELS RETURN THE CURRENT STATE

  if (shipment.status === ShipmentStatus.AT_DESTINATION_HUB) {
    return shipment;
  }

  if (
    CLOSED_STATUSES.includes(shipment.status)
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This Shipment Cannot Be Received Anymore",
    );
  }

  const updatedShipment = await prisma.shipment.update({
    where: {
      id: shipmentId,
    },

    data: {
      status: ShipmentStatus.AT_DESTINATION_HUB,
      receivedById: staff.id,
      receivedAt: new Date(),
    },
  });

  try {
    await transporter.sendMail({
      from: config.email_sender,
      to: shipment.receiverEmail,
      subject: "Your Parcel Has Arrived",
      text:
        `Your parcel has arrived at the destination hub.\n\n` +
        `Shipment ID: ${shipment.id}\n` +
        `You can collect your parcel from the destination hub.`,
    });
  } catch {
    //  IGNORE EMAIL FAILURES
  }

  return updatedShipment;
};

const deliverShipment = async (shipmentId: string, user: RequestUser) => {
  const staff = await getActiveStaffWithHub(user);

  const shipment = await prisma.shipment.findUnique({
    where: {
      id: shipmentId,
    },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  if (shipment.receivedById !== staff.id) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only The Receiving Staff Can Deliver This Shipment",
    );
  }

  if (shipment.status === ShipmentStatus.DELIVERED) {
    return shipment;
  }

  if (shipment.status !== ShipmentStatus.AT_DESTINATION_HUB) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Shipment Is Not Ready For Delivery",
    );
  }

  const updatedShipment = await prisma.shipment.update({
    where: {
      id: shipmentId,
    },

    data: {
      status: ShipmentStatus.DELIVERED,
      deliveredAt: new Date(),
    },
  });

  try {
    await transporter.sendMail({
      from: config.email_sender,
      to: shipment.receiverEmail,
      subject: "Parcel Delivered Successfully",
      text:
        `Your parcel has been delivered successfully.\n\n` +
        `Shipment ID: ${shipment.id}\n` +
        `Thank you for using our courier service.`,
    });
  } catch {
    //  IGNORE EMAIL FAILURES
  }

  return updatedShipment;
};

/* ==========================================
   READS
========================================== */

const getMyShipments = async (user: RequestUser) => {
  if (user.role !== Role.CUSTOMER) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Customer Can View Own Shipments",
    );
  }

  const shipments = await prisma.shipment.findMany({
    where: {
      senderId: user.userId,
    },

    include: {
      originHub: {
        select: SAFE_HUB_SELECT,
      },

      destinationHub: {
        select: SAFE_HUB_SELECT,
      },

      payment: {
        select: SAFE_PAYMENT_SELECT,
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  return shipments.map(serializeShipment);
};

const getHubShipments = async (
  user: RequestUser,
  query: IGetHubShipmentsQuery,
) => {
  const staff = await getActiveStaffWithHub(user);
  const searchTerm = query.searchTerm?.trim();

  const shipments = await prisma.shipment.findMany({
    where: {
      //  STAFF SEES SHIPMENTS OF THEIR OWN HUB (EITHER SIDE)
      //  USED WITH `AND` SO A SEARCH FILTER CANNOT REPLACE IT

      AND: [
        {
          OR: [
            { originHubId: staff.hubId as string },
            { destinationHubId: staff.hubId as string },
          ],
        },

        ...(query.status ? [{ status: query.status as ShipmentStatus }] : []),

        ...(searchTerm
          ? [
              {
                OR: [
                  { id: { contains: searchTerm, mode: "insensitive" as const } },
                  {
                    senderName: {
                      contains: searchTerm,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    senderEmail: {
                      contains: searchTerm,
                      mode: "insensitive" as const,
                    },
                  },
                  { senderPhone: { contains: searchTerm } },
                  {
                    receiverName: {
                      contains: searchTerm,
                      mode: "insensitive" as const,
                    },
                  },
                  { receiverPhone: { contains: searchTerm } },
                  {
                    parcelName: {
                      contains: searchTerm,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },

    include: {
      originHub: {
        select: SAFE_HUB_SELECT,
      },

      destinationHub: {
        select: SAFE_HUB_SELECT,
      },

      payment: {
        select: SAFE_PAYMENT_SELECT,
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  return shipments.map(serializeShipment);
};

const getShipmentById = async (shipmentId: string, user: RequestUser) => {
  const shipment = await prisma.shipment.findUnique({
    where: {
      id: shipmentId,
    },

    include: {
      originHub: {
        select: SAFE_HUB_SELECT,
      },

      destinationHub: {
        select: SAFE_HUB_SELECT,
      },

      payment: {
        select: SAFE_PAYMENT_SELECT,
      },
    },
  });

  if (!shipment) {
    throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
  }

  //  CUSTOMER: ONLY OWN SHIPMENT
  //  STAFF: ONLY HUB RELATED SHIPMENT
  //  ADMIN / SUPER ADMIN: EVERYTHING

  if (user.role === Role.CUSTOMER) {
    if (shipment.senderId !== user.userId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You Are Not Allowed To View This Shipment",
      );
    }
  } else if (user.role === Role.STAFF) {
    const staff = await prisma.user.findUnique({
      where: {
        id: user.userId,
      },

      select: {
        hubId: true,
      },
    });

    if (
      !staff?.hubId ||
      (shipment.originHubId !== staff.hubId &&
        shipment.destinationHubId !== staff.hubId)
    ) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You Are Not Allowed To View This Shipment",
      );
    }
  } else if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You Are Not Allowed To View This Shipment",
    );
  }

  //  TELLS THE UI WHICH ACTION IS AVAILABLE NEXT

  const isPaymentOpen =
    shipment.payment?.status === PaymentStatus.PENDING ||
    shipment.payment?.status === PaymentStatus.FAILED ||
    shipment.payment?.status === PaymentStatus.CANCELLED;

  const isInTransit =
    shipment.destinationHubId !== shipment.originHubId &&
    shipment.status !== ShipmentStatus.AT_DESTINATION_HUB &&
    !CLOSED_STATUSES.includes(shipment.status);

  return {
    ...serializeShipment(shipment),

    actions: {
      canPay: isPaymentOpen,
      canReceive: isInTransit,
      canDeliver: shipment.status === ShipmentStatus.AT_DESTINATION_HUB,
    },
  };
};

export const ShipmentService = {
  createShipment,
  getDeliveryChargeQuote,
  retryPayment,
  shipmentPaymentCallback,
  receiveShipment,
  deliverShipment,
  getMyShipments,
  getHubShipments,
  getShipmentById,
};
