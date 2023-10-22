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

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
