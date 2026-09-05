import { Router } from "express";

import { AuthController } from "./auth.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { UserValidation } from "./auth.validation";

const router = Router();

// Public Routes
router.post(
  "/register",
  validateRequest(UserValidation.CustomerRegistrationZodSchema),
  AuthController.registerCustomer,
);
router.post(
  "/verify-email",
  validateRequest(UserValidation.CustomerEmailVerifyZodSchema),
  AuthController.verifyCustomerEmail,
);
router.post(
  "/login",
  validateRequest(UserValidation.LoginZodSchema),
  AuthController.loginUser,
);
router.post("/google", AuthController.googleLogin);
router.post("/refresh-token", AuthController.refreshToken);
router.post(
  "/forgot-password",
  validateRequest(UserValidation.ForgotPasswordZodSchema),
  AuthController.forgotPassword,
);
router.post(
  "/reset-password",
  validateRequest(UserValidation.ResetPasswordZodSchema),
  AuthController.resetPassword,
);

// Protected Routes
router.get(
  "/me",
  auth(Role.CUSTOMER, Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
  AuthController.getMe,
);




export const AuthRoutes = router;
