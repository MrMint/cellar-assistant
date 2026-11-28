import { Page } from "@/components/app/Page";
import { Skeleton } from "@/components/ui/skeleton";

/** `/recipes/bar` while the bar is judged: Your bar's own shape. */
export default function BarLoading() {
  return (
    <Page aria-busy="true">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-36" />
      </div>
      <Skeleton className="h-4 w-60" />
      <Skeleton className="h-[46px] w-full rounded-md" />
      <div className="flex flex-col gap-px overflow-hidden rounded-md">
        {["a", "b", "c", "d"].map((key) => (
          <Skeleton key={key} className="h-16 w-full rounded-none" />
        ))}
      </div>
    </Page>
  );
}
