import { Link } from "@/components/app/Link";
import { cn } from "@/lib/utils";

export type CellarSegment = "cellars" | "bar";

/**
 * The Cellar tab's switch (D1), as the Cellars boards draw it: your
 * **Cellars**, and **Your bar** — recipes, reached from here (and from the
 * Recipes section of search). A door one way: the Recipes boards draw no
 * switch, and light More there, not Cellars (FR-5 amended, F-139, F-171).
 *
 * Links, not a `SegmentedControl`: each segment is a page with its own URL,
 * Back and deep link, so it is navigation (`aria-current`), not a radio
 * choice inside one page. It wears the segmented control's look so the two
 * read as the same kind of switch.
 *
 * X04 grows this into the cellar switcher plus Collection · Open · Finished ·
 * Bar; until then it is the two pages that exist.
 */
export const CELLAR_SEGMENTS: readonly {
  key: CellarSegment;
  label: string;
  href: string;
}[] = [
  { key: "cellars", label: "Cellars", href: "/cellars" },
  { key: "bar", label: "Your bar", href: "/recipes" },
];

export function CellarSegments({
  current,
  className,
}: {
  current: CellarSegment;
  className?: string;
}) {
  return (
    <nav
      aria-label="Cellar"
      data-slot="cellar-segments"
      className={cn(
        "flex w-full items-stretch gap-0.5 rounded-md bg-surface-2 p-0.5 sm:max-w-80",
        className,
      )}
    >
      {CELLAR_SEGMENTS.map((segment) => {
        const active = segment.key === current;
        return (
          <Link
            key={segment.key}
            href={segment.href}
            underline="none"
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-[10px] px-3 font-medium text-sm outline-none transition-colors duration-(--ca-dur-micro) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/50",
              // 40 px tall, with the hit area reaching the group's padding:
              // 44 px in all (design §3.3).
              "after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']",
              active
                ? "bg-surface-3 text-ink-1 shadow-sm"
                : "text-ink-2 hover:text-ink-1 active:bg-surface-3",
            )}
          >
            {segment.label}
          </Link>
        );
      })}
    </nav>
  );
}
