"use client";

/**
 * Stamps on the Me hub (ux-c M4): no props, its own data.
 *
 * A slot. It fetches its own data through urql and renders nothing until it
 * has some (plan L38). In seams it has no query yet and always renders
 * `null`; the stream that owns it fills it in without touching `MeHub`.
 */
export function MeStamps() {
  return null;
}
