import { AppBar } from "@/components/app/AppBar";
import { Page } from "@/components/app/Page";
import { PantryEditor } from "@/components/bar/PantryEditor";
import { BarPantryQuery } from "@/components/bar/queries";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/recipes/bar/pantry` — **the Bar pantry** (D23): ~30 toggles, separate
 * from cellars. Bottles in your cellars count automatically.
 */
export const dynamic = "force-dynamic";

export default async function BarPantryPage() {
  const data = await apiServerQuery(BarPantryQuery, {});
  const result = unwrapResult(data.barPantry, "BarPantry");

  return (
    <Page>
      <AppBar title="Bar pantry" parent="/recipes/bar" />
      {result.ok ? (
        <PantryEditor initial={result.data.have} />
      ) : (
        <p role="alert" className="type-body text-destructive">
          {result.error.message}
        </p>
      )}
    </Page>
  );
}
