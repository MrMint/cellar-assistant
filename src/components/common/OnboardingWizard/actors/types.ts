import type { ItemTypeValue } from "@cellar-assistant/shared";
import type { Client } from "urql";
import type { BeerFormDefaultValues } from "@/components/beer/BeerForm";
import type { CoffeeFormDefaultValues } from "@/components/coffee/CoffeeForm";
import type { SakeFormDefaultValues } from "@/components/sake/SakeForm";
import type { SpiritFormDefaultValues } from "@/components/spirit/SpiritForm";
import type { WineFormDefaultValues } from "@/components/wine/WineForm";
import type { Barcode } from "@/constants";

export type SearchByBarcodeInput = {
  barcode?: Barcode;
  urqlClient: Client;
  userId: string;
};

export type SearchByImageInput = {
  displayImage?: string;
  urqlClient: Client;
  userId: string;
};

export type InsertCellarItemInput = {
  urqlClient: Client;
  itemId: string;
  cellarId: string;
  displayImage?: string;
};

export type InsertCellarItemResult = {
  itemId: string;
};

export type UploadFilesInput = {
  frontLabel?: string;
  backLabel?: string;
};

export type UploadFilesResult = {
  barcode?: Barcode;
  frontLabelFileId?: string;
  backLabelFileId?: string;
};

export type FetchDefaultsInput = {
  urqlClient: Client;
  barcode?: Barcode;
  frontLabelFileId?: string;
  backLabelFileId?: string;
};

export type DefaultValues =
  | BeerFormDefaultValues
  | CoffeeFormDefaultValues
  | SakeFormDefaultValues
  | SpiritFormDefaultValues
  | WineFormDefaultValues;

export interface DefaultValuesResult<T extends DefaultValues> {
  defaults: T;
  itemOnboardingId: string;
  confidence: number;
}

export type UploadItemImageInput = {
  urqlClient: Client;
  itemId: string;
  itemType: ItemTypeValue;
  displayImage?: string;
};

export type UploadItemImageResult = {
  imageId?: string;
};

export type BarcodeSearchResult = {
  id: string;
  itemId: string;
  name: string;
  vintage?: string;
  type: ItemTypeValue;
  displayImageId?: string;
  placeholder?: string | null;
  score?: number | null;
  reviewCount?: number | null;
  reviewed?: boolean | null;
  favoriteCount?: number | null;
  favoriteId?: string | null;
};
