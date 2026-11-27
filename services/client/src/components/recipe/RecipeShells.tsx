import { Add, Back, More } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const CARDS = [1, 2, 3, 4];

/**
 * `/recipes` while it loads (X15's "correct loading titles"): the page's own
 * title, "Recipes", and its outlined New recipe — real from the first frame —
 * then the search field, Your bar, Yours and the list's rows. It used to say "All Recipes" with a
 * spinner, for a page titled something else, and it stood in for every
 * recipe's own page too; it sits in the `(index)` group now so it wraps
 * `/recipes` alone.
 */
export function RecipesShell() {
  return (
    <LoadingShell label="recipes">
      <Page wide>
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p className="t-title m-0 truncate text-ink">Recipes</p>
          {/* Inert until the page arrives: the sheet lives on the page. */}
          <Button variant="outline" className="shrink-0" disabled>
            <Add aria-hidden />
            New recipe
          </Button>
        </div>
        <ShellBlocks className="flex flex-col gap-6">
          <Skeleton className="h-11 w-full rounded-full" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-md" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CARDS.map((key) => (
              <Skeleton key={key} className="h-[88px] w-full rounded-lg" />
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
