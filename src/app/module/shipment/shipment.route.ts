import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { ShipmentController } from "./shipment.controller";

const router = Router();

router.post("/", auth(Role.STAFF), ShipmentController.createShipment);

router.get("/payment/callback", ShipmentController.shipmentPaymentCallback);

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
