import Image from "next/image";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { UserAvatar } from "@/components/app/UserAvatar";
import { feedback } from "@/lib/feedback";
import { cardCountLine, type IndexCard, type MosaicCell } from "./index-card";

const MOSAIC_CELLS = 4;

function Mosaic({ cells }: { cells: readonly MosaicCell[] }) {
  // Always four squares: a cellar with fewer bottles shows bare wells.
  const squares = Array.from(
    { length: MOSAIC_CELLS },
    (_, i) => cells[i] ?? null,
  );
  return (
    <div
      aria-hidden
      data-slot="cellar-card-mosaic"
      className="grid grid-cols-4 gap-px bg-line"
    >
      {squares.map((cell, i) =>
        cell === null ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: empty wells have no identity
          <div key={`well-${i}`} className="aspect-square bg-raised" />
        ) : (
          <div
            key={cell.key}
            className="relative aspect-square overflow-hidden bg-raised"
          >
            {cell.photoUrl ? (
              <Image
                src={cell.photoUrl}
                alt=""
                fill
                sizes="(min-width: 900px) 100px, 25vw"
                className="object-cover"
              />
            ) : (
              <LabelPlate
                type={cell.type}
                plate={cell.plate ?? { name: cell.name }}
                className="absolute inset-0"
              />
            )}
          </div>
        ),
      )}
    </div>
  );
}

/**
 * A card of the cellars index (lot-cellars-shelves-01): four of the newest
 * bottles, the name (the card's link), Edit on your own, "240 bottles · 20
 * open" (with whose it is on a friend's), and the counts per kind in the
 * owner's order.
 */
export function CellarIndexCard({
  card,
  onBeforeNavigate,
}: {
  card: IndexCard;
  onBeforeNavigate?: () => void;
}) {
  return (
    <article
      data-slot="cellar-card"
      aria-label={card.name}
      className="relative flex flex-col overflow-hidden rounded-lg border border-line bg-card transition-colors duration-(--ca-dur-micro) ease-standard hover:bg-surface-2"
    >
      <Mosaic cells={card.mosaic} />
      <div className="flex flex-col gap-1 px-4 pt-3 pb-4">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <Link
            overlay
            underline="none"
            href={`/cellars/${card.id}/items`}
            onClick={() => {
              feedback("press");
              onBeforeNavigate?.();
            }}
            className="t-head min-w-0 truncate text-ink"
          >
            {card.name}
          </Link>
          {card.mine && (
            <Link
              href={`/cellars/${card.id}/edit`}
              underline="none"
              onClick={() => {
                feedback("press");
                onBeforeNavigate?.();
              }}
              aria-label={`Edit ${card.name}`}
              className="t-head relative z-10 flex h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-2.5 text-act-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
            >
              Edit
            </Link>
          )}
        </div>
        <p className="t-body m-0 flex min-w-0 items-center gap-2 text-ink-2">
          {card.owner !== null && (
            <>
              <UserAvatar
                avatarUrl={card.owner.avatarUrl ?? ""}
                displayName={card.owner.name}
                size="sm"
              />
              <span className="truncate">{card.owner.name} ·</span>
            </>
          )}
          <span className="tabular shrink-0">{cardCountLine(card)}</span>
        </p>
        {card.kinds.length > 0 && (
          <p
            data-slot="cellar-card-kinds"
            className="t-body m-0 flex flex-wrap gap-x-4 gap-y-1 text-ink-2"
          >
            {card.kinds.map((kind) => (
              <span key={kind.type} className="tabular">
                {kind.count.toLocaleString("en-US")} {kind.label}
              </span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}
