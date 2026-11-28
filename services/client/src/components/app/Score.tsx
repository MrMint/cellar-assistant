import {
  formatRating,
  RATING_MAX,
  ratingSummary,
} from "@/components/common/rating/rating";
import { cn } from "@/lib/utils";
import { Star } from "./icons";

export type ScoreProps = {
  /** 0–5; an average may carry more precision than half steps. */
  value: number | null | undefined;
  /**
   * `inline` "4.5★" in running text, `pill` on tiles, `hero` the t-score
   * numeral on a detail page.
   */
  variant?: "inline" | "pill" | "hero";
  /** How many ratings an average is made of ("12 ratings"). Hidden at 0. */
  count?: number;
  className?: string;
};

/**
 * One decimal, and only when it is not zero: 4 → "4", 4.5 → "4.5",
 * 4.25 → "4.3". The same rule `formatRating` applies to half steps.
 */
export function formatScore(value: number): string {
  const rounded = Math.round(Math.min(RATING_MAX, Math.max(0, value)) * 10);
  return formatRating(rounded / 10);
}

/**
 * A rating as a number (design §2.1 `Score`): the six ad-hoc renderings
 * become three variants. Renders nothing for "not rated" — the caller
 * decides whether absence needs words. The accessible name is the full
 * sentence ("Rated 4.5 out of 5"); the glyph is decoration.
 */
export function Score({
  value,
  variant = "inline",
  count,
  className,
}: ScoreProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const text = formatScore(value);
  const label = `${ratingSummary(value)}${
    count !== undefined && count > 0
      ? `, ${count} rating${count === 1 ? "" : "s"}`
      : ""
  }`;

  if (variant === "hero") {
    return (
      <span
        role="img"
        aria-label={label}
        data-slot="score"
        data-variant="hero"
        className={cn("inline-flex items-baseline gap-2", className)}
      >
        <span className="t-score tabular text-ink">{text}</span>
        <span className="t-cap tabular text-ink-3">
          / {RATING_MAX}
          {count !== undefined && count > 0 && ` · ${count}`}
        </span>
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      data-slot="score"
      data-variant={variant}
      className={cn(
        "tabular inline-flex items-center gap-0.5 whitespace-nowrap",
        variant === "pill" && "t-micro h-6 rounded-sm bg-sel px-2 text-ink",
        variant === "inline" && "t-cap font-semibold text-ink-2",
        className,
      )}
    >
      {text}
      <Star aria-hidden className="size-[0.9em] fill-current" strokeWidth={0} />
      {count !== undefined && count > 0 && (
        <span className="ml-1 font-normal text-ink-3">({count})</span>
      )}
    </span>
  );
}
