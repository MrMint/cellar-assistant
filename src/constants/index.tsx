export enum BarcodeType {
  UPC_A = "UPC_A",
  EAN_13 = "EAN_13",
  UPC_E = "UPC_E",
  EAN_8 = "EAN_8",
}

/**
 * Confidence thresholds for AI analysis results.
 * These determine the user experience flow when adding items.
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Below this threshold: Full form with uncertain fields highlighted */
  LOW: 0.7,
  /** At or above this threshold: Quick add card with auto-confirm option */
  HIGH: 0.9,
} as const;

/** Default auto-confirm delay in seconds for quick add */
export const QUICK_ADD_AUTO_CONFIRM_DELAY = 3;

export type Barcode = {
  text: string;
  type?: BarcodeType;
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
