import httpStatus from "http-status";
import config from "../config";
import { AppError } from "../utils/AppError";

/* ==========================================
   DIVISIONS
   Hub.division is stored as a plain string in the database,
   so the supported list lives here and is matched case-insensitively.
========================================== */

export const SUPPORTED_DIVISIONS = [
  "BARISHAL",
  "CHATTAGRAM",
  "DHAKA",
  "KHULNA",
  "RANGPUR",
  "RAJSHAHI",
  "SYLHET",
] as const;

export type TSupportedDivision = (typeof SUPPORTED_DIVISIONS)[number];

/* ==========================================
   DIVISION BASE CHARGE (BDT)
========================================== */

export const divisionBaseCharge: Record<TSupportedDivision, number> = {
  BARISHAL: 130,
  CHATTAGRAM: 140,
  DHAKA: 150,
  KHULNA: 160,
  RANGPUR: 170,
  RAJSHAHI: 180,
  SYLHET: 190,
};

/* ==========================================
   HELPERS
========================================== */

const freeWeightKg = Number(config.delivery_free_weight_kg) || 1;
const extraKgCharge = Number(config.delivery_extra_kg_charge) || 0;

//  NORMALIZES A RAW HUB DIVISION VALUE (e.g. "Chattogram" -> "CHATTAGRAM")

export const normalizeDivision = (division: string): TSupportedDivision => {
  const compact = division.trim().toUpperCase().replace(/[\s_-]/g, "");

  const match = SUPPORTED_DIVISIONS.find(
    (divisionName) => divisionName.replace(/_/g, "") === compact,
  );

  if (!match) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "We do not deliver to this division yet",
    );
  }

  return match;
};

const getBaseCharge = (division: string): number => {
  return divisionBaseCharge[normalizeDivision(division)];
};

const getExtraKg = (weightKg: number): number => {
  return Math.ceil(Math.max(0, weightKg - freeWeightKg));
};

const assertValidWeight = (weightKg: number) => {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Parcel weight must be greater than 0",
    );
  }
};

/* ==========================================
   DELIVERY CHARGE CALCULATION
   - BASE CHARGE DEPENDS ON THE DESTINATION HUB DIVISION
   - THE FIRST N KG ARE INCLUDED IN THE BASE CHARGE
   - EVERY EXTRA KG (OR PART OF IT) ADDS A FLAT SURCHARGE
========================================== */

export const calculateDeliveryCharge = (input: {
  division: string;
  weightKg: number;
}): number => {
  const { division, weightKg } = input;

  assertValidWeight(weightKg);

  return getBaseCharge(division) + getExtraKg(weightKg) * extraKgCharge;
};

//  QUOTE RETURNED TO THE SHIPMENT FORM

export const getDeliveryChargeQuote = (input: {
  division: string;
  weightKg: number;
}) => {
  const { division, weightKg } = input;

  assertValidWeight(weightKg);

  const normalizedDivision = normalizeDivision(division);
  const baseCharge = divisionBaseCharge[normalizedDivision];
  const extraKg = getExtraKg(weightKg);

  return {
    division: normalizedDivision,
    weightKg,
    baseCharge,
    freeWeightKg,
    extraKg,
    extraKgCharge,
    totalCharge: baseCharge + extraKg * extraKgCharge,
  };
};
