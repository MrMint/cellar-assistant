import { Page } from "@/components/app/Page";
import { Skeleton } from "@/components/ui/skeleton";

/** `/recipes/bar` while the bar is judged: the screen's own shape. */
export default function BarLoading() {
  return (
    <Page aria-busy="true">
      <Skeleton className="h-11 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="flex flex-col gap-2">
        {["a", "b", "c", "d", "e"].map((key) => (
          <Skeleton key={key} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </Page>
  );
}
