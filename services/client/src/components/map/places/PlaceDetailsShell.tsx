import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaceHero as PlaceHeroCard } from "./PlaceHero";
import { formatCategoryName } from "./place-utils";

/** What the server knows of a place before the client's full read. */
export type PlaceHero = {
  name: string;
  category: string | null;
};

/**
 * A place page while it loads (X24), in the page's own frame: the 300 hero
 * with the name under it, Your rank, the where card with Directions, the
 * Visited / Want to try / Share row, then the Menu card.
 *
 * With a `hero` the glyph plate and the name are real — the server's
 * existence check already read them — so the page's one stable element is on
 * screen as soon as the route answers, outside every wait (design §4.4).
 * Without one (the route's `loading.tsx`) they are placeholders in the same
 * boxes.
 */
export function PlaceDetailsShell({ hero }: { hero?: PlaceHero }) {
  return (
    <LoadingShell label={hero?.name ?? "the place"}>
      <Page>
        <div className="-mt-4">
          {hero !== undefined ? (
            <PlaceHeroCard
              name={hero.name}
              category={hero.category}
              categoryLabel={
                hero.category === null
                  ? undefined
                  : formatCategoryName(hero.category)
              }
            />
          ) : (
            <ShellBlocks className="-mx-4 flex flex-col gap-3">
              <Skeleton className="h-[300px] w-full rounded-none" />
              <div className="flex flex-col gap-2 px-4">
                <Skeleton className="h-7 w-[60%]" />
                <Skeleton className="h-4 w-[35%]" />
              </div>
            </ShellBlocks>
          )}
        </div>
        <ShellBlocks className="flex flex-col gap-3">
          <Skeleton className="h-4 w-20" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-[70px] rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </ShellBlocks>
        <ShellBlocks className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
          <Skeleton className="h-4 w-[70%]" />
          <Skeleton className="h-3 w-[40%]" />
          <Skeleton className="h-11 w-full" />
        </ShellBlocks>
        <ShellBlocks className="grid grid-cols-3 gap-2">
          {["visited", "want", "share"].map((key) => (
            <Skeleton key={key} className="h-11" />
          ))}
        </ShellBlocks>
        <ShellBlocks className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-[60%]" />
          <Skeleton className="h-5 w-[45%]" />
          <Skeleton className="h-5 w-[55%]" />
        </ShellBlocks>
      </Page>
    </LoadingShell>
  );
}
