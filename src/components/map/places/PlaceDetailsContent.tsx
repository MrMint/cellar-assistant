"use client";

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
import {
  MdCheckCircle,
  MdClose,
  MdCoffee,
  MdDirections,
  MdFavorite,
  MdFavoriteBorder,
  MdFormatListNumbered,
  MdLanguage,
  MdLocalBar,
  MdMenuBook,
  MdPhone,
  MdPlace,
  MdRadioButtonUnchecked,
  MdRestaurant,
  MdShare,
  MdSportsBar,
  MdStar,
  MdWineBar,
} from "react-icons/md";
import { useMutation } from "urql";
import { AddToTierListModal } from "@/components/tier-list/AddToTierListModal";
import type { PlaceEnrichment, PlaceGooglePhoto } from "@/types/places";
import { getNhostStorageUrl } from "@/utilities";
import { MARK_PLACE_VISITED, TOGGLE_FAVORITE_PLACE } from "../queries";
import {
  formatCategoryName,
  formatTimeString,
  getPriceLevelText,
} from "./place-utils";
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
  enrichment?: PlaceEnrichment | null;
  isEnriching?: boolean;
  googlePhotos?: PlaceGooglePhoto[];
}

// ── Formatting Utilities ───────────────────────────────────────────────

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

export function getCategoryIcon(category: string) {
  switch (category) {
    case "restaurant":
      return MdRestaurant;
    case "bar":
    case "pub":
      return MdLocalBar;
    case "cafe":
    case "coffee_shop":
      return MdCoffee;
    case "brewery":
      return MdSportsBar;
    case "winery":
      return MdWineBar;
    default:
      return MdPlace;
  }
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
  enrichment,
  isEnriching,
  googlePhotos,
}: PlaceDetailsContentProps) {
  // Merge Google enrichment data with existing place data (Google takes precedence)
  const mergedRating = enrichment?.rating ?? place.rating;
  const mergedPriceLevel = enrichment?.priceLevel ?? place.price_level;
  const mergedPhone = enrichment?.phone ?? place.phone;
  const mergedWebsite = enrichment?.website ?? place.website;
  const mergedPlace = {
    ...place,
    rating: mergedRating,
    price_level: mergedPriceLevel,
    phone: mergedPhone,
    website: mergedWebsite,
  };
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
    if (!mergedPlace.phone) return;
    const cleanPhone = mergedPlace.phone.replace(/[^\d+]/g, "");
    window.open(`tel:${cleanPhone}`, "_self");
  };

  const handleWebsite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!mergedPlace.website) return;
    let url = mergedPlace.website;
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
  const editorialSummary = enrichment?.editorialSummary;
  const ratingCount = enrichment?.userRatingsTotal;

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
          <MainCategoryIcon size={24} />
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
            {mergedPlace.rating && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <MdStar
                  size={16}
                  style={{ color: "var(--joy-palette-warning-400)" }}
                />
                <Typography level="body-sm" sx={{ fontWeight: "md" }}>
                  {mergedPlace.rating.toFixed(1)}
                  {ratingCount ? ` (${ratingCount})` : ""}
                </Typography>
              </Stack>
            )}
            {mergedPlace.price_level && (
              <Typography
                level="body-sm"
                sx={{ color: "success.600", fontWeight: "md" }}
              >
                {getPriceLevelText(mergedPlace.price_level)}
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
          <MdClose />
        </IconButton>
      </Stack>

      {/* Business Status Warning */}
      {!isCompact &&
        enrichment?.businessStatus &&
        (enrichment.businessStatus === "CLOSED_TEMPORARILY" ||
          enrichment.businessStatus === "CLOSED_PERMANENTLY") && (
          <Box sx={{ px: isDesktop ? 0 : 2, pb: 2 }}>
            <Alert
              color={
                enrichment.businessStatus === "CLOSED_PERMANENTLY"
                  ? "danger"
                  : "warning"
              }
              size="sm"
            >
              {enrichment.businessStatus === "CLOSED_PERMANENTLY"
                ? "This place is permanently closed"
                : "This place is temporarily closed"}
            </Alert>
          </Box>
        )}

      {/* Photo — hidden when collapsed */}
      {!isCompact &&
        (googlePhotos && googlePhotos.length > 0 ? (
          <Box sx={{ px: isDesktop ? 0 : 2, pb: 2 }}>
            <AspectRatio
              ratio={isDesktop ? "16/9" : "21/9"}
              sx={{ borderRadius: "md" }}
            >
              <Image
                src={getNhostStorageUrl(googlePhotos[0].storageFileId)}
                alt={place.name}
                fill
                sizes="(max-width: 600px) 100vw, 720px"
                style={{ objectFit: "cover" }}
              />
            </AspectRatio>
          </Box>
        ) : place.photos && place.photos.length > 0 ? (
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
        ) : null)}

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
            place={mergedPlace}
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
            place={mergedPlace}
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

      {/* Editorial Summary — from Google enrichment */}
      {!isCompact && editorialSummary && (
        <Box
          sx={{
            px: isDesktop ? 0 : 2,
            pb: 2,
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            level="body-sm"
            sx={{ color: "text.secondary", fontStyle: "italic" }}
          >
            {editorialSummary}
          </Typography>
        </Box>
      )}

      {/* Enriching indicator */}
      {isEnriching && (
        <Box
          sx={{
            px: isDesktop ? 0 : 2,
            pb: 1,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <CircularProgress
            size="sm"
            sx={{ "--CircularProgress-size": "14px" }}
          />
          <Typography level="body-xs" color="neutral">
            Loading additional details...
          </Typography>
        </Box>
      )}

      {/* Contact Info — hidden when collapsed */}
      {!isCompact && (mergedPlace.phone || mergedPlace.website) && (
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
            {mergedPlace.phone && (
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ cursor: "pointer" }}
                onClick={handleCall}
              >
                <MdPhone
                  size={20}
                  style={{ color: "var(--joy-palette-text-secondary)" }}
                />
                <Typography level="body-sm" sx={{ color: "primary.500" }}>
                  {mergedPlace.phone}
                </Typography>
              </Stack>
            )}
            {mergedPlace.website && (
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ cursor: "pointer" }}
                onClick={handleWebsite}
              >
                <MdLanguage
                  size={20}
                  style={{ color: "var(--joy-palette-text-secondary)" }}
                />
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
            <MdMenuBook
              size={20}
              style={{ color: "var(--joy-palette-text-secondary)" }}
            />
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

      {/* Google Attribution */}
      {!isCompact && enrichment && (
        <Box sx={{ px: isDesktop ? 0 : 2, pb: 1 }}>
          <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
            Powered by Google
          </Typography>
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
        userId={userId}
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
        startDecorator={<MdDirections />}
        fullWidth
        onClick={onDirections}
      >
        Directions
      </Button>

      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          color="neutral"
          startDecorator={<MdPhone />}
          disabled={!place.phone}
          sx={{ flex: 1 }}
          onClick={onCall}
        >
          Call
        </Button>
        <Button
          variant="outlined"
          color="neutral"
          startDecorator={<MdLanguage />}
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
            userInteraction?.is_favorite ? <MdFavorite /> : <MdFavoriteBorder />
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
              <MdCheckCircle />
            ) : (
              <MdRadioButtonUnchecked />
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
          startDecorator={<MdShare />}
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
        startDecorator={<MdDirections />}
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
            startDecorator={<MdPhone />}
            size="sm"
            disabled={!place.phone}
            onClick={onCall}
          >
            Call
          </Button>
          <Button
            variant="outlined"
            color="neutral"
            startDecorator={<MdLanguage />}
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
              {userInteraction?.is_favorite ? (
                <MdFavorite />
              ) : (
                <MdFavoriteBorder />
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
                <MdCheckCircle />
              ) : (
                <MdRadioButtonUnchecked />
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
              <MdShare />
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
