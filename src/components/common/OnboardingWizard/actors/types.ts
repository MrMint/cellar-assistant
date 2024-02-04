import { NhostClient } from "@nhost/nextjs";
import { ItemType } from "@shared/gql/graphql";
import { Client } from "urql";
import { BeerFormDefaultValues } from "@/components/beer/BeerForm";
import { SpiritFormDefaultValues } from "@/components/spirit/SpiritForm";
import { WineFormDefaultValues } from "@/components/wine/WineForm";
import { Barcode } from "@/constants";

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
  nhostClient: NhostClient;
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
  | WineFormDefaultValues
  | SpiritFormDefaultValues;

export interface DefaultValuesResult<T extends DefaultValues> {
  defaults: T;
  itemOnboardingId: string;
}

export type BarcodeSearchResult = {
  id: string;
  itemId: string;
  name: string;
  vintage?: string;
  type: ItemType;
  displayImageId?: string;
  placeholder?: string | null;
  score?: number | null;
  reviewCount?: number | null;
  reviewed?: boolean | null;
  favoriteCount?: number | null;
  favoriteId?: string | null;
};
