import { Check, Help, Missing, Success, Swap } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { cn } from "@/lib/utils";
import {
  type AvailabilityLike,
  availabilityText,
  type MakeabilityLike,
  makeabilityDetail,
  makeabilityHeadline,
} from "./copy";

/**
 * X14 / D9: Have, Swap, Missing or Not tracked beside one ingredient — real
 * availability from the viewer's own bottles and Bar pantry, replacing the
 * old `Math.random()` icons.
 *
 * Colour never carries the meaning alone (the word is always printed): Have
 * is the success ink, a swap stays ink, missing and not tracked recede to
 * ink-3. No `"use client"` — it renders from the server or the client.
 */
export function IngredientAvailabilityTag({
  availability,
  className,
}: {
  availability: AvailabilityLike;
  className?: string;
}) {
  const { status } = availability;
  const Icon =
    status === "HAVE"
      ? Check
      : status === "SUBSTITUTE"
        ? Swap
        : status === "MISSING"
          ? Missing
          : Help;
  return (
    <span
      data-availability={status.toLowerCase()}
      className={cn(
        "t-cap inline-flex min-w-0 items-center gap-1",
        status === "HAVE" && availability.source !== "STAPLE" && "text-success",
        status === "HAVE" && availability.source === "STAPLE" && "text-ink-3",
        status === "SUBSTITUTE" && "text-ink",
        (status === "MISSING" || status === "UNKNOWN") && "text-ink-3",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
      <span className="truncate">{availabilityText(availability)}</span>
    </span>
  );
}

/**
 * The recipe's verdict, above its ingredients: "You can make this", "One
 * bottle away · Campari", "Missing 3 · Gin, Campari +1" — with a way into
 * the viewer's bar to change the answer.
 */
export function MakeabilitySummary({
  makeability,
  className,
}: {
  makeability: MakeabilityLike;
  className?: string;
}) {
  const canMake = makeability.status === "MAKE_NOW";
  const detail = makeabilityDetail(makeability);
  return (
    <div
      data-makeability={makeability.status.toLowerCase()}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-md border border-edge bg-card px-3 py-2",
        className,
      )}
    >
      {canMake ? (
        <Success aria-hidden className="size-5 shrink-0 text-success" />
      ) : (
        <Missing aria-hidden className="size-5 shrink-0 text-ink-3" />
      )}
      <p className="t-body m-0 min-w-0 flex-1">
        <span className="font-semibold text-ink">
          {makeabilityHeadline(makeability)}
        </span>
        {detail !== null && <span className="text-ink-2"> · {detail}</span>}
      </p>
      <Link
        href="/recipes/bar"
        underline="none"
        className="t-head relative shrink-0 text-act-ink after:absolute after:-inset-3 after:content-['']"
      >
        Your bar
      </Link>
    </div>
  );
}
