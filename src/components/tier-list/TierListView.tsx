"use client";

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
import {
  Box,
  Button,
  Card,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Modal,
  ModalDialog,
  Sheet,
  Snackbar,
  Typography,
} from "@mui/joy";
import Link from "next/link";
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
import { AiFillTrophy } from "react-icons/ai";
import { FaCrown } from "react-icons/fa";
import { MdDelete, MdDragIndicator, MdStar } from "react-icons/md";
import {
  removeItemFromTierListAction,
  reorderBandAction,
} from "@/app/actions/tierLists";
import { BAND_COLORS, BAND_LABELS, BANDS } from "./constants";
import type { TierListItemDisplay } from "./types";

// =============================================================================
// Types
// =============================================================================

interface TierListViewProps {
  tierListId: string;
  items: TierListItemDisplay[];
  isOwner: boolean;
  isEditingLocked?: boolean;
}

type BandMap = Record<number, string[]>;

// =============================================================================
// Band Configuration
// =============================================================================

const VERTICAL_MODIFIERS = [restrictToVerticalAxis];
const NO_MODIFIERS: typeof VERTICAL_MODIFIERS = [];

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

const TROPHY_COLOR = "#E5A100";

const BADGE_WIDTH = 32;

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Box
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: BADGE_WIDTH,
        }}
      >
        <FaCrown style={{ fontSize: 28, color: TROPHY_COLOR }} />
      </Box>
    );
  }

  if (rank <= 10) {
    return (
      <Box
        sx={{
          position: "relative",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: BADGE_WIDTH,
        }}
      >
        <AiFillTrophy style={{ fontSize: 32, color: TROPHY_COLOR }} />
        <Typography
          level="body-xs"
          sx={{
            position: "absolute",
            fontWeight: 800,
            fontSize: "0.75rem",
            lineHeight: 1,
            color: "#fff",
            top: "42%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {rank}
        </Typography>
      </Box>
    );
  }

  return (
    <Typography
      level="body-sm"
      sx={{
        color: "text.secondary",
        fontWeight: "xl",
        flexShrink: 0,
        width: BADGE_WIDTH,
        textAlign: "center",
      }}
    >
      {rank}
    </Typography>
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
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          level="title-sm"
          component={Link}
          href={item.href}
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            color: "inherit",
            textDecoration: "none",
            "&:hover": {
              textDecoration: "underline",
            },
          }}
        >
          {item.name}
        </Typography>
        {item.subtitle && (
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            {item.subtitle}
          </Typography>
        )}
      </Box>

      {item.reviewScore != null && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            flexShrink: 0,
            color: "warning.500",
          }}
        >
          <MdStar style={{ fontSize: 14 }} />
          <Typography
            level="body-xs"
            sx={{ fontWeight: "lg", color: "inherit" }}
          >
            {item.reviewScore}
          </Typography>
        </Box>
      )}

      <RankBadge rank={rank} />

      {canEdit && (
        <IconButton
          variant="plain"
          color="neutral"
          size="sm"
          onClick={() => onRemove(item.id, item.name)}
          aria-label={`Remove ${item.name}`}
          sx={{ flexShrink: 0 }}
        >
          <MdDelete />
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
  onRemove: (itemId: string, name: string) => void;
}

const SortableTierListItem = memo(function SortableTierListItem({
  item,
  rank,
  canEdit,
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

  // Dynamic values change every frame during drag — use inline style to
  // bypass Emotion's CSS class generation on each animation frame.
  const dynamicStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <Sheet
      ref={setNodeRef}
      variant="outlined"
      style={dynamicStyle}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: "sm",
        boxShadow: "xs",
        "&:hover": {
          boxShadow: "sm",
        },
      }}
    >
      {canEdit && (
        <Box
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          sx={{
            display: "flex",
            alignItems: "center",
            cursor: "grab",
            touchAction: "none",
            color: "neutral.400",
            flexShrink: 0,
          }}
        >
          <MdDragIndicator style={{ fontSize: 20 }} />
        </Box>
      )}

      <TierListItemContent
        item={item}
        rank={rank}
        canEdit={canEdit}
        onRemove={onRemove}
      />
    </Sheet>
  );
});

// =============================================================================
// DragOverlay item — elevated Card
// =============================================================================

const DragOverlayItem = memo(function DragOverlayItem({
  item,
}: {
  item: TierListItemDisplay;
}) {
  return (
    <Card
      variant="outlined"
      size="sm"
      sx={{
        flexDirection: "row",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 0.75,
        boxShadow: "lg",
        cursor: "grabbing",
      }}
    >
      <MdDragIndicator
        style={{ fontSize: 20, color: "var(--joy-palette-neutral-400)" }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          level="title-sm"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </Typography>
        {item.subtitle && (
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            {item.subtitle}
          </Typography>
        )}
      </Box>
    </Card>
  );
});

// =============================================================================
// TierBand — band label + drop zone with items
// =============================================================================

// Static band label — no DnD context dependency, fully memoized by band number.
const BandLabel = memo(function BandLabel({ band }: { band: number }) {
  const color = BAND_COLORS[band];
  const label = BAND_LABELS[band];
  return (
    <Sheet
      variant="soft"
      sx={{
        width: 32,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRight: "3px solid",
        borderColor: color,
        backgroundColor: `${color}14`,
        py: 0.5,
        minHeight: 88,
      }}
    >
      <Typography
        level="body-xs"
        sx={{
          color,
          fontWeight: "lg",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          userSelect: "none",
        }}
      >
        {label}
      </Typography>
    </Sheet>
  );
});

interface TierBandProps {
  band: number;
  itemIds: string[];
  itemMap: Map<string, TierListItemDisplay>;
  rankOffset: number;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRemove: (itemId: string, name: string) => void;
}

const TierBand = memo(function TierBand({
  band,
  itemIds,
  itemMap,
  rankOffset,
  canEdit,
  isFirst,
  isLast,
  onRemove,
}: TierBandProps) {
  const hasItems = itemIds.length > 0;
  const { setNodeRef } = useDroppable({ id: `band-${band}` });

  return (
    <Box
      sx={{
        display: "flex",
        borderBottom: isLast ? undefined : "2px solid",
        borderColor: `${BAND_COLORS[band]}66`,
        borderTopLeftRadius: isFirst ? "lg" : 0,
        borderTopRightRadius: isFirst ? "lg" : 0,
        borderBottomLeftRadius: isLast ? "lg" : 0,
        borderBottomRightRadius: isLast ? "lg" : 0,
        overflow: "hidden",
      }}
    >
      <BandLabel band={band} />

      {/* Items column */}
      <Box ref={setNodeRef} sx={{ flex: 1, minWidth: 0 }}>
        <SortableContext
          id={`band-${band}`}
          items={itemIds}
          strategy={verticalListSortingStrategy}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.75,
              p: 1,
              minHeight: hasItems ? undefined : 80,
            }}
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
                  onRemove={onRemove}
                />
              );
            })}
          </Box>
        </SortableContext>
      </Box>
    </Box>
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
}: TierListViewProps) {
  const dndId = useId();
  const router = useRouter();
  const canEdit = isOwner && !isEditingLocked;

  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

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

  // Sync server-provided bandMap when items prop changes, but skip during
  // an active drag — otherwise router.refresh() from a prior reorder can
  // reset bandMap mid-drag, causing the dragged item to jump or disappear.
  useLayoutEffect(() => {
    if (activeId === null) {
      setBandMap(initialBandMap);
    }
  }, [initialBandMap, activeId]);

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

  // Build sequential position updates (0, 1, 2…) for an entire band.
  const buildBandDiffUpdates = useCallback(
    (beforeBandItems: string[], afterBandItems: string[], band: number) => {
      const beforePositions = new Map(
        beforeBandItems.map((id, i) => [id, i] as const),
      );
      const updates: Array<{ id: string; band: number; position: number }> = [];
      for (let i = 0; i < afterBandItems.length; i++) {
        const id = afterBandItems[i];
        if (beforePositions.get(id) !== i) {
          updates.push({ id, band, position: i });
        }
      }
      return updates;
    },
    [],
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
      const bandsToDiff =
        sourceBand === destBand ? [destBand] : [sourceBand, destBand];
      const updates = bandsToDiff.flatMap((band) =>
        buildBandDiffUpdates(beforeMap[band] ?? [], finalMap[band] ?? [], band),
      );

      if (updates.length === 0) {
        return;
      }

      const rollbackMap = cloneBandMap(beforeMap);
      void (async () => {
        const result = await reorderBandAction(updates, tierListId);
        if (!isMountedRef.current) return;
        if (result.success) {
          router.refresh();
        } else {
          setBandMap(rollbackMap);
          setFeedback(result.error ?? "Failed to persist reorder");
        }
      })();
    },
    [
      findBandForItem,
      findBandFromContainerId,
      buildBandDiffUpdates,
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
      setFeedback(result.error ?? "Failed to remove item");
    }
  }, [removeTarget, tierListId, router, canEdit]);

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
        <Sheet
          variant="outlined"
          sx={{
            borderRadius: "lg",
            overflow: "hidden",
            boxShadow: "sm",
          }}
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
                isFirst={index === 0}
                isLast={index === BANDS.length - 1}
                onRemove={handleRemoveClick}
              />
            );
          })}
        </Sheet>

        <DragOverlay>
          {activeItem ? <DragOverlayItem item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>

      <Modal open={removeTarget !== null} onClose={() => setRemoveTarget(null)}>
        <ModalDialog variant="outlined" role="alertdialog">
          <DialogTitle>Remove from tier list?</DialogTitle>
          <Divider />
          <DialogContent>
            Remove <strong>{removeTarget?.name}</strong> from this tier list?
            This won&apos;t delete the item itself.
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
              color="danger"
              onClick={handleConfirmRemove}
            >
              Remove
            </Button>
            <Button
              variant="plain"
              color="neutral"
              onClick={() => setRemoveTarget(null)}
            >
              Cancel
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      <Snackbar
        open={feedback !== null}
        autoHideDuration={3000}
        onClose={() => setFeedback(null)}
        color="danger"
        variant="soft"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {feedback}
      </Snackbar>
    </>
  );
}
