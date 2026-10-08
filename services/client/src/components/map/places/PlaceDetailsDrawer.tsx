"use client";

/**
 * `82450ad1:src/components/map/places/PlaceDetailsDrawer.tsx`, restored.
 * `GET_PLACE_DETAILS` + `usePlaceEnrichment` → `usePlaceDetails`. A map
 * marker (`MapPlace`) carries no address or contact block, so the drawer's
 * place is the marker merged with the detail read, which is where the old
 * adaptive-cluster rows had them.
 */

import { AnimatePresence, motion } from "motion/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Spinner } from "@/components/ui/spinner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { spring, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { usePlaceDetails } from "../hooks/usePlaceDetails";
import type { ViewportInsets } from "../hooks/useViewportInsets";
import { MOBILE_NAV_HEIGHT, SIDEBAR_WIDTH } from "../utils/layout";
import type { DrawerState, Place } from "./PlaceDetailsContent";
import { PlaceDetailsContent } from "./PlaceDetailsContent";

// Pure function — no component state dependencies
function resolveNextState(
  dragDistance: number,
  velocity: number,
  current: DrawerState,
): DrawerState | "close" {
  if (velocity > 0.5) {
    if (dragDistance > 0) {
      return current === "full"
        ? "half"
        : current === "half"
          ? "collapsed"
          : "close";
    }
    return current === "collapsed"
      ? "half"
      : current === "half"
        ? "full"
        : "full";
  }

  if (dragDistance > 80) {
    return current === "full"
      ? "half"
      : current === "half"
        ? "collapsed"
        : "close";
  }
  if (dragDistance < -80) {
    return current === "collapsed"
      ? "half"
      : current === "half"
        ? "full"
        : "full";
  }
  return current;
}

export interface PlaceDetailsDrawerRef {
  collapse: () => void;
  setMiddle: () => void;
}

interface PlaceDetailsDrawerProps {
  place: Place | null;
  open: boolean;
  onClose: () => void;
  userId: string;
  /**
   * The map's distance from the viewport's left and bottom edges (the side
   * rail, the tab bar); measured by `MapLibreRenderer`. Until it is, the old
   * shell's 56 px rail and 50 px bar.
   */
  insets?: ViewportInsets | null;
}

export const PlaceDetailsDrawer = forwardRef<
  PlaceDetailsDrawerRef,
  PlaceDetailsDrawerProps
>(function PlaceDetailsDrawer({ place, open, onClose, userId, insets }, ref) {
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragCurrentY, setDragCurrentY] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isDesktop = useMediaQuery("(min-width: 769px)");
  const hasSidebar = useMediaQuery("(min-width: 600px)");
  const [drawerState, setDrawerState] = useState<DrawerState>("half");
  const [dragVelocity, setDragVelocity] = useState(0);
  const [lastDragTime, setLastDragTime] = useState(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const justDraggedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    collapse: () => setDrawerState("collapsed"),
    setMiddle: () => setDrawerState("half"),
  }));

  // Fetch detailed place data with menu items (and lazy Google enrichment)
  const {
    place: detailedPlace,
    userInteraction,
    menuItems,
    menuItemCount,
    hasMoreMenuItems,
    loadingMoreMenuItems,
    menuLoadMoreError,
    loadMoreMenuItems,
    enrichment,
    googlePhotos,
    isEnriching,
    detailsPending,
    fetching: loadingDetails,
    failure: error,
    refetch,
    setInteraction,
  } = usePlaceDetails(open ? place?.id : undefined);
  const hasMenuItems = menuItems.length > 0;

  // ── Drawer Height & Drag Logic ──────────────────────────────────────

  const bottomInset = insets?.bottom ?? MOBILE_NAV_HEIGHT;
  const leftInset = insets?.left ?? (hasSidebar ? SIDEBAR_WIDTH : 0);

  const getDrawerHeight = (state: DrawerState) => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const availableHeight = vh - (isDesktop ? 0 : bottomInset);
    switch (state) {
      case "collapsed":
        return availableHeight * 0.25;
      case "half":
        return availableHeight * 0.5;
      case "full":
        return availableHeight * 0.9;
      default:
        return availableHeight * 0.5;
    }
  };

  const getDragAdjustedHeight = (
    state: DrawerState,
    dragOffset: number = 0,
  ): number => {
    const baseHeight = getDrawerHeight(state);
    if (dragOffset < 0) {
      const expansionAmount = Math.abs(dragOffset);
      const maxHeight =
        typeof window !== "undefined" ? window.innerHeight * 0.9 : 720;
      return Math.min(baseHeight + expansionAmount, maxHeight);
    }
    return baseHeight;
  };

  useEffect(() => {
    if (open) {
      setDrawerState("half");
    }
  }, [open]);

  const finalizeDrag = useCallback(() => {
    if (isDragging) {
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 100);
    }

    if (dragStartY !== null && dragCurrentY !== null) {
      const dragDistance = dragCurrentY - dragStartY;
      const velocity = Math.abs(dragVelocity);
      const nextState = resolveNextState(dragDistance, velocity, drawerState);

      if (nextState === "close") {
        onClose();
      } else {
        setDrawerState(nextState);
      }
    }

    setDragStartY(null);
    setDragCurrentY(null);
    setIsDragging(false);
    setDragVelocity(0);
  }, [
    isDragging,
    dragStartY,
    dragCurrentY,
    dragVelocity,
    drawerState,
    onClose,
  ]);

  // ── Touch handlers (for drag handle) ────────────────────────────────

  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStartY(e.touches[0].clientY);
    setDragCurrentY(e.touches[0].clientY);
    setIsDragging(false);
    setLastDragTime(Date.now());
    setDragVelocity(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartY === null) return;
    e.preventDefault();
    const currentY = e.touches[0].clientY;
    const now = Date.now();
    const timeDiff = now - lastDragTime;
    if (dragCurrentY !== null && timeDiff > 0) {
      setDragVelocity((currentY - dragCurrentY) / timeDiff);
    }
    setDragCurrentY(currentY);
    setIsDragging(true);
    setLastDragTime(now);
  };

  const handleTouchEnd = () => finalizeDrag();

  // ── Mouse handlers ──────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragStartY(e.clientY);
    setDragCurrentY(e.clientY);
    setIsDragging(false);
    setLastDragTime(Date.now());
    setDragVelocity(0);
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartY === null) return;
    const currentY = e.clientY;
    const now = Date.now();
    const timeDiff = now - lastDragTime;
    if (dragCurrentY !== null && timeDiff > 0) {
      setDragVelocity((currentY - dragCurrentY) / timeDiff);
    }
    setDragCurrentY(currentY);
    setIsDragging(true);
    setLastDragTime(now);
  };

  const handleMouseUp = useCallback(() => {
    finalizeDrag();
  }, [finalizeDrag]);

  // Global mouse event handlers for drag continuation
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (dragStartY === null) return;
        const currentY = e.clientY;
        const now = Date.now();
        const timeDiff = now - lastDragTime;
        if (dragCurrentY !== null && timeDiff > 0) {
          setDragVelocity((currentY - dragCurrentY) / timeDiff);
        }
        setDragCurrentY(currentY);
        setLastDragTime(now);
      };
      const handleGlobalMouseUp = () => handleMouseUp();

      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleGlobalMouseMove);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [isDragging, dragStartY, dragCurrentY, lastDragTime, handleMouseUp]);

  const getDragOffset = () => {
    if (!isDragging || dragStartY === null || dragCurrentY === null) return 0;
    return dragCurrentY - dragStartY;
  };

  // Simple touch tap handler for drawer state toggling
  const handleTouchTap = (e: React.TouchEvent) => {
    if (justDraggedRef.current) return;
    const target = e.target as HTMLElement;
    const isInteractiveElement = target.closest(
      'button, input, select, textarea, a, [role="button"]',
    );
    const isDragHandle = target.closest("[data-drag-handle]");
    if (isDragHandle && !isInteractiveElement) {
      if (drawerState === "full") setDrawerState("half");
      else if (drawerState === "collapsed") setDrawerState("half");
      else setDrawerState("full");
    }
  };

  if (!place) return null;

  // Loading state (initial)
  if (loadingDetails && !detailedPlace) {
    return (
      <div className="flex justify-center p-8">
        <Spinner className="size-8 text-ink-2" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p
          role="alert"
          className="type-callout rounded-md border border-destructive/60 px-4 py-3 text-destructive"
        >
          Failed to load place details: {error.message}
        </p>
      </div>
    );
  }

  // Shared content props
  const contentProps = {
    place: {
      ...place,
      street_address: detailedPlace?.street_address ?? place.street_address,
      locality: detailedPlace?.locality ?? place.locality,
      phone: detailedPlace?.phone ?? place.phone,
      website: detailedPlace?.website ?? place.website,
      price_level: detailedPlace?.price_level ?? place.price_level,
      rating: detailedPlace?.rating ?? place.rating,
    },
    userInteraction,
    menuItems,
    menuItemCount,
    hasMoreMenuItems,
    loadingMoreMenuItems,
    menuLoadMoreError,
    onLoadMoreMenuItems: loadMoreMenuItems,
    loadingDetails: loadingDetails && !detailedPlace,
    hasMenuItems,
    userId,
    onClose,
    refetch,
    setInteraction,
    enrichment,
    isEnriching,
    detailsPending,
    googlePhotos,
  } as const;

  // ── Desktop Layout ──────────────────────────────────────────────────

  if (isDesktop) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            transition={{ ...spring.sheet, opacity: tween("short") }}
            className="fixed top-0 z-[950] h-dvh w-[400px] cursor-default overflow-y-auto overscroll-contain border-line border-r bg-background shadow-xl"
            style={{ left: leftInset }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-auto flex h-full cursor-default flex-col overflow-hidden px-6 pt-20 pb-4">
              <PlaceDetailsContent
                {...contentProps}
                variant="desktop"
                drawerState="full"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ── Mobile Layout ───────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{
            y: 0,
            opacity: 1,
            height: getDragAdjustedHeight(drawerState, getDragOffset()),
          }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{
            ...spring.sheet,
            opacity: tween("short"),
            height: spring.sheet,
          }}
          className="fixed inset-x-0 z-[1100] cursor-default overflow-hidden overscroll-contain rounded-t-lg bg-background shadow-[0_-8px_32px_black] shadow-black/15"
          style={{ bottom: bottomInset }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div
            ref={drawerRef}
            data-drawer-content
            className="pointer-events-auto flex h-full cursor-default flex-col overflow-hidden p-0"
            onTouchEnd={handleTouchTap}
          >
            {/* Drag handle: a pointer-only grip, hidden from assistive tech
                (the drawer's own controls do the keyboard work). */}
            <div
              aria-hidden
              data-drag-handle
              className={cn(
                "group flex w-full touch-none select-none items-center justify-center py-3",
                isDragging ? "cursor-grabbing" : "cursor-grab",
              )}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <div
                className={cn(
                  "h-[5px] w-12 rounded-[3px] transition-[background-color,transform] duration-(--ca-dur-medium) ease-standard group-hover:scale-x-110 group-hover:bg-ink-2",
                  isDragging ? "bg-ink-2" : "bg-ink-3",
                )}
              />
            </div>

            {/* Content */}
            <div
              className="flex flex-1 flex-col overflow-hidden"
              style={{
                opacity: isDragging
                  ? Math.max(0.5, 1 - getDragOffset() / 200)
                  : 1,
              }}
            >
              <PlaceDetailsContent
                {...contentProps}
                variant="mobile"
                drawerState={drawerState}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
