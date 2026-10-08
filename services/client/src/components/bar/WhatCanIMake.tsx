"use client";

import { barKindLabel } from "@cellar-assistant/contracts/bar";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { Cocktail, Pantry } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection } from "@/components/app/Page";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { Button } from "@/components/ui/button";
import { BarRecipeRow } from "./BarRecipeRow";
import type { BarRecipeMatch } from "./queries";

export type WhatCanIMakeData = {
  makeNow: readonly BarRecipeMatch[];
  oneBottleAway: readonly BarRecipeMatch[];
  makeNowCount: number;
  oneBottleAwayCount: number;
  bottleCount: number;
  pantryCount: number;
  scanned: number;
};

type Section = "now" | "away";

/**
 * The bottles that would unlock the most One-bottle-away cocktails: each
 * row's single missing ingredient, counted. "Campari · 4 more cocktails" is
 * the most useful sentence this screen can say about a shopping trip.
 *
 * Counted by **kind** where the vocabulary places the ingredient — one
 * recipe prints "Campari", another "Red bitter aperitivo", and both are the
 * same bottle to buy — and by the printed name, case-folded, where it does
 * not.
 */
export const nextBottles = (
  oneAway: readonly Pick<BarRecipeMatch, "makeability">[],
  limit = 3,
): { name: string; unlocks: number }[] => {
  const counts = new Map<string, { name: string; unlocks: number }>();
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
    });
  }
  return Array.from(counts.values())
    .filter((entry) => entry.unlocks > 1)
    .sort((a, b) => b.unlocks - a.unlocks || a.name.localeCompare(b.name))
    .slice(0, limit);
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * G29 / D18 — **What can I make**: the viewer's cocktails split into Make
 * now and One bottle away, from the bottles in their own cellars and their
 * Bar pantry (D23). One recipe per drink (the version closest to makeable).
 *
 * Opens on Make now unless there is nothing there and something one bottle
 * away, so the first screen is never an empty one with the answer a tap off.
 */
export function WhatCanIMake({ data }: { data: WhatCanIMakeData }) {
  const [section, setSection] = useState<Section>(() =>
    data.makeNowCount === 0 && data.oneBottleAwayCount > 0 ? "away" : "now",
  );
  const unlock = useMemo(
    () => nextBottles(data.oneBottleAway),
    [data.oneBottleAway],
  );

  const pantryLink = (
    <Button asChild variant="secondary">
      <Link href="/recipes/bar/pantry" underline="none">
        <Pantry aria-hidden />
        Stock your pantry
      </Link>
    </Button>
  );

  if (data.bottleCount === 0 && data.pantryCount === 0) {
    return (
      <EmptyState
        illustration={<Cocktail />}
        title="Your bar is empty"
        description="Add bottles to a cellar, or tick off what's in your kitchen, and this fills with cocktails you can make."
        action={pantryLink}
      />
    );
  }

  const rows = section === "now" ? data.makeNow : data.oneBottleAway;
  const count = section === "now" ? data.makeNowCount : data.oneBottleAwayCount;

  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 type-callout text-ink-2">
        From {plural(data.bottleCount, "bottle", "bottles")} in your cellars and{" "}
        {plural(data.pantryCount, "pantry item", "pantry items")}.{" "}
        <Link
          href="/recipes/bar/pantry"
          underline="always"
          className="text-ink-1"
        >
          Edit pantry
        </Link>
      </p>

      <SegmentedControl<Section>
        aria-label="Show"
        value={section}
        onValueChange={setSection}
        options={[
          { value: "now", label: `Make now · ${data.makeNowCount}` },
          {
            value: "away",
            label: `One bottle away · ${data.oneBottleAwayCount}`,
          },
        ]}
      />

      {section === "away" && unlock.length > 0 && (
        <InsetSection label="Worth picking up" data-testid="next-bottles">
          {unlock.map((entry) => (
            <div
              key={entry.name}
              className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="type-body text-ink-1">{entry.name}</span>
              <span className="type-footnote">
                {plural(entry.unlocks, "more cocktail", "more cocktails")}
              </span>
            </div>
          ))}
        </InsetSection>
      )}

      {rows.length === 0 ? (
        section === "now" ? (
          <EmptyState
            title="Nothing to make yet"
            description="Nothing you have covers a whole recipe. Your pantry is the quickest place to close the gap."
            action={pantryLink}
          />
        ) : (
          <EmptyState
            title="Nothing one bottle away"
            description="Every other cocktail needs two or more things you don't have."
          />
        )
      ) : (
        <InsetSection
          label={section === "now" ? "Make now" : "One bottle away"}
          data-testid={section === "now" ? "make-now" : "one-bottle-away"}
        >
          {rows.map((match) => (
            <BarRecipeRow
              key={match.recipeId}
              recipeId={match.recipeId}
              name={match.name}
              makeability={match.makeability}
            />
          ))}
        </InsetSection>
      )}

      {count > rows.length && (
        <p className="px-1 type-footnote">
          Showing {rows.length} of {count}.
        </p>
      )}
      <p className="px-1 type-footnote">
        Looked at the newest {plural(data.scanned, "cocktail", "cocktails")}.
        Garnishes and optional ingredients never count against a drink.
      </p>
    </div>
  );
}
