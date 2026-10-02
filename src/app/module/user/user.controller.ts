import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserServices } from "./user.service";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError(httpStatus.BAD_REQUEST, "No File Provided.");
  }

  const userId = req.user?.userId;

  const result = await UserServices.uploadProfileImage(
    req.file?.buffer,
    userId!,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pgofile Image Change successfully",
    data: result,
  });
});

const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const { name, phone } = req.body;
  const userId = req.user?.userId;

  const result = await UserServices.updateProfile({ name, phone }, userId!);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});

const deleteUserByID = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const result = await UserServices.deleteUserByID(userId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User deleted successfully",
    data: result,
  });
});

export const UserController = {
  updateProfile,
  uploadProfileImage,
  deleteUserByID,
};
