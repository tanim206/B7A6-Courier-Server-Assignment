import httpStatus from "http-status";
import config from "../config";
import { AppError } from "../utils/AppError";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
  try {
    const IdTokenKey = "bkash:idToken";
    const RefreshTokenKey = "bkash:refreshToken";

    let bkashIdToken = await redisClient.get(IdTokenKey);
    const bkashIdTokenTTL = await redisClient.ttl(IdTokenKey);

    const bkashRefreshToken = await redisClient.get(RefreshTokenKey);
    const bkashRefreshTokenTTL = await redisClient.ttl(RefreshTokenKey);

    if (
      (bkashIdTokenTTL <= 600 || !bkashIdToken) &&
      bkashRefreshToken &&
      bkashRefreshTokenTTL > 600
    ) {
      const refreshTokenResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/token/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            username: config.bkash_username,
            password: config.bkash_password,
          },
          body: JSON.stringify({
            app_key: config.bkash_app_key,
            app_secret: config.bkash_app_secret,
            refresh_token: bkashRefreshToken,
          }),
        },
      );
      if (!refreshTokenResponse.ok) {
        throw new AppError(
          httpStatus.BAD_GATEWAY,
          "Bkash Access Token Grant Failed",
        );
      }

      const bkashRefreshTokenResult = await refreshTokenResponse.json();

      bkashIdToken = bkashRefreshTokenResult.id_token as string;

      await redisClient.set(IdTokenKey, bkashIdToken, {
        expiration: {
          type: "EX",
          value: 60 * 60,
        },
      });

      return bkashIdToken;
    }

    if (bkashIdTokenTTL > 600) {
      return bkashIdToken;
    }

    const response = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/token/grant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );

    if (!response.ok) {
      throw new AppError(
        httpStatus.BAD_GATEWAY,
        "Bkash Access Token Grant Failed",
      );
    }

    const result = await response.json();

    //bkash id token set
    await redisClient.set(IdTokenKey, result.id_token, {
      expiration: {
        type: "EX",
        value: 60 * 60, // 1hour
      },
    });

    //bkash refresh token set
    await redisClient.set(RefreshTokenKey, result.refresh_token, {
      expiration: {
        type: "EX",
        value: 60 * 60 * 24 * 28, // 28 days
      },
    });

    bkashIdToken = result.id_token;

    return bkashIdToken;
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(httpStatus.BAD_GATEWAY, error.message);
  }
};

/* ==========================================
   TYPES
========================================== */

export interface ICreateBkashPaymentPayload {
  amount: string;
  merchantInvoiceNumber: string;
  //  BKASH REQUIRES A PAYER REFERENCE (SENDER PHONE OR EMAIL)

  payerReference: string;

  //  THE SANDBOX GATEWAY REJECTS THE CAPITALISED FORM WITH
  //  2008 "INVALID INTENT" SO THE VALUE IS SENT IN LOWERCASE

  intent: "sale";
  callbackURL: string;
}

export interface IBkashPaymentResponse {
  bkashURL: string;
  paymentID: string;
  merchantInvoiceNumber?: string;
}

interface IBkashErrorResponse {
  statusCode?: string;
  statusMessage?: string;
}

const getBkashErrorMessage = (
  result: Partial<IBkashErrorResponse>,
  fallback: string,
) => result.statusMessage?.trim() || result.statusCode?.trim() || fallback;

export interface IBkashExecutePaymentResponse {
  paymentID: string;
  trxID: string;
  invoice?: string;
  amount: string;
  status: string;
  transactionStatus: string;
  merchantInvoiceNumber: string;
  success: boolean;
}

const getRequiredHeaders = async () => {
  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
  }

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    //  BKASH EXPECTS THE RAW ID_TOKEN, NOT A BEARER PREFIXED VALUE
    Authorization: bkashIdToken,
    "X-App-Key": config.bkash_app_key,
  };
};

/* ==========================================
   CREATE A TOKENIZED CHECKOUT SESSION
   Returns the bKash redirect URL the user must visit.
========================================== */

export const createBkashPayment = async (
  payload: ICreateBkashPaymentPayload,
): Promise<IBkashPaymentResponse> => {
  try {
    const response = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: await getRequiredHeaders(),
        body: JSON.stringify({
          mode: "0011",
          payerType: "01",
          currency: "BDT",
          ...payload,
        }),
      },
    );

    const result = (await response.json()) as Partial<IBkashPaymentResponse> &
      IBkashErrorResponse;

    if (!response.ok || !result.paymentID || !result.bkashURL) {
      throw new AppError(
        httpStatus.BAD_GATEWAY,
        getBkashErrorMessage(
          result,
          "Bkash Payment Session Could Not Be Created",
        ),
      );
    }

    return {
      bkashURL: result.bkashURL,
      paymentID: result.paymentID,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      httpStatus.BAD_GATEWAY,
      "Bkash Payment Session Could Not Be Created",
    );
  }
};

/* ==========================================
   VERIFY/EXECUTE A CHECKOUT SESSION
   Only bKash itself can confirm that money was actually collected.
========================================== */

export const executeBkashPayment = async (
  paymentID: string,
): Promise<IBkashExecutePaymentResponse> => {
  try {
    const response = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/execute`,
      {
        method: "POST",
        headers: await getRequiredHeaders(),
        body: JSON.stringify({ paymentID }),
      },
    );

    const result = (await response.json()) as IBkashExecutePaymentResponse &
      IBkashErrorResponse;

    if (!response.ok) {
      throw new AppError(
        httpStatus.BAD_GATEWAY,
        getBkashErrorMessage(result, "Bkash Payment Verification Failed"),
      );
    }

    return result;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      httpStatus.BAD_GATEWAY,
      "Bkash Payment Verification Failed",
    );
  }
};
