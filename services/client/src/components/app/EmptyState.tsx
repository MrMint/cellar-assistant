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
  /** The kind glyph, at 28 in the glyph colour (KIT § 3 "Empty"). */
  illustration?: ReactNode;
  /** The message, one t-head line: `No bottle matches "orv"`. */
  title: string;
  /** A quieter line under it, t-cap. */
  description?: ReactNode;
  /**
   * Exactly one action — an outlined `Button` ("Clear search"), or a
   * `Button asChild` around an `app/Link`.
   */
  action?: ReactNode;
  /** In a box (card, edge, r8): how it sits inside a list or a section. */
  boxed?: boolean;
  className?: string;
};

/**
 * KIT § 3 "Empty": one glyph, one message, at most one way on. Column,
 * centred, gap 12; the glyph s28 in the glyph colour, the message t-head ink.
 */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  boxed = false,
  className,
}: EmptyStateProps) {
  return (
    <Empty
      data-slot="empty-state"
      className={cn(
        "gap-3 border-none px-2 pt-7 pb-5",
        boxed && "rounded-md border border-edge border-solid bg-card",
        className,
      )}
    >
      <EmptyHeader className="gap-2">
        {illustration !== undefined && (
          <EmptyMedia className="mb-0 text-glyph [&_svg:not([class*='size-'])]:size-7">
            {illustration}
          </EmptyMedia>
        )}
        <EmptyTitle className="t-head text-ink">{title}</EmptyTitle>
        {description !== undefined && (
          <EmptyDescription className="t-cap text-ink-2">
            {description}
          </EmptyDescription>
        )}
      </EmptyHeader>
      {action !== undefined && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export type ErrorStateProps = {
  /** The glyph for what went wrong (offline, a broken link…). */
  illustration?: ReactNode;
  /** What happened: "Couldn't load Home cellar". */
  title: string;
  /** Why, in a few words: "You're offline". */
  reason?: ReactNode;
  /** The one way out: a ghost "Try again". */
  action?: ReactNode;
  boxed?: boolean;
  className?: string;
};

/**
 * KIT § 3 "Error": "Say what happened and the one way out. No apology, no
 * code." The empty state's shape, announced (`role="alert"`), so a reader
 * hears it without having to find it.
 */
export function ErrorState({
  illustration,
  title,
  reason,
  action,
  boxed = false,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" data-slot="error-state" className="contents">
      <EmptyState
        illustration={illustration}
        title={title}
        description={reason}
        action={action}
        boxed={boxed}
        className={className}
      />
    </div>
  );
}
