import { BeerFormDefaultValues } from "@/components/beer/BeerForm";
import { SpiritFormDefaultValues } from "@/components/spirit/SpiritForm";
import { WineFormDefaultValues } from "@/components/wine/WineForm";
import { Barcode, ItemType } from "@/constants";
import { NhostClient } from "@nhost/nextjs";
import { Client } from "urql";

export type SearchByBarcodeInput = {
  barcode?: Barcode;
  urqlClient: Client;
};

export type InsertCellarItemInput = {
  urqlClient: Client;
  itemId: string;
  cellarId: string;
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
  name: string;
  vintage?: string;
  type: ItemType;
};
