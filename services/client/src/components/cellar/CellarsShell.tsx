import { Add } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CellarSegments } from "./CellarSegments";

/** As many cellar cards as a phone's first screen shows. */
const CARDS = [1, 2, 3];

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
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="t-display m-0 text-ink">Cellars</p>
        <Button asChild variant="outline">
          <Link href="/cellars/add" underline="none">
            <Add aria-hidden />
            New cellar
          </Link>
        </Button>
      </div>
      <CellarSegments current="cellars" />
      <div className="flex flex-col gap-3">
        {/* `SECTION_TITLES.MINE`, written out: that module is a client one. */}
        <div className="flex min-h-11 items-center">
          <p className="t-title m-0 text-ink">Yours</p>
        </div>
        <ShellBlocks className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-lg border border-line bg-card"
            >
              <div className="grid grid-cols-4 gap-px">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="aspect-square rounded-none" />
                ))}
              </div>
              <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
                <Skeleton className="h-6 w-[55%]" />
                <Skeleton className="h-5 w-[40%]" />
                <Skeleton className="h-5 w-[70%]" />
              </div>
            </div>
          ))}
        </ShellBlocks>
      </div>
    </LoadingShell>
  );
}
