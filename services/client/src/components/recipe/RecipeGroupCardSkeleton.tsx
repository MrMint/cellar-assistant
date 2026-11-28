import { Skeleton } from "@/components/ui/skeleton";

export type RecipeGroupCardSkeletonProps = {
  count?: number;
};

/** `RecipeGroupCard`'s row while a page of groups loads (Recipes-Browse 01). */
export const RecipeGroupCardSkeleton = ({
  count = 1,
}: RecipeGroupCardSkeletonProps) => {
  return (
    <>
      {Array.from({ length: count }, (_, i) => `skeleton-${i}`).map((key) => (
        <div
          key={key}
          aria-hidden
          className="flex min-h-[88px] overflow-hidden rounded-lg border border-edge bg-card"
        >
          <Skeleton className="w-[88px] shrink-0 rounded-none" />
          <div className="flex flex-1 flex-col justify-center gap-2 px-4 py-3">
            <Skeleton className="h-5 w-[60%]" />
            <Skeleton className="h-4 w-[45%]" />
            <Skeleton className="h-4 w-[80%]" />
          </div>
        </div>
      ))}
    </>
  );
};
