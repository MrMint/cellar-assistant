import { graphql } from "@shared/gql/graphql";

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
export type wineStyleKeys = ReturnType<
  typeof graphql.scalar<"wine_style_enum">
>;
export type wineVarietyKeys = ReturnType<
  typeof graphql.scalar<"wine_variety_enum">
>;
export const countryKeys = graphql.scalar<"country_enum">;
export type permissionKeys = ReturnType<
  typeof graphql.scalar<"permission_type_enum">
>;
export type coffeeRoastLevelKeys = ReturnType<
  typeof graphql.scalar<"coffee_roast_level_enum">
>;
export type coffeeProcessKeys = ReturnType<
  typeof graphql.scalar<"coffee_process_enum">
>;
export type coffeeCultivarKeys = ReturnType<
  typeof graphql.scalar<"coffee_cultivar_enum">
>;
