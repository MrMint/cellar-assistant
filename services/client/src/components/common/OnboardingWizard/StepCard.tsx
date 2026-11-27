import type { ComponentProps, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The wizard's two-up step layout: the capture surface beside a "Tips" card,
 * stacked on phones and side by side from `md` (Joy's `Grid xs=12 md=6`).
 */
export const StepGrid = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}
    {...props}
  />
);

/** A tonal step surface: `ui/card` without the border (design §3.3). */
export const StepCard = ({ className, ...props }: ComponentProps<"div">) => (
  <Card
    className={cn("gap-4 border-0 bg-surface-1 p-4 shadow-none", className)}
    {...props}
  />
);

/** The "Tips" card beside each capture step. */
export const TipsCard = ({ children }: { children: ReactNode }) => (
  <StepCard>
    <h3 className="t-head text-center">Tips</h3>
    <ul className="t-body list-disc space-y-1 pl-5 text-ink-2">{children}</ul>
  </StepCard>
);
