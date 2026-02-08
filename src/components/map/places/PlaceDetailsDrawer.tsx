"use client";

import { readFragment } from "@cellar-assistant/shared/gql";
import {
  CheckCircle,
  Close,
  Coffee,
  Directions,
  Favorite,
  FavoriteBorder,
  Language,
  LocalBar,
  MenuBook,
  Phone,
  Place as PlaceIcon,
  RadioButtonUnchecked,
  Restaurant,
  Share,
  SportsBar,
  Star,
  WineBar as Wine,
} from "@mui/icons-material";
import {
  Alert,
  AspectRatio,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/joy";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "urql";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  PlaceDetailsFragment,
  PlaceWithMenuFragment,
} from "../../shared/fragments/place-fragments";
import {
  GET_PLACE_DETAILS,
  MARK_PLACE_VISITED,
  TOGGLE_FAVORITE_PLACE,
} from "../queries";
import { PlaceMenuItems } from "./PlaceMenuItems";

interface Place {
  id: string;
  name: string;
  primary_category?: string;
  categories: string[];
  street_address?: string;
  locality?: string;
  rating?: number;
  price_level?: number;
  phone?: string;
  website?: string;
  photos?: string[];
  opening_hours?: {
    open_now?: boolean;
    periods?: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
  };
}

interface PlaceDetailsDrawerProps {
  place: Place | null;
  open: boolean;
  onClose: () => void;
  userId: string;
}

type DrawerState = "collapsed" | "half" | "full";

export function PlaceDetailsDrawer({
  place,
  open,
  onClose,
  userId,
}: PlaceDetailsDrawerProps) {
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [isMarkingVisited, setIsMarkingVisited] = useState(false);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragCurrentY, setDragCurrentY] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isDesktop = useMediaQuery("(min-width: 769px)");
  const hasSidebar = useMediaQuery("(min-width: 600px)");
  const [drawerState, setDrawerState] = useState<DrawerState>("half");
  const [dragVelocity, setDragVelocity] = useState(0);
  const [lastDragTime, setLastDragTime] = useState(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const justDraggedRef = useRef(false); // Track if we just finished a drag to prevent tap handler interference

  // Fetch detailed place data with menu items
  const [{ data: placeDetails, fetching: loadingDetails, error }, refetch] =
    useQuery({
      query: GET_PLACE_DETAILS,
      variables: { id: place?.id ?? "" },
      pause: !place?.id,
    });

  // Mutation hooks
  const [, toggleFavorite] = useMutation(TOGGLE_FAVORITE_PLACE);
  const [, markVisited] = useMutation(MARK_PLACE_VISITED);

  // Get real place and user interaction data by unmasking fragments
  const placeRaw = placeDetails?.places_by_pk;
  const placeWithMenu = placeRaw
    ? readFragment(PlaceWithMenuFragment, placeRaw)
    : null;
  const detailedPlace = placeWithMenu
    ? readFragment(PlaceDetailsFragment, placeWithMenu)
    : null;
  const userInteraction = placeWithMenu?.user_place_interactions?.[0];

  // Get menu items from the unmasked fragment
  const currentMenu = placeWithMenu?.place_menus?.[0];
  const menuItems = currentMenu?.place_menu_items ?? [];
  const hasMenuItems = menuItems.length > 0;

  // Handler functions for action buttons
  const handleDirections = () => {
    if (!place?.id) return;

    const address = place.street_address
      ? `${place.street_address}, ${place.locality || ""}`
      : place.name;

    const encodedAddress = encodeURIComponent(address);

    // Try to open in Google Maps app first, fallback to web
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;

    window.open(googleMapsUrl, "_blank");
  };

  const handleCall = () => {
    if (!place?.phone) return;

    // Remove any non-numeric characters except + for international numbers
    const cleanPhone = place.phone.replace(/[^\d+]/g, "");
    window.open(`tel:${cleanPhone}`, "_self");
  };

  const handleWebsite = () => {
    if (!place?.website) return;

    // Ensure the URL has a protocol
    let url = place.website;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    window.open(url, "_blank");
  };

  const handleShare = async () => {
    if (!place?.id) return;

    const shareData = {
      title: place.name,
      text: `Check out ${place.name}${place.street_address ? ` at ${place.street_address}` : ""}`,
      url: window.location.href,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback to copying to clipboard
        const textToShare = `${shareData.title}\n${shareData.text}\n${shareData.url}`;

        if (navigator.clipboard) {
          await navigator.clipboard.writeText(textToShare);
          alert("Place details copied to clipboard!");
        } else {
          // Final fallback for older browsers
          const textArea = document.createElement("textarea");
          textArea.value = textToShare;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          alert("Place details copied to clipboard!");
        }
      }
    } catch (error) {
      console.error("Error sharing:", error);
      alert("Failed to share place details");
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent drawer state change
    if (!userId || !place?.id) return;

    setIsTogglingFavorite(true);
    try {
      const result = await toggleFavorite({
        userId,
        placeId: place.id,
        isFavorite: !userInteraction?.is_favorite,
      });

      if (result.error) {
        console.error("Error toggling favorite:", result.error);
        alert("Failed to update favorite status");
      } else {
        refetch();
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      alert("Failed to update favorite status");
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  const handleMarkVisited = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent drawer state change
    if (!userId || !place?.id) return;

    setIsMarkingVisited(true);
    try {
      const result = await markVisited({
        userId,
        placeId: place.id,
        isVisited: !userInteraction?.is_visited,
        visitedAt: new Date().toISOString(),
      });

      if (result.error) {
        console.error("Error marking visited:", result.error);
        alert("Failed to update visited status");
      } else {
        refetch();
      }
    } catch (error) {
      console.error("Error marking visited:", error);
      alert("Failed to update visited status");
    } finally {
      setIsMarkingVisited(false);
    }
  };

  // Drawer height calculations
  const MOBILE_NAV_HEIGHT = 50; // Height of bottom navigation bar (measured)
  const getDrawerHeight = (state: DrawerState) => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    // Account for bottom nav on mobile
    const availableHeight = vh - (isDesktop ? 0 : MOBILE_NAV_HEIGHT);
    switch (state) {
      case "collapsed":
        return availableHeight * 0.25; // 25% of available height
      case "half":
        return availableHeight * 0.5; // 50% of available height
      case "full":
        return availableHeight * 0.9; // 90% of available height
      default:
        return availableHeight * 0.5;
    }
  };

  // Get max height for the drawer
  const _getDrawerMaxHeight = () => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    return vh - MOBILE_NAV_HEIGHT - 100; // Leave some space at top for map visibility
  };

  const _getDrawerTransform = (dragOffset: number = 0) => {
    // For dragging down only, apply positive offset as transform
    // For dragging up, we'll handle it via height adjustment instead
    const downwardDragOffset = Math.max(0, dragOffset);
    return `translateY(${downwardDragOffset}px)`;
  };

  const getDragAdjustedHeight = (
    state: DrawerState,
    dragOffset: number = 0,
  ): number => {
    const baseHeight = getDrawerHeight(state);

    // For dragging up (negative offset), increase height to expand upward
    // For dragging down (positive offset), keep base height (transform handles movement)
    if (dragOffset < 0) {
      const expansionAmount = Math.abs(dragOffset);
      const maxHeight =
        typeof window !== "undefined" ? window.innerHeight * 0.9 : 720;
      return Math.min(baseHeight + expansionAmount, maxHeight);
    }

    return baseHeight;
  };


  // Handle entrance - set initial drawer state
  useEffect(() => {
    if (open) {
      setDrawerState("half"); // Always start in half state
    }
  }, [open]);

  // Handle drag to close - Touch events (for drag handle only)
  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStartY(e.touches[0].clientY);
    setDragCurrentY(e.touches[0].clientY);
    setIsDragging(false);
    setLastDragTime(Date.now());
    setDragVelocity(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartY === null) return;

    const currentY = e.touches[0].clientY;
    const now = Date.now();
    const timeDiff = now - lastDragTime;

    if (dragCurrentY !== null && timeDiff > 0) {
      const distance = currentY - dragCurrentY;
      setDragVelocity(distance / timeDiff);
    }

    setDragCurrentY(currentY);
    setIsDragging(true);
    setLastDragTime(now);
  };

  const handleTouchEnd = () => {
    // Mark that we just finished a drag to prevent tap handler interference
    if (isDragging) {
      justDraggedRef.current = true;
      // Reset after a short delay
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 100);
    }

    if (dragStartY !== null && dragCurrentY !== null) {
      const dragDistance = dragCurrentY - dragStartY;
      const velocity = Math.abs(dragVelocity);

      // Determine next state based on drag distance, velocity, and current state
      let nextState: DrawerState | "close" = drawerState;

      if (velocity > 0.5) {
        // Fast swipe - move to next/previous state based on direction
        if (dragDistance > 0) {
          // Swiping down
          nextState =
            drawerState === "full"
              ? "half"
              : drawerState === "half"
                ? "collapsed"
                : "close";
        } else {
          // Swiping up
          nextState =
            drawerState === "collapsed"
              ? "half"
              : drawerState === "half"
                ? "full"
                : "full";
        }
      } else {
        // Slow drag - threshold-based
        if (dragDistance > 80) {
          // Dragged down significantly
          nextState =
            drawerState === "full"
              ? "half"
              : drawerState === "half"
                ? "collapsed"
                : "close";
        } else if (dragDistance < -80) {
          // Dragged up significantly
          nextState =
            drawerState === "collapsed"
              ? "half"
              : drawerState === "half"
                ? "full"
                : "full";
        }
      }

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
  };

  // Handle drag to close - Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    setDragStartY(e.clientY);
    setDragCurrentY(e.clientY);
    setIsDragging(false);
    setLastDragTime(Date.now());
    setDragVelocity(0);
    e.preventDefault(); // Prevent text selection
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartY === null) return;

    const currentY = e.clientY;
    const now = Date.now();
    const timeDiff = now - lastDragTime;

    if (dragCurrentY !== null && timeDiff > 0) {
      const distance = currentY - dragCurrentY;
      setDragVelocity(distance / timeDiff);
    }

    setDragCurrentY(currentY);
    setIsDragging(true);
    setLastDragTime(now);
  };

  const handleMouseUp = useCallback(() => {
    // Mark that we just finished a drag to prevent click handler interference
    if (isDragging) {
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 100);
    }

    if (dragStartY !== null && dragCurrentY !== null) {
      const dragDistance = dragCurrentY - dragStartY;
      const velocity = Math.abs(dragVelocity);

      // Determine next state based on drag distance, velocity, and current state
      let nextState: DrawerState | "close" = drawerState;

      if (velocity > 0.5) {
        // Fast swipe - move to next/previous state based on direction
        if (dragDistance > 0) {
          // Swiping down
          nextState =
            drawerState === "full"
              ? "half"
              : drawerState === "half"
                ? "collapsed"
                : "close";
        } else {
          // Swiping up
          nextState =
            drawerState === "collapsed"
              ? "half"
              : drawerState === "half"
                ? "full"
                : "full";
        }
      } else {
        // Slow drag - threshold-based
        if (dragDistance > 80) {
          // Dragged down significantly
          nextState =
            drawerState === "full"
              ? "half"
              : drawerState === "half"
                ? "collapsed"
                : "close";
        } else if (dragDistance < -80) {
          // Dragged up significantly
          nextState =
            drawerState === "collapsed"
              ? "half"
              : drawerState === "half"
                ? "full"
                : "full";
        }
      }

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

  // Global mouse event handlers for drag continuation
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (dragStartY === null) return;

        const currentY = e.clientY;
        const now = Date.now();
        const timeDiff = now - lastDragTime;

        if (dragCurrentY !== null && timeDiff > 0) {
          const distance = currentY - dragCurrentY;
          setDragVelocity(distance / timeDiff);
        }

        setDragCurrentY(currentY);
        setLastDragTime(now);
      };

      const handleGlobalMouseUp = () => {
        handleMouseUp();
      };

      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleGlobalMouseMove);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [isDragging, dragStartY, dragCurrentY, lastDragTime, handleMouseUp]);

  // Calculate drag offset for animation
  const getDragOffset = () => {
    if (!isDragging || dragStartY === null || dragCurrentY === null) return 0;
    return dragCurrentY - dragStartY; // Allow both positive and negative values
  };

  // Handle background click to toggle drawer state (mouse only)
  const _handleBackgroundClick = (e: React.MouseEvent) => {
    // Only trigger if not dragging and no recent drag activity
    if (isDragging || dragStartY !== null || justDraggedRef.current) return;

    const target = e.target as HTMLElement;

    // Check if clicked element is interactive (buttons, inputs, etc.)
    const isInteractiveElement = target.closest(
      'button, input, select, textarea, a, [role="button"]',
    );

    // Check if clicked on scrollable content area
    const isScrollableContent = target.closest("[data-scrollable-content]");

    // Check if clicked on the drag handle (should not trigger state change)
    const isDragHandle = target.closest("[data-drag-handle]");

    // Only trigger state change if not clicking interactive elements, scrollable content, or drag handle
    if (!isInteractiveElement && !isScrollableContent && !isDragHandle) {
      if (drawerState === "full") {
        setDrawerState("half");
      } else if (drawerState === "collapsed") {
        setDrawerState("half");
      } else {
        setDrawerState("full");
      }
    }
  };

  // Simple touch tap handler
  const handleTouchTap = (e: React.TouchEvent) => {
    // Don't trigger if we just finished a drag operation
    if (justDraggedRef.current) return;

    const target = e.target as HTMLElement;

    // Check if tapped element is interactive (buttons, inputs, etc.)
    const isInteractiveElement = target.closest(
      'button, input, select, textarea, a, [role="button"]',
    );

    // Check if tapped on the drag handle (should trigger state change)
    const isDragHandle = target.closest("[data-drag-handle]");

    // Only trigger state change if tapping the drag handle specifically (not dragging)
    if (isDragHandle && !isInteractiveElement) {
      if (drawerState === "full") {
        setDrawerState("half");
      } else if (drawerState === "collapsed") {
        setDrawerState("half");
      } else {
        setDrawerState("full");
      }
    }
  };

  if (!place) return null;

  // Handle loading and error states
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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "restaurant":
        return Restaurant;
      case "bar":
      case "pub":
        return LocalBar;
      case "cafe":
      case "coffee_shop":
        return Coffee;
      case "brewery":
        return SportsBar;
      case "winery":
        return Wine;
      default:
        return PlaceIcon;
    }
  };

  const getPriceLevelText = (level?: number) => {
    if (!level) return null;
    return "$".repeat(level);
  };

  const getOpenStatusText = () => {
    if (!place.opening_hours?.open_now) return "Closed";
    return "Open";
  };

  // Format category name: replace underscores/spaces, title case
  const formatCategoryName = (category: string) => {
    return category
      .replace(/_/g, " ") // Replace all underscores with spaces
      .replace(/\s+/g, " ") // Normalize multiple spaces
      .trim()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const MainCategoryIcon = getCategoryIcon(
    place.primary_category || place.categories[0],
  );

  // Desktop layout
  if (isDesktop) {
    return (
      <>
        {/* Desktop left panel */}
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
                left: hasSidebar ? 56 : 0, // Account for nav bar width on desktop
                width: 400,
                height: "100vh",
                backgroundColor: "var(--joy-palette-background-body)",
                boxShadow: "4px 0 20px rgba(0,0,0,0.08)",
                zIndex: 950,
                overflowY: "auto",
                borderRight: "1px solid var(--joy-palette-divider)",
                cursor: "default",
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseMove={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              {/* Desktop content */}
              <Box
                sx={{
                  pt: 10, // Top padding to avoid search bar overlap (80px)
                  px: 3, // Padding to match other detail pages
                  pb: 2,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  pointerEvents: "auto",
                  cursor: "default",
                }}
              >
                {/* Header */}
                <Stack
                  direction="row"
                  alignItems="flex-start"
                  spacing={2}
                  sx={{ mb: 3 }}
                >
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: "md",
                      backgroundColor: "primary.100",
                      color: "primary.600",
                    }}
                  >
                    <MainCategoryIcon sx={{ fontSize: 24 }} />
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/places/${place.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <Typography
                        level="h3"
                        sx={{
                          mb: 0.5,
                          cursor: "pointer",
                          "&:hover": {
                            color: "primary.500",
                          },
                        }}
                      >
                        {place.name}
                      </Typography>
                    </Link>

                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      sx={{ mb: 1, flexWrap: "wrap" }}
                    >
                      {place.rating && (
                        <Stack
                          direction="row"
                          spacing={0.5}
                          alignItems="center"
                        >
                          <Star sx={{ fontSize: 16, color: "warning.400" }} />
                          <Typography level="body-sm" sx={{ fontWeight: "md" }}>
                            {place.rating.toFixed(1)}
                          </Typography>
                        </Stack>
                      )}

                      {place.price_level && (
                        <Typography
                          level="body-sm"
                          sx={{ color: "success.600", fontWeight: "md" }}
                        >
                          {getPriceLevelText(place.price_level)}
                        </Typography>
                      )}

                      {place.opening_hours && (
                        <Typography
                          level="body-sm"
                          sx={{
                            color: place.opening_hours.open_now
                              ? "success.600"
                              : "danger.600",
                            fontWeight: "md",
                          }}
                        >
                          {getOpenStatusText()}
                        </Typography>
                      )}
                    </Stack>

                    {place.street_address && (
                      <Typography
                        level="body-sm"
                        sx={{ color: "text.secondary" }}
                      >
                        {place.street_address}
                        {place.locality && `, ${place.locality}`}
                      </Typography>
                    )}
                  </Box>

                  <IconButton
                    variant="soft"
                    color="neutral"
                    onClick={onClose}
                    sx={{
                      alignSelf: "flex-start",
                      "&:hover": {
                        backgroundColor: "neutral.200",
                      },
                    }}
                  >
                    <Close />
                  </IconButton>
                </Stack>

                {/* Photo */}
                {place.photos && place.photos.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <AspectRatio ratio="16/9" sx={{ borderRadius: "md" }}>
                      <Image
                        src={place.photos[0]}
                        alt={place.name}
                        fill
                        style={{ objectFit: "cover" }}
                      />
                    </AspectRatio>
                  </Box>
                )}

                {/* Categories */}
                {place.categories.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ flexWrap: "wrap", gap: 1 }}
                    >
                      {place.categories.slice(0, 4).map((category) => (
                        <Chip
                          key={category}
                          variant="soft"
                          color="neutral"
                          size="sm"
                        >
                          {formatCategoryName(category)}
                        </Chip>
                      ))}
                      {place.categories.length > 4 && (
                        <Chip variant="soft" color="neutral" size="sm">
                          +{place.categories.length - 4} more
                        </Chip>
                      )}
                    </Stack>
                  </Box>
                )}

                {/* Action buttons */}
                <Stack spacing={2} sx={{ mb: 3 }}>
                  <Button
                    variant="solid"
                    color="primary"
                    startDecorator={<Directions />}
                    fullWidth
                  >
                    Directions
                  </Button>

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      color="neutral"
                      startDecorator={<Phone />}
                      disabled={!place.phone}
                      sx={{ flex: 1 }}
                    >
                      Call
                    </Button>

                    <Button
                      variant="outlined"
                      color="neutral"
                      startDecorator={<Language />}
                      disabled={!place.website}
                      sx={{ flex: 1 }}
                    >
                      Website
                    </Button>
                  </Stack>

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant={
                        userInteraction?.is_favorite ? "solid" : "outlined"
                      }
                      color={
                        userInteraction?.is_favorite ? "danger" : "neutral"
                      }
                      startDecorator={
                        userInteraction?.is_favorite ? (
                          <Favorite />
                        ) : (
                          <FavoriteBorder />
                        )
                      }
                      onClick={handleToggleFavorite}
                      loading={isTogglingFavorite}
                      disabled={isTogglingFavorite}
                      sx={{ flex: 1 }}
                    >
                      {userInteraction?.is_favorite ? "Saved" : "Save"}
                    </Button>

                    <Button
                      variant={
                        userInteraction?.is_visited ? "solid" : "outlined"
                      }
                      color={
                        userInteraction?.is_visited ? "success" : "neutral"
                      }
                      startDecorator={
                        userInteraction?.is_visited ? (
                          <CheckCircle />
                        ) : (
                          <RadioButtonUnchecked />
                        )
                      }
                      onClick={handleMarkVisited}
                      loading={isMarkingVisited}
                      disabled={isMarkingVisited}
                      sx={{ flex: 1 }}
                    >
                      {userInteraction?.is_visited ? "Visited" : "Mark Visited"}
                    </Button>

                    <Button
                      variant="outlined"
                      color="neutral"
                      startDecorator={<Share />}
                      onClick={handleShare}
                      sx={{ flex: 1 }}
                    >
                      Share
                    </Button>
                  </Stack>
                </Stack>

                {/* Additional info */}
                {(place.phone || place.website) && (
                  <Box
                    sx={{
                      pt: 2,
                      borderTop: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Stack spacing={2}>
                      {place.phone && (
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Phone
                            sx={{ fontSize: 20, color: "text.secondary" }}
                          />
                          <Typography level="body-sm">{place.phone}</Typography>
                        </Stack>
                      )}

                      {place.website && (
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Language
                            sx={{ fontSize: 20, color: "text.secondary" }}
                          />
                          <Typography
                            level="body-sm"
                            sx={{ color: "primary.500" }}
                          >
                            Visit website
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                )}

                {/* Menu Items Section */}
                <Box
                  sx={{
                    pt: 3,
                    borderTop: "1px solid",
                    borderColor: "divider",
                    flex: "1 1 0",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 250,
                    overflow: "hidden",
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ mb: 2, flexShrink: 0 }}
                  >
                    <MenuBook sx={{ fontSize: 20, color: "text.secondary" }} />
                    <Typography level="title-md">Menu Items</Typography>
                    {hasMenuItems && (
                      <Chip size="sm" variant="soft" color="primary">
                        {menuItems.length}
                      </Chip>
                    )}
                  </Stack>

                  {loadingDetails && !detailedPlace ? (
                    <Box
                      sx={{ display: "flex", justifyContent: "center", py: 2 }}
                    >
                      <CircularProgress size="sm" />
                    </Box>
                  ) : !detailedPlace ? (
                    <Alert color="warning" size="sm">
                      Failed to load menu items
                    </Alert>
                  ) : hasMenuItems ? (
                    <Box
                      sx={{
                        flex: "1 1 0",
                        overflowY: "auto",
                        minHeight: 0,
                        height: "100%",
                        pointerEvents: "auto",
                      }}
                    >
                      <PlaceMenuItems
                        placeId={place.id}
                        userId={userId}
                        menuItems={menuItems}
                      />
                    </Box>
                  ) : (
                    <Alert
                      color="neutral"
                      size="sm"
                      sx={{
                        "& .MuiAlert-message": {
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 0.5,
                        },
                      }}
                    >
                      <Typography level="body-sm" component="span">
                        No menu discovered yet.
                      </Typography>
                      <Link
                        href={`/places/${place.id}`}
                        style={{
                          color: "var(--joy-palette-primary-500)",
                          textDecoration: "underline",
                        }}
                      >
                        <Typography level="body-sm" component="span">
                          Scan a menu
                        </Typography>
                      </Link>
                    </Alert>
                  )}
                </Box>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Mobile layout
  return (
    <>
      {/* Custom backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.2)",
              zIndex: 1099, // Just below the drawer
            }}
          />
        )}
      </AnimatePresence>

      {/* Custom drawer container */}
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
              bottom: MOBILE_NAV_HEIGHT, // Position above nav bar
              left: 0,
              right: 0,
              zIndex: 1100, // Above map elements, below modals
              backgroundColor: "var(--joy-palette-background-body)",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              boxShadow: "0 -8px 32px rgba(0,0,0,0.15)",
              cursor: "default",
              overflow: "hidden",
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
              {/* Drag handle - more visible */}
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
                    transition:
                      "background-color 0.2s ease, transform 0.2s ease",
                    "&:hover": {
                      backgroundColor: "neutral.500",
                      transform: "scaleX(1.1)",
                    },
                  }}
                />
              </Box>

              {/* Header */}
              <Box
                sx={{
                  px: 2,
                  pb: 2,
                  opacity: isDragging
                    ? Math.max(0.5, 1 - getDragOffset() / 200)
                    : 1,
                }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={2}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: "md",
                      backgroundColor: "primary.100",
                      color: "primary.600",
                    }}
                  >
                    <MainCategoryIcon sx={{ fontSize: 24 }} />
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/places/${place.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <Typography
                        level="h4"
                        sx={{
                          mb: 0.5,
                          cursor: "pointer",
                          "&:hover": {
                            color: "primary.500",
                          },
                        }}
                      >
                        {place.name}
                      </Typography>
                    </Link>

                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      sx={{ mb: 1 }}
                    >
                      {place.rating && (
                        <Stack
                          direction="row"
                          spacing={0.5}
                          alignItems="center"
                        >
                          <Star sx={{ fontSize: 16, color: "warning.400" }} />
                          <Typography level="body-sm" sx={{ fontWeight: "md" }}>
                            {place.rating.toFixed(1)}
                          </Typography>
                        </Stack>
                      )}

                      {place.price_level && (
                        <Typography
                          level="body-sm"
                          sx={{ color: "success.600", fontWeight: "md" }}
                        >
                          {getPriceLevelText(place.price_level)}
                        </Typography>
                      )}

                      {place.opening_hours && (
                        <Typography
                          level="body-sm"
                          sx={{
                            color: place.opening_hours.open_now
                              ? "success.600"
                              : "danger.600",
                            fontWeight: "md",
                          }}
                        >
                          {getOpenStatusText()}
                        </Typography>
                      )}
                    </Stack>

                    {place.street_address && (
                      <Typography
                        level="body-sm"
                        sx={{ color: "text.secondary" }}
                      >
                        {place.street_address}
                        {place.locality && `, ${place.locality}`}
                      </Typography>
                    )}
                  </Box>

                  <IconButton
                    variant="soft"
                    color="neutral"
                    onClick={onClose}
                    size="sm"
                    sx={{
                      alignSelf: "flex-start",
                      "&:hover": {
                        backgroundColor: "neutral.200",
                      },
                    }}
                  >
                    <Close />
                  </IconButton>
                </Stack>
              </Box>

              {/* Photo */}
              {place.photos && place.photos.length > 0 && (
                <Box
                  sx={{
                    px: 2,
                    pb: 2,
                    opacity: isDragging
                      ? Math.max(0.3, 1 - getDragOffset() / 150)
                      : 1,
                  }}
                >
                  <AspectRatio ratio="21/9" sx={{ borderRadius: "md" }}>
                    <Image
                      src={place.photos[0]}
                      alt={place.name}
                      fill
                      style={{ objectFit: "cover" }}
                    />
                  </AspectRatio>
                </Box>
              )}

              {/* Categories */}
              {place.categories.length > 0 && (
                <Box sx={{ px: 2, pb: 2 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ flexWrap: "wrap", gap: 0.5 }}
                  >
                    {place.categories.slice(0, 3).map((category) => (
                      <Chip
                        key={category}
                        variant="soft"
                        color="neutral"
                        size="sm"
                      >
                        {formatCategoryName(category)}
                      </Chip>
                    ))}
                    {place.categories.length > 3 && (
                      <Chip variant="soft" color="neutral" size="sm">
                        +{place.categories.length - 3}
                      </Chip>
                    )}
                  </Stack>
                </Box>
              )}

              {/* Action buttons */}
              <Box
                sx={{
                  px: 2,
                  pb: 2,
                  opacity: isDragging
                    ? Math.max(0.6, 1 - getDragOffset() / 180)
                    : 1,
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ flexWrap: "wrap", gap: 1 }}
                >
                  <Button
                    variant="solid"
                    color="primary"
                    startDecorator={<Directions />}
                    size="sm"
                    sx={{ flex: "1 1 auto", minWidth: "fit-content" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDirections();
                    }}
                  >
                    Directions
                  </Button>

                  <Button
                    variant="outlined"
                    color="neutral"
                    startDecorator={<Phone />}
                    size="sm"
                    disabled={!place.phone}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCall();
                    }}
                  >
                    Call
                  </Button>

                  <Button
                    variant="outlined"
                    color="neutral"
                    startDecorator={<Language />}
                    size="sm"
                    disabled={!place.website}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWebsite();
                    }}
                  >
                    Web
                  </Button>

                  <Tooltip
                    title={
                      userInteraction?.is_favorite
                        ? "Remove from saved"
                        : "Save"
                    }
                    placement="top"
                  >
                    <IconButton
                      variant={
                        userInteraction?.is_favorite ? "solid" : "outlined"
                      }
                      color={
                        userInteraction?.is_favorite ? "danger" : "neutral"
                      }
                      size="sm"
                      onClick={handleToggleFavorite}
                      loading={isTogglingFavorite}
                      disabled={isTogglingFavorite}
                    >
                      {userInteraction?.is_favorite ? (
                        <Favorite />
                      ) : (
                        <FavoriteBorder />
                      )}
                    </IconButton>
                  </Tooltip>

                  <Tooltip
                    title={
                      userInteraction?.is_visited
                        ? "Mark as not visited"
                        : "Mark as visited"
                    }
                    placement="top"
                  >
                    <IconButton
                      variant={
                        userInteraction?.is_visited ? "solid" : "outlined"
                      }
                      color={
                        userInteraction?.is_visited ? "success" : "neutral"
                      }
                      size="sm"
                      onClick={handleMarkVisited}
                      loading={isMarkingVisited}
                      disabled={isMarkingVisited}
                    >
                      {userInteraction?.is_visited ? (
                        <CheckCircle />
                      ) : (
                        <RadioButtonUnchecked />
                      )}
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Share" placement="top">
                    <IconButton
                      variant="outlined"
                      color="neutral"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare();
                      }}
                    >
                      <Share />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>

              {/* Additional info */}
              {(place.phone || place.website) && (
                <Box
                  sx={{
                    px: 2,
                    pb: 2,
                    borderTop: "1px solid",
                    borderColor: "divider",
                    pt: 2,
                  }}
                >
                  <Stack spacing={2}>
                    {place.phone && (
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        sx={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCall();
                        }}
                      >
                        <Phone sx={{ fontSize: 20, color: "text.secondary" }} />
                        <Typography
                          level="body-sm"
                          sx={{ color: "primary.500" }}
                        >
                          {place.phone}
                        </Typography>
                      </Stack>
                    )}

                    {place.website && (
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        sx={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWebsite();
                        }}
                      >
                        <Language
                          sx={{ fontSize: 20, color: "text.secondary" }}
                        />
                        <Typography
                          level="body-sm"
                          sx={{ color: "primary.500" }}
                        >
                          Visit website
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                </Box>
              )}

              {/* Menu Items Section */}
              {(hasMenuItems || (!loadingDetails && detailedPlace)) && (
                <Box
                  sx={{
                    px: 2,
                    pb: 1.5, // Reduced padding for tighter fit
                    borderTop: "1px solid",
                    borderColor: "divider",
                    pt: 2,
                    flex: "1 1 0", // Always stretch to fill remaining space
                    display: "flex",
                    flexDirection: "column",
                    minHeight: hasMenuItems ? 200 : "auto",
                    overflow: "hidden",
                  }}
                >
                  {hasMenuItems && (
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ mb: 2, flexShrink: 0 }}
                    >
                      <MenuBook
                        sx={{ fontSize: 20, color: "text.secondary" }}
                      />
                      <Typography level="title-md">Menu Items</Typography>
                      <Chip size="sm" variant="soft" color="primary">
                        {menuItems.length}
                      </Chip>
                    </Stack>
                  )}

                  {loadingDetails && !detailedPlace ? (
                    <Box
                      sx={{ display: "flex", justifyContent: "center", py: 2 }}
                    >
                      <CircularProgress size="sm" />
                    </Box>
                  ) : !detailedPlace ? (
                    <Alert color="warning" size="sm">
                      Failed to load menu items
                    </Alert>
                  ) : hasMenuItems ? (
                    <Box
                      data-scrollable-content
                      sx={{
                        flex: "1 1 0",
                        overflowY: "auto",
                        minHeight: 0,
                        height: "100%",
                        pointerEvents: "auto",
                      }}
                    >
                      <PlaceMenuItems
                        placeId={place.id}
                        userId={userId}
                        menuItems={menuItems}
                      />
                    </Box>
                  ) : (
                    <Alert
                      color="neutral"
                      size="sm"
                      sx={{
                        "& .MuiAlert-message": {
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 0.5,
                        },
                      }}
                    >
                      <Typography level="body-sm" component="span">
                        No menu discovered yet.
                      </Typography>
                      <Link
                        href={`/places/${place.id}`}
                        style={{
                          color: "var(--joy-palette-primary-500)",
                          textDecoration: "underline",
                        }}
                      >
                        <Typography level="body-sm" component="span">
                          Scan a menu
                        </Typography>
                      </Link>
                    </Alert>
                  )}
                </Box>
              )}
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
