export enum ItemType {
  Beer,
  Wine,
  Spirit,
}

export enum BarcodeType {
  UPC_12,
  EAN_13,
}

export type Barcode = {
  text: string;
  type: BarcodeType;
};
