import { Link } from "@/components/app/Link";
import { cn } from "@/lib/utils";
import type { StatTile } from "./dashboard";

/**
 * The dashboard's four numbers (X04, D3) as stat tiles: a label, the value,
 * one line of detail. Each is a link into the collection below with the
 * matching sort or segment, so a number is also the way to its bottles.
 *
 * Values are plain sans numerals at display size, proportional rather than
 * tabular (a lone large number, not a column), in ink — never a series colour.
 */
export function StatTiles({ tiles }: { tiles: readonly StatTile[] }) {
  return (
    <section aria-label="At a glance" data-slot="cellar-stats">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.key} className="min-w-0">
            <Link
              href={tile.href}
              underline="none"
              data-slot="stat-tile"
              data-stat={tile.key}
              className={cn(
                "flex h-full min-h-24 flex-col gap-1 rounded-lg bg-surface-1 p-3 text-ink-1 outline-none",
                "transition-[background-color,transform] duration-(--ca-dur-micro) ease-standard",
                "hover:bg-surface-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-97 motion-reduce:active:scale-100",
              )}
            >
              <span className="type-footnote">{tile.label}</span>
              <span
                className={cn(
                  "font-semibold text-[1.75rem] leading-none tracking-tight",
                  tile.value === 0 && "text-ink-3",
                )}
              >
                {tile.value}
              </span>
              {tile.detail !== null && (
                <span className="type-footnote line-clamp-2 text-ink-2">
                  {tile.detail}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
