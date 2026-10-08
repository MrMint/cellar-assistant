"use client";

import { Box, Button } from "@mui/joy";
import type { CSSProperties } from "react";
import {
  formatRating,
  RATING_STARS,
  RATING_STEP,
  ratingLabel,
  ratingOptionName,
  ratingSummary,
  starFractions,
} from "./rating";
import { useStarRatingInput } from "./useStarRatingInput";

/**
 * The N30 rating control and its read-only twin.
 *
 * Deliberately plain: `<span>`s, native `<input type="radio">`s and an inline
 * SVG, themed through `--ca-rating-*` custom properties. Joy contributes only
 * the `Box` that carries the stylesheet and the optional Clear button, so the
 * shadcn migration (D20) replaces those two and keeps the rest. All behaviour
 * is in `useStarRatingInput` and `rating.ts`.
 *
 * What the old `react-simple-star-rating` got wrong, and this does not:
 * its root was `aria-hidden` (VoiceOver saw nothing), it set
 * `touch-action: none` (a thumb on the stars could not scroll the page), and
 * it committed on `pointerleave` (sliding across the stars rated).
 */

const STAR_PATH =
  "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

const glyphStyle = (size: number | string): CSSProperties => ({
  position: "relative",
  display: "inline-block",
  flex: "none",
  width: size,
  height: size,
});

const layerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
};

/** One star, filled to `fraction` (0–1) from the left. Decorative. */
function StarGlyph({
  fraction,
  size,
}: {
  fraction: number;
  size: number | string;
}) {
  return (
    <span
      aria-hidden="true"
      className="ca-rating__glyph"
      style={glyphStyle(size)}
    >
      <svg
        viewBox="0 0 24 24"
        width="100%"
        height="100%"
        style={{ display: "block", fill: "var(--ca-rating-empty)" }}
        focusable="false"
        aria-hidden="true"
      >
        <path d={STAR_PATH} />
      </svg>
      {fraction > 0 && (
        <span
          className="ca-rating__glyph-fill"
          data-fraction={fraction}
          style={{ ...layerStyle, width: `${fraction * 100}%` }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              display: "block",
              width: size,
              height: size,
              fill: "var(--ca-rating-fill)",
            }}
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

/**
 * Defaults for the custom properties. `--joy-palette-*` resolve in both
 * colour schemes; the fallbacks keep the control legible outside a Joy
 * provider (the markup tests, a future shadcn page).
 */
const tokens = {
  "--ca-rating-fill": "var(--joy-palette-warning-400, #ea9a3e)",
  "--ca-rating-empty": "var(--joy-palette-neutral-outlinedBorder, #cdd7e1)",
  "--ca-rating-focus": "var(--joy-palette-focusVisible, #0b6bcb)",
  "--ca-rating-target": "44px",
  "--ca-rating-icon": "32px",
} as const;

const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: 0,
  border: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  pointerEvents: "none",
} as const;

const inputSx = {
  ...tokens,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: 1.5,
  rowGap: 0.5,
  "& .ca-rating__stars": {
    display: "inline-flex",
    // Never `none`: a thumb resting on the stars must still scroll the page.
    // `manipulation` only drops double-tap-to-zoom, so a second tap on a star
    // (the half) is not swallowed as a zoom gesture.
    touchAction: "manipulation",
  },
  "& .ca-rating__star": {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "var(--ca-rating-target)",
    minHeight: "var(--ca-rating-target)",
    borderRadius: "8px",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
  },
  "& .ca-rating__star:has(.ca-rating__radio:focus-visible)": {
    outline: "2px solid var(--ca-rating-focus)",
    outlineOffset: "-2px",
  },
  "& .ca-rating__radio": visuallyHidden,
  "&[data-disabled] .ca-rating__star": {
    cursor: "default",
    opacity: 0.6,
  },
  "& .ca-rating__readout": {
    margin: 0,
    fontSize: "var(--joy-fontSize-sm, 0.875rem)",
    color: "var(--joy-palette-text-secondary, #555e68)",
  },
} as const;

export type StarRatingProps = {
  value: number | null | undefined;
  onChange: (value: number) => void;
  /** Clears the rating; when given, a "Clear" button shows beside a value. */
  onClear?: () => void;
  disabled?: boolean;
  /** The group's accessible name. */
  label?: string;
};

/**
 * Half-star rating input: tap a star for that many stars, tap it again for
 * the half below; arrows step by halves.
 */
export function StarRating({
  value,
  onChange,
  onClear,
  disabled = false,
  label = "Your score",
}: StarRatingProps) {
  const { name, current, radioRef, onKeyDown, onStarClick, onRadioChange } =
    useStarRatingInput({ value, onChange, disabled });
  const fractions = starFractions(current);
  const word = ratingLabel(current);

  return (
    <Box
      className="ca-rating"
      sx={inputSx}
      data-disabled={disabled ? "" : undefined}
    >
      <div
        className="ca-rating__stars"
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
      >
        {RATING_STARS.map((star, i) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard path is the two radios inside, handled on the group.
          // biome-ignore lint/a11y/noStaticElementInteractions: a pointer target only; the radios inside carry the semantics.
          <span
            key={star}
            className="ca-rating__star"
            data-star={star}
            onClick={onStarClick(star)}
          >
            <StarGlyph
              fraction={fractions[i] ?? 0}
              size="var(--ca-rating-icon)"
            />
            {[star - RATING_STEP, star].map((v) => (
              <input
                key={v}
                ref={radioRef(v)}
                className="ca-rating__radio"
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
      <p className="ca-rating__readout">
        {current === null
          ? "Tap a star to rate"
          : `${formatRating(current)} · ${word ?? ""}${
              Number.isInteger(current) ? " — tap again for a half" : ""
            }`}
      </p>
      {onClear !== undefined && current !== null && (
        <Button
          size="sm"
          variant="plain"
          color="neutral"
          onClick={onClear}
          disabled={disabled}
        >
          Clear rating
        </Button>
      )}
    </Box>
  );
}

export type StarRatingDisplayProps = {
  value: number | null | undefined;
  /** Star size in px. */
  size?: number;
};

/** A read-only rating: one image named "Rated 3.5 out of 5". */
export function StarRatingDisplay({
  value,
  size = 20,
}: StarRatingDisplayProps) {
  return (
    <span
      className="ca-rating-display"
      role="img"
      aria-label={ratingSummary(value)}
      style={{
        ...(tokens as unknown as CSSProperties),
        display: "inline-flex",
        gap: 2,
        verticalAlign: "middle",
      }}
    >
      {starFractions(value).map((fraction, i) => (
        <StarGlyph
          // biome-ignore lint/suspicious/noArrayIndexKey: five fixed positions.
          key={i}
          fraction={fraction}
          size={size}
        />
      ))}
    </span>
  );
}
