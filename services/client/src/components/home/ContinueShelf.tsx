"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation } from "urql";
import { ICON_STROKE, Star } from "@/components/app/icons";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { CellarTile } from "@/components/app/parts/CellarTile";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { Button } from "@/components/ui/button";
import {
  OpenCellarItemMutation,
  UpdateCellarItemMutation,
} from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { type OpenBottle, openVariables, type SealedSoon } from "./continue";
import { openRail } from "./drink-soon";
import { SectionHead } from "./HomeLayout";
import { rateLabel } from "./landing";
import { PressLink } from "./PressLink";

/** How many open bottles the rail carries. */
export const RAIL_LIMIT = 20;
/** Drink soon's rows before "Show more" (Shell-Home: four). */
export const SOON_ROWS = 4;

/**
 * `now` for windows: the server's request instant first, so the hydration
 * pass prints what the server did, then the browser's own.
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

/**
 * Open and Drink soon (Shell-Home, ruling 1). **Open** is the rail of open
 * bottles as cellar tiles, the furthest past its best first with a "Past its
 * best" badge, the rest with their level; under it "Rate the n" goes to the
 * first one not rated yet. No action in a tile's foot (CROSS-LOT): Pour
 * lives on the item's bottle card. **Drink soon** is the sealed bottles
 * whose window is ending, each with Open, which opens the bottle at once
 * with Undo (KIT § 4 "Toast or confirm").
 */
export function ContinueSection({
  bottles,
  total = bottles.length,
  sealed = [],
  sealedTotal = sealed.length,
  serverNow,
}: {
  /** Every open bottle Home read, newest opened first. */
  bottles: readonly OpenBottle[];
  /** How many are open in all (the connection's count). */
  total?: number;
  /** L02: sealed bottles whose window closes soon. */
  sealed?: readonly SealedSoon[];
  /** All of them, beyond the page read (`drinkSoon.totalCount`). */
  sealedTotal?: number;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const rail = openRail(bottles, now).slice(0, RAIL_LIMIT);
  const unrated = bottles.filter((bottle) => bottle.rating === null);
  const rate = rateLabel(unrated.length);
  const firstUnrated = unrated[0];

  return (
    <>
      {rail.length > 0 && (
        <section aria-labelledby="open-heading" className="flex flex-col gap-2">
          <SectionHead
            id="open-heading"
            title="Open"
            count={Math.max(total, bottles.length)}
          />
          <ul className="-mx-4 m-0 flex list-none snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:scroll-px-0 md:px-0 [&::-webkit-scrollbar]:hidden">
            {rail.map(({ bottle, badge }) => (
              <li
                key={bottle.id}
                data-slot="open-bottle"
                data-past={badge.past || undefined}
                className="w-[150px] shrink-0 snap-start md:w-[calc((100%-36px)/4)]"
              >
                <CellarTile
                  className="h-full"
                  name={
                    <PressLink href={bottle.href} overlay>
                      {bottle.title}
                    </PressLink>
                  }
                  maker={bottle.maker}
                  style={bottle.style}
                  glyph={itemTypeTokens[bottle.type].glyph}
                  photoUrl={bottle.photoUrl}
                  plate={
                    <LabelPlate
                      type={bottle.type}
                      plate={bottle.plate}
                      styleFields={bottle.styleFields}
                    />
                  }
                  rating={bottle.rating}
                  badge={badge.text}
                />
              </li>
            ))}
          </ul>
          {rate !== null && firstUnrated !== undefined && (
            <Button
              variant="secondary"
              asChild
              className="w-full md:w-auto md:self-start"
            >
              <Link href={firstUnrated.href} underline="none">
                <Star aria-hidden strokeWidth={ICON_STROKE} />
                {rate}
              </Link>
            </Button>
          )}
        </section>
      )}
      {sealed.length > 0 && (
        <DrinkSoon rows={sealed} total={Math.max(sealedTotal, sealed.length)} />
      )}
    </>
  );
}

/**
 * The sealed bottles whose window is ending: four rows, "Show more · n" for
 * the rest Home read. Open opens the bottle (`openCellarItem`) and takes the
 * row away, with Undo, which puts the bottle back to sealed.
 */
function DrinkSoon({
  rows,
  total,
}: {
  rows: readonly SealedSoon[];
  total: number;
}) {
  const router = useRouter();
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [more, setMore] = useState(false);
  const [, openItem] = useMutation(OpenCellarItemMutation);
  const [, updateItem] = useMutation(UpdateCellarItemMutation);

  const left = rows.filter((row) => !opened.has(row.id));
  const shown = more ? left : left.slice(0, SOON_ROWS);
  const hidden = left.length - shown.length;
  if (left.length === 0) return null;

  const restore = (id: string) =>
    setOpened((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  const open = async (row: SealedSoon) => {
    const variables = openVariables(row.id, rows);
    if (variables === null) return;
    setOpened((current) => new Set(current).add(row.id));
    const response = await openItem(variables);
    const result = unwrapResult(response.data?.openCellarItem, "CellarItem");
    if (response.error !== undefined || !result.ok) {
      restore(row.id);
      feedback("refuse");
      notify(`${row.name} wasn't opened`, { tone: "error" });
      return;
    }
    notify(`${row.name} opened`, {
      undo: async () => {
        feedback("undo");
        restore(row.id);
        await updateItem({ ...variables, input: { openAt: null } });
        router.refresh();
      },
      onAutoClose: () => router.refresh(),
    });
  };

  return (
    <section aria-labelledby="soon-heading" className="flex flex-col gap-2">
      <SectionHead id="soon-heading" title="Drink soon" count={total} />
      <ul className="m-0 flex list-none flex-col divide-y divide-rule overflow-hidden rounded-md border border-edge bg-card p-0">
        {shown.map((row) => (
          <li
            key={row.id}
            data-kind="drink-soon-sealed"
            className="relative flex min-h-16 items-center gap-3 py-2 pr-2 pl-3 has-[a[data-slot=link]:active]:bg-raised"
          >
            <Thumb row={row} />
            <div className="flex min-w-0 flex-1 flex-col">
              <PressLink
                href={row.href}
                overlay
                className="t-head truncate text-ink"
              >
                {row.title}
              </PressLink>
              <span className={cn("t-cap truncate text-ink-2")}>
                {row.line}
              </span>
              {row.typical !== null && (
                <span className="t-cap truncate text-ink-2">{row.typical}</span>
              )}
            </div>
            <Button
              variant="secondary"
              aria-label={`Open ${row.name}`}
              onClick={() => void open(row)}
              className="relative z-10"
            >
              Open
            </Button>
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={() => {
                feedback("tick");
                setMore(true);
              }}
              className="t-head tabular flex min-h-12 w-full items-center justify-center text-act-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:-outline-offset-2 active:bg-raised"
            >
              Show more · {hidden}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/** A 54 thumb: the bottle's photo, or its kind glyph flat on raised. */
function Thumb({ row }: { row: SealedSoon }) {
  const Glyph = itemTypeTokens[row.type].glyph;
  return (
    <span className="relative flex size-[54px] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-raised">
      {row.photoUrl !== null ? (
        <Image
          src={row.photoUrl}
          alt=""
          fill
          sizes="54px"
          className="object-cover"
        />
      ) : (
        <Glyph
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-6 text-glyph"
        />
      )}
    </span>
  );
}
