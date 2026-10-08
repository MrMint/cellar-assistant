"use client";

import {
  BAR_KINDS,
  type BarKind,
  PANTRY_KINDS,
  PANTRY_SECTIONS,
} from "@cellar-assistant/contracts/bar";
import { useState } from "react";
import { useMutation } from "urql";
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

  const toggle = async (kind: BarKind) => {
    const next = !have.has(kind);
    const flip = (on: boolean) =>
      setHave((current) => {
        const copy = new Set(current);
        if (on) copy.add(kind);
        else copy.delete(kind);
        return copy;
      });
    flip(next);
    const response = await setItem({ kind, have: next });
    const result = unwrapResult(
      response.data?.setBarPantryItem,
      "BarPantryEntry",
    );
    if (!result.ok) {
      flip(!next);
      notify(`Couldn't update ${BAR_KINDS[kind].label}`, { tone: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 type-callout text-ink-2">
        Tick what's in your kitchen. Bottles in your cellars already count.
      </p>
      {pantrySections().map((section, index) => (
        <section
          key={section.title}
          aria-labelledby={`pantry-section-${index}`}
          className="flex flex-col gap-3"
        >
          <h2
            id={`pantry-section-${index}`}
            className="px-1 type-overline text-ink-3"
          >
            {section.title}
          </h2>
          <div className="flex flex-wrap gap-x-2 gap-y-3">
            {section.kinds.map((kind) => {
              const on = have.has(kind);
              return (
                <FilterChip
                  key={kind}
                  selected={on}
                  data-pantry-kind={kind}
                  icon={on ? <Check aria-hidden /> : undefined}
                  onClick={() => {
                    void toggle(kind);
                  }}
                >
                  {BAR_KINDS[kind].label}
                </FilterChip>
              );
            })}
          </div>
        </section>
      ))}
      <p className="px-1 type-footnote">
        {have.size} of {PANTRY_KINDS.length} in your pantry.
      </p>
    </div>
  );
}
