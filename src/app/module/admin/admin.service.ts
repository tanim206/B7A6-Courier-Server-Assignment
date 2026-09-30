import httpStatus from "http-status";
import {
  HubApplicationStatus,
  HubStatus,
  PaymentStatus,
  Role,
  ShipmentStatus,
  UserStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import type {
  IAdminApplicationsQuery,
  IAdminHubsQuery,
  IAdminPaymentsQuery,
  IAdminShipmentsQuery,
  IAdminUsersQuery,
  ICreateHubByAdminPayload,
  IPaginatedQuery,
  IReviewApplicationPayload,
  IUpdateHubByAdminPayload,
  IUpdateUserRolePayload,
  IUpdateUserStatusPayload,
} from "./admin.interface";

/* ==========================================
   HELPERS
   ========================================== */

//  DECIMAL -> STRING SO THE FRONTEND NEVER LOSES PRECISION

const toAmount = (value: unknown) => String(value ?? 0);

const getPagination = (query: IPaginatedQuery) => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const buildMeta = (total: number, page: number, limit: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const isSuperAdmin = (user: RequestUser) => user.role === Role.SUPER_ADMIN;

//  A HUB THAT STILL MOVES PARCELS MUST NOT BE REMOVED

const assertHubHasNoLiveShipments = async (hubId: string) => {
  const liveShipmentCount = await prisma.shipment.count({
    where: {
      OR: [{ originHubId: hubId }, { destinationHubId: hubId }],
      status: {
        notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
      },
    },
  });

  if (liveShipmentCount > 0) {
    throw new AppError(
      httpStatus.CONFLICT,
      `This hub still has ${liveShipmentCount} active shipment(s) and cannot be removed`,
    );
  }
};

/* ==========================================
   DASHBOARD OVERVIEW
   ========================================== */

const getAdminOverview = async (user: RequestUser) => {
  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Admin Can View The Overview",
    );
  }

  const [
    totalUsers,
    activeUsers,
    blockedUsers,
    staffUsers,
    totalHubs,
    activeHubs,
    totalShipments,
    deliveredShipments,
    totalPayments,
    paidPayments,
    pendingApplications,
    revenueAggregate,
    shipmentsByStatus,
    recentShipments,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { status: UserStatus.ACTIVE, deletedAt: null } }),
    prisma.user.count({ where: { status: UserStatus.BLOCKED, deletedAt: null } }),
    prisma.user.count({ where: { role: Role.STAFF, deletedAt: null } }),

    prisma.hub.count({ where: { deletedAt: null } }),
    prisma.hub.count({ where: { status: HubStatus.ACTIVE, deletedAt: null } }),

    prisma.shipment.count(),
    prisma.shipment.count({ where: { status: ShipmentStatus.DELIVERED } }),

    prisma.payment.count(),
    prisma.payment.count({ where: { status: PaymentStatus.PAID } }),

    prisma.hubApplication.count({
      where: { status: HubApplicationStatus.PENDING },
    }),

    prisma.payment.aggregate({
      where: { status: PaymentStatus.PAID },
      _sum: { amount: true },
    }),

    prisma.shipment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),

    prisma.shipment.findMany({
      select: {
        id: true,
        status: true,
        parcelName: true,
        deliveryCharge: true,
        createdAt: true,
        receiverName: true,
        originHub: { select: { city: true } },
        destinationHub: { select: { city: true } },
        payment: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const statusCounts = Object.fromEntries(
    Object.values(ShipmentStatus).map((status) => [status, 0]),
  ) as Record<ShipmentStatus, number>;

  for (const row of shipmentsByStatus) {
    statusCounts[row.status] = row._count._all;
  }

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      blocked: blockedUsers,
      staff: staffUsers,
    },
    hubs: {
      total: totalHubs,
      active: activeHubs,
    },
    shipments: {
      total: totalShipments,
      delivered: deliveredShipments,
      byStatus: statusCounts,
    },
    payments: {
      total: totalPayments,
      paid: paidPayments,
      totalRevenue: toAmount(revenueAggregate._sum.amount),
    },
    applications: {
      pending: pendingApplications,
    },
    recentShipments: recentShipments.map((shipment) => ({
      ...shipment,
      deliveryCharge: toAmount(shipment.deliveryCharge),
    })),
  };
};

/* ==========================================
   ANALYTICS
   ========================================== */

const getAdminAnalytics = async (user: RequestUser) => {
  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Admin Can View Analytics",
    );
  }

  const days = 14;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const [createdShipments, paidPayments, statusGroups, hubRevenue] =
    await Promise.all([
      prisma.shipment.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),

      prisma.payment.findMany({
        //  paidAt IS A STRING COLUMN HOLDING AN ISO TIMESTAMP
        //  ISO STRINGS SORT THE SAME CHRONOLOGICALLY

        where: {
          status: PaymentStatus.PAID,
          paidAt: { gte: since.toISOString() },
        },
        select: { amount: true, paidAt: true },
      }),

      prisma.shipment.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),

      prisma.shipment.groupBy({
        by: ["destinationHubId"],
        where: { status: ShipmentStatus.DELIVERED },
        _count: { _all: true },
        _sum: { deliveryCharge: true },
        orderBy: { _count: { destinationHubId: "desc" } },
        take: 5,
      }),
    ]);

  //  BUCKETS ARE BUILT IN MEMORY SO MISSING DAYS STILL RENDER AS ZERO

  const shipmentPerDay = new Map<string, number>();
  const revenuePerDay = new Map<string, number>();

  for (let index = 0; index < days; index += 1) {
    const day = new Date(since);
    day.setDate(since.getDate() + index);
    const key = day.toISOString().slice(0, 10);

    shipmentPerDay.set(key, 0);
    revenuePerDay.set(key, 0);
  }

  for (const shipment of createdShipments) {
    const key = shipment.createdAt.toISOString().slice(0, 10);

    if (shipmentPerDay.has(key)) {
      shipmentPerDay.set(key, (shipmentPerDay.get(key) ?? 0) + 1);
    }
  }

  for (const payment of paidPayments) {
    const key = payment.paidAt ? payment.paidAt.slice(0, 10) : "";

    if (!revenuePerDay.has(key)) {
      continue;
    }

    revenuePerDay.set(
      key,
      (revenuePerDay.get(key) ?? 0) + Number(payment.amount),
    );
  }

  const hubIds = hubRevenue.map((row) => row.destinationHubId);
  const hubNames = await prisma.hub.findMany({
    where: { id: { in: hubIds } },
    select: { id: true, name: true, city: true },
  });

  const hubNameMap = new Map(hubNames.map((hub) => [hub.id, hub]));

  return {
    daily: Array.from(shipmentPerDay.keys()).map((date) => ({
      date,
      shipments: shipmentPerDay.get(date) ?? 0,
      revenue: Number((revenuePerDay.get(date) ?? 0).toFixed(2)),
    })),
    shipmentsByStatus: statusGroups.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    topDestinationHubs: hubRevenue.map((row) => ({
      hubId: row.destinationHubId,
      name: hubNameMap.get(row.destinationHubId)?.name ?? "Unknown hub",
      city: hubNameMap.get(row.destinationHubId)?.city ?? "",
      delivered: row._count._all,
      revenue: toAmount(row._sum.deliveryCharge),
    })),
  };
};

/* ==========================================
   USERS
   ========================================== */

const getAllUsers = async (query: IAdminUsersQuery, user: RequestUser) => {
  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, "Only Admin Can View Users");
  }

  const { page, limit, skip } = getPagination(query);
  const searchTerm = query.searchTerm?.trim();

  const where = {
    //  A SOFT DELETED USER IS EXPLICITLY EXCLUDED UNLESS ASKED FOR

    ...(query.status === UserStatus.DELETED
      ? { deletedAt: { not: null } }
      : { deletedAt: null }),

    ...(query.role ? { role: query.role } : {}),
    ...(query.status && query.status !== UserStatus.DELETED
      ? { status: query.status }
      : {}),

    ...(searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" as const } },
            { email: { contains: searchTerm, mode: "insensitive" as const } },
            { phone: { contains: searchTerm } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,

      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        imageUrl: true,
        role: true,
        status: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        hubId: true,

        hub: {
          select: {
            id: true,
            name: true,
            hubCode: true,
            city: true,
          },
        },

        _count: {
          select: {
            sentShipments: true,
            createdShipments: true,
          },
        },
      },

      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),

    prisma.user.count({ where }),
  ]);

  return {
    users,
    meta: buildMeta(total, page, limit),
  };
};

const updateUserStatus = async (
  userId: string,
  payload: IUpdateUserStatusPayload,
  admin: RequestUser,
) => {
  if (userId === admin.userId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You Cannot Change Your Own Status",
    );
  }

  //  GUARDED TWICE ON PURPOSE, THIS KEEPS deletedAt IN SYNC WITH status EVEN
  //  IF THIS SERVICE IS CALLED FROM SOMEWHERE OTHER THAN THE ADMIN ROUTE
  if (payload.status === UserStatus.DELETED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Use The Delete Endpoint To Remove A User",
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, deletedAt: true },
  });

  if (!target || target.deletedAt) {
    throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
  }

  if (target.role === Role.SUPER_ADMIN && !isSuperAdmin(admin)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Super Admin Can Change A Super Admin",
    );
  }

  if (target.role === Role.ADMIN && !isSuperAdmin(admin)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Super Admin Can Change An Admin",
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: target.id },
    data: { status: payload.status },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
    },
  });

  return updatedUser;
};

const updateUserRole = async (
  userId: string,
  payload: IUpdateUserRolePayload,
  admin: RequestUser,
) => {
  if (userId === admin.userId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You Cannot Change Your Own Role",
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, hubId: true, deletedAt: true },
  });

  if (!target || target.deletedAt) {
    throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
  }

  const isPrivileged = (role: Role) =>
    role === Role.ADMIN || role === Role.SUPER_ADMIN;

  //  ESCALATION AND DEMOTION OF ADMINS IS RESERVED FOR THE SUPER ADMIN

  if ((isPrivileged(target.role) || isPrivileged(payload.role)) && !isSuperAdmin(admin)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Super Admin Can Change Admin Roles",
    );
  }

  //  STAFF BELONGS TO A HUB, SO A CUSTOMER TO STAFF SWITCH NEEDS A HUB

  const data: {
    role: Role;
    status?: UserStatus;
    hubId?: string | null;
  } = { role: payload.role };

  if (payload.role === Role.STAFF && !target.hubId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Assign a hub before making this user staff",
    );
  }

  if (payload.role !== Role.STAFF) {
    data.hubId = null;
  }

  //  A BLOCKED USER MUST NOT KEEP AN ACTIVE SESSION

  if (target.status === UserStatus.BLOCKED && payload.role === Role.CUSTOMER) {
    data.status = UserStatus.ACTIVE;
  }

  const updatedUser = await prisma.user.update({
    where: { id: target.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      hubId: true,
    },
  });

  return updatedUser;
};

const deleteUser = async (userId: string, admin: RequestUser) => {
  if (userId === admin.userId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You Cannot Delete Your Own Account",
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true },
  });

  if (!target || target.deletedAt) {
    throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
  }

  if (target.role === Role.SUPER_ADMIN && !isSuperAdmin(admin)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Super Admin Can Delete A Super Admin",
    );
  }

  if (target.role === Role.ADMIN && !isSuperAdmin(admin)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Super Admin Can Delete An Admin",
    );
  }

  //  A STAFF MEMBER OWNS A HUB PIPELINE, BLOCK FIRST SO NOTHING BREAKS

  if (target.role === Role.STAFF) {
    const liveShipmentCount = await prisma.shipment.count({
      where: {
        OR: [
          { createdById: target.id },
          { receivedById: target.id },
        ],
        status: {
          notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
        },
      },
    });

    if (liveShipmentCount > 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        `This staff member still handles ${liveShipmentCount} active shipment(s)`,
      );
    }
  }

  const deletedUser = await prisma.user.update({
    where: { id: target.id },
    data: {
      deletedAt: new Date(),
      status: UserStatus.DELETED,
    },
    select: { id: true, name: true, email: true },
  });

  return deletedUser;
};

/* ==========================================
   HUBS
   ========================================== */

const getAllHubs = async (query: IAdminHubsQuery, user: RequestUser) => {
  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, "Only Admin Can View Hubs");
  }

  const { page, limit, skip } = getPagination(query);
  const searchTerm = query.searchTerm?.trim();

  const where = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" as const } },
            { hubCode: { contains: searchTerm, mode: "insensitive" as const } },
            { city: { contains: searchTerm, mode: "insensitive" as const } },
            { email: { contains: searchTerm, mode: "insensitive" as const } },
            { phone: { contains: searchTerm } },
          ],
        }
      : {}),
  };

  const [hubs, total] = await Promise.all([
    prisma.hub.findMany({
      where,

      select: {
        id: true,
        hubCode: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        district: true,
        division: true,
        status: true,
        createdAt: true,

        _count: {
          select: {
            staffs: true,
            originShipments: true,
            destinationShipments: true,
          },
        },
      },

      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),

    prisma.hub.count({ where }),
  ]);

  return {
    hubs,
    meta: buildMeta(total, page, limit),
  };
};

const getHubById = async (hubId: string, user: RequestUser) => {
  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, "Only Admin Can View A Hub");
  }

  const hub = await prisma.hub.findFirst({
    where: { id: hubId, deletedAt: null },

    include: {
      staffs: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
        },
      },

      createdBy: {
        select: { id: true, name: true, email: true },
      },

      _count: {
        select: {
          staffs: true,
          originShipments: true,
          destinationShipments: true,
          applications: true,
        },
      },
    },
  });

  if (!hub) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub Not Found");
  }

  return hub;
};

const createHub = async (payload: ICreateHubByAdminPayload, admin: RequestUser) => {
  const existingHub = await prisma.hub.findUnique({
    where: { hubCode: payload.hubCode },
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

const updateHub = async (
  hubId: string,
  payload: IUpdateHubByAdminPayload,
  admin: RequestUser,
) => {
  const existingHub = await prisma.hub.findFirst({
    where: { id: hubId, deletedAt: null },
  });

  if (!existingHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub Not Found");
  }

  //  DEACTIVATING A HUB STOPS IT FROM BEING PICKED AS A DESTINATION

  if (payload.status === HubStatus.INACTIVE) {
    const liveShipmentCount = await prisma.shipment.count({
      where: {
        destinationHubId: hubId,
        status: {
          notIn: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
        },
      },
    });

    if (liveShipmentCount > 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        `This hub still receives ${liveShipmentCount} active shipment(s) and cannot be deactivated`,
      );
    }
  }

  const updatedHub = await prisma.hub.update({
    where: { id: hubId },
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

const deleteHub = async (hubId: string, admin: RequestUser) => {
  const existingHub = await prisma.hub.findFirst({
    where: { id: hubId, deletedAt: null },
  });

  if (!existingHub) {
    throw new AppError(httpStatus.NOT_FOUND, "Hub Not Found");
  }

  await assertHubHasNoLiveShipments(hubId);

  //  STAFF ARE RELEASED FROM THE HUB INSTEAD OF BEING ORPHANED

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { hubId },
      data: { hubId: null, role: Role.CUSTOMER },
    }),

    prisma.hub.update({
      where: { id: hubId },
      data: {
        deletedAt: new Date(),
        status: HubStatus.INACTIVE,
      },
    }),
  ]);

  return {
    id: hubId,
    name: existingHub.name,
  };
};

/* ==========================================
   HUB APPLICATIONS
   ========================================== */

const getHubApplications = async (
  query: IAdminApplicationsQuery,
  user: RequestUser,
) => {
  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Admin Can View Applications",
    );
  }

  const { page, limit, skip } = getPagination(query);
  const searchTerm = query.searchTerm?.trim();

  const where = {
    ...(query.status
      ? { status: query.status as HubApplicationStatus }
      : {}),

    ...(searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" as const } },
            { email: { contains: searchTerm, mode: "insensitive" as const } },
            { phone: { contains: searchTerm } },
            {
              hub: {
                name: { contains: searchTerm, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const [applications, total] = await Promise.all([
    prisma.hubApplication.findMany({
      where,

      include: {
        hub: {
          select: {
            id: true,
            name: true,
            hubCode: true,
            city: true,
            division: true,
          },
        },

        user: {
          select: { id: true, name: true, email: true, phone: true, status: true },
        },

        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
      },

      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),

    prisma.hubApplication.count({ where }),
  ]);

  return {
    applications,
    meta: buildMeta(total, page, limit),
  };
};

const reviewHubApplication = async (
  applicationId: string,
  payload: IReviewApplicationPayload,
  admin: RequestUser,
) => {
  //  THE EXISTING SERVICE OWNS THE APPROVE/REJECT RULES AND EMAILS

  const { hubService } = await import("../hub/hub.service");

  return hubService.reviewHubApplicationByAdmin(applicationId, payload, admin);
};

/* ==========================================
   SHIPMENTS
   ========================================== */

const getAllShipments = async (
  query: IAdminShipmentsQuery,
  user: RequestUser,
) => {
  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, "Only Admin Can View Shipments");
  }

  const { page, limit, skip } = getPagination(query);
  const searchTerm = query.searchTerm?.trim();

  const where = {
    ...(query.status ? { status: query.status as ShipmentStatus } : {}),

    //  A HUB FILTER MATCHES EITHER SIDE OF THE ROUTE

    ...(query.hubId
      ? {
          OR: [
            { originHubId: query.hubId },
            { destinationHubId: query.hubId },
          ],
        }
      : {}),

    ...(searchTerm
      ? {
          AND: [
            {
              OR: [
                { id: { contains: searchTerm, mode: "insensitive" as const } },
                {
                  senderName: {
                    contains: searchTerm,
                    mode: "insensitive" as const,
                  },
                },
                {
                  senderEmail: {
                    contains: searchTerm,
                    mode: "insensitive" as const,
                  },
                },
                { senderPhone: { contains: searchTerm } },
                {
                  receiverName: {
                    contains: searchTerm,
                    mode: "insensitive" as const,
                  },
                },
                { receiverPhone: { contains: searchTerm } },
                {
                  parcelName: {
                    contains: searchTerm,
                    mode: "insensitive" as const,
                  },
                },
              ],
            },
          ],
        }
      : {}),
  };

  const [shipments, total] = await Promise.all([
    prisma.shipment.findMany({
      where,

      include: {
        originHub: { select: { id: true, name: true, city: true, hubCode: true } },
        destinationHub: {
          select: { id: true, name: true, city: true, hubCode: true },
        },
        payment: {
          select: { id: true, status: true, amount: true, bkashTrxId: true },
        },
        createdBy: { select: { id: true, name: true } },
      },

      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),

    prisma.shipment.count({ where }),
  ]);

  return {
    shipments: shipments.map((shipment) => ({
      ...shipment,
      deliveryCharge: toAmount(shipment.deliveryCharge),
      ...(shipment.payment
        ? { payment: { ...shipment.payment, amount: toAmount(shipment.payment.amount) } }
        : {}),
    })),
    meta: buildMeta(total, page, limit),
  };
};

/* ==========================================
   PAYMENTS
   ========================================== */

const getAllPayments = async (
  query: IAdminPaymentsQuery,
  user: RequestUser,
) => {
  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new AppError(httpStatus.FORBIDDEN, "Only Admin Can View Payments");
  }

  const { page, limit, skip } = getPagination(query);
  const searchTerm = query.searchTerm?.trim();

  const where = {
    ...(query.status ? { status: query.status as PaymentStatus } : {}),

    ...(searchTerm
      ? {
          shipment: {
            OR: [
              { id: { contains: searchTerm, mode: "insensitive" as const } },
              {
                senderName: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
              {
                senderEmail: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
              {
                receiverName: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
              { bkashTrxId: { contains: searchTerm } },
              { merchantInvoiceNumber: { contains: searchTerm } },
            ],
          },
        }
      : {}),
  };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,

      select: {
        id: true,
        amount: true,
        status: true,
        currency: true,
        paymentGateway: true,
        merchantInvoiceNumber: true,
        bkashTrxId: true,
        paidAt: true,
        createdAt: true,

        shipment: {
          select: {
            id: true,
            status: true,
            senderName: true,
            senderEmail: true,
            receiverName: true,
            parcelName: true,
            originHub: { select: { name: true, city: true } },
            destinationHub: { select: { name: true, city: true } },
          },
        },
      },

      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),

    prisma.payment.count({ where }),
  ]);

  return {
    payments: payments.map((payment) => ({
      ...payment,
      amount: toAmount(payment.amount),
    })),
    meta: buildMeta(total, page, limit),
  };
};

export const AdminService = {
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
