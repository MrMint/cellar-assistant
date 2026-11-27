"use client";

import { EmptyState } from "@/components/app/EmptyState";
import { NoResults } from "@/components/app/icons";
import { StarGlyph } from "@/components/app/parts/Stars";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ListRow, ListTile, type TileSelect } from "./ListTile";
import { formatAverage, type ListSection } from "./model";

export type ListView = "tiles" | "rows";

/** The grid columns rule (KIT § 3): two on a phone, ⌊(w+16)/200⌋ from `md`. */
export const LIST_GRID_CLASS =
  "grid grid-cols-2 gap-4 md:grid-cols-[repeat(auto-fill,minmax(184px,1fr))]";

/** A section's element id, for jumping between makers. */
export const sectionId = (key: string): string =>
  `cellar-section-${encodeURIComponent(key)}`;

/**
 * The arranged list: each section's header (combined-13: the maker, its
 * count, the owner's average with one gold star), then its tiles or rows.
 */
export function ListBody({
  sections,
  view,
  onPeek,
  onOpen,
  selectedKey,
  selectedBy,
}: {
  sections: readonly ListSection[];
  view: ListView;
  onPeek: (key: string) => void;
  onOpen?: (key: string) => void;
  selectedKey: string | null;
  selectedBy: TileSelect;
}) {
  return (
    <div
      data-slot="cellar-grid"
      data-view={view}
      className="flex flex-col gap-6"
    >
      {sections.map((section) => (
        <section
          key={section.key}
          id={sectionId(section.key)}
          aria-label={section.title}
          data-slot="cellar-section"
          className="flex scroll-mt-40 flex-col gap-3"
        >
          {section.title !== undefined && (
            <h2
              data-slot="cellar-section-header"
              className="m-0 flex min-h-11 items-center gap-2"
            >
              <span className="t-title truncate text-ink">{section.title}</span>
              <span className="t-cap tabular text-ink-3">{section.count}</span>
              {section.average !== null && (
                <span className="t-cap tabular inline-flex items-center gap-1 text-ink-2">
                  <StarGlyph
                    fraction={1}
                    fillClass="text-gold"
                    className="size-4"
                  />
                  <span className="sr-only">your average</span>
                  {formatAverage(section.average)}
                </span>
              )}
            </h2>
          )}
          {view === "tiles" ? (
            <div className={LIST_GRID_CLASS}>
              {section.bottles.map((bottle) => (
                <ListTile
                  key={bottle.key}
                  bottle={bottle}
                  onPeek={onPeek}
                  onOpen={onOpen}
                  selected={selectedKey === bottle.key ? selectedBy : null}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-rule overflow-hidden rounded-md border border-edge bg-card">
              {section.bottles.map((bottle) => (
                <ListRow
                  key={bottle.key}
                  bottle={bottle}
                  onPeek={onPeek}
                  onOpen={onOpen}
                  selected={selectedKey === bottle.key ? selectedBy : null}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** A search that found nothing (KIT § 4): what is missing, one action. */
export function NoMatch({
  title,
  action,
  onAction,
  className,
}: {
  title: string;
  action: string;
  onAction: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      data-slot="cellar-no-match"
      illustration={<NoResults aria-hidden className="size-7 text-glyph" />}
      title={title}
      action={
        <Button variant="outline" onClick={onAction}>
          {action}
        </Button>
      }
      className={cn("py-12", className)}
    />
  );
}
