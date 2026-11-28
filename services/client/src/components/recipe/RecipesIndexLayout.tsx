import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * /recipes at desktop width (Recipes board, 1280): Your bar and Yours sit in
 * a left column and the recipe grid on the right, the search field across the
 * top. `RecipeGroupSearch` renders [search][between][All recipes] as flex
 * siblings, so the grid is laid over them from outside: the wrapper below
 * marks the "mine" block, and the section that follows it takes column two.
 * While a term is searched the block is absent and All recipes spans both.
 * Below `lg` it is the phone's single column, unchanged.
 */
export function RecipesIndexLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="recipes-index"
      className={cn(
        "lg:[&>[data-slot=recipe-group-search]]:grid lg:[&>[data-slot=recipe-group-search]]:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] lg:[&>[data-slot=recipe-group-search]]:gap-x-8",
        "lg:[&>[data-slot=recipe-group-search]>:first-child]:col-span-2",
        "lg:[&>[data-slot=recipe-group-search]>section]:col-span-2",
        "lg:[&>[data-slot=recipe-group-search]>[data-slot=recipes-mine]]:col-start-1",
        "lg:[&>[data-slot=recipe-group-search]>[data-slot=recipes-mine]+section]:col-span-1",
        "lg:[&>[data-slot=recipe-group-search]>[data-slot=recipes-mine]+section]:col-start-2",
        "lg:[&>[data-slot=recipe-group-search]>[data-slot=recipes-mine]+section]:row-start-2",
        "lg:[&>[data-slot=recipe-group-search]>[data-slot=recipes-mine]]:row-start-2",
      )}
    >
      {children}
    </div>
  );
}

/** Your bar and your recipes as one block the layout can place. */
export function RecipesMine({ children }: { children: ReactNode }) {
  return (
    <div data-slot="recipes-mine" className="flex min-w-0 flex-col gap-6">
      {children}
    </div>
  );
}
