import httpStatus from "http-status";
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { ShipmentService } from "./shipment.service";
import { sendResponse } from "../../utils/sendResponse";

const createShipment = catchAsync(async (req: Request, res: Response) => {
  const result = await ShipmentService.createShipment(req.body, req.user!);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,

    success: true,

    message: "Shipment Created Successfully. Please Complete bKash Payment.",

    data: result,
  });
});

const shipmentPaymentCallback = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ShipmentService.shipmentPaymentCallback(req.query);

    res.redirect(result.redirectUrl);
  },
);
const receiveShipment = catchAsync(async (req: Request, res: Response) => {
  const result = await ShipmentService.receiveShipment(
    req.params.shipmentId as string,
    req.user!,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,

    success: true,

    message: "Shipment Received Successfully",

    data: result,
  });
});

const deliverShipment = catchAsync(async (req: Request, res: Response) => {
  const result = await ShipmentService.deliverShipment(
    req.params.shipmentId as string,
    req.user!,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,

    success: true,

    message: "Shipment Delivered Successfully",

    data: result,
  });
});
export const ShipmentController = {
  createShipment,
  shipmentPaymentCallback,
  receiveShipment,
  deliverShipment,
};
