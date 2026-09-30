import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { ShipmentService } from "./shipment.service";
import { sendResponse } from "../../utils/sendResponse";
import type {
  IDeliveryChargeQuoteQuery,
  IGetHubShipmentsQuery,
} from "./shipment.interface";

const createShipment = catchAsync(async (req: Request, res: Response) => {
  const result = await ShipmentService.createShipment(req.body, req.user!);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,

    success: true,

    message: "Shipment Created Successfully. Please Complete bKash Payment.",

    data: result,
  });
});

const getDeliveryChargeQuote = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ShipmentService.getDeliveryChargeQuote(
      req.validatedQuery as IDeliveryChargeQuoteQuery,
      req.user!,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,

      success: true,

      message: "Delivery Charge Retrieved Successfully",

      data: result,
    });
  },
);

const retryPayment = catchAsync(async (req: Request, res: Response) => {
  const result = await ShipmentService.retryPayment(
    req.params.shipmentId as string,
    req.user!,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,

    success: true,

    message: "Payment Session Created. Please Complete bKash Payment.",

    data: result,
  });
});

const shipmentPaymentCallback = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ShipmentService.shipmentPaymentCallback(
      req.query as Record<string, string | undefined>,
    );

    res.redirect(result.redirectUrl);
  },
);

const getMyShipments = catchAsync(async (req: Request, res: Response) => {
  const result = await ShipmentService.getMyShipments(req.user!);

  sendResponse(res, {
    statusCode: httpStatus.OK,

    success: true,

    message: "Shipments Retrieved Successfully",

    data: result,
  });
});

const getHubShipments = catchAsync(async (req: Request, res: Response) => {
  const result = await ShipmentService.getHubShipments(req.user!, {
    ...(req.validatedQuery as IGetHubShipmentsQuery),
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,

    success: true,

    message: "Shipments Retrieved Successfully",

    data: result,
  });
});

const getShipmentById = catchAsync(async (req: Request, res: Response) => {
  const result = await ShipmentService.getShipmentById(
    req.params.shipmentId as string,
    req.user!,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,

    success: true,

    message: "Shipment Retrieved Successfully",

    data: result,
  });
});

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
  getDeliveryChargeQuote,
  retryPayment,
  shipmentPaymentCallback,
  getMyShipments,
  getHubShipments,
  getShipmentById,
  receiveShipment,
  deliverShipment,
};
