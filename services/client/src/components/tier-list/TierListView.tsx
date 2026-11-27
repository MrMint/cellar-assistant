"use client";

/**
 * The tier list's board (screens/Tier-list "Rows and scrubber", DECISIONS 37,
 * 38, 40b, 41): rows only, five bands that never collapse, the scrubber on
 * the left.
 *
 * - **Rows** are the kit's `PlaceRow` (KIT § 2): kind glyph plate, name, where,
 *   the public rating, and the filled band chip `#n`; the owner's own #1
 *   alone wears the gold crown (CROSS-LOT 1). On someone else's list, the
 *   viewer's own score rides in the "where" line ("You 4.5", X23).
 * - **Bands** are F2b's `BandBar` (marker, name, "count · #from–to"), drawn
 *   for every band, an empty one included; Unrated only when something sits
 *   in it (an older entry; nothing new lands there).
 * - **Scrubber** (F2b's `Scrubber`, left, sticky, never moving): a tap or a
 *   drag jumps the list to that rank, with a detent at each band boundary.
 *   It follows search and Show only, so it always describes what is drawn.
 * - **Arrange** (the lock, DECISIONS 41; L39): read-only until the owner
 *   taps Edit order. Then a row tap picks it, and the dock moves it — up,
 *   down, or "Move to band…" (F2b's `BandSheet`, which also removes) — each
 *   one `reorderTierListBand` call (`moveEntry`), its rank computed once
 *   and said in the toast: "Moved to Very Good · #27 · Cafe Blue" with Undo,
 *   or "New #1" (SPEC 16, 17). The handle keeps dnd-kit's hold-and-drag
 *   (SPEC 18: arm at 250 ms, the medium haptic). Rows roll on the snappy
 *   spring; under reduced motion they jump.
 * - **Search** and **Show only** narrow the rows (the page owns both); the
 *   crowd order is a flat list by public rating, ranks unchanged.
 *
 * Every move's toast offers the list's Undo (`onUndo`, the server-side
 * history), as the dock's own Undo does.
 */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActionBar } from "@/components/app/ActionBar";
import { IconButton } from "@/components/app/IconButton";
import {
  type AppIcon,
  Arrange,
  Check,
  ChevronDown,
  ChevronUp,
  Place,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { dismissNotification, notify } from "@/components/app/notify";
import { BandSheet } from "@/components/app/parts/BandSheet";
import {
  BeerGlyph,
  CoffeeGlyph,
  SakeGlyph,
  SpiritGlyph,
  TeaGlyph,
  WineGlyph,
} from "@/components/app/parts/glyphs";
import { PlaceRow } from "@/components/app/parts/PlaceRow";
import { BandBar, type Band as RankedBand } from "@/components/app/parts/Rank";
import { Scrubber, type ScrubberBand } from "@/components/app/parts/Scrubber";
import { formatScore } from "@/components/app/Score";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useTierListActions } from "./actions";
import {
  type BandMap,
  type EntryMove,
  moveEntry,
  rankOf,
  reorderCallFor,
} from "./adapter";
import { BAND_LABELS, BANDS, entryNoun } from "./constants";
import type { TierListItemDisplay } from "./types";

// =============================================================================
// Types
// =============================================================================

/** How the board is ordered: the ranking, or by the crowd's rating. */
export type BoardOrder = "rank" | "crowd";

interface TierListViewProps {
  tierListId: string;
  items: TierListItemDisplay[];
  isOwner: boolean;
  /** The list's name, for the band sheet's header. */
  listName?: string;
  /** The list's type ("place", "wine"…): the row glyph and the nouns. */
  listType?: string;
  /**
   * Arrange (the lock, DECISIONS 41): picking, moving, the handles and the
   * dock. Only ever true for the owner; read-only otherwise.
   */
  arranging?: boolean;
  selectedItemId?: string;
  /** Search this list: rows whose name or where line has it. */
  query?: string;
  /** Show only these bands (Arrange sheet); null or empty is all. */
  only?: ReadonlySet<number> | null;
  order?: BoardOrder;
  /** "No … matches" offers this as its one action. */
  onClearSearch?: () => void;
  /** An edit landed on the server (a move or a removal): Undo has work. */
  onEdited?: () => void;
  /** Step the list's history back once — a move's or a removal's toast. */
  onUndo?: () => void;
  /** Arranging: the page's Undo and Redo, at the end of the dock's top line. */
  arrangeTools?: ReactNode;
  /** Arranging: the dock's Done. */
  onDone?: () => void;
}

/**
 * The one toast an edit raises, reused by id: a later edit replaces an
 * earlier edit's toast, so an Undo on screen only ever names the newest
 * edit — the one the server's history would take back.
 */
export const TIER_LIST_EDIT_TOAST = "tier-list-edit";

const VERTICAL_MODIFIERS = [restrictToVerticalAxis];
const NO_MODIFIERS: typeof VERTICAL_MODIFIERS = [];

/** The ranked bands, best first, as the kit's parts type them. */
const RANKED: readonly RankedBand[] = [5, 4, 3, 2, 1];
const isRanked = (band: number): band is RankedBand =>
  RANKED.includes(band as RankedBand);

const GLYPHS: Record<string, AppIcon> = {
  place: Place,
  wine: WineGlyph,
  beer: BeerGlyph,
  spirit: SpiritGlyph,
  coffee: CoffeeGlyph,
  tea: TeaGlyph,
  sake: SakeGlyph,
};

function cloneBandMap(map: BandMap): BandMap {
  const cloned: BandMap = {};
  for (const band of BANDS) {
    cloned[band] = [...(map[band] ?? [])];
  }
  return cloned;
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function parseBandFromContainerId(id: unknown): number | null {
  if (typeof id !== "string" || !id.startsWith("band-")) {
    return null;
  }
  const band = Number(id.slice(5));
  return BANDS.includes(band as (typeof BANDS)[number]) ? band : null;
}

/** Search this list: the name or the where line holds the phrase. */
export function matchesQuery(
  item: TierListItemDisplay,
  query: string,
): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return true;
  return (
    item.name.toLocaleLowerCase().includes(q) ||
    item.subtitle.toLocaleLowerCase().includes(q)
  );
}

// =============================================================================
// One row
// =============================================================================

interface EntryRowProps {
  item: TierListItemDisplay;
  rank: number;
  glyph: AppIcon;
  canEdit: boolean;
  viewerIsOwner: boolean;
  picked: boolean;
  selected: boolean;
  /** The row's place among those drawn, for the scrubber. */
  index: number;
  /** Rows roll into place (SPEC 16); false while dragging or reduced. */
  layout: boolean;
  onPick: (id: string) => void;
}

const EntryRow = memo(function EntryRow({
  item,
  rank,
  glyph,
  canEdit,
  viewerIsOwner,
  picked,
  selected,
  index,
  layout,
  onPick,
}: EntryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canEdit });

  // Every drag frame changes these: an inline style, not a class.
  const dragStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.3 : 1,
  };

  useEffect(() => {
    if (!selected) return;
    document
      .getElementById(item.id)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected, item.id]);

  const mine = !viewerIsOwner && item.viewerScore !== null;
  const where = [
    item.subtitle,
    mine ? `You ${formatScore(item.viewerScore ?? 0)}` : "",
  ]
    .filter((part) => part !== "")
    .join(" · ");

  return (
    <div ref={setNodeRef} style={dragStyle}>
      <motion.div
        layout={layout ? "position" : false}
        transition={spring.snappy}
        id={item.id}
        data-slot="tier-list-entry"
        data-rank-index={index}
        aria-current={selected ? "true" : undefined}
        className="flex scroll-mt-32 items-stretch gap-1"
      >
        {canEdit && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            // dnd-kit's attributes give the handle a role but no name.
            aria-label={`Reorder ${item.name}`}
            className="flex w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-glyph outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
          >
            <Arrange aria-hidden className="size-5" />
          </button>
        )}
        <PlaceRow
          className={cn(
            "min-w-0 flex-1",
            picked && "ring-2 ring-act-ink",
            selected && !picked && "ring-2 ring-ring-select",
          )}
          glyph={glyph}
          where={where}
          rating={item.publicRating}
          ratingCount={item.publicRatingCount}
          {...(isRanked(item.band)
            ? {
                rank: {
                  rank,
                  band: item.band,
                  // CROSS-LOT 1: the crown is the owner's own #1, nobody else's.
                  crown: viewerIsOwner && rank === 1,
                },
              }
            : {})}
          name={
            canEdit ? (
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => {
                  feedback("tick");
                  onPick(item.id);
                }}
                className="w-full truncate text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
              >
                {item.name}
              </button>
            ) : (
              // Read-only, the whole row opens the entry.
              <Link href={item.href} overlay underline="none">
                {item.name}
              </Link>
            )
          }
        />
        {!isRanked(item.band) && (
          <span className="t-cap tabular sr-only">#{rank}, Unrated</span>
        )}
      </motion.div>
    </div>
  );
});

// =============================================================================
// One band
// =============================================================================

interface BandSectionProps {
  band: number;
  itemIds: string[];
  itemMap: Map<string, TierListItemDisplay>;
  rankOffset: number;
  /** The rows drawn before this band (search and Show only applied). */
  indexOffset: number;
  glyph: AppIcon;
  noun: (count: number) => string;
  canEdit: boolean;
  viewerIsOwner: boolean;
  pickedId: string | null;
  selectedItemId?: string;
  layout: boolean;
  /** Narrowed by search or Show only: hidden rows still count for ranks. */
  visible: (item: TierListItemDisplay) => boolean;
  onPick: (id: string) => void;
}

const BandSection = memo(function BandSection({
  band,
  itemIds,
  itemMap,
  rankOffset,
  indexOffset,
  glyph,
  noun,
  canEdit,
  viewerIsOwner,
  pickedId,
  selectedItemId,
  layout,
  visible,
  onPick,
}: BandSectionProps) {
  const { setNodeRef } = useDroppable({ id: `band-${band}` });
  const count = itemIds.length;
  const label = BAND_LABELS[band] ?? "Unrated";
  let drawn = 0;

  return (
    <section aria-label={label} className="flex flex-col gap-2">
      {isRanked(band) ? (
        <BandBar
          band={band}
          count={count}
          {...(count > 0
            ? { from: rankOffset + 1, to: rankOffset + count }
            : {})}
          className="sticky top-0 z-10 bg-background"
        />
      ) : (
        <div className="sticky top-0 z-10 flex h-[34px] items-center gap-2 bg-background">
          <span
            aria-hidden
            className="inline-block h-5 w-1.5 rounded-[3px] bg-raised"
          />
          <h3 className="t-head m-0 flex-1 text-ink">{label}</h3>
          <span className="t-cap tabular text-ink-3">
            {count} {noun(count)}
          </span>
        </div>
      )}
      <div ref={setNodeRef} className="flex flex-col gap-2">
        <SortableContext
          id={`band-${band}`}
          items={itemIds}
          strategy={verticalListSortingStrategy}
        >
          {count === 0 ? (
            <p className="t-cap flex min-h-11 items-center rounded-md border border-dash border-dashed px-3 text-ink-3">
              Nothing in {label} yet
            </p>
          ) : (
            itemIds.map((itemId, i) => {
              const item = itemMap.get(itemId);
              if (item === undefined || !visible(item)) return null;
              const index = indexOffset + drawn;
              drawn += 1;
              return (
                <EntryRow
                  key={itemId}
                  item={item}
                  rank={rankOffset + i + 1}
                  glyph={glyph}
                  canEdit={canEdit}
                  viewerIsOwner={viewerIsOwner}
                  picked={pickedId === itemId}
                  selected={selectedItemId === itemId}
                  index={index}
                  layout={layout}
                  onPick={onPick}
                />
              );
            })
          )}
        </SortableContext>
      </div>
    </section>
  );
});

// =============================================================================
// The lifted row (drag overlay)
// =============================================================================

function DragOverlayRow({
  item,
  glyph,
}: {
  item: TierListItemDisplay;
  glyph: AppIcon;
}) {
  return (
    <div className="scale-[1.03] cursor-grabbing shadow-pop">
      <PlaceRow name={item.name} glyph={glyph} where={item.subtitle} />
    </div>
  );
}

// =============================================================================
// Main TierListView
// =============================================================================

export function TierListView({
  tierListId,
  items,
  isOwner,
  listName = "",
  listType = "place",
  arranging = false,
  selectedItemId,
  query = "",
  only = null,
  order = "rank",
  onClearSearch,
  onEdited,
  onUndo,
  arrangeTools,
  onDone,
}: TierListViewProps) {
  const dndId = useId();
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const { removeItemFromTierListAction, reorderBandAction } =
    useTierListActions();
  const canEdit = isOwner && arranging;
  const glyph = GLYPHS[listType] ?? Place;
  const noun = useCallback(
    (count: number) => entryNoun(listType, count),
    [listType],
  );
  // Read by the async tails below, which outlive the render they began in.
  const onEditedRef = useRef(onEdited);
  onEditedRef.current = onEdited;
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;

  const { initialBandMap, itemMap } = useMemo(() => {
    const map = new Map<string, TierListItemDisplay>();
    const bands: BandMap = {};
    for (const band of BANDS) bands[band] = [];
    for (const item of items) {
      map.set(item.id, item);
      bands[item.band]?.push(item.id);
    }
    return { initialBandMap: bands, itemMap: map };
  }, [items]);

  const [bandMap, setBandMap] = useState<BandMap>(initialBandMap);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [bandSheetOpen, setBandSheetOpen] = useState(false);
  /** One move at a time: the next is computed from the board this one left. */
  const movingRef = useRef(false);

  // The server's board replaces the optimistic one when it lands — never
  // mid-drag (activeId is read through its ref, so drag-end's own reset
  // does not fire this and snap the row back).
  useLayoutEffect(() => {
    if (activeIdRef.current === null) {
      setBandMap(initialBandMap);
    }
  }, [initialBandMap]);

  // Leaving Arrange drops the pick.
  useEffect(() => {
    if (!canEdit) {
      setPickedId(null);
      setBandSheetOpen(false);
    }
  }, [canEdit]);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  // SPEC 18: the row arms after a 250 ms hold.
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);

  const bandMapRef = useRef(bandMap);
  bandMapRef.current = bandMap;
  const initialBandMapRef = useRef(initialBandMap);
  initialBandMapRef.current = initialBandMap;
  const dragInitialBandMapRef = useRef<BandMap | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const findBandForItem = useCallback((id: UniqueIdentifier): number | null => {
    const map = bandMapRef.current;
    const str = String(id);
    for (const band of BANDS) {
      if (map[band]?.includes(str)) return band;
    }
    return null;
  }, []);

  const dragSourceBandRef = useRef<number | null>(null);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!canEdit) return;
      feedback("medium");
      setActiveId(event.active.id);
      setPickedId(String(event.active.id));
      dragInitialBandMapRef.current = cloneBandMap(bandMapRef.current);
      dragSourceBandRef.current = findBandForItem(event.active.id);
    },
    [findBandForItem, canEdit],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!canEdit) return;
      const { active, over } = event;
      if (!over) return;
      const overContainerId = over.data.current?.sortable?.containerId;
      const activeBand = findBandForItem(active.id);
      const overBand =
        parseBandFromContainerId(overContainerId) ??
        parseBandFromContainerId(over.id) ??
        findBandForItem(over.id);
      if (activeBand === null || overBand === null) return;
      // Same-band reordering is SortableContext's transforms until the drop;
      // an arrayMove here loops (React #185).
      if (activeBand === overBand) return;
      const moving = String(active.id);
      setBandMap((prev) => {
        const prevSource = prev[activeBand] ?? [];
        const prevDest = prev[overBand] ?? [];
        const source = prevSource.filter((id) => id !== moving);
        const dest = prevDest.filter((id) => id !== moving);
        const overIndex = dest.indexOf(String(over.id));
        dest.splice(overIndex >= 0 ? overIndex : dest.length, 0, moving);
        if (
          areStringArraysEqual(source, prevSource) &&
          areStringArraysEqual(dest, prevDest)
        ) {
          return prev;
        }
        return { ...prev, [activeBand]: source, [overBand]: dest };
      });
    },
    [findBandForItem, canEdit],
  );

  const persist = useCallback(
    async (
      call: { band: number; orderedIds: string[] },
      rollback: BandMap,
      toast: string | null,
    ) => {
      const result = await reorderBandAction(call, tierListId);
      if (!isMountedRef.current) return;
      if (!result.success) {
        setBandMap(rollback);
        feedback("refuse");
        notify(result.error ?? "Couldn't move it just now.", {
          tone: "error",
        });
        return;
      }
      onEditedRef.current?.();
      if (toast === null) {
        // The move is now the top of the history: an earlier edit's toast
        // would take back this move instead of what it names.
        dismissNotification(TIER_LIST_EDIT_TOAST);
      } else {
        notify(toast, {
          id: TIER_LIST_EDIT_TOAST,
          ...(onUndoRef.current === undefined
            ? {}
            : { undo: () => onUndoRef.current?.() }),
        });
      }
      router.refresh();
    },
    [reorderBandAction, router, tierListId],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const preDragMap = dragInitialBandMapRef.current;
      dragInitialBandMapRef.current = null;
      setActiveId(null);
      if (!canEdit) {
        dragSourceBandRef.current = null;
        return;
      }
      const { active, over } = event;
      const sourceBand = dragSourceBandRef.current;
      dragSourceBandRef.current = null;
      if (!over || sourceBand === null) {
        setBandMap(cloneBandMap(preDragMap ?? initialBandMapRef.current));
        return;
      }
      const map = bandMapRef.current;
      const destBand =
        parseBandFromContainerId(over.data.current?.sortable?.containerId) ??
        parseBandFromContainerId(over.id) ??
        findBandForItem(active.id);
      if (destBand === null) {
        setBandMap(cloneBandMap(preDragMap ?? initialBandMapRef.current));
        return;
      }

      const moving = String(active.id);
      const destItems = map[destBand] ?? [];
      const activeIndex = destItems.indexOf(moving);
      let overIndex = destItems.indexOf(String(over.id));
      let finalMap: BandMap = map;

      if (sourceBand !== destBand && activeIndex < 0) {
        const nextDest = [...destItems];
        nextDest.splice(
          overIndex >= 0 ? overIndex : nextDest.length,
          0,
          moving,
        );
        finalMap = {
          ...map,
          [sourceBand]: (map[sourceBand] ?? []).filter((id) => id !== moving),
          [destBand]: nextDest,
        };
        setBandMap(finalMap);
      } else {
        if (overIndex < 0 && String(over.id).startsWith("band-")) {
          overIndex = destItems.length - 1;
        }
        if (activeIndex >= 0 && overIndex >= 0 && activeIndex !== overIndex) {
          finalMap = {
            ...map,
            [destBand]: arrayMove(destItems, activeIndex, overIndex),
          };
          setBandMap(finalMap);
        }
      }

      const beforeMap = preDragMap ?? map;
      const call = reorderCallFor(beforeMap, finalMap, sourceBand, destBand);
      if (call === null) return;
      feedback("tick");
      void persist(call, cloneBandMap(beforeMap), null);
    },
    [canEdit, findBandForItem, persist],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    dragSourceBandRef.current = null;
    setBandMap(
      cloneBandMap(dragInitialBandMapRef.current ?? initialBandMapRef.current),
    );
    dragInitialBandMapRef.current = null;
  }, []);

  /**
   * One dock move (SPEC 16, 17): optimistic, rolled back on a refusal, its
   * rank computed once by `moveEntry` and said in the toast.
   */
  const applyMove = useCallback(
    async (id: string, move: EntryMove) => {
      if (!canEdit || movingRef.current) return;
      const before = bandMapRef.current;
      const next = moveEntry(before, id, move);
      if (next === null) {
        feedback("refuse");
        return;
      }
      movingRef.current = true;
      const name = itemMap.get(id)?.name ?? "";
      const crowned = next.rank === 1 && isOwner;
      feedback(crowned ? "success" : "tick");
      setBandMap(next.after);
      await persist(
        next.call,
        cloneBandMap(before),
        crowned
          ? `New #1 · ${name}`
          : `Moved to ${BAND_LABELS[next.band]} · #${next.rank} · ${name}`,
      );
      movingRef.current = false;
    },
    [canEdit, isOwner, itemMap, persist],
  );

  /**
   * Remove without asking (KIT § 4: reversible, so a toast with Undo).
   * Optimistic, rolled back on a refusal.
   */
  const handleRemove = useCallback(
    async (itemId: string) => {
      if (!canEdit) return;
      const name = itemMap.get(itemId)?.name ?? "";
      const rollbackMap = cloneBandMap(bandMapRef.current);
      setPickedId(null);
      setBandMap((prev) => {
        const next = { ...prev };
        for (const band of BANDS) {
          const ids = next[band];
          if (ids?.includes(itemId)) {
            next[band] = ids.filter((id) => id !== itemId);
            break;
          }
        }
        return next;
      });
      const result = await removeItemFromTierListAction(itemId, tierListId);
      if (!isMountedRef.current) return;
      if (result.success) {
        onEditedRef.current?.();
        notify(`Removed ${name}`, {
          id: TIER_LIST_EDIT_TOAST,
          ...(onUndoRef.current === undefined
            ? {}
            : { undo: () => onUndoRef.current?.() }),
        });
        router.refresh();
      } else {
        setBandMap(rollbackMap);
        feedback("refuse");
        notify(result.error ?? "Couldn't remove it just now.", {
          tone: "error",
        });
      }
    },
    [canEdit, itemMap, tierListId, router, removeItemFromTierListAction],
  );

  const handlePick = useCallback((id: string) => {
    setPickedId((current) => (current === id ? null : id));
  }, []);

  // ---------------------------------------------------------------------------
  // What is drawn
  // ---------------------------------------------------------------------------

  const filtering = !canEdit && (query.trim() !== "" || (only?.size ?? 0) > 0);
  const visible = useCallback(
    (item: TierListItemDisplay) =>
      canEdit ||
      ((only === null || only.size === 0 || only.has(item.band)) &&
        matchesQuery(item, query)),
    [canEdit, only, query],
  );

  const sections = useMemo(() => {
    let rankOffset = 0;
    let indexOffset = 0;
    return BANDS.map((band) => {
      const ids = bandMap[band] ?? [];
      const shown = ids.filter((id) => {
        const item = itemMap.get(id);
        return item !== undefined && visible(item);
      }).length;
      const section = { band, ids, rankOffset, indexOffset, shown };
      rankOffset += ids.length;
      indexOffset += shown;
      return section;
    });
  }, [bandMap, itemMap, visible]);

  const drawnTotal = sections.reduce((n, s) => n + s.shown, 0);
  const scrubberBands: ScrubberBand[] = sections
    .filter((s): s is typeof s & { band: RankedBand } => isRanked(s.band))
    .map((s) => ({ band: s.band, count: s.shown }));

  // The scrubber's thumb follows the first row on screen.
  const boardRef = useRef<HTMLDivElement>(null);
  const [topIndex, setTopIndex] = useState(0);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rows =
          boardRef.current?.querySelectorAll<HTMLElement>("[data-rank-index]");
        if (rows === undefined) return;
        const first = Array.from(rows).find(
          (row) => row.getBoundingClientRect().bottom > 96,
        );
        if (first !== undefined) {
          setTopIndex(Number(first.dataset.rankIndex ?? 0));
        }
      });
    };
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  const jumpTo = useCallback((index: number) => {
    setTopIndex(index);
    boardRef.current
      ?.querySelector<HTMLElement>(`[data-rank-index="${index}"]`)
      ?.scrollIntoView({ block: "start" });
  }, []);

  const layout = !reduceMotion && activeId === null;
  const activeItem = activeId ? itemMap.get(String(activeId)) : null;
  const picked = pickedId === null ? null : (itemMap.get(pickedId) ?? null);
  const pickedRank = pickedId === null ? null : rankOf(bandMap, pickedId);
  const pickedBand =
    pickedId === null
      ? null
      : (BANDS.find((band) => bandMap[band]?.includes(pickedId)) ?? null);

  // ---------------------------------------------------------------------------
  // The crowd's order: a flat list, ranks unchanged
  // ---------------------------------------------------------------------------

  if (order === "crowd" && !canEdit) {
    const ranked = BANDS.flatMap((band) => bandMap[band] ?? []);
    const rows = ranked
      .map((id, i) => ({ item: itemMap.get(id), rank: i + 1 }))
      .filter(
        (row): row is { item: TierListItemDisplay; rank: number } =>
          row.item !== undefined && visible(row.item),
      )
      .sort(
        (a, b) =>
          (b.item.publicRating ?? -1) - (a.item.publicRating ?? -1) ||
          a.rank - b.rank,
      );
    if (rows.length === 0)
      return <NoMatch query={query} noun={noun} onClear={onClearSearch} />;
    return (
      <DndContext id={dndId}>
        <SortableContext items={[]}>
          <div data-slot="tier-board" className="flex flex-col gap-2">
            {rows.map(({ item, rank }, index) => (
              <EntryRow
                key={item.id}
                item={item}
                rank={rank}
                glyph={glyph}
                canEdit={false}
                viewerIsOwner={isOwner}
                picked={false}
                selected={selectedItemId === item.id}
                index={index}
                layout={layout}
                onPick={handlePick}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  if (filtering && drawnTotal === 0) {
    return <NoMatch query={query} noun={noun} onClear={onClearSearch} />;
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={canEdit ? VERTICAL_MODIFIERS : NO_MODIFIERS}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={boardRef} data-slot="tier-board" className="flex gap-1">
        {/* DECISIONS 38: the scrubber on the left, never moving. */}
        <div className="sticky top-2 h-[min(68dvh,600px)] shrink-0 self-start">
          <Scrubber
            bands={scrubberBands}
            value={Math.min(topIndex, Math.max(0, drawnTotal - 1))}
            onValueChange={jumpTo}
            className="h-full"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {sections.map((section) =>
            // Bands never collapse; under a filter, only bands with rows.
            (!isRanked(section.band) && section.ids.length === 0) ||
            (filtering && section.shown === 0) ? null : (
              <BandSection
                key={section.band}
                band={section.band}
                itemIds={section.ids}
                itemMap={itemMap}
                rankOffset={section.rankOffset}
                indexOffset={section.indexOffset}
                glyph={glyph}
                noun={noun}
                canEdit={canEdit}
                viewerIsOwner={isOwner}
                pickedId={pickedId}
                selectedItemId={selectedItemId}
                layout={layout}
                visible={visible}
                onPick={handlePick}
              />
            ),
          )}
        </div>
      </div>

      <DragOverlay>
        {activeItem ? <DragOverlayRow item={activeItem} glyph={glyph} /> : null}
      </DragOverlay>

      {canEdit && (
        <ActionBar
          role="toolbar"
          aria-label="Arrange"
          className="mt-3 flex-col items-stretch gap-2"
        >
          <div className="flex min-h-11 items-center gap-1 pl-2">
            <p className="t-cap tabular min-w-0 flex-1 truncate text-ink-2">
              {picked !== null && pickedRank !== null && pickedBand !== null
                ? `#${pickedRank} · ${picked.name} · ${BAND_LABELS[pickedBand]}`
                : "Tap a row to move it"}
            </p>
            {arrangeTools}
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              variant="outline"
              aria-label="Move up"
              disabled={pickedId === null}
              onClick={() =>
                pickedId && void applyMove(pickedId, { kind: "up" })
              }
            >
              <ChevronUp />
            </IconButton>
            <IconButton
              variant="outline"
              aria-label="Move down"
              disabled={pickedId === null}
              onClick={() =>
                pickedId && void applyMove(pickedId, { kind: "down" })
              }
            >
              <ChevronDown />
            </IconButton>
            <Button
              variant="outline"
              className="min-w-0 flex-1"
              disabled={pickedId === null}
              onClick={() => setBandSheetOpen(true)}
            >
              Move to band…
            </Button>
            <IconButton variant="outline" aria-label="Done" onClick={onDone}>
              <Check />
            </IconButton>
          </div>
        </ActionBar>
      )}

      {picked !== null &&
        pickedRank !== null &&
        pickedBand !== null &&
        isRanked(pickedBand) && (
          <BandSheet
            open={bandSheetOpen}
            onOpenChange={setBandSheetOpen}
            subject={picked.name}
            rank={pickedRank}
            band={pickedBand}
            listName={listName}
            counts={Object.fromEntries(
              RANKED.map((band) => [band, bandMap[band]?.length ?? 0]),
            )}
            onChoose={(band) => {
              setBandSheetOpen(false);
              void applyMove(picked.id, { kind: "band", band });
            }}
            onRemove={() => {
              setBandSheetOpen(false);
              void handleRemove(picked.id);
            }}
          />
        )}
    </DndContext>
  );
}

/** KIT § 4: "No place matches “q”" and its one action. */
function NoMatch({
  query,
  noun,
  onClear,
}: {
  query: string;
  noun: (count: number) => string;
  onClear?: (() => void) | undefined;
}) {
  const q = query.trim();
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="t-body text-ink">
        {q === ""
          ? `No ${noun(2)} in these bands`
          : `No ${noun(1)} matches “${q}”`}
      </p>
      {onClear !== undefined && (
        <Button variant="outline" onClick={onClear}>
          {q === "" ? "Show all" : "Clear search"}
        </Button>
      )}
    </div>
  );
}
