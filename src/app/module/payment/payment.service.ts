import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";

// GET MY PAYMENTS (CUSTOMER)

const getMyPayments = async (user: RequestUser) => {
  // CHECK CUSTOMER
  if (user.role !== Role.CUSTOMER) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Customer Can View Own Payments",
    );
  }

  const payments = await prisma.payment.findMany({
    where: {
      shipment: {
        senderId: user.userId,
      },
    },

    include: {
      shipment: {
        select: {
          id: true,
          status: true,

          senderId: true,
          senderName: true,
          senderEmail: true,
          senderPhone: true,

          receiverName: true,
          receiverEmail: true,
          receiverPhone: true,
          receiverAddress: true,
          receiverCity: true,
          receiverDistrict: true,
          receiverDivision: true,

          parcelName: true,
          weight: true,
          description: true,

          deliveryCharge: true,

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

          createdAt: true,
          updatedAt: true,
        },
      },
    },

    omit: {
      gatewayResponse: true,
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  return payments;
};

// GET ALL PAYMENTS
// Admin can see all payments

const getAllPayments = async (user: RequestUser) => {
  // CHECK SUPER ADMIN
  if (user.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Super Admin Can View All Payments",
    );
  }

  const payments = await prisma.payment.findMany({
    select: {
      id: true,
      amount: true,
      status: true,
      bkashTrxId: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,

      shipment: {
        select: {
          id: true,
          status: true,

          senderId: true,
          senderName: true,
          senderEmail: true,
          senderPhone: true,

          receiverName: true,
          receiverEmail: true,
          receiverPhone: true,
          receiverAddress: true,
          receiverCity: true,
          receiverDistrict: true,
          receiverDivision: true,

          parcelName: true,
          weight: true,
          description: true,

          deliveryCharge: true,

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

          createdAt: true,
          updatedAt: true,
        },
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });

  return payments;
};
// GET PAYMENT BY ID
// Customer = own payment
// Admin = any payment

const getPaymentById = async (paymentId: string, user: RequestUser) => {
  const payment = await prisma.payment.findUnique({
    where: {
      id: paymentId,
    },

    include: {
      shipment: {
        include: {
          originHub: true,
          destinationHub: true,
        },
      },
    },
  });

  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
  }

  // CUSTOMER CAN ONLY SEE OWN PAYMENT
  if (user.role === Role.CUSTOMER) {
    if (payment.shipment.senderId !== user.userId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You Are Not Allowed To View This Payment",
      );
    }
  }

  // ONLY CUSTOMER OR ADMIN
  if (user.role !== Role.CUSTOMER && user.role !== Role.ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You Are Not Allowed To View Payments",
    );
  }

  return payment;
};

export const PaymentService = {
  getMyPayments,
  getAllPayments,
  getPaymentById,
};
