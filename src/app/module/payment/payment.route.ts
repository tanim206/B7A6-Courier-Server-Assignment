import express from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { PaymentController } from "./payment.controller";

const router = express.Router();

// CUSTOMER - MY PAYMENTS
router.get(
  "/my-payments",
  auth(Role.CUSTOMER),
  PaymentController.getMyPayments,
);

// ADMIN - ALL PAYMENTS

router.get("/all", auth(Role.SUPER_ADMIN), PaymentController.getAllPayments);

// CUSTOMER / ADMIN - PAYMENT BY ID

router.get(
  "/:paymentId",
  auth(Role.CUSTOMER, Role.ADMIN, Role.SUPER_ADMIN),

  PaymentController.getPaymentById,
);

export const PaymentRoutes = router;
