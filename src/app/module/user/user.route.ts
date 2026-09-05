import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { UserController } from "./user.controller";

const router = Router();

router.patch(
  "/profile-image",
  auth(Role.CUSTOMER, Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
  upload.single("profileImage"),
  UserController.uploadProfileImage,
);

// Only Admin Can Delete User
router.patch("/:userId", auth(Role.ADMIN), UserController.deleteUserByID);

export const UserRoutes = router;
