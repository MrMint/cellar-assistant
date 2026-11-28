/**
 * One recap card's face in the app (Social-Recap board): overline, the big
 * numeral, a two-line title, then what it counted. "New to you" draws its
 * things as label plates (the API sends names, not photos); the breadth cards
 * draw them as plain tags (facts, not controls: no chip edge, SR-7); top rated
 * is a numbered list in plain tabular numerals (no band exists here, so no
 * band chip, and no crown: CROSS-LOT wave 3); a stamp card draws the stamp.
 */
import { cn } from "@/lib/utils";
import { RecapStamp } from "./RecapStamp";
import { type RecapCardView, recapCardCopy, recapMoreText } from "./recap-copy";

export function RecapCardFace({ card }: { card: RecapCardView }) {
  const copy = recapCardCopy(card);
  const more = recapMoreText(card);
  return (
    <div data-slot="recap-card-face" className="flex flex-col gap-3">
      <span data-slot="recap-overline" className="t-cap text-ink-2">
        {copy.overline}
      </span>
      {card.stamp !== null && (
        <span className="flex justify-center py-4">
          <RecapStamp stamp={card.stamp} />
        </span>
      )}
      {copy.big !== "" && (
        <span className="tabular text-[64px] leading-none font-bold">
          {copy.big}
        </span>
      )}
      <span className="t-title whitespace-pre-line text-ink-1">
        {copy.title}
      </span>
      {card.kind === "NEW_TO_YOU" && copy.chips.length > 0 && (
        <span className="mt-6 grid grid-cols-3 gap-2">
          {copy.chips.map((chip) => (
            <span
              key={chip}
              className="t-cap flex aspect-square items-end overflow-hidden rounded-md bg-raised p-2 text-ink-1"
            >
              <span className="line-clamp-3">{chip}</span>
            </span>
          ))}
          {more !== "" && (
            <span className="t-head tabular flex aspect-square items-center justify-center rounded-md bg-raised text-ink-2">
              {more.replace(" more", "")}
            </span>
          )}
        </span>
      )}
      {card.kind === "TOP_RATED" && copy.chips.length > 0 && (
        <ol className="mt-6 flex flex-col">
          {copy.chips.map((chip, index) => (
            <li
              key={chip}
              className={cn(
                "flex min-h-11 items-center gap-3 py-1",
                index > 0 && "border-hair border-t",
              )}
            >
              <span className="t-head tabular w-6 text-ink-2">{index + 1}</span>
              <span className="t-body min-w-0 flex-1 truncate">{chip}</span>
            </li>
          ))}
        </ol>
      )}
      {card.kind !== "NEW_TO_YOU" &&
        card.kind !== "TOP_RATED" &&
        copy.chips.length > 0 && (
          <span className="mt-6 flex flex-wrap gap-2">
            {copy.chips.map((chip) => (
              <span
                key={chip}
                className="t-body flex h-11 items-center rounded-md bg-raised px-4 text-ink-1"
              >
                {chip}
              </span>
            ))}
            {more !== "" && (
              <span className="t-body flex h-11 items-center px-2 text-ink-2">
                {more}
              </span>
            )}
          </span>
        )}
    </div>
  );
}
