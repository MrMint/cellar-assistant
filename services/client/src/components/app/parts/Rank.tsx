import { cn } from "@/lib/utils";
import { CrownGlyph } from "./glyphs";

/** A tier list's five bands, best first (KIT § 2, k5..k1). */
export type Band = 5 | 4 | 3 | 2 | 1;

export const BANDS: readonly { band: Band; name: string }[] = [
  { band: 5, name: "Outstanding" },
  { band: 4, name: "Very Good" },
  { band: 3, name: "Good" },
  { band: 2, name: "Mediocre" },
  { band: 1, name: "Bad" },
];

export const bandName = (band: Band): string =>
  BANDS.find((b) => b.band === band)?.name ?? "";

/** Class names written out so Tailwind sees them. */
export const BAND_FILL: Readonly<Record<Band, string>> = {
  5: "bg-band-5",
  4: "bg-band-4",
  3: "bg-band-3",
  2: "bg-band-2",
  1: "bg-band-1",
};

/**
 * The owner's crown, gold, beside their own #1 only (CROSS-LOT ruling 1).
 * Decorative: the chip beside it says "#1".
 */
export function Crown({ className }: { className?: string }) {
  return (
    <CrownGlyph
      aria-hidden
      data-slot="crown"
      strokeWidth={1.75}
      className={cn("size-5 shrink-0 fill-current text-gold", className)}
    />
  );
}

/**
 * KIT § 2 "Rank chip": "#n" filled in its band's colour, ink always dark
 * (on-band), with the light theme's 1 px band edge. `crown` draws the gold
 * crown before it: pass it only for the owner's own #1. Every rank wears its
 * band; none is gold.
 */
export function RankChip({
  rank,
  band,
  crown = false,
  className,
}: {
  rank: number;
  band: Band;
  crown?: boolean;
  className?: string;
}) {
  const chip = (
    <span
      data-slot="rank-chip"
      data-band={band}
      className={cn(
        "t-head tabular inline-flex h-6 min-w-[38px] shrink-0 items-center justify-center rounded-sm px-1.5 text-on-band ring-1 ring-band-edge ring-inset",
        BAND_FILL[band],
        !crown && className,
      )}
    >
      #{rank}
      <span className="sr-only">, {bandName(band)}</span>
    </span>
  );
  if (!crown) return chip;
  return (
    <span
      data-slot="rank"
      className={cn("inline-flex items-center gap-1", className)}
    >
      <Crown className="-my-0.5 -mr-1" />
      {chip}
    </span>
  );
}

/** The 6 × 20 band marker that leads a band's header and its sheet row. */
export function BandMarker({
  band,
  className,
}: {
  band: Band;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-slot="band-marker"
      className={cn(
        "inline-block h-5 w-1.5 shrink-0 rounded-[3px] ring-1 ring-band-edge ring-inset",
        BAND_FILL[band],
        className,
      )}
    />
  );
}

/**
 * KIT § 2 "Band bar": a band's header in a tier list. The marker, the band's
 * name (t-head) and, at the right, how many and which ranks
 * ("16 · #12–27").
 */
export function BandBar({
  band,
  count,
  from,
  to,
  className,
}: {
  band: Band;
  count: number;
  /** The first and last rank in the band; omit for an empty band. */
  from?: number;
  to?: number;
  className?: string;
}) {
  const range =
    from === undefined || to === undefined
      ? ""
      : from === to
        ? ` · #${from}`
        : ` · #${from}–${to}`;
  return (
    <div
      data-slot="band-bar"
      data-band={band}
      className={cn("flex h-[34px] items-center gap-2", className)}
    >
      <BandMarker band={band} />
      <h3 className="t-head m-0 min-w-0 flex-1 truncate text-ink">
        {bandName(band)}
      </h3>
      <span className="t-cap tabular shrink-0 text-ink-3">
        {count}
        {range}
      </span>
    </div>
  );
}
