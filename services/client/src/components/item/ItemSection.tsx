import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One block of the item and bottle pages — what each Joy `Card` was. Tonal,
 * not bordered (design §3.3: the bottle page stacked seven identical bordered
 * cards, visual-9): `surface-1`, the 20 pt card radius, a 16 pt inset.
 *
 * `title` keeps each card's old wording ("Located in:", "Reviews:", "Tea
 * Brands (1)") as a real heading, which the Joy `title-lg` paragraph was not.
 */
export function ItemSection({
  title,
  icon,
  className,
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  /** A glyph before the title ("On Lists"). Decorative. */
  icon?: ReactNode;
}) {
  return (
    <section
      data-slot="item-section"
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg bg-surface-1 p-4",
        className,
      )}
      {...props}
    >
      {title !== undefined && (
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="type-headline text-ink-1">{title}</h2>
        </div>
      )}
      {children}
    </section>
  );
}
