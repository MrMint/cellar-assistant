import { Add } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CellarSegments } from "./CellarSegments";

/** As many cellar cards as a phone's first screen shows. */
const CARDS = [1, 2, 3, 4, 5];

/**
 * `/cellars` while it loads (X24): the page's bar — its title and the
 * full-width "Add cellar" button where `Cellars` draws them; the button is
 * the real link, so it works before the list arrives — the Cellars | Bar
 * segment (also real links), the Yours section's title, then cellar cards in
 * the grid's own columns (one on a phone, then 2 / 3 / 4), each a name, an
 * owner avatar and the six type counts. From friends and Discover are drawn
 * only when they have something, so the shell does not guess at them.
 */
export function CellarsShell() {
  return (
    <LoadingShell label="cellars" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-h-11 items-center">
          <p className="type-headline truncate">Cellars</p>
        </div>
        <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
          <Button asChild>
            <Link href="/cellars/add" underline="none">
              <Add />
              Add cellar
            </Link>
          </Button>
        </div>
      </div>
      <CellarSegments current="cellars" />
      <div className="flex flex-col gap-3">
        {/* `SECTION_TITLES.MINE`, written out: that module is a client one. */}
        <div className="flex min-h-6 items-end px-1">
          <p className="type-overline text-ink-3">Yours</p>
        </div>
        <ShellBlocks className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {CARDS.map((i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-5 w-[55%]" />
                <Skeleton className="size-8 rounded-full" />
              </div>
              <div className="flex gap-4">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <Skeleton key={j} className="h-5 w-8" />
                ))}
              </div>
            </div>
          ))}
        </ShellBlocks>
      </div>
    </LoadingShell>
  );
}
