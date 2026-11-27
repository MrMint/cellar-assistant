import {
  RATING_MAX,
  ratingSummary,
  starFractions,
} from "@/components/common/rating/rating";
import { cn } from "@/lib/utils";
import { People } from "../icons";

/** The kit's star, on a 24 grid (KIT § 1, `G.star`). */
export const KIT_STAR_PATH =
  "M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z";

/**
 * A score as the kit prints it: always one decimal ("4.0", "4.5"), tabular.
 * Averages round to the tenth.
 */
export function formatKitScore(value: number): string {
  const clamped = Math.min(RATING_MAX, Math.max(0, value));
  return (Math.round(clamped * 10) / 10).toFixed(1);
}

/**
 * One star, filled to `fraction` from the left over its outline. The outline
 * is in the glyph colour (3:1 on every surface); the fill is the caller's.
 */
export function StarGlyph({
  fraction,
  fillClass,
  className,
}: {
  fraction: number;
  fillClass: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="star"
      className={cn("relative inline-block shrink-0", className)}
    >
      <svg
        viewBox="0 0 24 24"
        className="block size-full fill-none stroke-current text-glyph"
        strokeWidth={1.5}
        strokeLinejoin="round"
        focusable="false"
        aria-hidden="true"
      >
        <path d={KIT_STAR_PATH} />
      </svg>
      {fraction > 0 && (
        <span
          data-fraction={fraction}
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${fraction * 100}%` }}
        >
          <svg
            viewBox="0 0 24 24"
            className={cn("block h-full fill-current", fillClass)}
            style={{ width: `${100 / fraction}%` }}
            strokeWidth={1.5}
            strokeLinejoin="round"
            focusable="false"
            aria-hidden="true"
          >
            <path d={KIT_STAR_PATH} className="stroke-current" />
          </svg>
        </span>
      )}
    </span>
  );
}

const STAR_SIZE = {
  /** 15: desktop tiles, feed lines. */
  sm: "size-[15px]",
  /** 18: a phone tile's foot (KIT `.stars.lg`, 90 wide). */
  md: "size-[18px]",
  /** 32: a desktop pane. */
  lg: "size-8",
} as const;

export type StarsProps = {
  value: number | null | undefined;
  /**
   * `owner`: the person's own verdict, in gold (CROSS-LOT ruling 1). `other`:
   * anyone else's, in ink-2: gold is the owner's alone.
   */
  tone?: "owner" | "other";
  size?: keyof typeof STAR_SIZE;
  className?: string;
};

/**
 * A read-only row of five stars, half steps, one image named "Rated 3.5 out
 * of 5". Not rated is five outlines (amendments: "unrated tiles show empty
 * stars only"). The owner's stars never move (KIT § 4).
 */
export function Stars({
  value,
  tone = "owner",
  size = "md",
  className,
}: StarsProps) {
  return (
    <span
      role="img"
      aria-label={ratingSummary(value)}
      data-slot="stars"
      data-tone={tone}
      className={cn("inline-flex shrink-0 align-middle", className)}
    >
      {starFractions(value).map((fraction, i) => (
        <StarGlyph
          // biome-ignore lint/suspicious/noArrayIndexKey: five fixed positions.
          key={i}
          fraction={fraction}
          fillClass={tone === "owner" ? "text-gold" : "text-ink-2"}
          className={STAR_SIZE[size]}
        />
      ))}
    </span>
  );
}

/**
 * The public rating (KIT § 2 "Stars"): the people glyph, the average in
 * t-head and the count in t-cap, in ink-2 and ink-3, never gold. Renders
 * nothing without an average.
 */
export function PublicRating({
  value,
  count,
  className,
}: {
  value: number | null | undefined;
  count?: number | null | undefined;
  className?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const n = count ?? 0;
  return (
    <span
      role="img"
      aria-label={`People rate it ${formatKitScore(value)} out of 5${
        n > 0 ? `, ${n} rating${n === 1 ? "" : "s"}` : ""
      }`}
      data-slot="public-rating"
      className={cn(
        "tabular inline-flex shrink-0 items-center gap-1 text-ink-2",
        className,
      )}
    >
      <People aria-hidden className="size-4 text-ink-2" strokeWidth={1.75} />
      <span className="t-head tabular">{formatKitScore(value)}</span>
      {n > 0 && <span className="t-cap tabular text-ink-3">({n})</span>}
    </span>
  );
}
