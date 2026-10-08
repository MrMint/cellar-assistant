import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  /** An illustration or a large glyph. */
  illustration?: ReactNode;
  /** One Fraunces line: "Your cellar is waiting." */
  title: string;
  /** One Inter line. */
  description?: ReactNode;
  /**
   * Exactly one action (design §3.6) — a single element, typically a
   * `Button` or a `Button asChild` around an `app/Link`.
   */
  action?: ReactNode;
  className?: string;
};

/**
 * An empty, error or first-run state: one illustration, one Fraunces line,
 * one Inter line and at most one action. The copy table is design §3.6.
 */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Empty
      data-slot="empty-state"
      className={cn("border-none px-4 py-10", className)}
    >
      <EmptyHeader>
        {illustration !== undefined && (
          <EmptyMedia className="text-ink-3 [&_svg:not([class*='size-'])]:size-12">
            {illustration}
          </EmptyMedia>
        )}
        <EmptyTitle className="type-title-1 text-ink-1">{title}</EmptyTitle>
        {description !== undefined && (
          <EmptyDescription className="type-callout text-ink-2">
            {description}
          </EmptyDescription>
        )}
      </EmptyHeader>
      {action !== undefined && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
