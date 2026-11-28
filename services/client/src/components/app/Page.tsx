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
 * A titled group of rows (KIT § 3 "Settings"): a t-cap label, then one card
 * (1 px edge, r8) whose rows are split by 1 px rules.
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
        <div className="flex min-h-6 items-end justify-between gap-2 px-1">
          {label !== undefined && (
            <h2 className="t-cap m-0 text-ink-2">{label}</h2>
          )}
          {action}
        </div>
      )}
      <div className="flex flex-col divide-y divide-rule overflow-hidden rounded-md border border-edge bg-card">
        {children}
      </div>
    </section>
  );
}

/**
 * One row of an `InsetSection` (KIT § 3 "Settings" row): optional leading
 * media, a t-body title over a t-cap line in ink-2, optional trailing
 * content. 56 minimum; pressed, it turns raised. To make the whole row
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
        "relative flex min-h-14 items-center gap-3 py-1.5 pr-2 pl-3.5 has-[a[data-slot=link]]:active:bg-raised has-[button[data-slot=link]]:active:bg-raised",
        className,
      )}
      {...props}
    >
      {leading !== undefined && (
        <div className="flex shrink-0 items-center text-glyph">{leading}</div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="t-body truncate text-ink">{title}</div>
        {description !== undefined && (
          <div className="t-cap truncate text-ink-2">{description}</div>
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

/** The class for a 44 glass disc on a page hero's bar: a back, a menu. */
export const HERO_DISC =
  "relative flex size-11 shrink-0 items-center justify-center rounded-disc bg-glass text-on-glass outline-none backdrop-blur-md transition-transform duration-(--ca-dur-micro) active:scale-97 focus-visible:outline-2 focus-visible:outline-act-ink motion-reduce:active:scale-100 [&_svg]:size-6";

/**
 * KIT § 3 "Page hero": the photo 300 high on raised, cover, fading 88 px into
 * the page; over it a 56 bar of 44 glass discs (put `HERO_DISC` on each link
 * or button, back at the left, the rest at the right); under it the name in
 * t-title with the heart beside it, and one t-cap line of meta. With no
 * photo, pass the label plate as `photo`.
 */
export function PageHero({
  photo,
  back,
  actions,
  title,
  heart,
  meta,
  className,
}: {
  /** An `<Image fill>` (object-cover), or a `LabelPlate`. */
  photo: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
  title: string;
  /** A page-sized `Heart`. */
  heart?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-hero"
      className={cn("-mx-4 flex flex-col", className)}
    >
      <div className="relative h-[300px] overflow-hidden bg-raised [&_img]:object-cover">
        {photo}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[88px] bg-linear-to-b from-transparent to-background"
        />
        {(back !== undefined || actions !== undefined) && (
          <div className="absolute inset-x-0 top-0 flex h-14 items-center gap-2 px-2">
            {back}
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 px-4 pt-1 pb-3">
        <div className="flex items-start gap-2">
          <h1 className="t-title m-0 min-w-0 flex-1 text-ink">{title}</h1>
          {heart}
        </div>
        {meta !== undefined && <p className="t-cap m-0 text-ink-2">{meta}</p>}
      </div>
    </header>
  );
}
