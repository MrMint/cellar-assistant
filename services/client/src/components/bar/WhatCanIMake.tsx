"use client";

import { type BarKind, barKindLabel } from "@cellar-assistant/contracts/bar";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { Cocktail } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection } from "@/components/app/Page";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { Button } from "@/components/ui/button";
import { BarAppBar } from "./BarAppBar";
import { BarRecipeRow } from "./BarRecipeRow";
import type { YourBarMatch } from "./queries";
import { barRowDetail } from "./your-bar/detail";
import { countText, readinessLine, splitBar } from "./your-bar/sections";
import { WorthPickingUp } from "./your-bar/WorthPickingUp";

export type WhatCanIMakeData = {
  makeNow: readonly YourBarMatch[];
  oneBottleAway: readonly YourBarMatch[];
  makeNowCount: number;
  oneBottleAwayCount: number;
  bottleCount: number;
  pantryCount: number;
  scanned: number;
};

type Section = "now" | "away";

type MissingLike = {
  readonly makeability: {
    readonly missing: readonly string[];
    readonly missingKinds?: readonly BarKind[] | null;
    readonly status?: string;
  };
};

/**
 * The bottles that would unlock the most One-bottle-away cocktails: each
 * row's single missing ingredient, counted ("Sweet vermouth · In 4 drinks").
 *
 * Counted by **kind** where the vocabulary places the ingredient — one
 * recipe prints "Campari", another "Red bitter aperitivo", and both are the
 * same bottle to buy — and by the printed name, case-folded, where it does
 * not. A swap row misses nothing, so it never counts here.
 */
export const nextBottles = (
  oneAway: readonly MissingLike[],
  limit = 3,
): { name: string; unlocks: number; kind: BarKind | null }[] => {
  const counts = new Map<
    string,
    { name: string; unlocks: number; kind: BarKind | null }
  >();
  for (const match of oneAway) {
    const missing = match.makeability.missing[0];
    if (missing === undefined) continue;
    const kind = match.makeability.missingKinds?.[0] ?? null;
    const key = kind === null ? `name:${missing.toLowerCase()}` : kind;
    const name = barKindLabel(kind) ?? missing;
    const entry = counts.get(key);
    counts.set(key, {
      name: entry?.name ?? name,
      unlocks: (entry?.unlocks ?? 0) + 1,
      kind,
    });
  }
  return Array.from(counts.values())
    .filter((entry) => entry.unlocks > 1)
    .sort((a, b) => b.unlocks - a.unlocks || a.name.localeCompare(b.name))
    .slice(0, limit);
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** "From 240 bottles and 10 pantry items", naming only what there is. */
export const fromLine = (bottles: number, pantry: number): string => {
  const parts = [
    bottles > 0 ? plural(bottles, "bottle", "bottles") : null,
    pantry > 0 ? plural(pantry, "pantry item", "pantry items") : null,
  ].filter((part): part is string => part !== null);
  return `From ${parts.join(" and ")}`;
};

const ingredientsOf = (match: YourBarMatch) =>
  match.recipe.ingredients.edges.map((edge) => edge.node);

/**
 * **Your bar** (Recipes-Make board; G29, D18): the viewer's cocktails split
 * into Make now and One bottle away, from the bottles in their own cellars
 * and their pantry (D23). One recipe per drink (the version closest to
 * makeable). A swap is never Make now (CROSS-LOT, `splitBar`).
 *
 * Opens on Make now unless there is nothing there and something one bottle
 * away, so the first screen is never an empty one with the answer a tap off.
 */
export function WhatCanIMake({ data }: { data: WhatCanIMakeData }) {
  const bar = useMemo(() => splitBar(data), [data]);
  const [section, setSection] = useState<Section>(() =>
    bar.readyCount.value === 0 && bar.away.length > 0 ? "away" : "now",
  );
  const unlock = useMemo(() => nextBottles(bar.away), [bar.away]);

  if (data.bottleCount === 0 && data.pantryCount === 0) {
    return (
      <>
        <BarAppBar />
        <EmptyState
          illustration={<Cocktail />}
          title="Your bar is empty"
          action={
            <Button asChild>
              <Link href="/recipes/bar/pantry" underline="none">
                Stock pantry
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const rows = section === "now" ? bar.ready : bar.away;
  const segmentLabel = (label: string, more: boolean, value: number) =>
    more ? `${label} ${countText({ value, more })}` : label;

  return (
    <>
      <BarAppBar line={readinessLine(bar.readyCount, bar.awayCount)} />
      <div className="flex flex-col gap-4">
        <p className="t-cap m-0 px-1 text-ink-2 tabular-nums">
          {fromLine(data.bottleCount, data.pantryCount)}
        </p>

        <SegmentedControl<Section>
          aria-label="Show"
          value={section}
          onValueChange={setSection}
          options={[
            {
              value: "now",
              label: segmentLabel(
                "Make now",
                bar.readyCount.more,
                bar.readyCount.value,
              ),
              count: bar.readyCount.more ? undefined : bar.readyCount.value,
            },
            {
              value: "away",
              label: segmentLabel(
                "One bottle away",
                bar.awayCount.more,
                bar.awayCount.value,
              ),
              count: bar.awayCount.more ? undefined : bar.awayCount.value,
            },
          ]}
        />

        {rows.length === 0 ? (
          <EmptyState
            boxed
            illustration={<Cocktail />}
            title={
              section === "now" ? "Nothing to make yet" : "Nothing one away"
            }
            action={
              section === "now" && bar.away.length > 0 ? (
                <Button variant="outline" onClick={() => setSection("away")}>
                  One bottle away
                </Button>
              ) : undefined
            }
          />
        ) : (
          <InsetSection
            data-testid={section === "now" ? "make-now" : "one-bottle-away"}
            aria-label={section === "now" ? "Make now" : "One bottle away"}
          >
            {rows.map((match) => (
              <BarRecipeRow
                key={match.recipeId}
                recipeId={match.recipeId}
                name={match.name}
                makeability={match.makeability}
                detail={barRowDetail(match.makeability, ingredientsOf(match))}
              />
            ))}
          </InsetSection>
        )}

        {unlock.length > 0 && <WorthPickingUp bottles={unlock} />}
      </div>
    </>
  );
}
