import { Request, Response } from "express";
import httpStatus from "http-status";
import { PaymentService } from "./payment.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

// GET MY PAYMENTS

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.getMyPayments(req.user!);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My Payments Retrieved Successfully",
    data: result,
  });
});

// GET ALL PAYMENTS
// ADMIN

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.getAllPayments(req.user!);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All Payments Retrieved Successfully",
    data: result,
  });
});

// GET PAYMENT BY ID

const getPaymentById = catchAsync(async (req: Request, res: Response) => {
  const { paymentId } = req.params;

  const result = await PaymentService.getPaymentById(
    paymentId as string,
    req.user!,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment Retrieved Successfully",
    data: result,
  });
});

export const PaymentController = {
  getMyPayments,
  getAllPayments,
  getPaymentById,
};
