"use client";

import { LayoutGrid } from "lucide-react";
import Image from "next/image";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ListView } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { useAppKey } from "@/components/app/overlays/app-keys";
import { DesktopPane } from "@/components/app/overlays/DesktopPane";
import {
  QuickLook,
  type QuickLookItem,
} from "@/components/app/overlays/QuickLook";
import { CountFilters } from "@/components/app/parts/CountStrip";
import { Stars } from "@/components/app/parts/Stars";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { useNavigate } from "@/components/app/useNavigate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  ItemPane,
  ItemPaneMenu,
  useItemPaneSource,
} from "@/components/item/ItemPane";
import { SearchField } from "@/components/shell/SearchField";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { feedback } from "@/lib/feedback";
import type { CellarStatus } from "../cellarItemsQuery";
import { ArrangeSheet } from "./ArrangeSheet";
import { type JumpLetter, JumpSheet } from "./JumpSheet";
import { columnsOf, moveOf, moveSelection } from "./keys";
import {
  ListBody,
  NoMatch,
  sectionId,
  type ListView as View,
} from "./ListBody";
import { BottlePlate, type TileSelect, tileId } from "./ListTile";
import {
  type Arrangement,
  arrange,
  bottlesLabel,
  filterBottles,
  type ListBottle,
  type ListFilter,
  type ListSection,
  letterOf,
  lettersOf,
  needsDetailsLabel,
  noMatchTitle,
  parseArrangement,
  parseListFilter,
  shelvesOf,
  stripCounts,
} from "./model";
import { useBottleKeyWrites } from "./rate";
import { Shelves } from "./Shelves";

export type CellarListProps = {
  cellarId: string;
  cellarName: string;
  /** Every tile the server read (the cellar, or a search in it). */
  bottles: readonly ListBottle[];
  /** The header's count: bottles in the cellar (In cellar). */
  bottleCount: number;
  capped: boolean;
  search: string;
  status: CellarStatus;
  statusCounts: Record<CellarStatus, number>;
  needsDetails: number;
  /** The owner or a co-owner: the header's Edit. */
  canEdit: boolean;
  /** In place of the list: the Finished diary, or the empty cellar. */
  body?: React.ReactNode;
  /** "Lagavulin is in Bar Cart" under a search. */
  elsewhere?: React.ReactNode;
};

const VIEWS = [
  {
    value: "tiles" as const,
    label: "Tiles",
    icon: <LayoutGrid aria-hidden className="size-5" />,
  },
  {
    value: "rows" as const,
    label: "Rows",
    icon: <ListView aria-hidden className="size-5" />,
  },
];

/** Search results by meaning sit under a "Similar" header (Shelves ruling 6). */
const splitByMatch = (sections: ListSection[]): ListSection[] =>
  sections.flatMap((section) => {
    const exact = section.bottles.filter((b) => b.match !== "MEANING");
    const similar = section.bottles.filter((b) => b.match === "MEANING");
    if (similar.length === 0 || section.title !== undefined) return [section];
    return [
      ...(exact.length > 0
        ? [{ ...section, bottles: exact, count: exact.length }]
        : []),
      {
        key: `${section.key}:similar`,
        title: "Similar",
        count: similar.length,
        average: null,
        bottles: similar,
      },
    ];
  });

/**
 * The desktop pane for one bottle (MC-panes). It reads the item itself and
 * hands the read to both the pane's body and its glass `⋯` (H-115).
 */
function BottlePane({
  bottle,
  cellarId,
  open,
  onClose,
  onPrevious,
  onNext,
  onExpand,
}: {
  bottle: ListBottle;
  cellarId: string;
  open: boolean;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onExpand: () => void;
}) {
  const source = useItemPaneSource(bottle.itemId, bottle.type);
  return (
    <DesktopPane
      open={open}
      onClose={onClose}
      title={bottle.name}
      photo={
        bottle.photoUrl ? (
          <Image
            src={bottle.photoUrl}
            alt=""
            fill
            sizes="440px"
            className="object-cover"
          />
        ) : (
          <BottlePlate bottle={bottle} />
        )
      }
      onPrevious={onPrevious}
      onNext={onNext}
      onExpand={onExpand}
      more={<ItemPaneMenu source={source} />}
    >
      <ItemPane
        itemId={bottle.itemId}
        itemType={bottle.type}
        cellarId={cellarId}
        source={source}
      />
    </DesktopPane>
  );
}

/**
 * The cellar list (C1; combined/Cellar-flow, areas/Cellars-Shelves,
 * desktop/Cellar): a sticky top (back, name, bottles, Edit, tiles or rows;
 * the search and Arrange; the Open and kind counts), the Needs-details
 * count, then the bottles as the Arrange sheet says. Hold a tile to peek
 * (quick look); from `md` a click opens the 440 pane beside the grid and the
 * keys move a selection.
 */
export function CellarList({
  cellarId,
  cellarName,
  bottles,
  bottleCount,
  capped,
  search,
  status,
  statusCounts,
  needsDetails,
  canEdit,
  body,
  elsewhere,
}: CellarListProps) {
  const desktop = useMediaQuery(breakpointUp("md"));
  const navigate = useNavigate();
  const [pending, startTransition] = useTransition();

  // Server state: a search and the Show segment fetch again.
  const [, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({
      shallow: false,
      startTransition,
    }),
  );
  const [, setStatus] = useQueryState(
    "status",
    parseAsString.withOptions({ shallow: false, startTransition }),
  );
  // Client state: arranging and filtering what is already here.
  const [sortParam, setSortParam] = useQueryState("sort", parseAsString);
  const [viewParam, setViewParam] = useQueryState("view", parseAsString);
  const [typesParam, setTypesParam] = useQueryState(
    "types",
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [openParam, setOpenParam] = useQueryState("open", parseAsString);

  const arrangement = parseArrangement(sortParam);
  const view: View = viewParam === "rows" ? "rows" : "tiles";
  const filter = parseListFilter(typesParam, openParam);
  const searching = search.trim() !== "";

  const setArrangement = (next: Arrangement) =>
    void setSortParam(next === "a-z" ? null : next);
  const setFilter = (next: ListFilter) => {
    void setOpenParam(next === "OPEN" ? "1" : null);
    void setTypesParam(next === null || next === "OPEN" ? null : [next]);
  };
  const setView = (next: View) =>
    void setViewParam(next === "rows" ? "rows" : null);

  const shown = useMemo(
    () => filterBottles(bottles, filter),
    [bottles, filter],
  );
  const counts = useMemo(() => stripCounts(bottles), [bottles]);
  const sections = useMemo(
    () =>
      splitByMatch(
        arrange(shown, arrangement === "shelves" ? "a-z" : arrangement),
      ),
    [shown, arrangement],
  );
  const shelves = useMemo(
    () => (arrangement === "shelves" && !searching ? shelvesOf(shown) : null),
    [shown, arrangement, searching],
  );

  /** Tiles in screen order: what peek swipes through and the keys walk. */
  const order = useMemo(() => {
    const seen = new Set<string>();
    const list: ListBottle[] = [];
    const all =
      shelves === null
        ? sections.flatMap((s) => s.bottles)
        : shelves.flatMap((s) => s.bottles);
    for (const bottle of all) {
      if (seen.has(bottle.key)) continue;
      seen.add(bottle.key);
      list.push(bottle);
    }
    return list;
  }, [sections, shelves]);
  const byKey = useMemo(
    () =>
      new Map(order.map((bottle, index) => [bottle.key, { bottle, index }])),
    [order],
  );

  // Quick look (phone) and the pane (desktop).
  const [peek, setPeek] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedBy, setSelectedBy] = useState<TileSelect>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const paneBottle =
    selected === null ? undefined : byKey.get(selected)?.bottle;
  const keyWrites = useBottleKeyWrites(paneBottle);

  const onPeek = useCallback(
    (key: string) => {
      const found = byKey.get(key);
      if (found !== undefined) setPeek(found.index);
    },
    [byKey],
  );
  const select = useCallback((key: string | null, by: TileSelect) => {
    setSelected(key);
    setSelectedBy(key === null ? null : by);
    if (key !== null) {
      document
        .getElementById(tileId(key))
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, []);
  const onOpen = useCallback(
    (key: string) => {
      select(key, "pointer");
      setPaneOpen(true);
    },
    [select],
  );
  const step = (by: 1 | -1) => {
    const current = selected === null ? -1 : (byKey.get(selected)?.index ?? -1);
    const next = order[current + by];
    if (next !== undefined) {
      feedback("tick");
      select(next.key, "pointer");
    }
  };

  // Jump to a letter: names under A–Z, makers or styles when grouped.
  const [jumpOpen, setJumpOpen] = useState(false);
  const grouped = arrangement === "maker" || arrangement === "style";
  const letters: JumpLetter[] = useMemo(() => {
    if (grouped) {
      const found = new Map<string, JumpLetter>();
      for (const section of sections) {
        const letter = letterOf(section.title ?? "");
        const entry = found.get(letter);
        if (entry === undefined) {
          found.set(letter, {
            letter,
            count: section.count,
            target: sectionId(section.key),
          });
        } else {
          entry.count += section.count;
        }
      }
      return Array.from(found.values());
    }
    return lettersOf(shown).map((entry) => ({
      letter: entry.letter,
      count: entry.count,
      target: tileId(entry.firstKey),
    }));
  }, [grouped, sections, shown]);
  const openJump = () => {
    if (!grouped && arrangement !== "a-z") setArrangement("a-z");
    setJumpOpen(true);
  };
  const jump = (target: string) => {
    requestAnimationFrame(() =>
      document.getElementById(target)?.scrollIntoView({ block: "start" }),
    );
  };

  const gridRef = useRef<HTMLDivElement | null>(null);
  const keysOn = desktop && order.length > 0;

  const peekItems: QuickLookItem[] = useMemo(
    () =>
      order.map((bottle) => ({
        id: bottle.key,
        title: bottle.name,
        meta:
          [bottle.maker, bottle.style].filter(Boolean).join(" · ") || undefined,
        photo: (
          <div className="relative aspect-square w-full overflow-hidden bg-raised">
            {bottle.photoUrl ? (
              <Image
                src={bottle.photoUrl}
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
              />
            ) : (
              <BottlePlate bottle={bottle} />
            )}
          </div>
        ),
        extra: <Stars value={bottle.rating} size="lg" />,
        href: bottle.href,
      })),
    [order],
  );

  const empty = order.length === 0;
  const clearSearch = () => {
    feedback("tick");
    void setSearch(null);
  };

  return (
    <div className="md:flex md:items-start" data-slot="cellar-list">
      <div ref={gridRef} className="flex min-w-0 flex-1 flex-col gap-4">
        <header
          data-slot="cellar-list-top"
          className="sticky -top-4 z-20 -mx-4 -mt-4 flex flex-col gap-3 border-hair border-b bg-background px-4 pt-3 pb-3"
        >
          <div className="flex min-h-11 items-center gap-2">
            <Link
              href="/cellars"
              aria-label="Cellars"
              className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md text-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
            >
              <ChevronLeft aria-hidden className="size-6" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-baseline md:gap-2">
              <h1 className="t-title m-0 line-clamp-2 break-words text-ink">
                {cellarName}
              </h1>
              <span
                className="t-cap tabular text-ink-2"
                data-slot="cellar-list-count"
              >
                {bottlesLabel(bottleCount, capped)}
              </span>
            </div>
            {canEdit && (
              <Link
                href={`/cellars/${cellarId}/edit`}
                className="t-head flex h-11 min-w-11 items-center justify-center rounded-md px-2.5 text-act-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
              >
                Edit
              </Link>
            )}
            <SegmentedControl
              aria-label="View"
              value={view}
              onValueChange={setView}
              options={VIEWS}
              className="w-[92px] shrink-0 [&_[role=radio]>span:not(:has(svg))]:sr-only"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
            <SearchField
              aria-label="Search this cellar"
              placeholder={`Search ${cellarName}`}
              defaultValue={search}
              debounceTimeout={300}
              searching={pending}
              onDebounced={(value) =>
                void setSearch(value.trim() === "" ? null : value)
              }
              className="min-w-0 flex-1 md:max-w-80 md:flex-none md:basis-80"
            />
            <ArrangeSheet
              arrangement={arrangement}
              onArrangementChange={setArrangement}
              status={status}
              onStatusChange={(next) =>
                void setStatus(next === "in-cellar" ? null : next)
              }
              statusCounts={statusCounts}
              onJump={openJump}
              searching={searching}
            />
            {body === undefined && (
              <CountFilters<"OPEN" | ApiItemType>
                aria-label="Show only"
                lead={counts.open}
                cells={counts.kinds.map((kind) => ({
                  ...kind,
                  glyph: itemTypeTokens[kind.value].glyph,
                }))}
                value={filter}
                onValueChange={setFilter}
                className="max-md:basis-full md:min-w-0 md:flex-1"
              />
            )}
          </div>
        </header>

        {needsDetails > 0 && (
          <Link
            href={`/needs-details?cellar=${cellarId}`}
            data-slot="cellar-needs-details"
            className="t-head flex min-h-11 items-center justify-between rounded-md border border-edge bg-card px-3 text-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
          >
            <span>Needs details</span>
            <span className="t-cap tabular text-ink-2">
              {needsDetailsLabel(needsDetails)}
            </span>
          </Link>
        )}

        {body !== undefined ? (
          body
        ) : empty ? (
          searching ? (
            <NoMatch
              title={noMatchTitle(search)}
              action="Clear search"
              onAction={clearSearch}
            />
          ) : (
            <NoMatch
              title={filter === "OPEN" ? "Nothing open" : "No bottle here"}
              action="Show all"
              onAction={() => setFilter(null)}
            />
          )
        ) : shelves !== null ? (
          <Shelves
            shelves={shelves}
            onSeeAll={(shelf) => {
              feedback("tick");
              setArrangement(shelf.seeAll.arrangement);
              setFilter(shelf.seeAll.filter);
            }}
            onPeek={onPeek}
            onOpen={desktop ? onOpen : undefined}
            selectedKey={selected}
            selectedBy={selectedBy}
          />
        ) : (
          <ListBody
            sections={sections}
            view={view}
            onPeek={onPeek}
            onOpen={desktop ? onOpen : undefined}
            selectedKey={selected}
            selectedBy={selectedBy}
          />
        )}

        {elsewhere}
      </div>

      {desktop && paneBottle !== undefined && (
        <div className="sticky top-0 -my-4 -mr-4 ml-4 h-dvh shrink-0">
          <BottlePane
            bottle={paneBottle}
            cellarId={cellarId}
            open={paneOpen}
            onClose={() => setPaneOpen(false)}
            onPrevious={
              (byKey.get(paneBottle.key)?.index ?? 0) > 0
                ? () => step(-1)
                : undefined
            }
            onNext={
              (byKey.get(paneBottle.key)?.index ?? order.length) <
              order.length - 1
                ? () => step(1)
                : undefined
            }
            onExpand={() => navigate.push(paneBottle.href)}
          />
        </div>
      )}

      {keysOn && (
        <ListKeys
          onMove={(key) => {
            const move = moveOf(key);
            if (move === null) return;
            const grid = gridRef.current?.querySelector(
              `[data-slot="cellar-grid"][data-view="tiles"] > section > div`,
            );
            const next = moveSelection(
              order.map((b) => b.key),
              selected,
              move,
              view === "rows" ? 1 : columnsOf(grid ?? null),
            );
            if (next !== null && next !== selected) feedback("tick");
            select(next, "keyboard");
          }}
          onEnter={(event) => {
            const target = event.target;
            if (
              target instanceof HTMLElement &&
              target.closest(
                "button, a, [role=radio], [role=menuitemradio]",
              ) !== null &&
              target.closest(
                '[data-slot="cellar-list-tile"], [data-slot="cellar-list-row"]',
              ) === null
            ) {
              target.click();
              return;
            }
            if (selected === null) return;
            feedback("press");
            setPaneOpen(true);
          }}
          onClear={() => {
            if (selected === null) return;
            feedback("tick");
            select(null, null);
          }}
          onOpenPage={() => {
            if (paneBottle !== undefined) navigate.push(paneBottle.href);
          }}
          onToggleView={() => {
            feedback("tick");
            setView(view === "tiles" ? "rows" : "tiles");
          }}
          onFavourite={() => {
            if (paneBottle !== undefined) keyWrites.favourite(paneBottle);
          }}
          onRate={(score) => {
            if (paneBottle !== undefined) keyWrites.rate(paneBottle, score);
          }}
        />
      )}

      <QuickLook
        open={peek !== null}
        onOpenChange={(open) => {
          if (!open) setPeek(null);
        }}
        items={peekItems}
        index={peek ?? 0}
        onIndexChange={setPeek}
      />
      <JumpSheet
        open={jumpOpen}
        onOpenChange={setJumpOpen}
        title={grouped ? "Jump to a maker" : "Jump to a letter"}
        letters={letters}
        onJump={jump}
      />
    </div>
  );
}

type KeyEvent = { key: string; target: EventTarget | null };

/** The list's keys on the app element, live while the desktop list shows. */
function ListKeys({
  onMove,
  onEnter,
  onClear,
  onOpenPage,
  onToggleView,
  onFavourite,
  onRate,
}: {
  onMove: (key: string) => void;
  onEnter: (event: KeyEvent) => void;
  onClear: () => void;
  onOpenPage: () => void;
  onToggleView: () => void;
  /** F on the selected bottle (F-144). */
  onFavourite: () => void;
  /** 1 to 5 on the selected bottle (F-144). */
  onRate: (score: number) => void;
}) {
  const move = (event: KeyEvent) =>
    onMove(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  useAppKey("ArrowRight", move);
  useAppKey("ArrowLeft", move);
  useAppKey("ArrowDown", move);
  useAppKey("ArrowUp", move);
  useAppKey("j", move);
  useAppKey("k", move);
  useAppKey("Enter", onEnter);
  useAppKey("Backspace", onClear);
  useAppKey("o", onOpenPage);
  useAppKey("t", onToggleView);
  useAppKey("f", onFavourite);
  useAppKey("1", () => onRate(1));
  useAppKey("2", () => onRate(2));
  useAppKey("3", () => onRate(3));
  useAppKey("4", () => onRate(4));
  useAppKey("5", () => onRate(5));
  return null;
}
