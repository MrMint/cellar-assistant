import { Add, Back, More } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import { CellarSegments } from "@/components/cellar/CellarSegments";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const CARDS = [1, 2, 3, 4];

/**
 * `/recipes` while it loads (X15's "correct loading titles"): the Bar page's
 * own title, its New recipe button and the Cellars · Bar switch — real from
 * the first frame — then the list's cards. It used to say "All Recipes" with a
 * spinner, for a page titled something else, and it stood in for every
 * recipe's own page too; it sits in the `(index)` group now so it wraps
 * `/recipes` alone.
 */
export function RecipesShell() {
  return (
    <LoadingShell label="recipes">
      <Page wide>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-h-11 items-center">
            <p className="t-head truncate">Bar</p>
          </div>
          {/* Inert until the page arrives: the sheet lives on the page. */}
          <Button className="sm:ml-auto" disabled>
            <Add aria-hidden />
            New recipe
          </Button>
        </div>
        <CellarSegments current="bar" />
        <ShellBlocks className="flex flex-col gap-6">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {CARDS.map((key) => (
              <Skeleton key={key} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        </ShellBlocks>
      </Page>
    </LoadingShell>
  );
}

/**
 * One recipe while it loads: the page's bar (Back and ⋯ where `AppBar` draws
 * them, no title yet — a guessed name would be wrong), the hero and the
 * ingredient card in their own places.
 */
export function RecipeDetailShell() {
  return (
    <LoadingShell label="the recipe">
      <div className="flex flex-col gap-4">
        <div className="flex min-h-11 items-center gap-2">
          <span className="flex size-11 items-center justify-center text-ink-2">
            <Back aria-hidden className="size-5" />
          </span>
          <ShellBlocks className="flex-1">
            <Skeleton className="h-5 w-40" />
          </ShellBlocks>
          <span className="flex size-11 items-center justify-center text-ink-3">
            <More aria-hidden className="size-5" />
          </span>
        </div>
        <ShellBlocks className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="aspect-[4/3] w-full rounded-lg sm:aspect-square" />
          <div className="flex flex-col gap-4 sm:col-span-2">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        </ShellBlocks>
      </div>
    </LoadingShell>
  );
}
