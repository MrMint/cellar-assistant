import { Add } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { LIST_GRID_CLASS } from "./ListBody";

/**
 * A cellar with nothing in it (lot-cellars-shelves shelf-empty): a dashed
 * tile that adds the first bottle, and one quiet line under the grid. A
 * friend's empty cellar gets the line alone.
 */
export function EmptyShelf({
  cellarId,
  cellarName,
  canAdd,
}: {
  cellarId: string;
  cellarName: string;
  canAdd: boolean;
}) {
  return (
    <div data-slot="cellar-empty" className="flex flex-col gap-4">
      {canAdd && (
        <div className={LIST_GRID_CLASS}>
          <Link
            href={`/cellars/${cellarId}/items/add`}
            underline="none"
            className="flex aspect-[171/250] flex-col items-center justify-center gap-4 rounded-md border border-act-ink border-dashed text-ink outline-none transition-transform duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 active:scale-97 motion-reduce:active:scale-100"
          >
            <span className="flex size-13 items-center justify-center rounded-md border border-act-ink text-act-ink">
              <Add aria-hidden className="size-6" />
            </span>
            <span className="t-head">Add a bottle</span>
          </Link>
        </div>
      )}
      <p className="t-body m-0 text-ink-2">Nothing in {cellarName} yet</p>
    </div>
  );
}
