"use client";

import Image from "next/image";
import {
  lazy,
  type MouseEvent,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Place } from "@/components/app/icons";
import { useAppKey } from "@/components/app/overlays/app-keys";
import { DesktopPane } from "@/components/app/overlays/DesktopPane";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { useNavigate } from "@/components/app/useNavigate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { type LookRow, stepKey } from "../search-quick-look";

// The pane bodies load when a pane first opens: a phone never needs them.
const ItemPane = lazy(() =>
  import("@/components/item/ItemPane").then((m) => ({ default: m.ItemPane })),
);
const PlacePane = lazy(() =>
  import("@/components/map/places/PlacePane").then((m) => ({
    default: m.PlacePane,
  })),
);

const isItemType = (value: string): value is ApiItemType =>
  value in itemTypeTokens;

/** The pane's 320 photo: the row's own, or the kit's no-photo plate. */
function PanePhoto({ row }: { row: LookRow }) {
  if (row.thumb.kind === "image") {
    return (
      <Image
        src={row.thumb.url}
        alt=""
        fill
        sizes="440px"
        className="object-cover"
      />
    );
  }
  return (
    <span className="flex size-full items-center justify-center text-glyph">
      {row.look?.kind === "place" ? (
        <Place aria-hidden strokeWidth={1.25} className="size-16" />
      ) : row.thumb.kind === "item" && isItemType(row.thumb.itemType) ? (
        <TypeGlyph type={row.thumb.itemType} className="size-16" />
      ) : null}
    </span>
  );
}

type Move = 1 | -1;

/** The results' keys on the app element, live while the desktop shows. */
function ResultKeys({
  onMove,
  onEnter,
  onOpenPage,
}: {
  onMove: (by: Move) => boolean;
  onEnter: () => boolean;
  onOpenPage: () => boolean;
}) {
  useAppKey("j", () => onMove(1));
  useAppKey("ArrowDown", () => onMove(1));
  useAppKey("k", () => onMove(-1));
  useAppKey("ArrowUp", () => onMove(-1));
  useAppKey("Enter", onEnter);
  useAppKey("o", onOpenPage);
  return null;
}

/** Whether a click is a plain one the pane may take over (no new tab). */
const plainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * The desktop quick look on search results (F-42; Recipes-Search desktop,
 * KIT § 3): from `md` up, J and K (or ↓ ↑) move a selection through the
 * results, Enter opens the selected drink or place in F2a's `DesktopPane`
 * beside them (a plain click on its row does too), Esc closes it, and O
 * opens the page. A row with no pane body (a recipe, a brand, a person)
 * opens its page on Enter. On a phone the rows are plain links.
 */
export function SearchQuickLook({
  rows,
  children,
}: {
  /** The rows in the order the page shows them (`lookOrder`). */
  rows: readonly LookRow[];
  children: ReactNode;
}) {
  const desktop = useMediaQuery(breakpointUp("md"));
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);

  const byKey = useMemo(
    () => new Map(rows.map((row) => [row.key, row])),
    [rows],
  );
  const keys = useMemo(() => rows.map((row) => row.key), [rows]);
  // A new search keeps nothing selected that is no longer on the page.
  const selected = picked !== null && byKey.has(picked) ? picked : null;
  const selectedRow = selected === null ? undefined : byKey.get(selected);
  const paneRow =
    desktop && paneOpen && selectedRow?.look !== undefined
      ? selectedRow
      : undefined;

  // The selection is drawn on the row the server rendered.
  useEffect(() => {
    const root = box.current;
    if (root === null) return;
    root.querySelectorAll("[data-search-selected]").forEach((element) => {
      element.removeAttribute("data-search-selected");
    });
    if (!desktop || selected === null) return;
    const element = root.querySelector(
      `[data-search-row="${CSS.escape(selected)}"]`,
    );
    if (element === null) return;
    element.setAttribute("data-search-selected", "");
    element.scrollIntoView?.({ block: "nearest" });
  }, [desktop, selected]);

  const move = (by: Move) => {
    const next = stepKey(keys, selected, by);
    if (next === null) return false;
    if (next !== selected) feedback("tick");
    setPicked(next);
    // The pane follows the selection, and closes on a row it can't show.
    if (paneOpen && byKey.get(next)?.look === undefined) setPaneOpen(false);
    return true;
  };

  const enter = () => {
    if (selectedRow === undefined) return false;
    feedback("press");
    if (selectedRow.look === undefined) navigate.push(selectedRow.href);
    else setPaneOpen(true);
    return true;
  };

  const openPage = () => {
    if (selectedRow === undefined) return false;
    feedback("press");
    navigate.push(selectedRow.href);
    return true;
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!desktop || !plainClick(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    // A row's own control (Add friend, Accept) keeps its click.
    if (target.closest("button") !== null) return;
    const key = target
      .closest("[data-search-row]")
      ?.getAttribute("data-search-row");
    const row = key == null ? undefined : byKey.get(key);
    if (row?.look === undefined) return;
    event.preventDefault();
    feedback("press");
    setPicked(row.key);
    setPaneOpen(true);
  };

  return (
    <div className="flex items-start gap-4">
      <div
        ref={box}
        onClickCapture={onClickCapture}
        className={cn(
          "min-w-0 flex-1",
          "[&_[data-search-selected]]:outline-2 [&_[data-search-selected]]:outline-offset-2 [&_[data-search-selected]]:outline-act-ink",
        )}
      >
        {children}
      </div>
      {desktop && (
        <ResultKeys onMove={move} onEnter={enter} onOpenPage={openPage} />
      )}
      {paneRow?.look !== undefined && (
        <div className="sticky top-0 h-dvh shrink-0">
          <DesktopPane
            open
            onClose={() => setPaneOpen(false)}
            title={paneRow.title}
            photo={<PanePhoto row={paneRow} />}
            onPrevious={
              keys.indexOf(paneRow.key) > 0 ? () => void move(-1) : undefined
            }
            onNext={
              keys.indexOf(paneRow.key) < keys.length - 1
                ? () => void move(1)
                : undefined
            }
            onExpand={() => navigate.push(paneRow.href)}
          >
            <Suspense fallback={null}>
              {paneRow.look.kind === "item" ? (
                <ItemPane
                  key={paneRow.key}
                  itemId={paneRow.look.itemId}
                  itemType={paneRow.look.itemType}
                  cellarId={paneRow.look.cellarId}
                />
              ) : (
                <PlacePane key={paneRow.key} placeId={paneRow.look.placeId} />
              )}
            </Suspense>
          </DesktopPane>
        </div>
      )}
    </div>
  );
}
