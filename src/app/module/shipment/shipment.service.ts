import httpStatus from "http-status";
import {
  HubStatus,
  PaymentStatus,
  Role,
  ShipmentStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreateShipmentPayload } from "./shipment.interface";
import { getBkashIdToken } from "../../lib/bkash";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";

const createShipment = async (
  payload: ICreateShipmentPayload,
  user: RequestUser,
) => {
  // CHECK STAFF

  const staff = await prisma.user.findUnique({
    where: {
      id: user.userId,
      role: Role.STAFF,
    },
  });

  if (!staff) {
    throw new AppError(httpStatus.FORBIDDEN, "Only Staff Can Create Shipment");
  }

  if (!staff.hubId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Staff Is Not Assigned To Any Hub",
    );
  }

  // FIND SENDER

  const sender = await prisma.user.findUnique({
    where: {
      id: payload.senderId,
      role: Role.CUSTOMER,
    },
  });

  if (!sender) {
    throw new AppError(httpStatus.NOT_FOUND, "Customer Not Found");
  }

  // FIND DESTINATION HUB

  const destinationHub = await prisma.hub.findUnique({
    where: {
      id: payload.destinationHubId,
    },
  });

  if (!destinationHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Destination Hub Not Found");
  }

  if (destinationHub.status !== HubStatus.ACTIVE) {
    throw new AppError(httpStatus.BAD_REQUEST, "Destination Hub Is Not Active");
  }

  //  ORIGIN HUB = STAFF'S HUB

  const originHubId = staff.hubId;

  // if (originHubId === payload.destinationHubId) {
  //   throw new AppError(
  //     httpStatus.BAD_REQUEST,
  //     "Origin And Destination Hub Cannot Be Same",
  //   );
  // }

  //  FIXED DELIVERY CHARGE

  const DELIVERY_CHARGE = 300;
  const amount = DELIVERY_CHARGE.toFixed(2);

  //  CREATE SHIPMENT + PAYMENT

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
        weight: payload?.weight,
        description: payload.description,

        originHubId,
        destinationHubId: payload.destinationHubId,

        createdById: staff.id,

        deliveryCharge: amount,
      },
    });

    await tx.payment.create({
      data: {
        shipmentId: newShipment.id,
        amount: amount,
        merchantInvoiceNumber: newShipment.id,
        payerReference: sender.email,
      },
    });

    return newShipment;
  });

  //  BKASH TOKEN

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
  }

  //  CREATE BKASH PAYMENT

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/create`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },

      body: JSON.stringify({
        mode: "0011",
        payerReference: sender.email,
        callbackURL:
          `${config.bkash_callback_url}` + `/shipment/payment/callback`,

        amount,
        currency: "BDT",
        intent: "sale",

        merchantInvoiceNumber: shipment.id,
      }),
    },
  );

  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

  // ==========================================
  // 9. UPDATE PAYMENT
  // ==========================================

  await prisma.payment.update({
    where: {
      shipmentId: shipment.id,
    },

    data: {
      merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
      bkashPaymentId: bkashCreatePaymentResult.paymentID,
      gatewayResponse: bkashCreatePaymentResult,
    },
  });

  return {
    shipmentId: shipment.id,
    amount,
    paymentUrl: bkashCreatePaymentResult.bkashURL,
  };
};

const shipmentPaymentCallback = async (query: Record<string, any>) => {
  const paymentId = query.paymentID;
  const status = query.status;

  if (!paymentId) {
    throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
  }

  if (!status) {
    throw new AppError(httpStatus.BAD_REQUEST, "Payment Status Is Missing");
  }

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
  }

  // EXECUTE PAYMENT

  const executedPaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/execute`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },

      body: JSON.stringify({
        paymentID: paymentId,
      }),
    },
  );

  const executedPaymentResult = await executedPaymentResponse.json();

  // SUCCESS

  if (status === "success") {
    const shipment = await prisma.shipment.findUnique({
      where: {
        id: executedPaymentResult.merchantInvoiceNumber,
      },

      include: {
        sender: true,
        payment: true,
      },
    });

    if (!shipment) {
      throw new AppError(httpStatus.NOT_FOUND, "Shipment Not Found");
    }

    if (shipment.payment?.status === PaymentStatus.PAID) {
      return {
        redirectUrl:
          `${config.frontend_url}` +
          `/dashboard/shipments/payment?status=success`,
      };
    }

    await prisma.$transaction(async (tx) => {
      // PAYMENT PAID

      await tx.payment.update({
        where: {
          shipmentId: shipment.id,
        },

        data: {
          status: PaymentStatus.PAID,
          bkashTrxId: executedPaymentResult.trxID,
          paidAt: executedPaymentResult.paymentExecuteTime,
          gatewayResponse: executedPaymentResult,
        },
      });

      // SHIPMENT CONFIRMED

      await tx.shipment.update({
        where: {
          id: shipment.id,
        },

        data: {
          status: ShipmentStatus.PENDING,
        },
      });
    });

    // SEND EMAIL TO SENDER

    await transporter.sendMail({
      from: config.email_sender,
      to: shipment.senderEmail,
      subject: "Shipment Payment Successful - Courier Service",
      text:
        `Your shipment has been created successfully.\n\n` +
        `Shipment ID: ${shipment.id}\n` +
        `Amount Paid: ${executedPaymentResult.amount} BDT\n` +
        `Payment Method: bKash\n` +
        `Transaction ID: ${executedPaymentResult.trxID}`,
    });

    return {
      redirectUrl:
        `${config.frontend_url}` +
        `/dashboard/shipments/payment?status=success`,
    };
  }

  // FAILURE

  if (status === "failure") {
    await prisma.payment.update({
      where: {
        bkashPaymentId: paymentId,
      },

      data: {
        status: PaymentStatus.FAILED,

        gatewayResponse: executedPaymentResult,
      },
    });

    return {
      redirectUrl:
        `${config.frontend_url}` +
        `/dashboard/shipments/payment?status=failure`,
    };
  }

  // CANCEL

  if (status === "cancel") {
    await prisma.payment.update({
      where: {
        bkashPaymentId: paymentId,
      },

      data: {
        status: PaymentStatus.CANCELLED,

        gatewayResponse: executedPaymentResult,
      },
    });

    return {
      redirectUrl:
        `${config.frontend_url}` + `/dashboard/shipments/payment?status=cancel`,
    };
  }

  return {
    redirectUrl:
      `${config.frontend_url}` + `/dashboard/shipments/payment?status=failed`,
  };
};

const receiveShipment = async (shipmentId: string, user: RequestUser) => {
  const staff = await prisma.user.findUnique({
    where: {
      id: user.userId,
      role: Role.STAFF,
    },
  });

  if (!staff) {
    throw new AppError(httpStatus.FORBIDDEN, "Only Staff Can Receive Shipment");
  }

  if (!staff.hubId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Staff Is Not Assigned To Any Hub",
    );
  }

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

  // if (shipment.status !== ShipmentStatus.TRANSIT) {
  //   throw new AppError(httpStatus.BAD_REQUEST, "Shipment Is Not In Transit");
  // }

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

  // receiver email
  await transporter.sendMail({
    from: config.email_sender,
    to: shipment.receiverEmail,
    subject: "Your Parcel Has Arrived",
    text:
      `Your parcel has arrived at the destination hub.\n\n` +
      `Shipment ID: ${shipment.id}\n` +
      `You can collect your parcel from the destination hub.`,
  });

  return updatedShipment;
};

const deliverShipment = async (shipmentId: string, user: RequestUser) => {
  const staff = await prisma.user.findUnique({
    where: {
      id: user.userId,
      role: Role.STAFF,
    },
  });

  if (!staff) {
    throw new AppError(httpStatus.FORBIDDEN, "Only Staff Can Deliver Shipment");
  }

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

  // Receiver delivery confirmation
  await transporter.sendMail({
    from: config.email_sender,

    to: shipment.receiverEmail,
    subject: "Parcel Delivered Successfully",
    text:
      `Your parcel has been delivered successfully.\n\n` +
      `Shipment ID: ${shipment.id}\n` +
      `Thank you for using our courier service.`,
  });

  return updatedShipment;
};

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
        select: {
          id: true,
          hubCode: true,
          name: true,
          city: true,
          district: true,
          division: true,
        },
      },

      destinationHub: {
        select: {
          id: true,
          hubCode: true,
          name: true,
          city: true,
          district: true,
          division: true,
        },
      },

      payment: true,
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  return shipments;
};

export const ShipmentService = {
  createShipment,
  shipmentPaymentCallback,
  receiveShipment,
  deliverShipment,
  getMyShipments,
};
