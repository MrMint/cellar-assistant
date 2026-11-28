/**
 * The pure half of `82450ad1:src/utilities/index.ts`, restored so ported
 * components can keep their `@/utilities` imports.
 *
 * Kept: the formatters the restored cards and headers render with.
 *
 * Deliberately **not** restored (see `docs/archive/nhost-migration/LEGACY-RESTORE.md`):
 * - the storage-URL builder — images render from the
 *   presigned `ItemImage.file.url` the API hands back.
 * - `dataUrlToFile`, `compressImage` — the base64-through-a-server-action
 *   upload path (E2d/E2f). Uploads go through `lib/api/files.ts`.
 * - `formatIsoDateString`, `convertYearToDate` — date-fns, and the hydration
 *   rule: dates render through `common/Timestamp.tsx`.
 * - `typeToIdKey`, `getItemType` — the old table and column names.
 * - `getRandomInt` — its one caller was the `Math.random()` ingredient
 *   availability bug (§7).
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { formatEnum } from "./formatters";

export { formatEnum } from "./formatters";

export function formatAsPercentage(input: number | null | undefined) {
  if (input === null || input === undefined) return undefined;
  return `${input}%`;
}

/**
 * `2019`, from either an ISO day (`2019-01-01`, wine/beer/spirit `vintage`) or
 * a year (`2019`, sake `vintageYear`). The old version parsed with date-fns;
 * only the year was ever shown, so it is sliced here instead — no `Date`, so
 * no timezone to disagree about between server and browser.
 */
export function formatVintage(
  vintage: string | number | null | undefined,
): string | undefined {
  if (vintage === null || vintage === undefined) return undefined;
  if (typeof vintage === "number") return vintage.toString();
  const year = vintage.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : undefined;
}

/** What a non-vintage wine shows where a year would be (X19). */
export const NON_VINTAGE_LABEL = "NV";

/**
 * An item's vintage for display (X19): a wine's `null` vintage is an answer —
 * non-vintage — and reads "NV"; every other type's `null` is simply absent.
 * `undefined` (the field was not fetched) is never NV. An already-formatted
 * "NV" passes through, so a card can format what an adapter formatted.
 */
export function formatItemVintage(
  type: string,
  vintage: string | number | null | undefined,
): string | undefined {
  if (vintage === NON_VINTAGE_LABEL) return NON_VINTAGE_LABEL;
  if (type === "WINE" && vintage === null) return NON_VINTAGE_LABEL;
  return formatVintage(vintage);
}

/**
 * The old placeholders were bare base64 bodies (`png;base64,…`) that
 * `next/image` wanted prefixed. A value that already carries its scheme is
 * passed through rather than double-prefixed.
 */
export const getNextPlaceholder = (
  placeholderDataUrl: string | undefined | null,
): `data:image/${string}` | undefined => {
  if (placeholderDataUrl === null || placeholderDataUrl === undefined) {
    return undefined;
  }
  if (placeholderDataUrl.startsWith("data:image/")) {
    return placeholderDataUrl as `data:image/${string}`;
  }
  return `data:image/${placeholderDataUrl}`;
};

export const formatItemType = (type: ApiItemType) => {
  switch (type) {
    case "BEER":
      return "Beer";
    case "WINE":
      return "Wine";
    case "SPIRIT":
      return "Spirit";
    case "COFFEE":
      return "Coffee";
    case "SAKE":
      return "Sake";
    case "TEA":
      return "Tea";
  }
};

export const parseNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") return undefined;
  const result = Number.parseFloat(value);
  if (Number.isNaN(result)) return undefined;
  return result;
};

/**
 * `Brand · Descriptor`, the line under an item's name on every card.
 *
 * The old signature took a query row (`brands[0].brand.name`,
 * `subtitle_field`); this takes the two values directly so any adapter can
 * call it. Same join, same `formatEnum` on the descriptor.
 */
export function buildItemSubtitle(result: {
  brandName?: string | null;
  descriptor?: string | null;
}): string | undefined {
  const descriptor = result.descriptor
    ? formatEnum(result.descriptor)
    : undefined;
  const parts = [result.brandName, descriptor].filter(
    (part): part is string => typeof part === "string" && part !== "",
  );
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
