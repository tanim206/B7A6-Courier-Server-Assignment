import z from "zod";

/* ==========================================
   PROFILE UPDATE
   THE EMAIL IS THE LOGIN IDENTITY SO IT IS
   NOT PART OF THIS PAYLOAD
========================================== */

const updateProfileZodSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name must be atleast 3 characters long")
    .max(60, "Name must be at most 60 characters long"),

  phone: z
    .string()
    .trim()
    .regex(
      /^01[3-9]\d{8}$/,
      "Please provide a valid Bangladeshi phone number",
    ),
});

export const UserValidation = {
  updateProfileZodSchema,
};
