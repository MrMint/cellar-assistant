"use client";

import {
  BAR_KINDS,
  type BarKind,
  PANTRY_KINDS,
} from "@cellar-assistant/contracts/bar";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { InsetSection } from "@/components/app/Page";
import { SpiritGlyph } from "@/components/app/parts/glyphs";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";
import { SetBarPantryItemMutation } from "../queries";

export type WorthBottle = {
  readonly name: string;
  readonly unlocks: number;
  readonly kind: BarKind | null;
};

const PANTRY = new Set<string>(PANTRY_KINDS);

/** Whether "Have it" can say so: only a pantry kind lives in the pantry. */
export const canHaveIt = (kind: BarKind | null): kind is BarKind =>
  kind !== null && PANTRY.has(kind);

/**
 * "Worth picking up" (Recipes-Make board): the bottles that would unlock the
 * most drinks, "In 4 drinks". Where the bottle is a pantry kind (a vermouth,
 * a syrup), an outlined "Have it" ticks it into the viewer's own pantry at
 * once, with Undo — the same one write the pantry page makes. A bottle that
 * belongs in a cellar is not had from here.
 */
export function WorthPickingUp({
  bottles,
}: {
  bottles: readonly WorthBottle[];
}) {
  const router = useRouter();
  const [, setItem] = useMutation(SetBarPantryItemMutation);
  const [busy, setBusy] = useState<BarKind | null>(null);

  const set = async (kind: BarKind, have: boolean): Promise<boolean> => {
    const result = unwrapResult(
      (await setItem({ kind, have })).data?.setBarPantryItem,
      "BarPantryEntry",
    );
    if (!result.ok) {
      notify(`Couldn't update ${BAR_KINDS[kind].label}`, { tone: "error" });
      return false;
    }
    router.refresh();
    return true;
  };

  const haveIt = async (kind: BarKind) => {
    setBusy(kind);
    const ok = await set(kind, true);
    setBusy(null);
    if (!ok) return;
    notify(`${BAR_KINDS[kind].label} in your pantry`, {
      undo: () => void set(kind, false),
    });
  };

  return (
    <InsetSection label="Worth picking up" data-testid="next-bottles">
      {bottles.map((bottle) => (
        <div
          key={bottle.kind ?? bottle.name}
          className="flex min-h-16 items-center gap-3 py-2.5 pr-3 pl-3.5"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-raised text-glyph">
            <SpiritGlyph aria-hidden className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="t-head truncate text-ink">{bottle.name}</span>
            <span className="t-cap text-ink-2 tabular-nums">
              In {bottle.unlocks} drinks
            </span>
          </div>
          {canHaveIt(bottle.kind) && (
            <Button
              variant="outline"
              disabled={busy === bottle.kind}
              aria-label={`Have it: ${bottle.name}`}
              onClick={() => {
                const kind = bottle.kind;
                if (canHaveIt(kind)) void haveIt(kind);
              }}
            >
              Have it
            </Button>
          )}
        </div>
      ))}
    </InsetSection>
  );
}
