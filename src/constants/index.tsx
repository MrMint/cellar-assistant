import {
  Beer_Style_Enum,
  Country_Enum,
  Permission_Type_Enum,
  Wine_Style_Enum,
  Wine_Variety_Enum,
} from "@/gql/graphql";
import { getEnumKeys } from "@/utilities";

export enum BarcodeType {
  UPC_A = "UPC_A",
  EAN_13 = "EAN_13",
  UPC_E = "UPC_E",
  EAN_8 = "EAN_8",
}

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

// TODO move these over to graphql queries to support enum table edits at runtime
export const beerStyleKeys = getEnumKeys(Beer_Style_Enum);
export const wineStyleKeys = getEnumKeys(Wine_Style_Enum);
export const wineVarietyKeys = getEnumKeys(Wine_Variety_Enum);
export const countryKeys = getEnumKeys(Country_Enum);
export const permissionKeys = getEnumKeys(Permission_Type_Enum);
