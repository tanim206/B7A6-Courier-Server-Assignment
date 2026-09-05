import path from "path";
import ejs from "ejs";
import crypto from "crypto";
import httpStatus from "http-status";
import {
  IApplyHubApplicationPayload,
  ICreateHubPayload,
  IReviewHubApplicationPayload,
  IUpdateHubPayload,
  IVerifyHubApplicationEmailPayload,
} from "./hub.interface";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import {
  HubApplicationStatus,
  HubStatus,
  Role,
} from "../../../generated/prisma/enums";
import { RequestUser } from "../../middleware/checkAuth";
import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import config from "../../config";
import { id } from "zod/locales";

const createHubByAdmin = async (
  payload: ICreateHubPayload,
  admin: RequestUser,
) => {
  if (admin.role !== Role.ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, "Only admins can create hubs");
  }

  const existingHub = await prisma.hub.findUnique({
    where: {
      hubCode: payload.hubCode,
    },
  });

  if (existingHub) {
    throw new AppError(httpStatus.CONFLICT, "Hub code already exists");
  }

  const hub = await prisma.hub.create({
    data: {
      name: payload.hubName,
      hubCode: payload.hubCode,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      city: payload.city,
      district: payload.district,
      division: payload.division,
      status: HubStatus.ACTIVE,
      createdById: admin.userId,
    },
  });

  return hub;
};

const updateHubByAdmin = async (
  hubId: string,
  payload: IUpdateHubPayload,
  admin: RequestUser,
) => {
  if (admin.role !== Role.ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, "Only admins can update hubs");
  }

  const existingHub = await prisma.hub.findUnique({
    where: {
      id: hubId,
    },
  });

  if (!existingHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub not found");
  }

  if (existingHub.deletedAt) {
    throw new AppError(httpStatus.GONE, "This hub has been deleted");
  }

  const updatedHub = await prisma.hub.update({
    where: {
      id: hubId,
    },
    data: {
      name: payload.hubName?.trim(),
      email: payload.email?.trim().toLowerCase(),
      phone: payload.phone?.trim(),
      address: payload.address?.trim(),
      city: payload.city?.trim(),
      district: payload.district?.trim(),
      division: payload.division?.trim(),
      status: payload.status,
    },
  });

  return updatedHub;
};

const applyHubApplication = async (
  hubId: string,
  payload: IApplyHubApplicationPayload,
  additionalFiles: Express.Multer.File[],
  user: RequestUser,
) => {
  const existingUser = await prisma.user.findUnique({
    where: {
      email: user.email,
    },
  });

  if (!existingUser) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (existingUser.deletedAt) {
    throw new AppError(httpStatus.GONE, "This user has been deleted");
  }

  if (existingUser.role !== Role.CUSTOMER) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only customers can apply for hub applications",
    );
  }

  const existingHub = await prisma.hub.findUnique({
    where: {
      id: hubId,
    },
  });

  if (!existingHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub not found");
  }

  if (existingHub.deletedAt) {
    throw new AppError(httpStatus.GONE, "This hub has been deleted");
  }

  if (existingHub.status !== HubStatus.ACTIVE) {
    throw new AppError(httpStatus.BAD_REQUEST, "This hub is inactive");
  }

  const existingApplication = await prisma.hubApplication.findFirst({
    where: {
      userId: existingUser.id,
      hubId: existingHub.id,
      status: {
        in: [
          HubApplicationStatus.DRAFT,
          HubApplicationStatus.PENDING,
          HubApplicationStatus.APPROVED,
        ],
      },
    },
  });

  if (existingApplication) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You already have an active application for this hub",
    );
  }

  const additionalFilesUploadResults = await Promise.all(
    additionalFiles.map((file) => {
      return new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: "auto",
            },

            (error, result) => {
              if (error) {
                if ((error as any).http_code === 403) {
                  return reject(
                    new AppError(
                      httpStatus.FORBIDDEN,
                      "Cloudinary authentication failed. Please check your Cloudinary API credentials.",
                    ),
                  );
                }

                return reject(error);
              }

              if (!result) {
                return reject(new Error("No result returned from Cloudinary"));
              }

              resolve(result);
            },
          )
          .end(file.buffer);
      });
    }),
  );

  const hubApplication = await prisma.hubApplication.create({
    data: {
      hubId: existingHub.id,
      userId: existingUser.id,
      name: existingUser.name.trim(),
      email: existingUser.email.trim().toLowerCase(),
      phone: payload.phone.trim(),
      address: payload.address.trim(),
      city: payload.city.trim(),
      district: payload.district.trim(),
      division: payload.division.trim(),
      additionalFiles: additionalFilesUploadResults.map((file) => ({
        url: file.secure_url,
        publicId: file.public_id,
      })),
      status: HubApplicationStatus.DRAFT,
    },
  });

  const expirationSeconds = 60 * 60;
  const otpKey = `hub-application-otp:${existingUser.email}`;
  const otpValue = crypto.randomInt(100000, 1000000).toString();
  await redisClient.set(otpKey, otpValue, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/hub-apply-otp.ejs",
  );

  const templateData = {
    name: existingUser.name,
    email: existingUser.email,
    otp: otpValue,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(templatePath, templateData);
  await transporter.sendMail({
    from: config.email_sender,
    to: existingUser.email,
    subject: "Hub Application - Email Verification",
    html,
  });

  return {
    hubApplicationId: hubApplication.id,
    message: `Verify Otp ${hubApplication.email}`,
  };
};

const verifyHubApplicationEmail = async (
  payload: IVerifyHubApplicationEmailPayload,
) => {
  const application = await prisma.hubApplication.findUnique({
    where: {
      id: payload.applicationId,
    },

    include: {
      hub: {
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!application) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub application not found");
  }

  if (application.status !== HubApplicationStatus.DRAFT) {
    throw new AppError(
      httpStatus.CONFLICT,
      "This application is already verified",
    );
  }

  const otpKey = `hub-application-otp:${application.email}`;
  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "OTP expired. Please apply again.",
    );
  }

  if (redisOtp !== payload.otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP does not match");
  }

  await redisClient.del(otpKey);

  const verifiedApplication = await prisma.hubApplication.update({
    where: {
      id: application.id,
    },

    data: {
      status: HubApplicationStatus.PENDING,
    },

    include: {
      hub: true,
    },
  });

  const hubAdmin = application.hub.createdBy;

  // 8. SEND APPLICATION EMAIL TO HUB ADMIN

  if (hubAdmin?.email) {
    const templatePath = path.join(
      process.cwd(),
      "src/app/templates/hub-application-admin-email.ejs",
    );

    const templateData = {
      adminName: hubAdmin.name,
      applicationId: application.id,
      applicantName: application.name,
      applicantEmail: application.email,
      applicantPhone: application.phone,
      applicantAddress: application.address,
      applicantCity: application.city,
      applicantDistrict: application.district,
      applicantDivision: application.division,

      hubCode: application.hub.hubCode,
      hubEmail: application.hub.email,
      applicationStatus: application.status,
      appliedAt: application.createdAt,
    };

    const html = await ejs.renderFile(templatePath, templateData);

    await transporter.sendMail({
      from: config.email_sender,
      to: hubAdmin.email,
      subject: `New Hub Staff Application - ${application.hub.name}`,
      html,
    });
  }

  return verifiedApplication;
};

const reviewHubApplicationByAdmin = async (
  applicationId: string,
  payload: IReviewHubApplicationPayload,
  admin: RequestUser,
) => {
  const application = await prisma.hubApplication.findUnique({
    where: {
      id: applicationId,
    },
    include: {
      user: true,
      hub: {
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!application) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub application not found");
  }

  if (application.status !== HubApplicationStatus.PENDING) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `This application cannot be reviewed because its current status is ${application.status}`,
    );
  }

  if (!application.user) {
    throw new AppError(httpStatus.NOT_FOUND, "Applicant user not found");
  }

  if (application.user.deletedAt) {
    throw new AppError(httpStatus.GONE, "This applicant has been deleted");
  }

  if (!application.hub) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub not found");
  }

  if (application.hub.deletedAt) {
    throw new AppError(httpStatus.GONE, "This hub has been deleted");
  }

  if (payload.action === "REJECTED" && !payload.rejectionReason?.trim()) {
    throw new AppError(httpStatus.BAD_REQUEST, "Rejection reason is required");
  }

  if (payload.action === "APPROVED") {
    const result = await prisma.$transaction(async (tx) => {
      const approvedApplication = await tx.hubApplication.update({
        where: {
          id: application.id,
        },
        data: {
          status: HubApplicationStatus.APPROVED,
          // reviewedBy: admin.id,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });

      const updatedUser = await tx.user.update({
        where: {
          id: application.userId,
        },
        data: {
          role: Role.STAFF,
          hubId: application.hubId,
        },
      });

      return {
        approvedApplication,
        updatedUser,
      };
    });

    const templatePath = path.join(
      process.cwd(),
      "src/app/templates/hub-application-approved.ejs",
    );

    const templateData = {
      applicantName: application.name,
      hubName: application.hub.name,
      hubCode: application.hub.hubCode,
      hubEmail: application.hub.email,
      adminName: application.hub.createdBy.name,
      applicationId: application.id,
      approvedAt: result.approvedApplication.reviewedAt,
    };

    const html = await ejs.renderFile(templatePath, templateData);

    await transporter.sendMail({
      from: config.email_sender,
      to: application.email,
      subject: "Congratulations! Your Hub Staff Application Has Been Approved",
      html,
    });

    return {
      applicationId: application.id,
      status: HubApplicationStatus.APPROVED,
      message:
        "Congratulations! Your hub staff application has been approved successfully. You are now a staff member of this hub.",
      user: {
        id: result.updatedUser.id,
        name: result.updatedUser.name,
        email: result.updatedUser.email,
        role: result.updatedUser.role,
        hubId: result.updatedUser.hubId,
      },
      hub: {
        id: application.hub.id,
        name: application.hub.name,
        hubCode: application.hub.hubCode,
      },
    };
  }

  const rejectedApplication = await prisma.hubApplication.update({
    where: {
      id: application.id,
    },
    data: {
      status: HubApplicationStatus.REJECTED,
      rejectionReason: payload.rejectionReason!,
      // reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/hub-application-rejected.ejs",
  );

  const templateData = {
    applicantName: application.name,
    hubName: application.hub.name,
    hubCode: application.hub.hubCode,
    hubEmail: application.hub.email,
    adminName: application.hub.createdBy.name,
    applicationId: application.id,
    rejectionReason: rejectedApplication.rejectionReason,
    reviewedAt: rejectedApplication.reviewedAt,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: application.email,
    subject: "Update Regarding Your Hub Staff Application",
    html,
  });

  return {
    applicationId: application.id,
    status: HubApplicationStatus.REJECTED,
    message:
      "Your hub staff application has been rejected. Please check the rejection reason and contact the hub administration for further information.",
    rejectionReason: rejectedApplication.rejectionReason,
    hub: {
      id: application.hub.id,
      name: application.hub.name,
      hubCode: application.hub.hubCode,
    },
  };
};

export const hubService = {
  createHubByAdmin,
  updateHubByAdmin,
  applyHubApplication,
  verifyHubApplicationEmail,
  reviewHubApplicationByAdmin,
};
