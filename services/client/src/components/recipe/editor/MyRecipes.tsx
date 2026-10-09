"use client";

import { useState } from "react";
import { AI, Lock, People, Public } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { Button } from "@/components/ui/button";
import { PRIVACY_COPY, type RecipePrivacy } from "./recipe-draft";

export type MyRecipeRow = {
  readonly id: string;
  readonly name: string;
  readonly privacy: string;
  readonly isDraft: boolean;
  readonly ingredientCount: number;
};

/** How many of your recipes show before "Show all". */
const FIRST = 3;

const PRIVACY_ICON = {
  PRIVATE: Lock,
  FRIENDS: People,
  PUBLIC: Public,
} as const;

const privacyOf = (value: string): RecipePrivacy =>
  value === "PUBLIC" || value === "FRIENDS" ? value : "PRIVATE";

const ingredientsLine = (count: number): string =>
  count === 1 ? "1 ingredient" : `${count} ingredients`;

/**
 * Your drafts, then your recipes (X15) — the top of the Bar page.
 *
 * A draft is what the AI read and nobody has checked yet: it opens in the
 * editor, wears the AI mark, and is yours alone until saved. Your recipes
 * say who can see each one, because they start private (D22).
 * Neither section is drawn when it is empty.
 */
export function MyRecipes({ rows }: { rows: readonly MyRecipeRow[] }) {
  const [all, setAll] = useState(false);
  const drafts = rows.filter((row) => row.isDraft);
  const mine = rows.filter((row) => !row.isDraft);
  const shown = all ? mine : mine.slice(0, FIRST);

  return (
    <>
      {drafts.length > 0 && (
        <InsetSection label="Your drafts" aria-label="Your drafts">
          {drafts.map((row) => (
            <ListRow
              key={row.id}
              leading={
                <span className="flex size-10 items-center justify-center rounded-md bg-ai/15 text-ai">
                  <AI aria-hidden className="size-5" />
                </span>
              }
              title={
                <Link
                  href={`/recipes/${row.id}/edit`}
                  overlay
                  underline="none"
                  className="text-ink-1"
                >
                  {row.name}
                </Link>
              }
              description={`Read by AI · ${ingredientsLine(row.ingredientCount)} · check it to save`}
            />
          ))}
        </InsetSection>
      )}
      {mine.length > 0 && (
        <InsetSection
          label="Your recipes"
          aria-label="Your recipes"
          action={
            mine.length > FIRST ? (
              <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>
                {all ? "Show fewer" : `Show all ${mine.length}`}
              </Button>
            ) : undefined
          }
        >
          {shown.map((row) => {
            const privacy = privacyOf(row.privacy);
            const Icon = PRIVACY_ICON[privacy];
            return (
              <ListRow
                key={row.id}
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
                  <span className="flex items-center gap-1">
                    <Icon aria-hidden className="size-3.5" />
                    {PRIVACY_COPY[privacy].label} ·{" "}
                    {ingredientsLine(row.ingredientCount)}
                  </span>
                }
              />
            );
          })}
        </InsetSection>
      )}
    </>
  );
}
