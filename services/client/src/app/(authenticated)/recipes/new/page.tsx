import type { Metadata } from "next";
import {
  type ComposerSource,
  RecipeComposer,
} from "@/components/recipe/editor/RecipeComposer";

/**
 * `/recipes/new` (X15): `?from=photo|paste|type`, or the three choices.
 * The ＋ chooser's Recipe row and the Bar page's New recipe both lead here.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New recipe · Cellar Assistant" };

const SOURCES = new Set(["photo", "paste", "type"]);

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const from = (await searchParams).from;
  const source =
    typeof from === "string" && SOURCES.has(from)
      ? (from as Exclude<ComposerSource, null>)
      : null;
  // Keyed by the source: switching from Paste to Type is a new composer.
  return <RecipeComposer key={source ?? "choose"} source={source} />;
}
