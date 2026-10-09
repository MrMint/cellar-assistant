import { allAddableCellars } from "@/components/item/page-lists";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import type { AddableCellar } from "./CellarPicker";
import { CaptureCellarsQuery } from "./queries";

/**
 * Every cellar the viewer may add a bottle to (creator or co-owner), past
 * 100. Empty when the read fails: the page still works — the draft card
 * just has no "Into" row and the item is catalogued without a bottle.
 */
export async function loadAddableCellars(): Promise<AddableCellar[]> {
  const data = await apiServerQuery(CaptureCellarsQuery, {});
  const first = unwrapResult(data.myCellars, "CellarConnection");
  if (!first.ok) return [];
  return allAddableCellars(apiServerQuery, first.data, data.me?.id ?? null);
}
