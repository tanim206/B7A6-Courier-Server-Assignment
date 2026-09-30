import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateQuery, validateRequest } from "../../middleware/validateRequest";
import { ShipmentController } from "./shipment.controller";
import {
  createShipmentValidation,
  deliveryChargeQuoteValidation,
  hubShipmentsQueryValidation,
} from "./shipment.validation";

const router = Router();

//  PUBLIC - BKASH REDIRECTS THE USER HERE

router.get("/payment/callback", ShipmentController.shipmentPaymentCallback);

router.get(
  "/delivery-charge",
  auth(Role.STAFF, Role.CUSTOMER),
  validateQuery(deliveryChargeQuoteValidation),
  ShipmentController.getDeliveryChargeQuote,
);

router.get("/my", auth(Role.CUSTOMER), ShipmentController.getMyShipments);

router.get(
  "/",
  auth(Role.STAFF),
  validateQuery(hubShipmentsQueryValidation),
  ShipmentController.getHubShipments,
);

router.post(
  "/",
  auth(Role.STAFF),
  validateRequest(createShipmentValidation),
  ShipmentController.createShipment,
);

router.post(
  "/:shipmentId/payment/retry",
  auth(Role.STAFF, Role.CUSTOMER),
  ShipmentController.retryPayment,
);

router.get(
  "/:shipmentId",
  auth(Role.STAFF, Role.CUSTOMER, Role.ADMIN, Role.SUPER_ADMIN),
  ShipmentController.getShipmentById,
);

router.patch(
  "/:shipmentId/receive",
  auth(Role.STAFF),
  ShipmentController.receiveShipment,
);

router.patch(
  "/:shipmentId/deliver",
  auth(Role.STAFF),
  ShipmentController.deliverShipment,
);

export const ShipmentRoutes = router;
