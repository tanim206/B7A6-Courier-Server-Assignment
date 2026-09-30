import { z } from "zod";

export const createShipmentValidation = z.object({
  senderId: z
    .string()
    .trim()
    .min(1, "Please select a customer")
    .uuid("Please select a valid customer"),

  receiverName: z
    .string()
    .trim()
    .min(2, "Receiver name must be at least 2 characters")
    .max(100, "Receiver name is too long"),

  receiverEmail: z
    .string()
    .trim()
    .email("Please provide a valid receiver email")
    .max(160, "Receiver email is too long"),

  receiverPhone: z
    .string()
    .trim()
    .min(10, "Receiver phone must be at least 10 digits")
    .max(20, "Receiver phone is too long"),

  receiverAddress: z
    .string()
    .trim()
    .min(5, "Receiver address must be at least 5 characters")
    .max(300, "Receiver address is too long"),

  receiverCity: z
    .string()
    .trim()
    .min(2, "Receiver city must be at least 2 characters")
    .max(80, "Receiver city is too long"),

  receiverDistrict: z
    .string()
    .trim()
    .min(2, "Receiver district must be at least 2 characters")
    .max(80, "Receiver district is too long"),

  receiverDivision: z
    .string()
    .trim()
    .min(2, "Receiver division must be at least 2 characters")
    .max(80, "Receiver division is too long"),

  parcelName: z
    .string()
    .trim()
    .min(2, "Parcel name must be at least 2 characters")
    .max(120, "Parcel name is too long"),

  weight: z.coerce
    .number({ message: "Please provide a valid parcel weight" })
    .positive("Parcel weight must be greater than 0")
    .max(1000, "Parcel weight cannot be more than 1000 kg"),

  description: z
    .string()
    .trim()
    .max(500, "Description cannot be more than 500 characters")
    .optional(),

  destinationHubId: z
    .string()
    .trim()
    .min(1, "Please select a destination hub")
    .uuid("Please select a valid destination hub"),
});

export const deliveryChargeQuoteValidation = z.object({
  destinationHubId: z
    .string()
    .trim()
    .min(1, "Please select a destination hub")
    .uuid("Please select a valid destination hub"),

  weight: z.coerce
    .number({ message: "Please provide a valid parcel weight" })
    .positive("Parcel weight must be greater than 0")
    .max(1000, "Parcel weight cannot be more than 1000 kg"),
});

export const hubShipmentsQueryValidation = z.object({
  searchTerm: z.string().trim().max(160).optional(),

  status: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .refine(
      (value) =>
        value === undefined ||
        [
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
        ].includes(value),
      { message: "Please provide a valid shipment status" },
    ),
});
