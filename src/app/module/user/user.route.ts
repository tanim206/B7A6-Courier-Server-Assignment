import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { imageUpload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";

const router = Router();

const everyRole = auth(
  Role.CUSTOMER,
  Role.STAFF,
  Role.ADMIN,
  Role.SUPER_ADMIN,
);

router.patch(
  "/profile",
  everyRole,
  validateRequest(UserValidation.updateProfileZodSchema),
  UserController.updateProfile,
);

router.patch(
  "/profile-image",
  everyRole,
  imageUpload.single("profileImage"),
  UserController.uploadProfileImage,
);

// Only Admin Can Delete User
router.patch("/:userId", auth(Role.ADMIN), UserController.deleteUserByID);

export const UserRoutes = router;
