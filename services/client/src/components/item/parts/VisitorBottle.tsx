import { ChevronRight } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { bottleState } from "@/components/cellar/bottle-state";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { thisContainerLabel } from "@/components/drink-log/type-words";
import { bottleStateLine } from "../item-page-model";

/**
 * The visitor's view of a bottle in someone else's cellar you may see
 * (Cellars-Pour visitor-01): "This bottle", the cellar, its state and a level
 * bar. Read-only: pouring from it and checking in are its owner's.
 */
export function VisitorBottle({
  itemType,
  bottle,
}: {
  itemType: ApiItemType;
  bottle: {
    cellarId: string;
    cellarName: string | null;
    openAt: string | null;
    emptyAt: string | null;
    percentageRemaining: number;
  };
}) {
  const state = bottleState(bottle, null);
  const opened =
    bottle.openAt === null
      ? null
      : `Opened ${new Date(bottle.openAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`;
  return (
    <section
      data-testid="visitor-bottle"
      aria-label={thisContainerLabel(itemType)}
      className="flex flex-col gap-3 rounded-lg border border-edge bg-card p-4"
    >
      <h2 className="t-cap text-ink-2">{thisContainerLabel(itemType)}</h2>
      <div className="relative flex min-h-11 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={`/cellars/${bottle.cellarId}/items`}
            overlay
            underline="none"
            className="t-head truncate text-ink"
          >
            {bottle.cellarName ?? "Their cellar"}
          </Link>
          <span className="t-cap text-ink-2">{bottleStateLine(bottle)}</span>
        </div>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-glyph" />
      </div>
      {state.kind === "open" && (
        <span
          aria-hidden
          className="relative block h-2.5 overflow-hidden rounded-full bg-raised"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-ink-2"
            style={{ width: `${state.level}%` }}
          />
        </span>
      )}
      {opened !== null && <p className="t-cap text-ink-2">{opened}</p>}
    </section>
  );
}
