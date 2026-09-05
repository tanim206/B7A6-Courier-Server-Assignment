import { HubStatus } from "../../../generated/prisma/enums";

export interface ICreateHubPayload {
  hubName: string;
  hubCode: string;
  email?: string;
  phone?: string;
  address: string;
  city: string;
  district: string;
  division: string;
}

export interface IUpdateHubPayload {
  hubName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  division?: string;
  status?: HubStatus;
}
export interface IApplyHubApplicationPayload {
  phone: string;
  address: string;
  city: string;
  district: string;
  division: string;
}

export interface IVerifyHubApplicationEmailPayload {
  applicationId: string;
  otp: string;
}

export interface IReviewHubApplicationPayload {
  action: "APPROVED" | "REJECTED";
  rejectionReason?: string;
}

// export interface IApproveHubEmailPayload {
//   hubId: string;
//   verificationStatus: HubVerificationStatus;
//   rejectionReason: string;
// }
