import type { Metadata } from "next";
import { AppBar } from "@/components/app/AppBar";
import { Page } from "@/components/app/Page";
import { PantryEditor } from "@/components/bar/PantryEditor";
import { BarPantryQuery } from "@/components/bar/queries";
import { BarLoadError } from "@/components/bar/your-bar/BarLoadError";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

export const metadata: Metadata = { title: "Pantry" };

/**
 * `/recipes/bar/pantry` — **the pantry** (D23; Recipes-Make board): about
 * thirty toggles, separate from cellars. Bottles in your cellars count
 * automatically.
 */
export const dynamic = "force-dynamic";

export default async function BarPantryPage() {
  const data = await apiServerQuery(BarPantryQuery, {});
  const result = unwrapResult(data.barPantry, "BarPantry");

  return (
    <Page>
      {result.ok ? (
        <PantryEditor initial={result.data.have} />
      ) : (
        <>
          <AppBar title="Pantry" parent="/recipes/bar" />
          <BarLoadError title="Couldn't load your pantry" />
        </>
      )}
    </Page>
  );
}
