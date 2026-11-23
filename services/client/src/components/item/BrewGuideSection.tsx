"use client";

import type { ItemView } from "./adapter";

/**
 * "Brew guide": the viewer's own water temperature, steep time, dose and
 * water for a tea or coffee (`item_brew_prefs`, ux-c M1/M4). `ItemPageView`
 * mounts it for those two types only.
 *
 * A slot. It fetches its own data through urql and renders nothing until it
 * has some (plan L38). In seams it has no query yet and always renders
 * `null`; the stream that owns it fills it in without touching
 * `ItemPageView`.
 */
export function BrewGuideSection(_props: { item: ItemView }) {
  return null;
}
