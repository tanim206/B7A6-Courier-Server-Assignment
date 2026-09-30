import type { Request, Response } from "express";
import httpStatus from "http-status";
import type {
  IAdminApplicationsQuery,
  IAdminHubsQuery,
  IAdminPaymentsQuery,
  IAdminShipmentsQuery,
  IAdminUsersQuery,
  ICreateHubByAdminPayload,
  IReviewApplicationPayload,
  IUpdateHubByAdminPayload,
  IUpdateUserRolePayload,
  IUpdateUserStatusPayload,
} from "./admin.interface";
import { AdminService } from "./admin.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

/* ==========================================
   DASHBOARD
   ========================================== */

const getAdminOverview = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getAdminOverview(req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Overview loaded successfully",
    data: result,
  });
});

const getAdminAnalytics = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getAdminAnalytics(req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Analytics loaded successfully",
    data: result,
  });
});

/* ==========================================
   USERS
   ========================================== */

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getAllUsers(
    req.validatedQuery as IAdminUsersQuery,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Users loaded successfully",
    data: result.users,
    meta: result.meta,
  });
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.updateUserStatus(
    req.params.userId as string,
    req.body as IUpdateUserStatusPayload,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "User status updated successfully",
    data: result,
  });
});

const updateUserRole = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.updateUserRole(
    req.params.userId as string,
    req.body as IUpdateUserRolePayload,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "User role updated successfully",
    data: result,
  });
});

const deleteUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.deleteUser(req.params.userId as string, req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "User deleted successfully",
    data: result,
  });
});

/* ==========================================
   HUBS
   ========================================== */

const getAllHubs = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getAllHubs(
    req.validatedQuery as IAdminHubsQuery,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Hubs loaded successfully",
    data: result.hubs,
    meta: result.meta,
  });
});

const getHubById = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getHubById(req.params.hubId as string, req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Hub loaded successfully",
    data: result,
  });
});

const createHub = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.createHub(
    req.body as ICreateHubByAdminPayload,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Hub created successfully",
    data: result,
  });
});

const updateHub = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.updateHub(
    req.params.hubId as string,
    req.body as IUpdateHubByAdminPayload,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Hub updated successfully",
    data: result,
  });
});

const deleteHub = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.deleteHub(req.params.hubId as string, req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Hub deleted successfully",
    data: result,
  });
});

/* ==========================================
   HUB APPLICATIONS
   ========================================== */

const getHubApplications = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getHubApplications(
    req.validatedQuery as IAdminApplicationsQuery,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Applications loaded successfully",
    data: result.applications,
    meta: result.meta,
  });
});

const reviewHubApplication = catchAsync(
  async (req: Request, res: Response) => {
    const result = await AdminService.reviewHubApplication(
      req.params.applicationId as string,
      req.body as IReviewApplicationPayload,
      req.user!,
    );

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: `Application ${result.status} successfully`,
      data: result,
    });
  },
);

/* ==========================================
   SHIPMENTS + PAYMENTS
   ========================================== */

const getAllShipments = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getAllShipments(
    req.validatedQuery as IAdminShipmentsQuery,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Shipments loaded successfully",
    data: result.shipments,
    meta: result.meta,
  });
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getAllPayments(
    req.validatedQuery as IAdminPaymentsQuery,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Payments loaded successfully",
    data: result.payments,
    meta: result.meta,
  });
});

export const AdminController = {
  getAdminOverview,
  getAdminAnalytics,
  getAllUsers,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  getAllHubs,
  getHubById,
  createHub,
  updateHub,
  deleteHub,
  getHubApplications,
  reviewHubApplication,
  getAllShipments,
  getAllPayments,
};
