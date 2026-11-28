"use client";

/**
 * `/recap` — the viewer's month or year as a deck of cards (L04), laid out to
 * the Social-Recap boards.
 *
 * Phone: full screen, no tab bar. Progress segments (one per card and one for
 * the end card), Close and the period button ("May 2026 ⌄", which opens the
 * Recaps sheet), the card, and Share. Tap the left third to go back, the rest
 * to go on; swipe either way; arrow keys on the app element. The end card
 * carries the stat tiles, the totals and the doors, with Start over and Share.
 * Desktop (`md` up): crumbs, "Your May 2026" and Share card; the Recaps column
 * (from `lg`), the card with Previous / Next, and the period's tiles and doors.
 *
 * Cards come from `Query.recap`, already thresholded; periods from
 * `Query.recapPeriods` (MC-recap). A period with no cards is the empty month,
 * never a zero deck. No `?period` opens the latest recap (FIX-social-b
 * ruling 3), or this month, empty, when there is none.
 */
import {
  parseRecapPeriod,
  type RecapPeriod,
} from "@cellar-assistant/contracts/recap";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "urql";
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Close,
  History,
  ICON_STROKE,
  Share,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { useNavigate } from "@/components/app/useNavigate";
import { leaveTo } from "@/components/make/leave";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { RecapCardFace } from "./RecapCardFace";
import { RecapDoors, RecapEndCard } from "./RecapEndCard";
import { RecapPeriodRows, RecapPeriodSheet } from "./RecapPeriodList";
import { RecapShareDialog } from "./RecapShareDialog";
import {
  currentRecapPeriod,
  type RecapCardView,
  type RecapPeriodOption,
  recapCardCopy,
  recapEndStats,
  recapPeriodList,
  recapPeriodName,
  recapPeriodShort,
  viewerTimeZone,
} from "./recap-copy";
import {
  deckOf,
  periodsFromResult,
  type RecapEndView,
  RecapPeriodsQuery,
  RecapQuery,
  type RecapStatus,
  recapFromResult,
  recapImagePath,
  recapStatus,
} from "./recap-data";
import { recapFileName } from "./share-card";

/** A horizontal move this far is a swipe, not a tap (the board's 48). */
const SWIPE_PX = 48;

export function RecapDeck({
  ownerId,
  period: requested,
}: {
  ownerId: string;
  period: string | null;
}) {
  const timeZone = useMemo(viewerTimeZone, []);
  const [periodsRead] = useQuery({
    query: RecapPeriodsQuery,
    variables: { timeZone },
  });
  const periods = periodsFromResult(periodsRead.data);
  const options = useMemo(
    () => recapPeriodList(periods ?? { months: [], years: [] }),
    [periods],
  );
  const latest = periods?.months[0] ?? periods?.years[0] ?? null;

  const [picked, setPicked] = useState<string | null>(
    parseRecapPeriod(requested) === null ? null : requested,
  );
  // No period asked for: the latest recap, once the periods are known.
  const periodsSettled = periods !== null || !periodsRead.fetching;
  const periodKey =
    picked ?? (periodsSettled ? (latest ?? currentRecapPeriod()) : null);

  const pick = useCallback((key: string) => {
    setPicked(key);
    // Keep the URL linkable without a server round trip.
    window.history.replaceState(null, "", `/recap?period=${key}`);
  }, []);

  if (periodKey === null) {
    return (
      <RecapFrame
        status="loading"
        ownerId={ownerId}
        periodKey={currentRecapPeriod()}
        timeZone={timeZone}
        options={options}
        latest={latest}
        onPick={pick}
      />
    );
  }
  return (
    <RecapPeriodDeck
      key={periodKey}
      ownerId={ownerId}
      periodKey={periodKey}
      timeZone={timeZone}
      options={options}
      latest={latest}
      onPick={pick}
    />
  );
}

type FrameShared = {
  ownerId: string;
  periodKey: string;
  timeZone: string;
  options: readonly RecapPeriodOption[];
  latest: string | null;
  onPick: (key: string) => void;
};

function RecapPeriodDeck(props: FrameShared) {
  const [result, reexecute] = useQuery({
    query: RecapQuery,
    variables: { period: props.periodKey, timeZone: props.timeZone },
  });
  const retry = useCallback(() => {
    feedback("tick");
    reexecute({ requestPolicy: "network-only" });
  }, [reexecute]);
  const recap = recapFromResult(result.data);
  const cards = useMemo(() => (recap === null ? [] : deckOf(recap)), [recap]);
  const end: RecapEndView | null =
    recap === null
      ? null
      : {
          kind: "END",
          stats: recapEndStats(cards),
          totals: recap.totals,
        };
  return (
    <RecapFrame
      {...props}
      status={recapStatus(result)}
      onRetry={retry}
      cards={cards}
      end={end}
    />
  );
}

function RecapFrame({
  status,
  onRetry,
  cards = [],
  end = null,
  ownerId,
  periodKey,
  timeZone,
  options,
  latest,
  onPick,
}: FrameShared & {
  status: RecapStatus;
  onRetry?: () => void;
  cards?: readonly RecapCardView[];
  end?: RecapEndView | null;
}) {
  const period: RecapPeriod = parseRecapPeriod(periodKey) ?? {
    kind: "year",
    year: new Date().getFullYear(),
  };
  const name = recapPeriodName(period);
  const short = recapPeriodShort(period);
  const [index, setIndex] = useState(0);
  const [sheet, setSheet] = useState<"periods" | "share" | null>(null);
  const navigate = useNavigate();
  const appRef = useRef<HTMLDivElement>(null);
  const downX = useRef<number | null>(null);
  const swiped = useRef(false);

  const deck = status === "ready" && cards.length > 0;
  const atEnd = deck && index >= cards.length;
  const current = deck && !atEnd ? cards[index] : undefined;

  useEffect(() => {
    appRef.current?.focus({ preventScroll: true });
  }, []);

  const go = useCallback(
    (step: 1 | -1) => {
      if (!deck) return;
      const to = Math.max(0, Math.min(cards.length, index + step));
      if (to === index) {
        feedback("detent");
        return;
      }
      feedback(cards[to]?.kind === "STAMP" ? "success" : "tick");
      setIndex(to);
    },
    [cards, deck, index],
  );

  const close = () => leaveTo(navigate, "/me");

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (sheet !== null) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    downX.current = event.clientX;
    swiped.current = false;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (downX.current === null) return;
    const dx = event.clientX - downX.current;
    downX.current = null;
    if (Math.abs(dx) < SWIPE_PX) return;
    swiped.current = true;
    go(dx < 0 ? 1 : -1);
  };
  const tap = (step: 1 | -1) => () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    go(step);
  };

  const startOver = () => {
    feedback("tick");
    setIndex(0);
  };
  const openSheet = (which: "periods" | "share") => {
    feedback("tick");
    setSheet(which);
  };

  const shareIndex = atEnd ? cards.length : index;
  const shareAlt =
    current !== undefined
      ? `${recapCardCopy(current).overline}: ${recapCardCopy(current).big} ${recapCardCopy(current).title.replace(/\n/g, " ")}`
      : `That’s your ${short}`;

  const shareButton = (label: string, className?: string) => (
    <Button
      onClick={() => setSheet("share")}
      className={cn("gap-2", className)}
    >
      <Share aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
      {label}
    </Button>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keys live on the app element (KIT amendments)
    <div
      ref={appRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-slot="recap-deck"
      className="fixed inset-0 z-50 flex flex-col bg-background text-ink-1 outline-none md:static md:z-auto md:min-h-full md:px-8 md:pb-8"
    >
      {/* Phone header: segments, Close, the period button. */}
      <div className="flex flex-col gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] md:hidden">
        <Segments count={deck ? cards.length + 1 : 0} at={index} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={close}
            aria-label="Close recap"
            className="-ml-2.5 flex size-11 items-center justify-center text-ink-2"
          >
            <Close aria-hidden strokeWidth={ICON_STROKE} className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => openSheet("periods")}
            aria-label={`Recap for ${name}, choose another`}
            className="t-head flex h-11 items-center gap-2 px-2 text-ink-1"
          >
            {name}
            <ChevronDown
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5 text-glyph"
            />
          </button>
        </div>
      </div>

      {/* Desktop header: crumbs, the page's one heading, Share card. */}
      <div className="flex items-end justify-between gap-4 md:border-edge md:border-b md:py-4">
        <div className="flex flex-col gap-1">
          <nav
            aria-label="Breadcrumb"
            className="t-cap hidden items-center gap-1 text-ink-2 md:flex"
          >
            <Link
              href="/me"
              underline="none"
              className="flex min-h-11 min-w-11 items-center text-ink-2"
            >
              Me
            </Link>
            <ChevronRight
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-4 text-glyph"
            />
            <span aria-current="page">Recap</span>
          </nav>
          <h1 className="t-title sr-only md:not-sr-only">Your {name}</h1>
        </div>
        {deck && shareButton("Share card", "hidden md:flex")}
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_280px] md:gap-8 md:pt-6 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="hidden flex-col gap-2 lg:flex">
          <h2 className="t-head px-3 pb-1">Recaps</h2>
          <RecapPeriodRows
            variant="column"
            options={options}
            value={periodKey}
            onPick={(key) => key !== periodKey && onPick(key)}
          />
        </aside>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 md:px-0 md:pt-0">
          <div className="hidden md:block">
            <Segments count={deck ? cards.length + 1 : 0} at={index} />
          </div>
          <div
            className="relative flex min-h-0 flex-1 flex-col overflow-y-auto rounded-md border border-edge bg-card p-5 md:min-h-[560px] md:flex-none"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          >
            {status === "loading" ? (
              <div className="flex flex-col gap-4" aria-hidden>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-20" />
                <Skeleton className="h-14 w-64" />
              </div>
            ) : status === "failed" ? (
              <div
                data-slot="recap-failed"
                className="flex flex-1 items-center justify-center"
              >
                <ErrorState
                  title="Couldn’t load your recap"
                  action={
                    <Button variant="outline" onClick={onRetry}>
                      Try again
                    </Button>
                  }
                />
              </div>
            ) : !deck ? (
              <EmptyMonth
                short={short}
                latest={latest}
                periodKey={periodKey}
                onPick={onPick}
              />
            ) : atEnd && end !== null ? (
              // No tap zones here: the doors stay tappable; back is a swipe,
              // the arrow keys, Previous or Start over.
              <RecapEndCard
                end={end}
                short={short}
                onOtherRecaps={() => setSheet("periods")}
              />
            ) : current !== undefined ? (
              <>
                <RecapCardFace card={current} />
                <button
                  type="button"
                  aria-label="Previous card"
                  onClick={tap(-1)}
                  className="absolute inset-y-0 left-0 w-1/3 cursor-pointer"
                />
                <button
                  type="button"
                  aria-label="Next card"
                  onClick={tap(1)}
                  className="absolute inset-y-0 right-0 w-2/3 cursor-pointer"
                />
              </>
            ) : null}
          </div>

          {deck && (
            <div className="hidden items-center justify-between md:flex">
              <Button
                variant="outline"
                disabled={index === 0}
                onClick={() => go(-1)}
                className="gap-1"
              >
                <ChevronLeft
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-5"
                />
                Previous
              </Button>
              <span className="t-cap tabular text-ink-2" aria-live="polite">
                {Math.min(index, cards.length) + 1} of {cards.length + 1}
              </span>
              <Button
                variant="outline"
                disabled={atEnd}
                onClick={() => go(1)}
                className="gap-1"
              >
                Next
                <ChevronRight
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-5"
                />
              </Button>
            </div>
          )}

          {/* Phone footer: Share; on the end card, Start over beside it. */}
          {deck && (
            <div className="flex gap-3 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
              {atEnd && (
                <Button
                  variant="quiet-muted"
                  onClick={startOver}
                  className="flex-1"
                >
                  Start over
                </Button>
              )}
              {shareButton("Share", atEnd ? "flex-[2]" : "flex-1")}
            </div>
          )}
        </div>

        <aside className="hidden flex-col gap-4 md:flex">
          {deck && end !== null && (
            <>
              <h2 className="t-head">{name}</h2>
              {end.stats.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {end.stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="flex flex-col rounded-md border border-edge bg-card p-3"
                    >
                      <span className="t-score tabular">{stat.value}</span>
                      <span className="t-cap text-ink-2">{stat.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <RecapDoors
                otherRecaps={false}
                onOtherRecaps={() => setSheet("periods")}
              />
              {atEnd && (
                <Button
                  variant="quiet-muted"
                  onClick={startOver}
                  className="self-start"
                >
                  Start over
                </Button>
              )}
            </>
          )}
        </aside>
      </div>

      <RecapPeriodSheet
        open={sheet === "periods"}
        onOpenChange={(open) => setSheet(open ? "periods" : null)}
        options={options}
        value={periodKey}
        onPick={onPick}
      />
      {deck && (
        <RecapShareDialog
          open={sheet === "share"}
          onOpenChange={(open) => setSheet(open ? "share" : null)}
          imagePath={recapImagePath(ownerId, periodKey, shareIndex, timeZone)}
          fileName={recapFileName(periodKey, shareIndex)}
          description={shareAlt}
        />
      )}
    </div>
  );
}

/** One segment per card, plus the end card; lit up to the current one. */
function Segments({ count, at }: { count: number; at: number }) {
  if (count === 0) return null;
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: count }, (_, k) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positions
          key={k}
          className={cn(
            "h-[3px] flex-1 rounded-sm",
            k <= at ? "bg-ink-1" : "bg-edge",
          )}
        />
      ))}
    </div>
  );
}

/** The empty month (kit empty state): what is missing, and the latest recap. */
function EmptyMonth({
  short,
  latest,
  periodKey,
  onPick,
}: {
  short: string;
  latest: string | null;
  periodKey: string;
  onPick: (key: string) => void;
}) {
  const latestPeriod =
    latest === null || latest === periodKey ? null : parseRecapPeriod(latest);
  return (
    <div
      data-slot="recap-empty"
      className="flex flex-1 items-start justify-center pt-16"
    >
      <EmptyState
        illustration={<History aria-hidden strokeWidth={ICON_STROKE} />}
        title={`Nothing to recap for ${short} yet`}
        action={
          latestPeriod === null || latest === null ? undefined : (
            <Button onClick={() => onPick(latest)}>
              See {recapPeriodName(latestPeriod)}
            </Button>
          )
        }
      />
    </div>
  );
}
