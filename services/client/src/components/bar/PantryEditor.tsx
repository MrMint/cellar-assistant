"use client";

import {
  BAR_KINDS,
  type BarKind,
  PANTRY_KINDS,
  PANTRY_SECTIONS,
} from "@cellar-assistant/contracts/bar";
import { useRef, useState } from "react";
import { useMutation } from "urql";
import { AppBar } from "@/components/app/AppBar";
import { FilterChip } from "@/components/app/FilterChip";
import { Check } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { unwrapResult } from "@/lib/api/result";
import { SetBarPantryItemMutation } from "./queries";

/** The pantry's sections, each with its toggles in screen order. */
export const pantrySections = (): {
  title: string;
  kinds: BarKind[];
}[] =>
  PANTRY_SECTIONS.map((section) => ({
    title: section.title,
    kinds: PANTRY_KINDS.filter((kind) =>
      section.groups.includes(BAR_KINDS[kind].group),
    ),
  })).filter((section) => section.kinds.length > 0);

/**
 * D23 — **the Bar pantry**: about thirty toggles for what a cellar does not
 * hold (citrus, syrups, bitters, vermouths, mixers, dairy, garnishes).
 * Bottles in your cellars count automatically and are not here.
 *
 * Chips rather than thirty switch rows: one tap each, the whole pantry on a
 * phone's first screen or two, and each chip a 44 pt target. A tap flips at
 * once and saves in the background; a refusal flips it back and says so.
 */
export function PantryEditor({ initial }: { initial: readonly BarKind[] }) {
  const [have, setHave] = useState<ReadonlySet<BarKind>>(
    () => new Set(initial),
  );
  const [, setItem] = useMutation(SetBarPantryItemMutation);
  // Per chip: the save in flight (so a quick second tap is sent after the
  // first, never racing it to the server and landing first) and how many
  // taps there have been (so only the newest tap's failure flips it back).
  const inFlight = useRef(new Map<BarKind, Promise<void>>());
  const taps = useRef(new Map<BarKind, number>());

  const toggle = (kind: BarKind) => {
    const next = !have.has(kind);
    const flip = (on: boolean) =>
      setHave((current) => {
        const copy = new Set(current);
        if (on) copy.add(kind);
        else copy.delete(kind);
        return copy;
      });
    flip(next);
    const tap = (taps.current.get(kind) ?? 0) + 1;
    taps.current.set(kind, tap);
    const save = async () => {
      const response = await setItem({ kind, have: next });
      const result = unwrapResult(
        response.data?.setBarPantryItem,
        "BarPantryEntry",
      );
      if (!result.ok && taps.current.get(kind) === tap) {
        flip(!next);
        notify(`Couldn't update ${BAR_KINDS[kind].label}`, { tone: "error" });
      }
    };
    const queued = (inFlight.current.get(kind) ?? Promise.resolve())
      .catch(() => undefined)
      .then(save);
    inFlight.current.set(kind, queued);
  };

  return (
    <>
      <AppBar
        parent="/recipes/bar"
        title={
          <div className="flex items-center gap-2">
            <h1 className="t-title m-0 min-w-0 flex-1 truncate text-ink">
              Pantry
            </h1>
            <output
              aria-live="polite"
              data-testid="pantry-count"
              className="t-cap shrink-0 text-ink-2 tabular-nums"
            >
              {have.size} of {PANTRY_KINDS.length}
            </output>
          </div>
        }
      />
      <div className="flex flex-col gap-6">
        <p className="t-cap m-0 px-1 text-ink-2">
          Bottles in your cellars already count.
        </p>
        {pantrySections().map((section, index) => (
          <section
            key={section.title}
            aria-labelledby={`pantry-section-${index}`}
            className="flex flex-col gap-3"
          >
            <h2
              id={`pantry-section-${index}`}
              className="t-head m-0 px-1 text-ink"
            >
              {section.title}
            </h2>
            <div className="flex flex-wrap gap-2">
              {section.kinds.map((kind) => {
                const on = have.has(kind);
                return (
                  <FilterChip
                    key={kind}
                    selected={on}
                    data-pantry-kind={kind}
                    icon={on ? <Check aria-hidden /> : undefined}
                    onClick={() => toggle(kind)}
                  >
                    {BAR_KINDS[kind].label}
                  </FilterChip>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
