import express from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateQuery, validateRequest } from "../../middleware/validateRequest";
import { AdminController } from "./admin.controller";
import {
  adminApplicationsQueryValidation,
  adminCreateHubValidation,
  adminHubsQueryValidation,
  adminPaymentsQueryValidation,
  adminReviewApplicationValidation,
  adminShipmentsQueryValidation,
  adminUpdateHubValidation,
  adminUpdateUserRoleValidation,
  adminUpdateUserStatusValidation,
  adminUsersQueryValidation,
} from "./admin.validation";

const router = express.Router();

//  EVERY ADMIN ROUTE REQUIRES AN ADMIN SESSION

router.use(auth(Role.ADMIN, Role.SUPER_ADMIN));

/* ==========================================
   DASHBOARD
   ========================================== */

router.get("/overview", AdminController.getAdminOverview);
router.get("/analytics", AdminController.getAdminAnalytics);

/* ==========================================
   USERS
   ========================================== */

router.get("/users", validateQuery(adminUsersQueryValidation), AdminController.getAllUsers);

router.patch(
  "/users/:userId/status",
  validateRequest(adminUpdateUserStatusValidation),
  AdminController.updateUserStatus,
);

router.patch(
  "/users/:userId/role",
  validateRequest(adminUpdateUserRoleValidation),
  AdminController.updateUserRole,
);

router.delete("/users/:userId", AdminController.deleteUser);

/* ==========================================
   HUBS
   ========================================== */

router.get("/hubs", validateQuery(adminHubsQueryValidation), AdminController.getAllHubs);

router.post("/hubs", validateRequest(adminCreateHubValidation), AdminController.createHub);

//  A HUB ID ROUTE IS REGISTERED AFTER THE COLLECTION ROUTES
//  SO IT CANNOT SHADOW /hubs/active OR /hubs/customers

router.get("/hubs/:hubId", AdminController.getHubById);

router.patch(
  "/hubs/:hubId",
  validateRequest(adminUpdateHubValidation),
  AdminController.updateHub,
);

router.delete("/hubs/:hubId", AdminController.deleteHub);

/* ==========================================
   HUB APPLICATIONS
   ========================================== */

router.get(
  "/hub-applications",
  validateQuery(adminApplicationsQueryValidation),
  AdminController.getHubApplications,
);

router.patch(
  "/hub-applications/:applicationId/review",
  validateRequest(adminReviewApplicationValidation),
  AdminController.reviewHubApplication,
);

/* ==========================================
   SHIPMENTS + PAYMENTS
   ========================================== */

router.get(
  "/shipments",
  validateQuery(adminShipmentsQueryValidation),
  AdminController.getAllShipments,
);

router.get(
  "/payments",
  validateQuery(adminPaymentsQueryValidation),
  AdminController.getAllPayments,
);

export const AdminRoutes = router;
