import { Request, Response } from "express";
import httpStatus from "http-status";
import { hubService } from "./hub.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { HubApplicationStatus } from "../../../generated/prisma/enums";

const createHubByAdmin = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await hubService.createHubByAdmin(req.body, user);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Hub created successfully.",
    data: result,
  });
});

const updateHubByAdmin = catchAsync(async (req: Request, res: Response) => {
  const { hubId } = req.params;
  const admin = req.user!;
  const result = await hubService.updateHubByAdmin(
    hubId as string,
    req.body,
    admin,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hub updated successfully",
    data: result,
  });
});

const applyHubApplication = catchAsync(async (req: Request, res: Response) => {
  const { hubId } = req.params;
  const payload = req.body;
  const user = req.user!;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const additionalFiles = files?.["additionalFiles"] || [];

  const result = await hubService.applyHubApplication(
    hubId as string,
    payload,
    additionalFiles,
    user,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Hub Application Created Successfully",
    data: result,
  });
});

const verifyHubApplicationEmail = catchAsync(
  async (req: Request, res: Response) => {
    const result = await hubService.verifyHubApplicationEmail(req.body);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message:
        "Email verified successfully. Your hub application is now pending for admin review.",
      data: result,
    });
  },
);

const reviewHubApplicationByAdmin = catchAsync(
  async (req: Request, res: Response) => {
    const result = await hubService.reviewHubApplicationByAdmin(
      req.params.applicationId as string,
      req.body,
      req.user!,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message:
        result.status === HubApplicationStatus.APPROVED
          ? "Hub application approved successfully"
          : "Hub application rejected successfully",
      data: result,
    });
  },
);

export const hubController = {
  createHubByAdmin,
  updateHubByAdmin,
  applyHubApplication,
  verifyHubApplicationEmail,
  reviewHubApplicationByAdmin,
};
