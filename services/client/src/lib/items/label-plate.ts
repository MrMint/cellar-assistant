/**
 * What a LabelPlate prints (design-direction §3.5, roadmap N28): the
 * typographic label drawn wherever an item has no photo of its own.
 *
 * Pure and deterministic — the same item always gives the same plate, on the
 * server and in the browser, with no AI and no network. Everything here comes
 * from fields the caller already selected; a field it did not select simply
 * leaves its line off the plate. Nothing is guessed: no vintage is invented,
 * and "NV" is printed only for a wine, where it is a real term ("non-vintage")
 * rather than a placeholder.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { formatVintage } from "@/utilities";
import { formatCountry } from "@/utilities/formatters";
import { displayItemName } from "@/utilities/smart-title-case";

export type LabelPlateData = {
  /** The primary brand: the producer, set in Inter small caps. */
  producer?: string;
  name: string;
  /** A four-digit year, "NV" for a non-vintage wine, or absent. */
  vintage?: string;
  /** Region (else country) · ABV, the plate's last line. */
  origin?: string;
  abv?: string;
};

/** The fields a plate can be built from — every one optional but the name. */
export type LabelPlateSource = {
  type: ApiItemType;
  name: string;
  producer?: string | null;
  /** Wine, beer, spirit: an ISO day. */
  vintage?: string | null;
  /** Sake: an integer year. */
  vintageYear?: number | null;
  region?: string | null;
  country?: string | null;
  alcoholContentPercentage?: number | null;
};

/** Types whose catalog rows carry a vintage at all (coffee and tea do not). */
const HAS_VINTAGE: ReadonlySet<ApiItemType> = new Set<ApiItemType>([
  "WINE",
  "BEER",
  "SPIRIT",
  "SAKE",
]);

const present = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

/**
 * `13.5` → `"13.5%"`, `14` → `"14%"`, at most one decimal. Out-of-range or
 * non-finite values print nothing rather than a wrong number.
 */
export const formatAbv = (
  value: number | null | undefined,
): string | undefined => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  if (value <= 0 || value > 100) return undefined;
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
};

/**
 * Region wins over country: "Piedmont" says more than "Italy". A country is
 * stored as an enum (`NEW_ZEALAND`) and goes through the shared formatter; a
 * region is free text and is printed as stored.
 */
const originOf = (source: LabelPlateSource): string | undefined =>
  present(source.region) ?? present(formatCountry(present(source.country)));

export const labelPlateFrom = (source: LabelPlateSource): LabelPlateData => {
  const vintage = HAS_VINTAGE.has(source.type)
    ? formatVintage(source.vintage ?? source.vintageYear)
    : undefined;
  const plate: LabelPlateData = { name: displayItemName(source.name) };
  const producer = present(source.producer);
  if (producer !== undefined && producer !== plate.name) {
    plate.producer = producer;
  }
  if (vintage !== undefined) plate.vintage = vintage;
  else if (source.type === "WINE") plate.vintage = "NV";
  const origin = originOf(source);
  if (origin !== undefined) plate.origin = origin;
  const abv = formatAbv(source.alcoholContentPercentage);
  if (abv !== undefined) plate.abv = abv;
  return plate;
};

/** "Piedmont · 14%", or whichever half exists. */
export const plateFootLine = (plate: LabelPlateData): string | undefined => {
  const parts = [plate.origin, plate.abv].filter(
    (part): part is string => part !== undefined,
  );
  return parts.length > 0 ? parts.join(" · ") : undefined;
};

/**
 * The plate read aloud, when it stands for the item's picture: "Vietti
 * Barolo, 2016, Piedmont · 14%". "NV" is spelled out.
 */
export const plateSummary = (plate: LabelPlateData): string => {
  const head = [plate.producer, plate.name].filter(Boolean).join(" ");
  const vintage = plate.vintage === "NV" ? "non-vintage" : plate.vintage;
  return [head, vintage, plateFootLine(plate)].filter(Boolean).join(", ");
};
