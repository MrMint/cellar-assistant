import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaceCategoryTile } from "./PlaceActionButtons";

/** What the server knows of a place before the client's full read. */
export type PlaceHero = {
  name: string;
  category: string | null;
};

/** The hero and action sections' frame, as `PlaceDetails` draws them. */
const SECTION = "rounded-lg bg-surface-1 p-4";

/**
 * A place page while it loads (X24), in `PlaceDetails`' own sections: the
 * hero (category tile, name, the rating and address lines), the action grid
 * (Directions, then two rows of two), then the tabbed menu.
 *
 * With a `hero` the tile and the name are real — the server's existence check
 * already read them — so the page's one stable element is on screen as soon
 * as the route answers, outside every wait (design §4.4: heroes stay outside
 * Suspense, or B05's map-sheet → place morph never pairs). Without one (the
 * route's `loading.tsx`, before the server has answered) they are
 * placeholders in the same boxes.
 */
export function PlaceDetailsShell({ hero }: { hero?: PlaceHero }) {
  return (
    <LoadingShell label={hero?.name ?? "the place"}>
      <Page>
        <section className={SECTION}>
          <div className="flex flex-row items-start gap-4">
            {hero !== undefined ? (
              <PlaceCategoryTile category={hero.category ?? undefined} large />
            ) : (
              <ShellBlocks>
                <Skeleton className="size-13 rounded-md" />
              </ShellBlocks>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {hero !== undefined ? (
                <h1 className="type-title-1 text-ink-1">{hero.name}</h1>
              ) : (
                <ShellBlocks>
                  <Skeleton className="h-8 w-[70%]" />
                </ShellBlocks>
              )}
              <ShellBlocks className="flex flex-col gap-2">
                <Skeleton className="h-4 w-[40%]" />
                <Skeleton className="h-4 w-[80%]" />
              </ShellBlocks>
            </div>
          </div>
        </section>
        <ShellBlocks className={`flex flex-col gap-3 ${SECTION}`}>
          <Skeleton className="h-11 w-full" />
          {["contact", "toggles", "share"].map((row) => (
            <div key={row} className="flex gap-2">
              <Skeleton className="h-11 flex-1" />
              <Skeleton className="h-11 flex-1" />
            </div>
          ))}
        </ShellBlocks>
        <ShellBlocks className="flex flex-col rounded-lg bg-surface-1">
          <div className="flex h-11 items-center gap-4 border-line border-b px-5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
          </div>
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-5 w-[60%]" />
            <Skeleton className="h-5 w-[45%]" />
            <Skeleton className="h-5 w-[55%]" />
          </div>
        </ShellBlocks>
      </Page>
    </LoadingShell>
  );
}
