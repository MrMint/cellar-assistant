"use client";

/**
 * `82450ad1:src/components/map/places/PlaceDetailsDrawer.tsx`, restored.
 * `GET_PLACE_DETAILS` + `usePlaceEnrichment` → `usePlaceDetails`. A map
 * marker (`MapPlace`) carries no address or contact block, so the drawer's
 * place is the marker merged with the detail read, which is where the old
 * adaptive-cluster rows had them.
 */

import { Alert, Box, CircularProgress } from "@mui/joy";
import { AnimatePresence, motion } from "framer-motion";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePlaceDetails } from "../hooks/usePlaceDetails";
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
}

export const PlaceDetailsDrawer = forwardRef<
  PlaceDetailsDrawerRef,
  PlaceDetailsDrawerProps
>(function PlaceDetailsDrawer({ place, open, onClose, userId }, ref) {
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
    fetching: loadingDetails,
    failure: error,
    refetch,
    setInteraction,
  } = usePlaceDetails(open ? place?.id : undefined);
  const hasMenuItems = menuItems.length > 0;

  // ── Drawer Height & Drag Logic ──────────────────────────────────────

  const MOBILE_NAV_HEIGHT = 50;

  const getDrawerHeight = (state: DrawerState) => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const availableHeight = vh - (isDesktop ? 0 : MOBILE_NAV_HEIGHT);
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
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert color="danger">
          Failed to load place details: {error.message}
        </Alert>
      </Box>
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
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 35,
              opacity: { duration: 0.15 },
            }}
            style={{
              position: "fixed",
              top: 0,
              left: hasSidebar ? 56 : 0,
              width: 400,
              height: "100dvh",
              backgroundColor: "var(--joy-palette-background-body)",
              boxShadow: "4px 0 20px rgba(0,0,0,0.08)",
              zIndex: 950,
              overflowY: "auto",
              borderRight: "1px solid var(--joy-palette-divider)",
              cursor: "default",
              overscrollBehavior: "contain",
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Box
              sx={{
                pt: 10,
                px: 3,
                pb: 2,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                pointerEvents: "auto",
                cursor: "default",
              }}
            >
              <PlaceDetailsContent
                {...contentProps}
                variant="desktop"
                drawerState="full"
              />
            </Box>
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
            type: "spring",
            stiffness: 550,
            damping: 40,
            opacity: { duration: 0.15 },
            height: { type: "spring", stiffness: 400, damping: 30 },
          }}
          style={{
            position: "fixed",
            bottom: MOBILE_NAV_HEIGHT,
            left: 0,
            right: 0,
            zIndex: 1100,
            backgroundColor: "var(--joy-palette-background-body)",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            boxShadow: "0 -8px 32px rgba(0,0,0,0.15)",
            cursor: "default",
            overflow: "hidden",
            overscrollBehavior: "contain",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <Box
            ref={drawerRef}
            data-drawer-content
            sx={{
              p: 0,
              display: "flex",
              flexDirection: "column",
              pointerEvents: "auto",
              cursor: "default",
              height: "100%",
              overflow: "hidden",
            }}
            onTouchEnd={handleTouchTap}
          >
            {/* Drag handle */}
            <Box
              data-drag-handle
              sx={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                py: 1.5,
                cursor: isDragging ? "grabbing" : "grab",
                userSelect: "none",
                touchAction: "none",
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <Box
                sx={{
                  width: 48,
                  height: 5,
                  backgroundColor: isDragging ? "neutral.500" : "neutral.400",
                  borderRadius: 3,
                  transition: "background-color 0.2s ease, transform 0.2s ease",
                  "&:hover": {
                    backgroundColor: "neutral.500",
                    transform: "scaleX(1.1)",
                  },
                }}
              />
            </Box>

            {/* Content */}
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
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
            </Box>
          </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
