import { Page } from "@/components/app/Page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/recipes/bar/pantry` while the toggles load: rows of chips, not the What
 * can I make skeleton the parent segment's `loading.tsx` would otherwise show.
 */
export default function BarPantryLoading() {
  return (
    <Page aria-busy="true">
      <Skeleton className="h-11 w-40" />
      <Skeleton className="h-4 w-64" />
      {["a", "b", "c"].map((section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <div className="flex flex-wrap gap-x-2 gap-y-3">
            {["1", "2", "3", "4", "5"].map((chip) => (
              <Skeleton key={chip} className="h-9 w-24 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </Page>
  );
}
