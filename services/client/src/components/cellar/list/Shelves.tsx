"use client";

import { Button } from "@/components/ui/button";
import { ListTile, type TileSelect } from "./ListTile";
import type { Shelf } from "./model";

/**
 * Shelves (combined-18, -19): a row per shelf (Open now, Your best, Not
 * rated yet, Newest) that scrolls sideways, its count beside the title and
 * "See all" turning that shelf into the list. Wide note tiles stay narrow
 * here: a shelf is a row of equal tiles.
 */
export function Shelves({
  shelves,
  onSeeAll,
  onPeek,
  onOpen,
  selectedKey,
  selectedBy,
}: {
  shelves: readonly Shelf[];
  onSeeAll: (shelf: Shelf) => void;
  onPeek: (key: string) => void;
  onOpen?: (key: string) => void;
  selectedKey: string | null;
  selectedBy: TileSelect;
}) {
  return (
    <div data-slot="cellar-shelves" className="flex flex-col gap-6">
      {shelves.map((shelf) => (
        <section
          key={shelf.key}
          aria-labelledby={`shelf-${shelf.key}`}
          data-slot="cellar-shelf"
          data-shelf={shelf.key}
          className="flex flex-col gap-2"
        >
          <div className="flex min-h-11 items-center gap-2">
            <h2 id={`shelf-${shelf.key}`} className="t-title m-0 text-ink">
              {shelf.title}
            </h2>
            <span className="t-cap tabular text-ink-3">{shelf.count}</span>
            <span className="flex-1" />
            {shelf.count > shelf.bottles.length && (
              <Button
                variant="quiet"
                onClick={() => onSeeAll(shelf)}
                aria-label={`See all ${shelf.title}`}
              >
                See all
              </Button>
            )}
          </div>
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none]">
            {shelf.bottles.map((bottle) => (
              <div
                key={bottle.key}
                className="w-[min(42vw,180px)] shrink-0 snap-start"
              >
                <ListTile
                  bottle={{ ...bottle, note: null }}
                  onPeek={onPeek}
                  onOpen={onOpen}
                  anchor={false}
                  selected={selectedKey === bottle.key ? selectedBy : null}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
