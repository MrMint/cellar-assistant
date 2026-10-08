"use client";

import {
  formatRating,
  RATING_STARS,
  RATING_STEP,
  ratingLabel,
  ratingOptionName,
  ratingSummary,
  starFractions,
} from "@/components/common/rating/rating";
import { useStarRatingInput } from "@/components/common/rating/useStarRatingInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STAR_PATH =
  "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

/**
 * One star, filled to `fraction` (0–1) from the left. Decorative. Empty is
 * an outline (it is the only affordance before a first tap, so it must read
 * at 3:1 against the surface); filled is solid.
 */
function StarGlyph({
  fraction,
  className,
  fillClass,
}: {
  fraction: number;
  className?: string;
  fillClass: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="star"
      className={cn("relative inline-block shrink-0", className)}
    >
      <svg
        viewBox="0 0 24 24"
        className="block size-full fill-none stroke-current text-ink-3"
        strokeWidth={1.5}
        strokeLinejoin="round"
        focusable="false"
        aria-hidden="true"
      >
        <path d={STAR_PATH} />
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
            focusable="false"
            aria-hidden="true"
          >
            <path d={STAR_PATH} />
          </svg>
        </span>
      )}
    </span>
  );
}

export type RatingInputProps = {
  value: number | null | undefined;
  onChange: (value: number) => void;
  /** Clears the rating; when given, a "Clear rating" button shows beside a value. */
  onClear?: () => void;
  disabled?: boolean;
  /** The group's accessible name. */
  label?: string;
  className?: string;
};

/**
 * The N30 half-star rating input, on the app's tokens. All behaviour is ux/rating's `useStarRatingInput`: ten
 * native radios named "3.5 stars, Good+", 44 pt star targets, tap a star for
 * that many and again for the half below, arrows by halves, Home/End, and no
 * commit on pointer-leave or hover — a thumb sliding across the stars to
 * scroll sets nothing (`touch-action: manipulation`, never `none`).
 */
export function RatingInput({
  value,
  onChange,
  onClear,
  disabled = false,
  label = "Your score",
  className,
}: RatingInputProps) {
  const {
    name,
    current,
    radioRef,
    onKeyDown,
    onStarClick,
    onRadioChange,
    clear,
  } = useStarRatingInput({ value, onChange, onClear, disabled });
  const fractions = starFractions(current);
  const word = ratingLabel(current);

  return (
    <div
      data-slot="rating-input"
      data-disabled={disabled ? "" : undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className="inline-flex touch-manipulation"
      >
        {RATING_STARS.map((star, i) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard path is the two radios inside, handled on the group.
          // biome-ignore lint/a11y/noStaticElementInteractions: a pointer target only; the radios inside carry the semantics.
          <span
            key={star}
            data-star={star}
            onClick={onStarClick(star)}
            className={cn(
              "touch-none-select relative inline-flex size-11 items-center justify-center rounded-md has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50",
              disabled ? "cursor-default" : "cursor-pointer",
            )}
          >
            <StarGlyph
              fraction={fractions[i] ?? 0}
              className="size-8"
              fillClass="text-primary"
            />
            {[star - RATING_STEP, star].map((v) => (
              <input
                key={v}
                ref={radioRef(v)}
                className="sr-only"
                type="radio"
                name={name}
                value={v}
                checked={current === v}
                disabled={disabled}
                aria-label={ratingOptionName(v)}
                onChange={onRadioChange}
              />
            ))}
          </span>
        ))}
      </div>
      <p className="type-footnote m-0">
        {current === null
          ? "Tap a star to rate"
          : `${formatRating(current)} · ${word ?? ""}${
              Number.isInteger(current) ? " — tap again for a half" : ""
            }`}
      </p>
      {onClear !== undefined && current !== null && (
        <Button size="sm" variant="ghost" onClick={clear} disabled={disabled}>
          Clear rating
        </Button>
      )}
    </div>
  );
}

/** A read-only row of stars: one image named "Rated 3.5 out of 5". */
export function RatingDisplay({
  value,
  size = "sm",
  className,
}: {
  value: number | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={ratingSummary(value)}
      data-slot="rating-display"
      className={cn("inline-flex gap-0.5 align-middle", className)}
    >
      {starFractions(value).map((fraction, i) => (
        <StarGlyph
          // biome-ignore lint/suspicious/noArrayIndexKey: five fixed positions.
          key={i}
          fraction={fraction}
          className={size === "sm" ? "size-4" : "size-5"}
          fillClass="text-ink-2"
        />
      ))}
    </span>
  );
}
