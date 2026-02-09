"use client";

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
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import Link from "next/link";
import type React from "react";
import { useState } from "react";
import { MdFormatListNumbered } from "react-icons/md";
import { useMutation } from "urql";
import { AddToTierListModal } from "@/components/tier-list/AddToTierListModal";
import { MARK_PLACE_VISITED, TOGGLE_FAVORITE_PLACE } from "../queries";
import { PlaceMenuItems } from "./PlaceMenuItems";

// ── Types ──────────────────────────────────────────────────────────────

export interface Place {
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

export type DrawerState = "collapsed" | "half" | "full";

interface UserInteraction {
  is_favorite?: boolean | null;
  is_visited?: boolean | null;
  visit_count?: number | null;
}

interface PlaceDetailsContentProps {
  place: Place;
  userInteraction?: UserInteraction;
  menuItems: React.ComponentProps<typeof PlaceMenuItems>["menuItems"];
  loadingDetails: boolean;
  hasMenuItems: boolean;
  userId: string;
  variant: "desktop" | "mobile";
  drawerState?: DrawerState;
  onClose: () => void;
  refetch: () => void;
}

// ── Formatting Utilities ───────────────────────────────────────────────

export function formatCategoryName(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatTimeString(time: string): string {
  const hours = Number.parseInt(time.slice(0, 2), 10);
  const minutes = time.slice(2);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${minutes} ${period}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getOpenStatusWithHours(openingHours: Place["opening_hours"]): {
  text: string;
  isOpen: boolean;
} {
  if (!openingHours) return { text: "", isOpen: false };
  const isOpen = openingHours.open_now ?? false;

  if (!openingHours.periods?.length) {
    return { text: isOpen ? "Open" : "Closed", isOpen };
  }

  const currentDay = new Date().getDay();
  const todayPeriods = openingHours.periods.filter(
    (p) => p.open.day === currentDay,
  );

  if (isOpen && todayPeriods.length > 0) {
    const currentPeriod = todayPeriods[0];
    if (currentPeriod.close) {
      return {
        text: `Open · Closes ${formatTimeString(currentPeriod.close.time)}`,
        isOpen: true,
      };
    }
    return { text: "Open 24 hours", isOpen: true };
  }

  if (!isOpen) {
    for (let offset = 0; offset <= 7; offset++) {
      const checkDay = (currentDay + offset) % 7;
      const dayPeriods = openingHours.periods.filter(
        (p) => p.open.day === checkDay,
      );
      if (dayPeriods.length > 0) {
        const label =
          offset === 0
            ? ""
            : offset === 1
              ? "tomorrow "
              : `${DAY_NAMES[checkDay]} `;
        return {
          text: `Closed · Opens ${label}${formatTimeString(dayPeriods[0].open.time)}`,
          isOpen: false,
        };
      }
    }
  }

  return { text: isOpen ? "Open" : "Closed", isOpen };
}

function getCategoryIcon(category: string) {
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
}

function getPriceLevelText(level?: number) {
  if (!level) return null;
  return "$".repeat(level);
}

// ── Component ──────────────────────────────────────────────────────────

export function PlaceDetailsContent({
  place,
  userInteraction,
  menuItems,
  loadingDetails,
  hasMenuItems,
  userId,
  variant,
  drawerState,
  onClose,
  refetch,
}: PlaceDetailsContentProps) {
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [isMarkingVisited, setIsMarkingVisited] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    color: "success" | "danger" | "neutral";
  } | null>(null);

  const [tierListModalOpen, setTierListModalOpen] = useState(false);

  const [, toggleFavorite] = useMutation(TOGGLE_FAVORITE_PLACE);
  const [, markVisited] = useMutation(MARK_PLACE_VISITED);

  const isDesktop = variant === "desktop";
  const isCompact = variant === "mobile" && drawerState === "collapsed";
  const isFullyExpanded = variant === "desktop" || drawerState === "full";

  // ── Action Handlers ────────────────────────────────────────────────

  const handleDirections = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!place.id) return;
    const address = place.street_address
      ? `${place.street_address}, ${place.locality ?? ""}`
      : place.name;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
      "_blank",
    );
  };

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!place.phone) return;
    const cleanPhone = place.phone.replace(/[^\d+]/g, "");
    window.open(`tel:${cleanPhone}`, "_self");
  };

  const handleWebsite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!place.website) return;
    let url = place.website;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    window.open(url, "_blank");
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!place.id) return;
    const placeUrl = `${window.location.origin}/places/${place.id}`;
    const shareData = {
      title: place.name,
      text: `Check out ${place.name}${place.street_address ? ` at ${place.street_address}` : ""}`,
      url: placeUrl,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          `${shareData.title}\n${shareData.text}\n${shareData.url}`,
        );
        setFeedback({ message: "Link copied to clipboard", color: "success" });
      }
    } catch {
      setFeedback({ message: "Failed to share", color: "danger" });
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId || !place.id) return;
    setIsTogglingFavorite(true);
    try {
      const result = await toggleFavorite({
        userId,
        placeId: place.id,
        isFavorite: !userInteraction?.is_favorite,
      });
      if (result.error) {
        setFeedback({
          message: "Failed to update favorite",
          color: "danger",
        });
      } else {
        setFeedback({
          message: userInteraction?.is_favorite
            ? "Removed from saved"
            : "Saved",
          color: "success",
        });
        refetch();
      }
    } catch {
      setFeedback({ message: "Failed to update favorite", color: "danger" });
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  const handleMarkVisited = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId || !place.id) return;
    setIsMarkingVisited(true);
    const willBeVisited = !userInteraction?.is_visited;
    try {
      const result = await markVisited({
        userId,
        placeId: place.id,
        isVisited: willBeVisited,
        visitedAt: new Date().toISOString(),
        visitCount: willBeVisited
          ? (userInteraction?.visit_count ?? 0) + 1
          : (userInteraction?.visit_count ?? 0),
      });
      if (result.error) {
        setFeedback({
          message: "Failed to update visited status",
          color: "danger",
        });
      } else {
        setFeedback({
          message: willBeVisited ? "Marked as visited" : "Unmarked",
          color: "success",
        });
        refetch();
      }
    } catch {
      setFeedback({
        message: "Failed to update visited status",
        color: "danger",
      });
    } finally {
      setIsMarkingVisited(false);
    }
  };

  // ── Derived Values ─────────────────────────────────────────────────

  const MainCategoryIcon = getCategoryIcon(
    place.primary_category ?? place.categories[0],
  );
  const openStatus = place.opening_hours
    ? getOpenStatusWithHours(place.opening_hours)
    : null;
  const maxCategories = isDesktop ? 4 : 3;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="flex-start"
        spacing={2}
        sx={{ px: isDesktop ? 0 : 2, pb: 2 }}
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
          <Link href={`/places/${place.id}`} style={{ textDecoration: "none" }}>
            <Typography
              level={isDesktop ? "h3" : "h4"}
              sx={{
                mb: 0.5,
                cursor: "pointer",
                "&:hover": { color: "primary.500" },
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
              <Stack direction="row" spacing={0.5} alignItems="center">
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
            {openStatus && (
              <Typography
                level="body-sm"
                sx={{
                  color: openStatus.isOpen ? "success.600" : "danger.600",
                  fontWeight: "md",
                }}
              >
                {openStatus.text}
              </Typography>
            )}
          </Stack>

          {place.street_address && (
            <Typography level="body-sm" sx={{ color: "text.secondary" }}>
              {place.street_address}
              {place.locality && `, ${place.locality}`}
            </Typography>
          )}
        </Box>

        <IconButton
          variant="soft"
          color="neutral"
          size={isDesktop ? "md" : "sm"}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close place details"
          sx={{ alignSelf: "flex-start" }}
        >
          <Close />
        </IconButton>
      </Stack>

      {/* Photo — hidden when collapsed */}
      {!isCompact && place.photos && place.photos.length > 0 && (
        <Box sx={{ px: isDesktop ? 0 : 2, pb: 2 }}>
          <AspectRatio
            ratio={isDesktop ? "16/9" : "21/9"}
            sx={{ borderRadius: "md" }}
          >
            <Image
              src={place.photos[0]}
              alt={place.name}
              fill
              style={{ objectFit: "cover" }}
            />
          </AspectRatio>
        </Box>
      )}

      {/* Categories — hidden when collapsed */}
      {!isCompact && place.categories.length > 0 && (
        <Box sx={{ px: isDesktop ? 0 : 2, pb: 2 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: "wrap", gap: isDesktop ? 1 : 0.5 }}
          >
            {place.categories.slice(0, maxCategories).map((category) => (
              <Chip key={category} variant="soft" color="neutral" size="sm">
                {formatCategoryName(category)}
              </Chip>
            ))}
            {place.categories.length > maxCategories && (
              <Chip variant="soft" color="neutral" size="sm">
                +{place.categories.length - maxCategories} more
              </Chip>
            )}
          </Stack>
        </Box>
      )}

      {/* Action Buttons — layout differs by variant */}
      <Box sx={{ px: isDesktop ? 0 : 2, pb: 2 }}>
        {isDesktop ? (
          <DesktopActions
            place={place}
            userInteraction={userInteraction}
            isTogglingFavorite={isTogglingFavorite}
            isMarkingVisited={isMarkingVisited}
            onDirections={handleDirections}
            onCall={handleCall}
            onWebsite={handleWebsite}
            onShare={handleShare}
            onToggleFavorite={handleToggleFavorite}
            onMarkVisited={handleMarkVisited}
            onAddToTierList={() => setTierListModalOpen(true)}
          />
        ) : (
          <MobileActions
            place={place}
            userInteraction={userInteraction}
            isCompact={isCompact}
            isTogglingFavorite={isTogglingFavorite}
            isMarkingVisited={isMarkingVisited}
            onDirections={handleDirections}
            onCall={handleCall}
            onWebsite={handleWebsite}
            onShare={handleShare}
            onToggleFavorite={handleToggleFavorite}
            onMarkVisited={handleMarkVisited}
            onAddToTierList={() => setTierListModalOpen(true)}
          />
        )}
      </Box>

      {/* Contact Info — hidden when collapsed */}
      {!isCompact && (place.phone || place.website) && (
        <Box
          sx={{
            px: isDesktop ? 0 : 2,
            pb: 2,
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack spacing={2}>
            {place.phone && (
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ cursor: "pointer" }}
                onClick={handleCall}
              >
                <Phone sx={{ fontSize: 20, color: "text.secondary" }} />
                <Typography level="body-sm" sx={{ color: "primary.500" }}>
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
                onClick={handleWebsite}
              >
                <Language sx={{ fontSize: 20, color: "text.secondary" }} />
                <Typography level="body-sm" sx={{ color: "primary.500" }}>
                  Visit website
                </Typography>
              </Stack>
            )}
          </Stack>
        </Box>
      )}

      {/* Menu Items — only when fully expanded */}
      {isFullyExpanded && (
        <Box
          sx={{
            px: isDesktop ? 0 : 2,
            pb: isDesktop ? 2 : 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            pt: isDesktop ? 3 : 2,
            flex: "1 1 0",
            display: "flex",
            flexDirection: "column",
            minHeight: hasMenuItems ? (isDesktop ? 250 : 200) : "auto",
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

          {loadingDetails ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size="sm" />
            </Box>
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

      {/* Feedback Snackbar */}
      <Snackbar
        open={feedback !== null}
        autoHideDuration={3000}
        onClose={() => setFeedback(null)}
        color={feedback?.color ?? "neutral"}
        variant="soft"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {feedback?.message}
      </Snackbar>

      {/* Add to Tier List Modal */}
      <AddToTierListModal
        open={tierListModalOpen}
        onClose={() => setTierListModalOpen(false)}
        placeId={place.id}
        placeName={place.name}
      />
    </>
  );
}

// ── Desktop Action Buttons ─────────────────────────────────────────────

interface ActionProps {
  place: Place;
  userInteraction?: UserInteraction;
  isTogglingFavorite: boolean;
  isMarkingVisited: boolean;
  onDirections: (e: React.MouseEvent) => void;
  onCall: (e: React.MouseEvent) => void;
  onWebsite: (e: React.MouseEvent) => void;
  onShare: (e: React.MouseEvent) => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onMarkVisited: (e: React.MouseEvent) => void;
  onAddToTierList: (e: React.MouseEvent) => void;
}

function DesktopActions({
  place,
  userInteraction,
  isTogglingFavorite,
  isMarkingVisited,
  onDirections,
  onCall,
  onWebsite,
  onShare,
  onToggleFavorite,
  onMarkVisited,
  onAddToTierList,
}: ActionProps) {
  return (
    <Stack spacing={2}>
      <Button
        variant="solid"
        color="primary"
        startDecorator={<Directions />}
        fullWidth
        onClick={onDirections}
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
          onClick={onCall}
        >
          Call
        </Button>
        <Button
          variant="outlined"
          color="neutral"
          startDecorator={<Language />}
          disabled={!place.website}
          sx={{ flex: 1 }}
          onClick={onWebsite}
        >
          Website
        </Button>
      </Stack>

      <Stack direction="row" spacing={1}>
        <Button
          variant={userInteraction?.is_favorite ? "solid" : "outlined"}
          color={userInteraction?.is_favorite ? "danger" : "neutral"}
          startDecorator={
            userInteraction?.is_favorite ? <Favorite /> : <FavoriteBorder />
          }
          onClick={onToggleFavorite}
          loading={isTogglingFavorite}
          disabled={isTogglingFavorite}
          sx={{ flex: 1 }}
        >
          {userInteraction?.is_favorite ? "Saved" : "Save"}
        </Button>
        <Button
          variant={userInteraction?.is_visited ? "solid" : "outlined"}
          color={userInteraction?.is_visited ? "success" : "neutral"}
          startDecorator={
            userInteraction?.is_visited ? (
              <CheckCircle />
            ) : (
              <RadioButtonUnchecked />
            )
          }
          onClick={onMarkVisited}
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
          onClick={onShare}
          sx={{ flex: 1 }}
        >
          Share
        </Button>
      </Stack>

      <Button
        variant="outlined"
        color="neutral"
        startDecorator={<MdFormatListNumbered />}
        fullWidth
        onClick={onAddToTierList}
      >
        Add to Tier List
      </Button>
    </Stack>
  );
}

// ── Mobile Action Buttons ──────────────────────────────────────────────

interface MobileActionProps extends ActionProps {
  isCompact: boolean;
}

function MobileActions({
  place,
  userInteraction,
  isCompact,
  isTogglingFavorite,
  isMarkingVisited,
  onDirections,
  onCall,
  onWebsite,
  onShare,
  onToggleFavorite,
  onMarkVisited,
  onAddToTierList,
}: MobileActionProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
      <Button
        variant="solid"
        color="primary"
        startDecorator={<Directions />}
        size="sm"
        sx={{ flex: "1 1 auto", minWidth: "fit-content" }}
        onClick={onDirections}
      >
        Directions
      </Button>

      {!isCompact && (
        <>
          <Button
            variant="outlined"
            color="neutral"
            startDecorator={<Phone />}
            size="sm"
            disabled={!place.phone}
            onClick={onCall}
          >
            Call
          </Button>
          <Button
            variant="outlined"
            color="neutral"
            startDecorator={<Language />}
            size="sm"
            disabled={!place.website}
            onClick={onWebsite}
          >
            Web
          </Button>

          <Tooltip
            title={userInteraction?.is_favorite ? "Remove from saved" : "Save"}
            placement="top"
          >
            <IconButton
              variant={userInteraction?.is_favorite ? "solid" : "outlined"}
              color={userInteraction?.is_favorite ? "danger" : "neutral"}
              size="sm"
              onClick={onToggleFavorite}
              loading={isTogglingFavorite}
              disabled={isTogglingFavorite}
              aria-label={
                userInteraction?.is_favorite ? "Remove from saved" : "Save"
              }
            >
              {userInteraction?.is_favorite ? <Favorite /> : <FavoriteBorder />}
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
              variant={userInteraction?.is_visited ? "solid" : "outlined"}
              color={userInteraction?.is_visited ? "success" : "neutral"}
              size="sm"
              onClick={onMarkVisited}
              loading={isMarkingVisited}
              disabled={isMarkingVisited}
              aria-label={
                userInteraction?.is_visited
                  ? "Mark as not visited"
                  : "Mark as visited"
              }
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
              onClick={onShare}
              aria-label="Share"
            >
              <Share />
            </IconButton>
          </Tooltip>

          <Tooltip title="Add to Tier List" placement="top">
            <IconButton
              variant="outlined"
              color="neutral"
              size="sm"
              onClick={onAddToTierList}
              aria-label="Add to Tier List"
            >
              <MdFormatListNumbered />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Stack>
  );
}
