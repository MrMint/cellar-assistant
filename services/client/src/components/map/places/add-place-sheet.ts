import type { PinAddressField } from "../adapter";

/**
 * FS-1: the map's padding while the Add a place sheet is up. MapLibre centres
 * on the padded box, so the pin (drawn at that box's middle) and
 * `getCenter()` agree: on a phone above the sheet over the map's foot, from
 * md to the right of the sheet at the map's left edge.
 */
export function mapPaddingFor(
  desktop: boolean,
  sheetPx: number,
): { top: number; bottom: number; left: number; right: number } {
  const px = Math.max(0, Math.round(sheetPx));
  return desktop
    ? { top: 0, bottom: 0, left: px, right: 0 }
    : { top: 0, bottom: px, left: 0, right: 0 };
}

type AddressDraft = Partial<Record<PinAddressField, string>>;

const FIELDS: readonly PinAddressField[] = [
  "street_address",
  "locality",
  "region",
  "postcode",
  "country_code",
];

/**
 * What a moved pin's reverse geocode writes into the address fields: a
 * field that still holds the last pin's value (or nothing) takes the new
 * pin's; a field the person typed is theirs and stays. A field the new pin
 * has no value for is cleared only when it was the last pin's.
 */
export function repinAddress(
  previousDraft: AddressDraft,
  current: AddressDraft,
  nextDraft: AddressDraft,
): AddressDraft {
  const writes: AddressDraft = {};
  for (const field of FIELDS) {
    const now = current[field]?.trim() ?? "";
    const wasPin = now === "" || now === (previousDraft[field] ?? "");
    if (!wasPin) continue;
    const next = nextDraft[field] ?? "";
    if (next !== now) writes[field] = next;
  }
  return writes;
}
