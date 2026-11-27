import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A bottle's history (KIT § 2 "History row"): rows joined by a dashed thread
 * through their discs. Wrap `HistoryRow`s in it.
 */
export function HistoryList({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      data-slot="history-list"
      className={cn(
        "relative m-0 flex list-none flex-col gap-1 p-0 before:absolute before:top-3.5 before:bottom-3.5 before:left-4 before:border-dash before:border-l before:border-dashed before:content-['']",
        className,
      )}
      {...props}
    />
  );
}

/**
 * One event: a 32 disc with its glyph, the event in words ("Checked in",
 * "Rated 4.0") and its date in t-cap. `owner` marks the person's own verdict
 * (a rating): its glyph is gold and filled, the one place gold appears here.
 */
export function HistoryRow({
  glyph,
  date,
  owner = false,
  className,
  children,
}: {
  glyph: ReactNode;
  date: string;
  owner?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li
      data-slot="history-row"
      className={cn("relative flex min-h-10 items-center gap-3", className)}
    >
      <span
        aria-hidden
        className={cn(
          "mx-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-edge bg-raised [&_svg]:size-3.5",
          owner ? "text-gold [&_svg]:fill-current" : "text-ink-2",
        )}
      >
        {glyph}
      </span>
      <span className="t-body min-w-0 flex-1 truncate text-ink">
        {children}
      </span>
      <span className="t-cap tabular shrink-0 text-ink-3">{date}</span>
    </li>
  );
}
