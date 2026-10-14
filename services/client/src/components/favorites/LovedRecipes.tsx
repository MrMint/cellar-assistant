"use client";

import { useState } from "react";
import { Cocktail, Restaurant } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { Button } from "@/components/ui/button";

export type LovedRecipeRow = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly ingredientCount: number;
};

/** Rows before "Show all": the Loved page is bottles first. */
const FIRST = 3;

/**
 * The recipes you Love (D9), on Me › Lists › Loved (X15). Love is one verb
 * across the app, so what you Love is one page too: recipes above the
 * bottles, three and "Show all". A recipe its author has since made private
 * is not listed (`UserActor.lovedRecipes`); nothing is drawn when you Love
 * none.
 */
export function LovedRecipes({
  rows,
}: {
  rows: readonly LovedRecipeRow[];
  /** The whole count; more than `rows` when Loves run past the first read. */
  totalCount: number;
}) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, FIRST);
  return (
    <InsetSection
      label="Recipes"
      aria-label="Loved recipes"
      action={
        rows.length > FIRST ? (
          <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : "Show all"}
          </Button>
        ) : undefined
      }
    >
      {shown.map((row) => {
        const Icon = row.type === "food" ? Restaurant : Cocktail;
        return (
          <ListRow
            key={row.id}
            leading={<Icon aria-hidden className="size-5" />}
            title={
              <Link
                href={`/recipes/${row.id}`}
                overlay
                underline="none"
                className="text-ink-1"
              >
                {row.name}
              </Link>
            }
            description={
              row.ingredientCount === 1
                ? "1 ingredient"
                : `${row.ingredientCount} ingredients`
            }
          />
        );
      })}
    </InsetSection>
  );
}
