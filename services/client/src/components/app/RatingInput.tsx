"use client";

import { motion } from "motion/react";
import { useState } from "react";

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
import { feedback, HapticOverlay } from "@/lib/feedback";
import { spring, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatKitScore, StarGlyph } from "./parts/Stars";

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
 * The N30 half-star rating input, in the kit (KIT § 2 "Stars"): the owner's
 * gold over glyph outlines, the score in t-score beside them, a tick per
 * star (felt on an iPhone through each star's `HapticOverlay`), and on a
 * tap the filled stars pop in turn (SPEC § Movements 11; under reduced
 * motion the values change only). All behaviour is ux/rating's `useStarRatingInput`: ten
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
  } = useStarRatingInput({
    value,
    onChange: (next) => {
      feedback("tick");
      setPops((n) => n + 1);
      onChange(next);
    },
    onClear,
    disabled,
  });
  /* Each commit the person makes pops the filled stars once (0: none yet). */
  const [pops, setPops] = useState(0);
  const fractions = starFractions(current);
  const word = ratingLabel(current);

  return (
    <div
      data-slot="rating-input"
      data-disabled={disabled ? "" : undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1",
        disabled && "opacity-40",
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
            <motion.span
              key={(fractions[i] ?? 0) > 0 ? pops : 0}
              className="inline-flex"
              initial={
                pops > 0 && (fractions[i] ?? 0) > 0 ? { scale: 0.6 } : false
              }
              animate={{ scale: 1 }}
              transition={{ ...spring.celebrate, delay: staggerDelay(i) }}
            >
              <StarGlyph
                fraction={fractions[i] ?? 0}
                className="size-10"
                fillClass="text-gold"
              />
            </motion.span>
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
            {!disabled && <HapticOverlay />}
          </span>
        ))}
      </div>
      {current !== null && (
        <span data-slot="rating-score" className="t-score tabular text-ink">
          {formatKitScore(current)}
        </span>
      )}
      <p className="t-cap m-0 basis-full text-ink-2">
        {current === null
          ? "Tap a star to rate"
          : `${formatRating(current)} · ${word ?? ""}${
              Number.isInteger(current) ? " — tap again for a half" : ""
            }`}
      </p>
      {onClear !== undefined && current !== null && (
        <Button variant="quiet-muted" onClick={clear} disabled={disabled}>
          Clear rating
        </Button>
      )}
    </div>
  );
}

/**
 * A read-only row of stars in ink-2 (reviews: anyone's, so never gold): one
 * image named "Rated 3.5 out of 5". The owner's own are `parts/Stars`.
 */
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
