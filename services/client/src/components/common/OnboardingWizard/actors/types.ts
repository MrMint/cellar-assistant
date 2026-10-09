import type { Client } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { Barcode } from "@/constants";
import type { AiOutcome } from "@/lib/ai/outcome";
import type { DraftMeta } from "@/lib/capture/draft-store";
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
  /**
   * X05: track the read in `captureDrafts` under the session id, so it
   * survives leaving the page ("Keep going in the background") and a return
   * adopts it instead of asking again.
   */
  draft?: DraftMeta;
};

/** X05/N21: the optional back label, read with the front under a new session. */
export type RereadLabelsInput = {
  urqlClient: Client;
  itemType: ApiItemType;
  barcode?: Barcode;
  /** The front label already uploaded at the shutter, if it was. */
  frontLabelFileId?: string;
  /** The back-label capture, as a data URL. */
  backLabel: string;
};

export type RereadLabelsResult = DefaultValuesResult & {
  backLabelFileId?: string;
};

export type OpenCellarItemInput = {
  urqlClient: Client;
  cellarId: string;
  cellarItemId: string;
};

/** N19: the read label, looked up in the catalogue. */
export type SearchCatalogInput = {
  urqlClient: Client;
  itemType: ApiItemType;
  defaults: OnboardingDefaults;
  /** Items the person already declined (the barcode chooser's "Create New"). */
  excludeItemIds: readonly string[];
};

export interface DefaultValuesResult {
  defaults: OnboardingDefaults;
  itemOnboardingId: string;
  confidence: number;
  /**
   * Why nothing was read — no label, a photograph that is not one, no
   * provider, a spent allowance — as `aiOutcome`'s words (N07), never the
   * server's message. Not fatal: the session row exists and confirm works,
   * which is what makes typing it in by hand a real path.
   */
  extractionError?: AiOutcome;
  /**
   * Whether a label photograph reached the read — from the session itself
   * when it answered (so a resumed draft knows), else from what was sent.
   */
  labelSent?: boolean;
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

/** The session `analyze` opened, closed because an existing item was filed. */
export type CloseOnboardingInput = {
  urqlClient: Client;
  itemOnboardingId: string;
};
