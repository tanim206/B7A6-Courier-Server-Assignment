import { HubStatus, Role, UserStatus } from "../../../generated/prisma/enums";

export interface IPaginatedQuery {
  page?: number;
  limit?: number;
  searchTerm?: string;
}

export interface IAdminUsersQuery extends IPaginatedQuery {
  role?: Role;
  status?: UserStatus;
}

export interface IAdminHubsQuery extends IPaginatedQuery {
  status?: HubStatus;
}

export interface IAdminApplicationsQuery extends IPaginatedQuery {
  status?: string;
}

export interface IAdminShipmentsQuery extends IPaginatedQuery {
  status?: string;
  hubId?: string;
}

export interface IAdminPaymentsQuery extends IPaginatedQuery {
  status?: string;
}

export interface IUpdateUserStatusPayload {
  status: UserStatus;
}

export interface IUpdateUserRolePayload {
  role: Role;
}

export interface ICreateHubByAdminPayload {
  hubName: string;
  hubCode: string;
  email?: string;
  phone?: string;
  address: string;
  city: string;
  district: string;
  division: string;
}

export interface IUpdateHubByAdminPayload {
  hubName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  division?: string;
  status?: HubStatus;
}

export interface IReviewApplicationPayload {
  action: "APPROVED" | "REJECTED";
  rejectionReason?: string;
}
