"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "urql";
import { ErrorState } from "@/components/app/EmptyState";
import { AI, Lock, People, Public } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";
import { RecipeThumb } from "../RecipePlate";
import { ingredientsLine } from "../recipe-meta";
import { MY_RECIPES_ALL, MyRecipesQuery } from "./documents";
import { PRIVACY_WHO, type RecipePrivacy } from "./recipe-draft";

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

/**
 * Your drafts, then your recipes (X15, Recipes-Browse 01: "Yours 10").
 *
 * A draft is what the AI read and nobody has checked yet: it opens in the
 * editor, wears the AI mark, and is yours alone until saved. Your recipes
 * say who can see each one, because they start private (D22).
 * Neither section is drawn when it is empty.
 */
export function MyRecipes({
  rows,
  publishedTotal,
  draftsTotal,
  draftsFailure,
}: {
  rows: readonly MyRecipeRow[];
  /**
   * How many published recipes you have in all — more than `rows` holds when
   * the server read only the first page. "Show all" then reads the rest.
   */
  publishedTotal?: number;
  /** How many drafts you have in all, as `publishedTotal` is for recipes. */
  draftsTotal?: number;
  /** Why the drafts read failed: said, not drawn as "no drafts" (F-109). */
  draftsFailure?: string;
}) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const [allDrafts, setAllDrafts] = useState(false);
  const draftsFirstPage = rows.filter((row) => row.isDraft);
  const draftCount = Math.max(draftsTotal ?? 0, draftsFirstPage.length);
  const [restDrafts] = useQuery({
    query: MyRecipesQuery,
    variables: { first: MY_RECIPES_ALL, drafts: true },
    pause: !allDrafts || draftCount <= draftsFirstPage.length,
  });
  const restDraftsResult =
    restDrafts.data === undefined
      ? null
      : unwrapResult(restDrafts.data.myRecipes, "RecipeConnection");
  const drafts =
    allDrafts && restDraftsResult?.ok === true
      ? restDraftsResult.data.edges.map((edge) => edge.node)
      : draftsFirstPage;
  const firstPage = rows.filter((row) => !row.isDraft);
  const total = Math.max(publishedTotal ?? 0, firstPage.length);
  // "Show all" reads the rest only when the server's first page was short of
  // the total — and only once it is asked for.
  const [rest] = useQuery({
    query: MyRecipesQuery,
    variables: { first: MY_RECIPES_ALL, drafts: false },
    pause: !all || total <= firstPage.length,
  });
  const restResult =
    rest.data === undefined
      ? null
      : unwrapResult(rest.data.myRecipes, "RecipeConnection");
  const mine =
    all && restResult?.ok === true
      ? restResult.data.edges.map((edge) => edge.node)
      : firstPage;
  const shown = all ? mine : mine.slice(0, FIRST);

  return (
    <>
      {draftsFailure !== undefined && (
        <section aria-label="Your drafts">
          <ErrorState
            boxed
            title="Couldn't load your drafts"
            reason={draftsFailure}
            action={
              <Button variant="outline" onClick={() => router.refresh()}>
                Try again
              </Button>
            }
          />
        </section>
      )}
      {draftsFailure === undefined && drafts.length > 0 && (
        <InsetSection
          label={`Drafts ${draftCount}`}
          aria-label="Your drafts"
          action={
            draftCount > draftsFirstPage.length ? (
              <Button
                variant="ghost"
                size="sm"
                className="t-head text-act-ink"
                aria-busy={(allDrafts && restDrafts.fetching) || undefined}
                onClick={() => setAllDrafts(!allDrafts)}
              >
                {allDrafts ? "Show fewer" : `Show all ${draftCount}`}
              </Button>
            ) : undefined
          }
        >
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
                  className="text-ink"
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
          label={`Yours ${total}`}
          aria-label="Your recipes"
          action={
            total > FIRST ? (
              <Button
                variant="ghost"
                size="sm"
                className="t-head text-act-ink"
                aria-busy={(all && rest.fetching) || undefined}
                onClick={() => setAll(!all)}
              >
                {all ? "Show fewer" : `Show all ${total}`}
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
                leading={
                  <span className="relative block size-10 overflow-hidden rounded-md bg-raised">
                    <RecipeThumb type="cocktail" name={row.name} />
                  </span>
                }
                title={
                  <Link
                    href={`/recipes/${row.id}`}
                    overlay
                    underline="none"
                    className="text-ink"
                  >
                    {row.name}
                  </Link>
                }
                description={
                  <span className="flex items-center gap-1">
                    <Icon aria-hidden className="size-3.5" />
                    {PRIVACY_WHO[privacy]} ·{" "}
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
