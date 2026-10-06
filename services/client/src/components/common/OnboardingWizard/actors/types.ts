import type { Client } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { Barcode } from "@/constants";
import type { OnboardingDefaults } from "../adapter";

/**
 * `82450ad1:…/OnboardingWizard/actors/types.ts`, over the new API. Two
 * changes run through every input: `urqlClient` is still the client, but no
 * `userId` goes anywhere (the API reads the viewer from the session), and every
 * image is a data URL only until an actor turns it into a `File` for the
 * presigned upload (`lib/items/data-url.ts`).
 */

export type SearchByBarcodeInput = {
  barcode?: Barcode;
  urqlClient: Client;
};

/** G32: the display photo, as captured, and the type being added. */
export type SearchByImageInput = {
  displayImage?: string;
  urqlClient: Client;
  itemType?: ApiItemType;
};

export type InsertCellarItemInput = {
  urqlClient: Client;
  itemId: string;
  itemType: ApiItemType;
  cellarId: string;
  /** Minted once per wizard, so a retry files one bottle, not two. */
  cellarItemId: string;
  displayImage?: string;
};

export type InsertCellarItemResult = {
  /** The new bottle's id (client-minted, so a retry adds one bottle). */
  itemId: string;
};

export type UploadFilesInput = {
  urqlClient: Client;
  frontLabel?: string;
  backLabel?: string;
};

export type UploadFilesResult = {
  frontLabelFileId?: string;
  backLabelFileId?: string;
};

export type FetchDefaultsInput = {
  urqlClient: Client;
  itemType: ApiItemType;
  /** Minted once per wizard, so a retry reuses the session (§8.4). */
  itemOnboardingId: string;
  barcode?: Barcode;
  frontLabelFileId?: string;
  backLabelFileId?: string;
};

export interface DefaultValuesResult {
  defaults: OnboardingDefaults;
  itemOnboardingId: string;
  confidence: number;
  /**
   * The server's refusal when nothing was read — no label, a photograph that
   * is not one, no provider. Not fatal: the session row exists and confirm
   * works, which is what makes typing it in by hand a real path.
   */
  extractionError?: string;
}

export type UploadItemImageInput = {
  urqlClient: Client;
  itemId: string;
  itemType: ApiItemType;
  displayImage?: string;
};

export type UploadItemImageResult = {
  imageId?: string;
};
