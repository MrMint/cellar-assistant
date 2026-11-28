import { Page } from "@/components/app/Page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/recipes/bar/pantry` while the toggles load: rows of chips, not Your bar's
 * skeleton the parent segment's `loading.tsx` would otherwise show.
 */
export default function BarPantryLoading() {
  return (
    <Page aria-busy="true">
      <Skeleton className="h-11 w-40" />
      <Skeleton className="h-4 w-64" />
      {["a", "b", "c"].map((section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex flex-wrap gap-2">
            {["1", "2", "3", "4", "5"].map((chip) => (
              <Skeleton key={chip} className="h-11 w-28 rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </Page>
  );
}
