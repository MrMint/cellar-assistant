"use client";

/**
 * `/recap` — the viewer's month or year as a deck of cards (L04), laid out to
 * the approved Recap board (L43): segmented progress, "Your <month>" and
 * Close, the whole card a "Next card" target (overline, big numeral, serif
 * title, chips, the stamp on a stamp card), and "Share this card" below.
 *
 * Cards come from `Query.recap`, already thresholded: a card with too little
 * data was skipped on the server, so an empty deck is an honest empty state,
 * never a padded one. Sharing sends the card's image as a file (L16).
 */
import {
  parseRecapPeriod,
  type RecapPeriod,
} from "@cellar-assistant/contracts/recap";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "urql";
import { Close, Share } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { useNavigate } from "@/components/app/useNavigate";
import { leaveTo } from "@/components/make/leave";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RecapStamp } from "./RecapStamp";
import {
  currentRecapPeriod,
  type RecapCardView,
  type RecapTone,
  recapCardCopy,
  recapPeriodLabel,
  viewerTimeZone,
} from "./recap-copy";
import {
  deckOf,
  RecapQuery,
  type RecapStatus,
  recapFromResult,
  recapImagePath,
  recapStatus,
} from "./recap-data";
import {
  browserDownload,
  recapFileName,
  type ShareOutcome,
  shareRecapImage,
} from "./share-card";

const TONE_BG: Readonly<Record<RecapTone, string>> = {
  plain: "var(--ca-bg)",
  claret: "color-mix(in oklab, var(--ca-brand) 22%, var(--ca-bg))",
  raised: "var(--ca-surface-1)",
};

const NOTE =
  "Shared as an image. No link, nothing public. Cards with too little data are skipped.";

const OUTCOME_NOTE: Partial<Record<ShareOutcome, string>> = {
  downloaded: "Saved the image to your device. No link, nothing public.",
  failed: "Couldn't make the image. Try again in a moment.",
};

export function RecapDeck({
  ownerId,
  period: requested,
}: {
  ownerId: string;
  period: string | null;
}) {
  const period: RecapPeriod = useMemo(
    () =>
      parseRecapPeriod(requested) ??
      parseRecapPeriod(currentRecapPeriod()) ?? {
        kind: "year",
        year: new Date().getFullYear(),
      },
    [requested],
  );
  const periodKey =
    period.kind === "year"
      ? String(period.year)
      : `${period.year}-${String(period.month).padStart(2, "0")}`;
  const timeZone = useMemo(viewerTimeZone, []);
  const [result, reexecute] = useQuery({
    query: RecapQuery,
    variables: { period: periodKey, timeZone },
  });
  const retry = useCallback(
    () => reexecute({ requestPolicy: "network-only" }),
    [reexecute],
  );
  const recap = recapFromResult(result.data);
  const deck = useMemo(() => (recap === null ? [] : deckOf(recap)), [recap]);
  const label = recapPeriodLabel(period);

  return (
    <RecapFrame
      label={label}
      status={recapStatus(result)}
      onRetry={retry}
      cards={deck}
      period={period}
      ownerId={ownerId}
      periodKey={periodKey}
      timeZone={timeZone}
    />
  );
}

function RecapFrame({
  label,
  status,
  onRetry,
  cards,
  period,
  ownerId,
  periodKey,
  timeZone,
}: {
  label: string;
  status: RecapStatus;
  onRetry: () => void;
  cards: readonly RecapCardView[];
  period: RecapPeriod;
  ownerId: string;
  periodKey: string;
  timeZone: string;
}) {
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState(NOTE);
  const [sharing, setSharing] = useState(false);
  const navigate = useNavigate();
  const current = cards[Math.min(index, Math.max(cards.length - 1, 0))];
  const copy = current === undefined ? null : recapCardCopy(current);

  const next = useCallback(() => {
    setNote(NOTE);
    setIndex((i) => (cards.length === 0 ? 0 : (i + 1) % cards.length));
  }, [cards.length]);

  const share = useCallback(async () => {
    if (current === undefined) return;
    setSharing(true);
    const position = cards.indexOf(current);
    const outcome = await shareRecapImage(
      recapImagePath(ownerId, periodKey, position, timeZone),
      recapFileName(periodKey, position),
      {
        fetch: (url) => fetch(url, { credentials: "same-origin" }),
        navigator: typeof navigator === "undefined" ? undefined : navigator,
        download: browserDownload,
      },
    );
    setSharing(false);
    setNote(OUTCOME_NOTE[outcome] ?? NOTE);
  }, [cards, current, ownerId, periodKey, timeZone]);

  return (
    <div
      data-slot="recap-deck"
      className="fixed inset-0 z-50 flex flex-col text-ink-1"
      style={{ background: TONE_BG[copy?.tone ?? "plain"] }}
    >
      <div className="flex flex-col gap-3 px-4 pt-[max(56px,env(safe-area-inset-top))]">
        {cards.length > 0 && (
          <div className="flex gap-1" aria-hidden>
            {cards.map((card, k) => (
              <div
                key={`${card.kind}-${card.stamp?.kind ?? ""}`}
                className={cn(
                  "h-[3px] flex-1 rounded-sm",
                  k <= index ? "bg-ink-1" : "bg-ink-1/25",
                )}
              />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <h1 className="type-footnote font-normal text-ink-2">{label}</h1>
          <button
            type="button"
            onClick={() => leaveTo(navigate, "/me")}
            aria-label="Close recap"
            className="-mr-3 flex size-11 items-center justify-center text-ink-1"
          >
            <Close aria-hidden className="size-[22px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {status === "loading" ? (
        <div className="flex flex-1 flex-col gap-4 px-6 pt-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-20 w-28" />
          <Skeleton className="h-16 w-64" />
        </div>
      ) : status === "failed" ? (
        <FailedDeck onRetry={onRetry} />
      ) : current === undefined || copy === null ? (
        <EmptyDeck period={period} />
      ) : (
        <button
          type="button"
          onClick={next}
          aria-label="Next card"
          aria-describedby="recap-card-body"
          className="flex flex-1 cursor-pointer flex-col gap-3.5 border-0 bg-transparent px-6 pt-6 text-left text-inherit"
        >
          <span id="recap-card-body" className="flex flex-col gap-3.5">
            <span
              data-slot="recap-overline"
              className={cn(
                "type-overline",
                copy.accent === "claret" ? "text-brand-ink" : "text-brass",
              )}
            >
              {copy.overline}
            </span>
            {copy.big !== "" && (
              <span className="font-display text-[88px] leading-[88px] font-medium tabular-nums">
                {copy.big}
              </span>
            )}
            <span className="font-display text-[28px] leading-[34px] font-semibold whitespace-pre-line">
              {copy.title}
            </span>
            {copy.chips.length > 0 && (
              <span className="flex flex-wrap gap-2 pt-2">
                {copy.chips.map((chip) => (
                  <span
                    key={chip}
                    className="h-8 rounded-full bg-ink-1/10 px-3 text-[15px] leading-8"
                  >
                    {chip}
                  </span>
                ))}
              </span>
            )}
            {current.stamp !== null && current.stamp !== undefined && (
              <RecapStamp stamp={current.stamp} />
            )}
          </span>
        </button>
      )}

      <div className="flex flex-col gap-2 px-4 pt-4 pb-[max(40px,env(safe-area-inset-bottom))]">
        {status === "ready" && current !== undefined && (
          <button
            type="button"
            onClick={share}
            disabled={sharing}
            className="flex h-[52px] items-center justify-center gap-2 rounded-full bg-brass text-base font-semibold text-on-brass disabled:opacity-60"
          >
            <Share aria-hidden className="size-[18px]" strokeWidth={2} />
            Share this card
          </button>
        )}
        <span
          className="type-footnote text-center text-ink-3"
          aria-live="polite"
        >
          {status === "failed"
            ? ""
            : current === undefined
              ? "Cards with too little data are skipped."
              : note}
        </span>
      </div>
    </div>
  );
}

/** The read failed: say so, and offer it again (CR-7). Not "too little". */
function FailedDeck({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-slot="recap-failed"
      className="flex flex-1 flex-col gap-3.5 px-6 pt-6"
    >
      <span className="type-overline text-brass">Recap unavailable</span>
      <p
        role="alert"
        className="font-display text-[28px] leading-[34px] font-semibold"
      >
        Couldn&apos;t load your recap just now
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-11 w-fit items-center rounded-full bg-ink-1/10 px-5 text-base font-semibold"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyDeck({ period }: { period: RecapPeriod }) {
  return (
    <div className="flex flex-1 flex-col gap-3.5 px-6 pt-6">
      <span className="type-overline text-brass">Not enough yet</span>
      <span className="font-display text-[28px] leading-[34px] font-semibold whitespace-pre-line">
        {period.kind === "month"
          ? "Too little logged this month\nfor a recap"
          : "Too little logged this year\nfor a recap"}
      </span>
      {period.kind === "month" && (
        <Link href={`/recap?period=${period.year}`} className="text-brass">
          See your {period.year}
        </Link>
      )}
    </div>
  );
}
