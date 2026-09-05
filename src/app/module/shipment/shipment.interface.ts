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
  weight?: number;
  description?: string;

  destinationHubId: string;
}
