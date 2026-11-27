import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One block of the item page — what each Joy `Card` was — drawn the way an
 * `InsetSection` is (design §3.3): the heading is an overline *above* a
 * tonal `surface-1` block, with no border and a 16 pt inset. X09 made the
 * page one column of these, so the restored cards (brands, recipes,
 * reviews) and the new `InsetSection`s ("Your bottles", "Your log") read as
 * one list rather than two styles.
 *
 * `title` is a real `h2`; `icon` is a decorative glyph before it. `action`
 * sits at the end of the heading row ("Change brand").
 */
export function ItemSection({
  title,
  icon,
  action,
  className,
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  /** A glyph before the title. Decorative. */
  icon?: ReactNode;
  /** A trailing control on the heading row. */
  action?: ReactNode;
}) {
  const block = (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface-1 p-4">
      {children}
    </div>
  );
  if (title === undefined) {
    return (
      <section
        data-slot="item-section"
        className={cn("min-w-0", className)}
        {...props}
      >
        {block}
      </section>
    );
  }
  return (
    <section
      data-slot="item-section"
      className={cn("flex min-w-0 flex-col gap-2", className)}
      {...props}
    >
      <div className="flex min-h-6 items-end justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon}
          <h2 className="t-micro truncate text-ink-3">{title}</h2>
        </div>
        {action}
      </div>
      {block}
    </section>
  );
}
