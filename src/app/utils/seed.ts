// import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import { Role, UserStatus, AuthProvider } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import bcrypt from "bcryptjs";

export const seedSuperAdmin = async () => {
  try {
    // Check Existing Super Admin
    const isSuperAdminExist = await prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
      },
    });

    if (isSuperAdminExist) {
      console.log("Super Admin Already Exists!");
      return;
    }

    // Get Super Admin Credentials From ENV

    const name = config.super_admin_name;
    const email = config.super_admin_email?.trim().toLowerCase();
    const password = config.super_admin_password;

    if (!name || !email || !password) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Super Admin Name, Email, Password Missing In ENV File!!!",
      );
    }

    // Check Email Already Exists

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new AppError(
        httpStatus.CONFLICT,
        "A User With Super Admin Email Already Exists",
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    // Create Super Admin

    await prisma.user.create({
      data: {
        name,
        email,
        phone: "01700000000",
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        authProvider: AuthProvider.CREDENTIAL,
        emailVerified: true,
      },

      omit: {
        password: true,
      },
    });

    console.log(" Super Admin Created Successfully!");
    // console.log({
    //   id: superAdmin.id,
    //   name: superAdmin.name,
    //   email: superAdmin.email,
    //   role: superAdmin.role,
    //   phone: superAdmin.phone,
    // });
  } catch (error) {
    console.error(" Error Seeding Super Admin:", error);

    throw error;
  }
};
