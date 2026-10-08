import { Skeleton } from "@/components/ui/skeleton";

export type RecipeGroupCardSkeletonProps = {
  count?: number;
};

/** `RecipeGroupCard`'s shape while a page of groups loads. */
export const RecipeGroupCardSkeleton = ({
  count = 1,
}: RecipeGroupCardSkeletonProps) => {
  return (
    <>
      {Array.from({ length: count }, (_, i) => `skeleton-${i}`).map((key) => (
        <div
          key={key}
          aria-hidden
          className="flex flex-col overflow-hidden rounded-lg bg-surface-1"
        >
          <Skeleton className="aspect-[4/3] rounded-none" />

          <div className="flex flex-col gap-2 p-4">
            {/* Recipe Group Name */}
            <Skeleton className="h-5 w-full" />

            {/* Featured Recipe Name */}
            <Skeleton className="h-4 w-[70%]" />

            {/* Description */}
            <div className="mt-2 flex flex-col gap-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[80%]" />
            </div>

            {/* Recipe Details */}
            <div className="mt-2 flex gap-4">
              <Skeleton className="h-3.5 w-15" />
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="h-3.5 w-[70px]" />
            </div>

            {/* Category and Tags */}
            <div className="mt-2 flex gap-2">
              <Skeleton className="h-6 w-20 rounded-sm" />
              <Skeleton className="h-6 w-15 rounded-sm" />
              <Skeleton className="h-6 w-[90px] rounded-sm" />
            </div>

            {/* Tags */}
            <div className="mt-2 flex gap-1">
              <Skeleton className="h-5 w-[50px] rounded-sm" />
              <Skeleton className="h-5 w-[65px] rounded-sm" />
              <Skeleton className="h-5 w-[45px] rounded-sm" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
};
