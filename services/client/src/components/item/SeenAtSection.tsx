"use client";

import type { ItemView } from "./adapter";

/**
 * "Seen at": the places this item has been seen on a menu or logged (ux-c M4).
 *
 * A slot. It fetches its own data through urql and renders nothing until it
 * has some (plan L38), so the server-rendered `ItemPageView` stays
 * synchronous. In seams it has no query yet and always renders `null`; the
 * stream that owns it fills it in without touching `ItemPageView`.
 */
export function SeenAtSection(_props: { item: ItemView }) {
  return null;
}
