export interface ICreateShipmentPayload {
  senderId: string;

  receiverName: string;
  receiverEmail: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverCity: string;
  receiverDistrict: string;
  receiverDivision: string;

  parcelName: string;
  weight: number;
  description?: string;

  destinationHubId: string;
}

export interface IGetHubShipmentsQuery {
  searchTerm?: string;
  status?: string;
}

export interface IDeliveryChargeQuoteQuery {
  destinationHubId: string;
  weight: number;
}

export interface IDeliveryChargeQuote {
  division: string;
  weightKg: number;
  baseCharge: number;
  freeWeightKg: number;
  extraKg: number;
  extraKgCharge: number;
  totalCharge: number;
}
