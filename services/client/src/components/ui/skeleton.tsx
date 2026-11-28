import { cn } from "@/lib/utils";

/**
 * A placeholder block (KIT § 2 "Skeleton"): skel fill, r4, breathing to
 * 45 % and back. Under reduced motion it holds still.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-xs bg-skel motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
