import { z } from "zod";

/* ==========================================
   REUSABLE PAGINATION
   ========================================== */

const paginationSchema = {
  page: z.coerce
    .number({ message: "Please provide a valid page number" })
    .int("Page number must be a whole number")
    .min(1, "Page number must be 1 or higher")
    .max(10000, "Page number is too large")
    .optional(),

  limit: z.coerce
    .number({ message: "Please provide a valid page size" })
    .int("Page size must be a whole number")
    .min(1, "Page size must be at least 1")
    .max(100, "Page size cannot be more than 100")
    .optional(),

  searchTerm: z.string().trim().max(160).optional(),
};

const paginationShape = (extra: z.ZodRawShape = {}) => ({
  ...paginationSchema,
  ...extra,
});

//  ENUMS ARE IMPORTED AS STRINGS TO KEEP THE SCHEMA INDEPENDENT OF PRISMA

const userStatusValues = ["ACTIVE", "BLOCKED", "DELETED"] as const;

//  SOFT DELETION IS ONLY REACHABLE THROUGH THE DELETE ENDPOINT BECAUSE IT
//  MUST ALSO STAMP deletedAt, SO IT IS NOT SETTABLE HERE
const assignableUserStatusValues = ["ACTIVE", "BLOCKED"] as const;
const roleValues = ["CUSTOMER", "STAFF", "ADMIN", "SUPER_ADMIN"] as const;
const hubStatusValues = ["ACTIVE", "INACTIVE"] as const;

const shipmentStatusValues = [
  "PENDING",
  "PICKUP_SCHEDULED",
  "ASSIGNED",
  "PICKED_UP",
  "AT_ORIGIN_HUB",
  "TRANSIT",
  "AT_DESTINATION_HUB",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_DELIVERY",
  "CANCELLED",
] as const;

const paymentStatusValues = [
  "PENDING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;

const applicationStatusValues = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

/* ==========================================
   READ QUERIES
   ========================================== */

export const adminUsersQueryValidation = z.object(
  paginationShape({
    role: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine(
        (value) => value === undefined || roleValues.includes(value as never),
        { message: "Please provide a valid role" },
      ),

    status: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine(
        (value) =>
          value === undefined || userStatusValues.includes(value as never),
        { message: "Please provide a valid user status" },
      ),
  }),
);

export const adminHubsQueryValidation = z.object(
  paginationShape({
    status: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine(
        (value) =>
          value === undefined || hubStatusValues.includes(value as never),
        { message: "Please provide a valid hub status" },
      ),
  }),
);

export const adminApplicationsQueryValidation = z.object(
  paginationShape({
    status: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine(
        (value) =>
          value === undefined || applicationStatusValues.includes(value as never),
        { message: "Please provide a valid application status" },
      ),
  }),
);

export const adminShipmentsQueryValidation = z.object(
  paginationShape({
    status: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine(
        (value) =>
          value === undefined || shipmentStatusValues.includes(value as never),
        { message: "Please provide a valid shipment status" },
      ),

    hubId: z
      .string()
      .trim()
      .uuid("Please provide a valid hub id")
      .optional(),
  }),
);

export const adminPaymentsQueryValidation = z.object(
  paginationShape({
    status: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine(
        (value) =>
          value === undefined || paymentStatusValues.includes(value as never),
        { message: "Please provide a valid payment status" },
      ),
  }),
);

/* ==========================================
   MUTATIONS
   ========================================== */

export const adminUpdateUserStatusValidation = z.object({
  status: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (value) => assignableUserStatusValues.includes(value as never),
      { message: "Please provide a valid user status" },
    ),
});

export const adminUpdateUserRoleValidation = z.object({
  role: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => roleValues.includes(value as never), {
      message: "Please provide a valid role",
    }),
});

export const adminCreateHubValidation = z.object({
  hubName: z
    .string()
    .trim()
    .min(2, "Hub name must be at least 2 characters")
    .max(120, "Hub name is too long"),

  hubCode: z
    .string()
    .trim()
    .min(2, "Hub code must be at least 2 characters")
    .max(20, "Hub code is too long")
    .regex(/^[A-Za-z0-9-]+$/, "Hub code can only contain letters, numbers and dashes"),

  email: z
    .string()
    .trim()
    .email("Please provide a valid hub email")
    .max(160, "Hub email is too long")
    .optional(),

  phone: z
    .string()
    .trim()
    .min(10, "Hub phone must be at least 10 digits")
    .max(20, "Hub phone is too long")
    .optional(),

  address: z
    .string()
    .trim()
    .min(5, "Hub address must be at least 5 characters")
    .max(300, "Hub address is too long"),

  city: z
    .string()
    .trim()
    .min(2, "City must be at least 2 characters")
    .max(80, "City is too long"),

  district: z
    .string()
    .trim()
    .min(2, "District must be at least 2 characters")
    .max(80, "District is too long"),

  division: z
    .string()
    .trim()
    .min(2, "Division must be at least 2 characters")
    .max(80, "Division is too long"),
});

export const adminUpdateHubValidation = z
  .object({
    hubName: z
      .string()
      .trim()
      .min(2, "Hub name must be at least 2 characters")
      .max(120, "Hub name is too long")
      .optional(),

    email: z
      .string()
      .trim()
      .email("Please provide a valid hub email")
      .max(160, "Hub email is too long")
      .optional(),

    phone: z
      .string()
      .trim()
      .min(10, "Hub phone must be at least 10 digits")
      .max(20, "Hub phone is too long")
      .optional(),

    address: z
      .string()
      .trim()
      .min(5, "Hub address must be at least 5 characters")
      .max(300, "Hub address is too long")
      .optional(),

    city: z
      .string()
      .trim()
      .min(2, "City must be at least 2 characters")
      .max(80, "City is too long")
      .optional(),

    district: z
      .string()
      .trim()
      .min(2, "District must be at least 2 characters")
      .max(80, "District is too long")
      .optional(),

    division: z
      .string()
      .trim()
      .min(2, "Division must be at least 2 characters")
      .max(80, "Division is too long")
      .optional(),

    status: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine(
        (value) => value === undefined || hubStatusValues.includes(value as never),
        { message: "Please provide a valid hub status" },
      ),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Please provide at least one field to update",
  });

export const adminReviewApplicationValidation = z.object({
  action: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "APPROVED" || value === "REJECTED", {
      message: "Please provide a valid review action",
    }),

  rejectionReason: z.string().trim().max(300).optional(),
});
