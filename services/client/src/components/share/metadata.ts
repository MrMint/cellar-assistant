import type { Metadata } from "next";
import { topEntries } from "@/lib/share/tier-bands";

/**
 * The words a link preview shows under the card (X17): one sentence that
 * says what was shared, from the shared data and nothing else. Pure, so the
 * pages and the tests read the same strings.
 */

const SITE = "Cellar Assistant";

export const tierListDescription = (list: {
  ownerDisplayName: string | null;
  entries: readonly {
    band: number;
    position: number;
    name: string | null;
  }[];
}): string => {
  const top = topEntries(list.entries, 3)
    .filter((entry) => entry.name !== null)
    .map((entry) => `#${entry.rank} ${entry.name}`);
  const by =
    list.ownerDisplayName === null
      ? "A ranked list"
      : `A ranked list by ${list.ownerDisplayName}`;
  return top.length === 0 ? `${by} on ${SITE}.` : `${by}: ${top.join(", ")}.`;
};

export const recipeDescription = (recipe: {
  description: string | null;
  ingredients: readonly { name: string | null }[];
}): string => {
  const own = recipe.description?.trim();
  if (own !== undefined && own !== "") return own;
  const names = recipe.ingredients
    .map((row) => row.name)
    .filter((name): name is string => name !== null)
    .slice(0, 5);
  return names.length === 0
    ? `A recipe on ${SITE}.`
    : `Made with ${names.join(", ")}.`;
};

/** The metadata every share page carries: its title, words and URL. */
export const shareMetadata = ({
  title,
  description,
  canonicalPath,
}: {
  title: string;
  description: string;
  canonicalPath: string;
}): Metadata => ({
  // The root layout's template adds " · Cellar Assistant" (X21).
  title,
  description,
  alternates: { canonical: canonicalPath },
  openGraph: {
    title,
    description,
    url: canonicalPath,
    siteName: SITE,
    type: "website",
  },
  twitter: { card: "summary_large_image", title, description },
});

/** A missing or private thing's metadata: nothing about it at all. */
export const NOT_SHARED_METADATA: Metadata = {
  title: "Not found",
};
