import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A page's content column: a 16 pt gutter (the shell's scroller supplies
 * it on non-map routes, so `Page` adds none of its own by default), sections
 * 24 pt apart, centred at 720 px — 1120 with `wide` for pages that carry a
 * rail of their own. The bottom padding clears a floating `ActionBar`.
 */
export function Page({
  wide = false,
  withActionBar = false,
  className,
  ...props
}: ComponentProps<"div"> & { wide?: boolean; withActionBar?: boolean }) {
  return (
    <div
      data-slot="page"
      className={cn(
        "mx-auto flex w-full flex-col gap-6",
        wide ? "max-w-[1120px]" : "max-w-[720px]",
        withActionBar && "pb-24",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A titled group of rows (design §3.3, elevation 1): an overline label, then
 * a `surface-1` block with no border whose rows are split by hairlines.
 * Containers are tonal; the "box soup" of bordered cards ends here.
 */
export function InsetSection({
  label,
  action,
  className,
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  /** The overline above the block (no colon). */
  label?: string;
  /** A trailing link or button on the label row ("See all"). */
  action?: ReactNode;
}) {
  return (
    <section
      data-slot="inset-section"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      {(label !== undefined || action !== undefined) && (
        <div className="flex min-h-6 items-end justify-between gap-2 px-4">
          {label !== undefined && (
            <h2 className="type-overline text-ink-3">{label}</h2>
          )}
          {action}
        </div>
      )}
      <div className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1">
        {children}
      </div>
    </section>
  );
}

/**
 * One row of an `InsetSection`: optional leading media, a title over a
 * footnote, optional trailing content. 44 pt minimum. To make the whole row
 * a link, put an `app/Link` with `overlay` in `title`; the row is the
 * positioning context.
 */
export function ListRow({
  leading,
  title,
  description,
  trailing,
  className,
  ...props
}: Omit<ComponentProps<"div">, "title"> & {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      data-slot="list-row"
      className={cn(
        "relative flex min-h-11 items-center gap-3 px-4 py-2.5 has-[a[data-slot=link]]:active:bg-surface-3",
        className,
      )}
      {...props}
    >
      {leading !== undefined && (
        <div className="flex shrink-0 items-center text-ink-2">{leading}</div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="type-body truncate text-ink-1">{title}</div>
        {description !== undefined && (
          <div className="type-footnote truncate">{description}</div>
        )}
      </div>
      {trailing !== undefined && (
        <div className="relative z-10 flex shrink-0 items-center gap-2 text-ink-3">
          {trailing}
        </div>
      )}
    </div>
  );
}
