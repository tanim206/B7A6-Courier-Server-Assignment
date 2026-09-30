import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type z from "zod";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}

export const validateRequest = (zodSchema: z.ZodObject) => {
  return catchAsync((req: Request, res: Response, next: NextFunction) => {
    // const payload = req.body ? req.body : {}
    const payload = req.body ?? {};

    const result = zodSchema.safeParse(payload);

    if (!result.success) {
      console.log(result.error);
      console.log(result.error.issues);

      throw new AppError(
        httpStatus.BAD_REQUEST,
        result.error.issues[0].message,
      );
    }

    req.body = result.data;
    next();
  });
};

//  SAME AS validateRequest BUT FOR QUERY PARAMS
//  THE PARSED RESULT IS STORED IN req.validatedQuery

export const validateQuery = (zodSchema: z.ZodObject) => {
  return catchAsync((req: Request, _res: Response, next: NextFunction) => {
    const result = zodSchema.safeParse(req.query ?? {});

    if (!result.success) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        result.error.issues[0].message,
      );
    }

    req.validatedQuery = result.data;
    next();
  });
};
