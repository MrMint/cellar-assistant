"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ICON_STROKE, Pour } from "@/components/app/icons";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { bottleState } from "@/components/cellar/bottle-state";
import { LogDrinkSheet } from "@/components/drink-log/LogDrinkSheet";
import { useDrinkLogFeedback } from "@/components/drink-log/useDrinkLogFeedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getNextPlaceholder } from "@/utilities";
import type { OpenBottle } from "./continue";
import { drinkSoonList, typicalLine } from "./drink-soon";
import { CONTINUE_LIMIT } from "./queries";

/**
 * `now` for ages and windows: the server's request instant first, so the
 * hydration pass prints what the server did, then the browser's own.
 */
const useNow = (serverNow: number): number => {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

/** Which bottle the Pour sheet is open for. */
const usePour = () => {
  const router = useRouter();
  const [bottle, setBottle] = useState<OpenBottle | null>(null);
  const [open, setOpen] = useState(false);
  const onSaved = useDrinkLogFeedback({
    itemName: bottle?.name ?? "",
    onChanged: () => router.refresh(),
  });
  const pour = (next: OpenBottle) => {
    setBottle(next);
    setOpen(true);
  };
  const sheet =
    bottle === null ? null : (
      <LogDrinkSheet
        // A fresh sheet (and log id) per bottle.
        key={bottle.id}
        open={open}
        onOpenChange={setOpen}
        subject={{
          itemType: bottle.type,
          itemId: bottle.itemId,
          itemName: bottle.name,
          bottle: { cellarId: bottle.cellarId, cellarItemId: bottle.id },
        }}
        onSaved={onSaved}
      />
    );
  return { pour, sheet };
};

/**
 * Continue and Drink soon (X10): the bottles you have open, across every
 * cellar you own, each one Pour away from a log — and, under them, the ones
 * whose style says not to wait (D29: a labelled table, never a model).
 *
 * Pour opens the drink-log sheet with the bottle (X02): a score for this
 * glass, a note, where, who with. (X03's Pour sheet — level, Finish, rate —
 * replaces it when it lands; the button and its place stay.)
 */
export function ContinueSection({
  bottles,
  total = bottles.length,
  serverNow,
}: {
  /**
   * Every open bottle Home read, newest opened first. The shelf shows the
   * first {@link CONTINUE_LIMIT}; Drink soon ranks all of them, since the
   * bottles open longest — the ones it exists for — are the shelf's last.
   */
  bottles: readonly OpenBottle[];
  /** How many are open in all (the connection's count), for "N open". */
  total?: number;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const { pour, sheet } = usePour();
  const soon = drinkSoonList(bottles, now);
  if (bottles.length === 0) return null;
  const shelf = bottles.slice(0, CONTINUE_LIMIT);

  return (
    <>
      <section
        aria-labelledby="continue-heading"
        className="flex flex-col gap-2"
      >
        <div className="flex min-h-6 items-end justify-between px-4">
          <h2 id="continue-heading" className="type-overline text-ink-3">
            Continue
          </h2>
          <span className="type-footnote">
            {Math.max(total, bottles.length)} open
          </span>
        </div>
        <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shelf.map((bottle) => (
            <li key={bottle.id} className="w-36 shrink-0 snap-start">
              <OpenBottleCard
                bottle={bottle}
                now={now}
                onPour={() => pour(bottle)}
              />
            </li>
          ))}
        </ul>
      </section>

      {soon.length > 0 && (
        <InsetSection label="Drink soon" aria-label="Drink soon">
          {soon.map(({ bottle, state }) => (
            <ListRow
              key={bottle.id}
              leading={
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md",
                    itemTypeTokens[bottle.type].tintClass,
                  )}
                >
                  {/* A plate's text cannot be read at 36 px, and it spilled
                      past the row's edge (clipped, but measured): the type's
                      glyph, as universal search's rows draw it. */}
                  <TypeGlyph type={bottle.type} className="size-5" />
                </span>
              }
              title={
                <Link
                  href={bottle.href}
                  overlay
                  underline="none"
                  className="text-ink-1"
                >
                  {bottle.title}
                </Link>
              }
              description={
                <>
                  <span
                    className={cn(state.urgency === "past" && "text-ink-1")}
                  >
                    Open {state.openDays}{" "}
                    {state.openDays === 1 ? "day" : "days"}
                  </span>
                  {" · "}
                  {typicalLine(state.life)}
                </>
              }
              trailing={
                <Button
                  variant="secondary"
                  size="sm"
                  aria-haspopup="dialog"
                  aria-label={`Pour ${bottle.name}`}
                  onClick={() => pour(bottle)}
                >
                  <Pour aria-hidden strokeWidth={ICON_STROKE} />
                  Pour
                </Button>
              }
            />
          ))}
        </InsetSection>
      )}
      {sheet}
    </>
  );
}

function OpenBottleCard({
  bottle,
  now,
  onPour,
}: {
  bottle: OpenBottle;
  now: number;
  onPour: () => void;
}) {
  const state = bottleState(bottle, now);
  return (
    <div
      data-slot="open-bottle"
      className="relative flex h-full flex-col overflow-hidden rounded-md bg-surface-2"
    >
      <div
        className={cn(
          "relative aspect-4/5 overflow-hidden",
          itemTypeTokens[bottle.type].tintClass,
        )}
      >
        {bottle.photoUrl !== null ? (
          <Image
            src={bottle.photoUrl}
            alt=""
            fill
            sizes="144px"
            placeholder={bottle.placeholder ? "blur" : undefined}
            blurDataURL={getNextPlaceholder(bottle.placeholder)}
            className="object-cover"
          />
        ) : (
          <LabelPlate
            type={bottle.type}
            plate={bottle.plate}
            styleFields={bottle.styleFields}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-surface-3/80"
        >
          <div
            className="h-full origin-left rounded-full bg-ink-1"
            style={{ transform: `scaleX(${state.level / 100})` }}
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2.5 pt-2 pb-2.5">
        <Link
          href={bottle.href}
          overlay
          underline="none"
          className="type-callout line-clamp-2 min-h-10 font-semibold text-ink-1"
        >
          {bottle.title}
        </Link>
        <p className="type-footnote truncate">
          <span aria-hidden>
            {state.label} · {Math.round(state.level)}%
          </span>
          <span className="sr-only">{state.spoken}</span>
        </p>
        {bottle.cellarName !== null && (
          <p className="type-footnote truncate text-ink-3">
            {bottle.cellarName}
          </p>
        )}
        <Button
          variant="secondary"
          size="sm"
          aria-haspopup="dialog"
          aria-label={`Pour ${bottle.name}`}
          onClick={onPour}
          className="relative z-10 mt-1 w-full"
        >
          <Pour aria-hidden strokeWidth={ICON_STROKE} />
          Pour
        </Button>
      </div>
    </div>
  );
}
