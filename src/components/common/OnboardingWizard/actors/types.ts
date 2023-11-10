import { NhostClient } from "@nhost/nextjs";
import { Client } from "urql";
import { BeerFormDefaultValues } from "@/components/beer/BeerForm";
import { SpiritFormDefaultValues } from "@/components/spirit/SpiritForm";
import { WineFormDefaultValues } from "@/components/wine/WineForm";
import { Barcode } from "@/constants";
import { ItemType } from "@/gql/graphql";

export type SearchByBarcodeInput = {
  barcode?: Barcode;
  urqlClient: Client;
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
  name: string;
  vintage?: string;
  type: ItemType;
};
