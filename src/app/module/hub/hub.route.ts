import express from "express";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { hubController } from "./hub.controller";

const router = express.Router();

//  ACTIVE HUBS - USED AS THE SHIPMENT DESTINATION SELECTOR

router.get("/active", auth(Role.STAFF, Role.CUSTOMER), hubController.getActiveHubs);

//  STAFF ONLY - CUSTOMER SEARCH FOR THE SHIPMENT SENDER SELECTOR

router.get("/customers/search", auth(Role.STAFF), hubController.searchCustomers);

router.post("/create-hub", auth(Role.ADMIN), hubController.createHubByAdmin);

router.post(
  "/application-form/:hubId",
  auth(Role.CUSTOMER),
  upload.fields([
    {
      name: "additionalFiles",
      maxCount: 10,
    },
  ]),
  hubController.applyHubApplication,
);

router.post(
  "/verify-hub-application",
  auth(Role.CUSTOMER),
  hubController.verifyHubApplicationEmail,
);

router.patch(
  "/application/:applicationId/review",
  auth(Role.ADMIN),
  hubController.reviewHubApplicationByAdmin,
);

router.patch("/:hubId", auth(Role.ADMIN), hubController.updateHubByAdmin);

export const HubRoutes = router;
