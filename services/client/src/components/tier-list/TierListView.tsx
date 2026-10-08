"use client";

/**
 * `82450ad1:src/components/tier-list/TierListView.tsx`, restored: the
 * @dnd-kit board, rank badges (crown, trophies, plain), the viewer's own score
 * and the public rating, drag overlay, remove confirm. Substitutions:
 *
 * - `reorderBandAction(updates)` (a per-row diff of both bands) → one call
 *   with the destination band's full order (`reorderCallFor`), the API's
 *   contract; the optimistic map, rollback and `router.refresh()` are as
 *   before.
 * - The server actions come from `useTierListActions` (`actions.ts`).
 * - On the app's primitives (D20): band colours are the `--ca-band-*` ramp
 *   (`BAND_TONES`), always beside the band word; the remove confirm is a
 *   `ConfirmSheet`; a failed save is a `notify` toast. The drag engine is
 *   untouched.
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
import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { IconButton } from "@/components/app/IconButton";
import {
  Crown,
  Delete,
  DragHandle,
  ICON_STROKE,
  People,
  Trophy,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { Score } from "@/components/app/Score";
import { cn } from "@/lib/utils";
import { useTierListActions } from "./actions";
import { reorderCallFor } from "./adapter";
import { BAND_LABELS, BAND_TONES, BANDS } from "./constants";
import type { TierListItemDisplay } from "./types";

// =============================================================================
// Types
// =============================================================================

interface TierListViewProps {
  tierListId: string;
  items: TierListItemDisplay[];
  isOwner: boolean;
  isEditingLocked?: boolean;
  selectedItemId?: string;
}

type BandMap = Record<number, string[]>;

// =============================================================================
// Band Configuration
// =============================================================================

const VERTICAL_MODIFIERS = [restrictToVerticalAxis];
const NO_MODIFIERS: typeof VERTICAL_MODIFIERS = [];

function formatRatingCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
}

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

// =============================================================================
// Rank Badge — Strava-style: crown for #1, trophies for 2-10, plain for 11+
// =============================================================================

/** The badge column's width: every rank lines up whatever its glyph. */
const BADGE = "flex w-8 shrink-0 items-center justify-center";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    // Claret for #1 (design §3.4); the rank is said, not only drawn.
    return (
      <span className={BADGE}>
        <Crown
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-7 fill-brand text-brand-ink"
        />
        <span className="sr-only">Rank 1</span>
      </span>
    );
  }

  if (rank <= 10) {
    return (
      <span className={cn(BADGE, "relative")}>
        <Trophy
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-8 fill-brass text-brass"
        />
        <span className="tabular absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 font-extrabold text-[0.75rem] text-on-brass leading-none">
          {rank}
        </span>
      </span>
    );
  }

  return (
    <span className="tabular w-8 shrink-0 text-center font-bold type-callout text-ink-2">
      {rank}
    </span>
  );
}

// =============================================================================
// Sortable TierListItem — split into DnD wrapper + memoized content
// =============================================================================

// Inner content — does NOT consume DndContext, so React.memo actually prevents
// re-renders during drag when only the wrapper's transform/transition change.
interface TierListItemContentProps {
  item: TierListItemDisplay;
  rank: number;
  canEdit: boolean;
  onRemove: (itemId: string, name: string) => void;
}

const TierListItemContent = memo(function TierListItemContent({
  item,
  rank,
  canEdit,
  onRemove,
}: TierListItemContentProps) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <Link
          href={item.href}
          className="block truncate font-semibold type-callout text-ink-1"
        >
          {item.name}
        </Link>
        {item.subtitle && (
          <p className="type-footnote truncate">{item.subtitle}</p>
        )}
      </div>

      {(item.reviewScore != null || item.publicRating != null) && (
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {item.reviewScore != null && <Score value={item.reviewScore} />}
          {item.publicRating != null && (
            <span className="tabular inline-flex items-center gap-0.5 font-medium text-ink-3">
              <People
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-3.5"
              />
              <span className="sr-only">Public rating </span>
              {item.publicRating}
              {item.publicRatingCount != null && (
                <span className="ml-0.5 font-normal">
                  ({formatRatingCount(item.publicRatingCount)})
                </span>
              )}
            </span>
          )}
        </div>
      )}

      <RankBadge rank={rank} />

      {canEdit && (
        <IconButton
          size="sm"
          onClick={() => onRemove(item.id, item.name)}
          aria-label={`Remove ${item.name}`}
          className="shrink-0 text-ink-3"
        >
          <Delete />
        </IconButton>
      )}
    </>
  );
});

// Thin wrapper — subscribes to DndContext via useSortable (must re-render on
// every drag frame), but delegates actual content rendering to the memoized
// TierListItemContent which skips reconciliation for inactive items.
interface SortableTierListItemProps {
  item: TierListItemDisplay;
  rank: number;
  canEdit: boolean;
  isSelected?: boolean;
  onRemove: (itemId: string, name: string) => void;
}

const SortableTierListItem = memo(function SortableTierListItem({
  item,
  rank,
  canEdit,
  isSelected,
  onRemove,
}: SortableTierListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });

  // Dynamic values change every frame during drag — an inline style, not a
  // class, so nothing is generated or merged on each animation frame.
  const dynamicStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.3 : 1,
  };

  useEffect(() => {
    if (!isSelected) return;
    const el = document.getElementById(item.id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isSelected, item.id]);

  return (
    <div
      ref={setNodeRef}
      id={item.id}
      data-slot="tier-list-entry"
      aria-current={isSelected ? "true" : undefined}
      style={dynamicStyle}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md bg-surface-2 px-3 py-1.5 shadow-[inset_0_1px_0_var(--ca-highlight)]",
        isSelected && "outline-2 outline-ring outline-offset-2 outline-solid",
      )}
    >
      {canEdit && (
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="-my-1.5 -ml-1 flex shrink-0 cursor-grab touch-none items-center self-stretch rounded-sm px-1 text-ink-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <DragHandle
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-5"
          />
        </div>
      )}

      <TierListItemContent
        item={item}
        rank={rank}
        canEdit={canEdit}
        onRemove={onRemove}
      />
    </div>
  );
});

// =============================================================================
// DragOverlay item — the lifted row
// =============================================================================

const DragOverlayItem = memo(function DragOverlayItem({
  item,
}: {
  item: TierListItemDisplay;
}) {
  return (
    <div className="surface-glass flex cursor-grabbing items-center gap-2 rounded-md px-3 py-1.5">
      <DragHandle
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-ink-3"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold type-callout text-ink-1">
          {item.name}
        </p>
        {item.subtitle && (
          <p className="type-footnote truncate">{item.subtitle}</p>
        )}
      </div>
    </div>
  );
});

// =============================================================================
// TierBand — band label + drop zone with items
// =============================================================================

// Static band label — no DnD context dependency, fully memoized by band number.
// The word is always printed (design §3.1): the hue never carries the meaning.
const BandLabel = memo(function BandLabel({ band }: { band: number }) {
  const tone = BAND_TONES[band] ?? BAND_TONES[0];
  const label = BAND_LABELS[band];
  return (
    <div
      className={cn(
        "flex min-h-22 w-8 shrink-0 items-center justify-center border-r-[3px] py-1",
        tone.rule,
        tone.tint,
      )}
    >
      <span className="rotate-180 select-none whitespace-nowrap text-ink-1 type-overline [writing-mode:vertical-rl]">
        {label}
      </span>
    </div>
  );
});

interface TierBandProps {
  band: number;
  itemIds: string[];
  itemMap: Map<string, TierListItemDisplay>;
  rankOffset: number;
  canEdit: boolean;
  isLast: boolean;
  selectedItemId?: string;
  onRemove: (itemId: string, name: string) => void;
}

const TierBand = memo(function TierBand({
  band,
  itemIds,
  itemMap,
  rankOffset,
  canEdit,
  isLast,
  selectedItemId,
  onRemove,
}: TierBandProps) {
  const hasItems = itemIds.length > 0;
  const { setNodeRef } = useDroppable({ id: `band-${band}` });

  return (
    <section
      aria-label={BAND_LABELS[band]}
      className={cn(
        "flex",
        !isLast && "border-b-2",
        !isLast && (BAND_TONES[band] ?? BAND_TONES[0]).divider,
      )}
    >
      <BandLabel band={band} />

      {/* Items column */}
      <div ref={setNodeRef} className="min-w-0 flex-1">
        <SortableContext
          id={`band-${band}`}
          items={itemIds}
          strategy={verticalListSortingStrategy}
        >
          <div
            className={cn("flex flex-col gap-1.5 p-2", !hasItems && "min-h-20")}
          >
            {itemIds.map((itemId, index) => {
              const item = itemMap.get(itemId);
              if (!item) return null;
              return (
                <SortableTierListItem
                  key={itemId}
                  item={item}
                  rank={rankOffset + index + 1}
                  canEdit={canEdit}
                  isSelected={selectedItemId === itemId}
                  onRemove={onRemove}
                />
              );
            })}
          </div>
        </SortableContext>
      </div>
    </section>
  );
});

// =============================================================================
// Main TierListView
// =============================================================================

export function TierListView({
  tierListId,
  items,
  isOwner,
  isEditingLocked = false,
  selectedItemId,
}: TierListViewProps) {
  const dndId = useId();
  const router = useRouter();
  const { removeItemFromTierListAction, reorderBandAction } =
    useTierListActions();
  const canEdit = isOwner && !isEditingLocked;

  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const { initialBandMap, itemMap } = useMemo(() => {
    const map = new Map<string, TierListItemDisplay>();
    const bands: Record<number, string[]> = {};

    for (const band of BANDS) {
      bands[band] = [];
    }

    for (const item of items) {
      map.set(item.id, item);
      if (bands[item.band]) {
        bands[item.band].push(item.id);
      }
    }

    return { initialBandMap: bands, itemMap: map };
  }, [items]);

  const [bandMap, setBandMap] = useState<BandMap>(initialBandMap);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // Sync server-provided bandMap when items prop changes (e.g. after
  // router.refresh()), but skip during an active drag to avoid resetting
  // the dragged item's position mid-flight.
  //
  // IMPORTANT: activeId is read via ref, NOT included in deps. Including it
  // would cause the effect to fire on drag-end (activeId: uuid → null),
  // overwriting the optimistic bandMap from handleDragEnd with stale server
  // data before the browser paints — making items visually snap back.
  useLayoutEffect(() => {
    if (activeIdRef.current === null) {
      setBandMap(initialBandMap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBandMap]);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);

  // ---------------------------------------------------------------------------
  // Refs for latest state — read by DnD callbacks to keep them stable.
  // Without refs, every bandMap change would recreate all callbacks,
  // causing DndContext to re-render and cascade to all useSortable/useDroppable
  // consumers (18 items + 6 bands). With refs, callbacks are created once.
  // ---------------------------------------------------------------------------
  const bandMapRef = useRef(bandMap);
  bandMapRef.current = bandMap;

  const initialBandMapRef = useRef(initialBandMap);
  initialBandMapRef.current = initialBandMap;
  const dragInitialBandMapRef = useRef<BandMap | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Stable helpers — read from refs, never recreated
  const findBandForItem = useCallback((id: UniqueIdentifier): number | null => {
    const map = bandMapRef.current;
    const str = String(id);
    for (const band of BANDS) {
      if (map[band]?.includes(str)) return band;
    }
    return null;
  }, []);

  const findBandFromContainerId = useCallback(
    (id: unknown): number | null => parseBandFromContainerId(id),
    [],
  );

  // Track which band the drag started from (before handleDragOver moves it)
  const dragSourceBandRef = useRef<number | null>(null);

  // Stable DnD handlers — no bandMap/itemToBand in deps
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!canEdit) return;
      setActiveId(event.active.id);
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
        findBandFromContainerId(overContainerId) ??
        findBandFromContainerId(over.id) ??
        findBandForItem(over.id);

      if (activeBand === null || overBand === null) return;

      // Only handle cross-band transfers in handleDragOver.
      // Same-band reordering is handled visually by SortableContext transforms
      // and committed in handleDragEnd. Doing same-band arrayMove here causes
      // infinite re-render loops (React error #185) because each setBandMap
      // triggers a re-render → dnd-kit recalculates → fires handleDragOver
      // again with swapped indices → another setBandMap → infinite loop.
      if (activeBand === overBand) return;

      const activeId = String(active.id);

      // Cross-band: move item from source to destination
      setBandMap((prev) => {
        const prevSourceItems = prev[activeBand] ?? [];
        const prevDestItems = prev[overBand] ?? [];
        const sourceItems = prevSourceItems.filter((id) => id !== activeId);
        const destItems = prevDestItems.filter((id) => id !== activeId);

        const overIndex = destItems.indexOf(String(over.id));
        const insertionIndex = overIndex >= 0 ? overIndex : destItems.length;
        destItems.splice(insertionIndex, 0, activeId);

        if (
          areStringArraysEqual(sourceItems, prevSourceItems) &&
          areStringArraysEqual(destItems, prevDestItems)
        ) {
          return prev;
        }

        return {
          ...prev,
          [activeBand]: sourceItems,
          [overBand]: destItems,
        };
      });
    },
    [findBandForItem, findBandFromContainerId, canEdit],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canEdit) {
        setActiveId(null);
        dragSourceBandRef.current = null;
        dragInitialBandMapRef.current = null;
        return;
      }

      const { active, over } = event;
      setActiveId(null);
      const preDragMap = dragInitialBandMapRef.current;
      dragInitialBandMapRef.current = null;

      if (!over) {
        // Dropped outside any droppable — revert to pre-drag state
        dragSourceBandRef.current = null;
        setBandMap(cloneBandMap(preDragMap ?? initialBandMapRef.current));
        return;
      }

      const map = bandMapRef.current;
      const sourceBand = dragSourceBandRef.current;
      const overContainerId = over.data.current?.sortable?.containerId;
      const destBand =
        findBandFromContainerId(overContainerId) ??
        findBandFromContainerId(over.id) ??
        findBandForItem(active.id);
      dragSourceBandRef.current = null;

      if (sourceBand === null || destBand === null) {
        setBandMap(cloneBandMap(preDragMap ?? initialBandMapRef.current));
        return;
      }

      // Final position adjustment within the destination band
      const activeId = String(active.id);
      const destItems = map[destBand] ?? [];
      const activeIndex = destItems.indexOf(activeId);
      let overIndex = destItems.indexOf(String(over.id));
      const overIsBandContainer = String(over.id).startsWith("band-");

      let finalMap: BandMap = map;
      let finalDestItems = destItems;

      if (sourceBand !== destBand && activeIndex < 0) {
        const sourceItems = (map[sourceBand] ?? []).filter(
          (id) => id !== activeId,
        );
        const nextDestItems = [...destItems];
        const insertionIndex =
          overIndex >= 0 ? overIndex : nextDestItems.length;
        nextDestItems.splice(insertionIndex, 0, activeId);
        finalDestItems = nextDestItems;
        finalMap = {
          ...map,
          [sourceBand]: sourceItems,
          [destBand]: nextDestItems,
        };
        setBandMap(finalMap);
      } else {
        if (overIndex < 0 && overIsBandContainer) {
          overIndex = destItems.length - 1;
        }
        if (activeIndex >= 0 && overIndex >= 0 && activeIndex !== overIndex) {
          finalDestItems = arrayMove(destItems, activeIndex, overIndex);
          finalMap = { ...map, [destBand]: finalDestItems };
          setBandMap(finalMap);
        }
      }

      const beforeMap = preDragMap ?? map;
      // One call naming the destination band's full order (adapter.ts).
      const call = reorderCallFor(beforeMap, finalMap, sourceBand, destBand);

      if (call === null) {
        return;
      }

      const rollbackMap = cloneBandMap(beforeMap);
      void (async () => {
        const result = await reorderBandAction(call, tierListId);
        if (!isMountedRef.current) return;
        if (result.success) {
          router.refresh();
        } else {
          setBandMap(rollbackMap);
          notify(result.error ?? "Failed to persist reorder", {
            tone: "error",
          });
        }
      })();
    },
    [
      findBandForItem,
      findBandFromContainerId,
      reorderBandAction,
      tierListId,
      router,
      canEdit,
    ],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    dragSourceBandRef.current = null;
    setBandMap(
      cloneBandMap(dragInitialBandMapRef.current ?? initialBandMapRef.current),
    );
    dragInitialBandMapRef.current = null;
  }, []);

  const handleRemoveClick = useCallback((itemId: string, name: string) => {
    setRemoveTarget({ id: itemId, name });
  }, []);

  const handleConfirmRemove = useCallback(async () => {
    if (!canEdit || !removeTarget) return;
    const rollbackMap = cloneBandMap(bandMapRef.current);
    // Optimistically remove from local state for instant feedback
    setBandMap((prev) => {
      const next = { ...prev };
      for (const band of BANDS) {
        const items = next[band];
        if (items?.includes(removeTarget.id)) {
          next[band] = items.filter((id) => id !== removeTarget.id);
          break;
        }
      }
      return next;
    });
    setRemoveTarget(null);
    const result = await removeItemFromTierListAction(
      removeTarget.id,
      tierListId,
    );
    if (!isMountedRef.current) return;
    if (result.success) {
      router.refresh();
    } else {
      setBandMap(rollbackMap);
      notify(result.error ?? "Failed to remove item", { tone: "error" });
    }
  }, [removeTarget, tierListId, router, canEdit, removeItemFromTierListAction]);

  const activeItem = activeId ? itemMap.get(String(activeId)) : null;

  return (
    <>
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
        <div
          data-slot="tier-board"
          className="overflow-hidden rounded-lg bg-surface-1"
        >
          {BANDS.map((band, index) => {
            // Compute rank offset: count of items in all higher bands
            let rankOffset = 0;
            for (let i = 0; i < index; i++) {
              rankOffset += (bandMap[BANDS[i]] ?? []).length;
            }
            return (
              <TierBand
                key={band}
                band={band}
                itemIds={bandMap[band] ?? []}
                itemMap={itemMap}
                rankOffset={rankOffset}
                canEdit={canEdit}
                isLast={index === BANDS.length - 1}
                selectedItemId={selectedItemId}
                onRemove={handleRemoveClick}
              />
            );
          })}
        </div>

        <DragOverlay>
          {activeItem ? <DragOverlayItem item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>

      <ConfirmSheet
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remove from tier list?"
        description={
          <>
            Remove <strong>{removeTarget?.name}</strong> from this tier list?
            This won&apos;t delete the item itself.
          </>
        }
        confirmLabel="Remove"
        onConfirm={() => void handleConfirmRemove()}
      />
    </>
  );
}
