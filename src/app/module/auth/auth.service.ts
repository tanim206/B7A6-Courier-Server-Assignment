import bcrypt from "bcryptjs";
import crypto from "crypto";
import ejs from "ejs";
import type { TokenPayload } from "google-auth-library";
import httpStatus from "http-status";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import path from "path";

import {
  AuthProvider,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";

import config from "../../config";
import { googleClient } from "../../lib/googleAuth";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import { AppError } from "../../utils/AppError";
import { jwtUtils } from "../../utils/jwt";

import type {
  IForgotPasswordPayload,
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterCustomerPayload,
  IRequestUser,
  IResetPasswordPayload,
  IVerifyEmailPayload,
} from "./auth.interface";

const registerCustomer = async (payload: IRegisterCustomerPayload) => {
  const name = payload.name.trim();
  const email = payload.email.trim().toLowerCase();
  const phone = payload.phone.trim();
  const password = payload.password;

  // Check email
  const existingEmail = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingEmail) {
    throw new AppError(
      httpStatus.CONFLICT,
      "User with this email already exists",
    );
  }

  // Check phone
  const existingPhone = await prisma.user.findUnique({
    where: {
      phone,
    },
  });

  if (existingPhone) {
    throw new AppError(
      httpStatus.CONFLICT,
      "User with this phone number already exists",
    );
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(
    password,
    Number(config.bcrypt_salt_rounds),
  );

  // OTP expiration = 5 minutes
  const expirationSeconds = 5 * 60;

  // Generate OTP
  const otp = crypto.randomInt(100000, 1000000).toString();

  // Redis OTP key
  const otpKey = `customer-registration-otp:${email}`;

  await redisClient.set(otpKey, otp, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  // Store temporary registration data
  const registrationKey = `customer-registration-data:${email}`;

  const registrationData = {
    name,
    email,
    phone,
    password: hashedPassword,
  };

  await redisClient.set(registrationKey, JSON.stringify(registrationData), {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  // Email template
  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/registration-user-otp.ejs",
  );

  const templateData = {
    name,
    email,
    otp,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  // Send OTP
  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "Courier Account Email Verification",
    html,
  });

  return {
    message: "Registration successful. Please verify your email with the OTP.",
  };
};

const verifyCustomerEmail = async (payload: IVerifyEmailPayload) => {
  const email = payload.email.trim().toLowerCase();
  const otp = payload.otp.trim();

  // OTP key
  const otpKey = `customer-registration-otp:${email}`;

  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP is expired or invalid");
  }

  if (redisOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP does not match");
  }

  // Registration data key
  const registrationKey = `customer-registration-data:${email}`;

  const redisRegistrationData = await redisClient.get(registrationKey);

  if (!redisRegistrationData) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Registration data not found or expired",
    );
  }

  const registrationData = JSON.parse(redisRegistrationData) as {
    name: string;
    email: string;
    phone: string;
    password: string;
  };

  // Check again before creating user
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        {
          email: registrationData.email,
        },
        {
          phone: registrationData.phone,
        },
      ],
    },
  });

  if (existingUser) {
    throw new AppError(httpStatus.CONFLICT, "User already exists");
  }

  // Create user
  const createdUser = await prisma.user.create({
    data: {
      name: registrationData.name,
      email: registrationData.email,
      phone: registrationData.phone,
      password: registrationData.password,

      role: Role.CUSTOMER,
      status: UserStatus.ACTIVE,

      authProvider: AuthProvider.CREDENTIAL,
      emailVerified: true,
    },

    omit: {
      password: true,
    },
  });

  // Delete Redis data
  await redisClient.del(otpKey);
  await redisClient.del(registrationKey);

  // Welcome email
  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/welcome-email.ejs",
  );

  const templateData = {
    name: createdUser.name,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: createdUser.email,
    subject: "Welcome to Courier & Logistics",
    html,
  });

  // JWT payload
  const jwtPayload = {
    userId: createdUser.id,
    name: createdUser.name,
    email: createdUser.email,
    role: createdUser.role,
  };

  // Access token
  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  // Refresh token
  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    user: createdUser,
    accessToken,
    refreshToken,
  };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  // Blocked
  if (user.status === UserStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  // Deleted
  if (user.status === UserStatus.DELETED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
  }

  // Email verification
  if (!user.emailVerified) {
    throw new AppError(httpStatus.FORBIDDEN, "Please verify your email first");
  }

  // Google-only account
  if (!user.password && user.googleId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This account was created with Google. Please login with Google.",
    );
  }

  if (!user.password) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password login is not available for this account",
    );
  }

  // Compare password
  const isPasswordMatched = await bcrypt.compare(password, user.password);

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid credentials");
  }

  // Update last login
  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      lastLoginAt: new Date(),
    },
  });

  // JWT payload
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const existingUser = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    omit: {
      password: true,
    },

    include: {
      hub: true,
    },
  });

  if (!existingUser) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (existingUser.status === UserStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  if (existingUser.status === UserStatus.DELETED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
  }

  return existingUser;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: {
      id: data.userId,
    },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "User is inactive or not found",
    );
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const newAccessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const newRefreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googlePayload: TokenPayload | null | undefined = null;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });

    googlePayload = ticket.getPayload();
  } catch (error) {
    console.log("Google ID Token Verification Failed", error);

    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "Invalid or expired Google ID token",
    );
  }

  if (!googlePayload) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "Invalid or expired Google ID token",
    );
  }

  if (!googlePayload.email) {
    throw new AppError(httpStatus.BAD_REQUEST, "Google email not found");
  }

  if (!googlePayload.name) {
    throw new AppError(httpStatus.BAD_REQUEST, "Google user name not found");
  }

  if (!googlePayload.sub) {
    throw new AppError(httpStatus.BAD_REQUEST, "Google user ID not found");
  }

  const email = googlePayload.email.trim().toLowerCase();

  const googleId = googlePayload.sub;

  /* -----------------------------------------
     Find existing Google account
  ----------------------------------------- */

  let user = await prisma.user.findUnique({
    where: {
      googleId,
    },
  });

  /* -----------------------------------------
     If Google account does not exist
  ----------------------------------------- */

  if (!user) {
    const existingEmail = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    /* ---------------------------------------
       Existing credential account
    --------------------------------------- */

    if (existingEmail) {
      if (existingEmail.status === UserStatus.BLOCKED) {
        throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
      }

      if (existingEmail.status === UserStatus.DELETED) {
        throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
      }

      if (!existingEmail.emailVerified) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Please verify your email first",
        );
      }

      // Link Google account
      user = await prisma.user.update({
        where: {
          id: existingEmail.id,
        },

        data: {
          googleId,
        },

        // include: {
        //   hub: true,
        // },
      });
    } else {
      /* ---------------------------------------
         New Google Customer
      --------------------------------------- */

      user = await prisma.user.create({
        data: {
          name: googlePayload.name,
          email,
          googleId,
          authProvider: AuthProvider.GOOGLE,
          phone: "", // Google login does not provide phone number
          role: Role.CUSTOMER,
          status: UserStatus.ACTIVE,

          emailVerified: true,
          lastLoginAt: new Date(),
        },

        // include: {
        //   hub: true,
        // },
      });
    }
  }

  /* -----------------------------------------
     Account status check
  ----------------------------------------- */

  if (user.status === UserStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  if (user.status === UserStatus.DELETED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
  }

  /* -----------------------------------------
     Update last login
  ----------------------------------------- */

  user = await prisma.user.update({
    where: {
      id: user.id,
    },

    data: {
      lastLoginAt: new Date(),
    },

    // include: {
    //   hub: true,
    // },
  });

  /* -----------------------------------------
     JWT
  ----------------------------------------- */

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    user,
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User does not exist");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  if (user.status === UserStatus.DELETED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
  }

  if (!user.emailVerified) {
    throw new AppError(httpStatus.FORBIDDEN, "Please verify your email first");
  }

  // Google-only account
  if (!user.password && user.googleId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This account was created with Google. Password reset is not available.",
    );
  }

  if (!user.password) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password reset is not available for this account",
    );
  }

  const otp = crypto.randomInt(100000, 1000000).toString();

  const key = `forgot-password-otp:${email}`;

  const expirationSeconds = 5 * 60;

  await redisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/forgot-password.ejs",
  );

  const templateData = {
    name: user.name,
    otp,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: user.email,
    subject: "Courier Password Reset OTP",
    html,
  });

  return {
    message: "Password reset OTP has been sent to your email",
  };
};

const resetPassword = async (payload: IResetPasswordPayload) => {
  const email = payload.email.trim().toLowerCase();

  const { otp, newPassword } = payload;

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User does not exist");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  if (user.status === UserStatus.DELETED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
  }

  if (!user.emailVerified) {
    throw new AppError(httpStatus.FORBIDDEN, "Please verify your email first");
  }

  if (!user.password) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password reset is not available for this account",
    );
  }

  const key = `forgot-password-otp:${email}`;

  const redisOtp = await redisClient.get(key);

  if (!redisOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP is expired or invalid");
  }

  if (redisOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP does not match");
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  await prisma.user.update({
    where: {
      id: user.id,
    },

    data: {
      password: hashedPassword,
    },
  });

  await redisClient.del(key);

  return {
    message: "Password reset successful",
  };
};

export const AuthService = {
  registerCustomer,
  verifyCustomerEmail,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
};
