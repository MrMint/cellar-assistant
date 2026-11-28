"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { notify } from "@/components/app/notify";
import { BandSheet } from "@/components/app/parts/BandSheet";
import { type Band, bandName } from "@/components/app/parts/Rank";
import { useTierListActions } from "@/components/tier-list/actions";
import { bandMapOf, rankOf } from "@/components/tier-list/adapter";
import { ListRanksQuery } from "@/components/tier-list/lists/queries";
import { UnratedBandSheet } from "@/components/tier-list/UnratedBandSheet";
import { unwrapResult } from "@/lib/api/result";
import type { PlaceListEntry } from "./PlaceSections";
import { planBandChange, planRemove } from "./place-entry-edit";

export type PlaceEntryEditMode = "band" | "remove" | null;

const asBand = (band: number): Band | null =>
  band >= 1 && band <= 5 ? (band as Band) : null;

/**
 * F-201: the place More sheet's "Change the band" (the band sheet) and
 * "Remove from list" (a confirm) for the viewer's entry the rank block shows,
 * `own[0]`. Every write goes through `planBandChange` / `planRemove`, which
 * refuse an entry that is not on one of the viewer's own lists.
 */
export function PlaceEntryEdit({
  placeName,
  own,
  mode,
  onModeChange,
  onChanged,
}: {
  placeName: string;
  own: readonly PlaceListEntry[];
  mode: PlaceEntryEditMode;
  onModeChange: (mode: PlaceEntryEditMode) => void;
  onChanged: () => void;
}) {
  const entry = own[0] ?? null;
  const listId = entry?.tier_list?.id ?? "";
  const listName = entry?.tier_list?.name ?? "";
  const [{ data }, reexecute] = useQuery({
    query: ListRanksQuery,
    variables: { id: listId },
    pause: listId === "" || mode === null,
  });
  const { reorderBandAction, removeItemFromTierListAction } =
    useTierListActions();
  const [removing, setRemoving] = useState(false);

  if (entry === null) return null;

  const list = unwrapResult(data?.tierList, "TierList");
  const rows = list.ok ? list.data.items.edges.map((edge) => edge.node) : [];
  const counts: Partial<Record<Band, number>> = {};
  for (const row of rows) {
    const band = asBand(row.band);
    if (band !== null) counts[band] = (counts[band] ?? 0) + 1;
  }
  const rank = rankOf(bandMapOf(rows), entry.id) ?? 0;

  const choose = async (band: Band) => {
    const plan = planBandChange(own, entry.id, rows, band);
    if (plan === null) return;
    const result = await reorderBandAction(plan.call, plan.tierListId);
    if (!result.success) {
      notify(result.error ?? "Couldn't move it. Try again.", {
        tone: "error",
      });
      return;
    }
    notify(`Moved to ${bandName(band)} · #${plan.rank} · ${placeName}`);
    reexecute({ requestPolicy: "network-only" });
    onChanged();
  };

  const remove = async () => {
    const plan = planRemove(own, entry.id);
    if (plan === null) return;
    setRemoving(true);
    const result = await removeItemFromTierListAction(plan.id, plan.tierListId);
    setRemoving(false);
    if (!result.success) {
      notify(result.error ?? "Couldn't remove it. Try again.", {
        tone: "error",
      });
      return;
    }
    onModeChange(null);
    notify(`Removed from ${listName}`);
    onChanged();
  };

  const sheetOpen = (open: boolean) => onModeChange(open ? "band" : null);
  const current = asBand(entry.band);

  return (
    <>
      {current !== null ? (
        <BandSheet
          open={mode === "band"}
          onOpenChange={sheetOpen}
          subject={placeName}
          rank={rank}
          band={current}
          listName={listName}
          counts={counts}
          onChoose={(band) => void choose(band)}
          onRemove={() => onModeChange("remove")}
        />
      ) : (
        <UnratedBandSheet
          open={mode === "band"}
          onOpenChange={sheetOpen}
          subject={placeName}
          rank={rank}
          listName={listName}
          counts={counts}
          onChoose={(band) => void choose(band)}
          onRemove={() => onModeChange("remove")}
        />
      )}
      <ConfirmSheet
        open={mode === "remove"}
        onOpenChange={(open) => onModeChange(open ? "remove" : null)}
        title={`Remove from ${listName}?`}
        description={`${placeName} comes off the list, with its place in it.`}
        confirmLabel="Remove"
        onConfirm={() => void remove()}
        pending={removing}
      />
    </>
  );
}
