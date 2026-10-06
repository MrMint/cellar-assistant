"use client";

/**
 * `82450ad1:src/components/map/places/PlaceDetails.tsx`, restored — the
 * `/places/[placeId]` page (Menu / Camera Scan / Info tabs).
 *
 * Data: one `PlaceDetailsQuery` through `usePlaceDetails` (adapter.ts) in
 * place of `GET_PLACE_DETAILS` + the server page's `GET_PLACE_ENRICHMENT`.
 * - The "On Lists" card was a server-rendered slot over `tier_list_items`
 *   (leaking private lists); it is `Place.tierListEntries` (G8) now, visible
 *   lists only, rendered by the restored `ItemTierLists`.
 * - The current menu is `Place.menuItems`: every line this place's scans
 *   wrote, which is what the old single `is_current` menu accumulated
 *   (`processMenuScan` appended each scan to it).
 * - Save / Mark Visited → `recordPlaceInteraction`; the visit count is the
 *   server's, not `visit_count + 1` computed here.
 * - Photos are the mirrored `Place.photos` (presigned, through `next/image`); Google's
 *   attribution blocks are printed with "Powered by Google".
 */

import {
  Alert,
  AspectRatio,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Snackbar,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  MdCheckCircle,
  MdCoffee,
  MdDirections,
  MdFavorite,
  MdFavoriteBorder,
  MdFormatListNumbered,
  MdLanguage,
  MdLocalBar,
  MdMap,
  MdPhone,
  MdPlace,
  MdRadioButtonUnchecked,
  MdRestaurant,
  MdSchedule,
  MdShare,
  MdSportsBar,
  MdStar,
  MdWineBar,
} from "react-icons/md";
import { Timestamp } from "@/components/common/Timestamp";
import { ItemTierLists } from "@/components/item/ItemTierLists";
import { AddToTierListModal } from "../../tier-list/AddToTierListModal";
import { usePlaceDetails } from "../hooks/usePlaceDetails";
import { MenuScanner } from "../scanning/MenuScanner";
import { GoogleAttribution } from "./GoogleAttribution";
import { PlaceMenuItems } from "./PlaceMenuItems";
import {
  formatCategoryName,
  formatTimeString,
  getPriceLevelText,
} from "./place-utils";

// ── Constants ──────────────────────────────────────────────────────────

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ── Utilities ──────────────────────────────────────────────────────────

function getCategoryIcon(category: string) {
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

// ── Sub-components ─────────────────────────────────────────────────────

/** Format an opening-hours point to a display string like "9:00 AM". */
function formatOpeningPoint(point: {
  hour?: number;
  minute?: number;
  time?: string;
}): string {
  // Google Places API (New): { hour, minute }
  if (point.hour != null) {
    const hours = point.hour;
    const minutes = String(point.minute ?? 0).padStart(2, "0");
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${minutes} ${period}`;
  }
  // Legacy format: { time: "0900" }
  if (point.time) {
    return formatTimeString(point.time);
  }
  return "";
}

function HoursDisplay({ hours }: { hours: unknown }) {
  if (typeof hours === "string") {
    return (
      <Typography level="body-sm" sx={{ mt: 1 }}>
        {hours}
      </Typography>
    );
  }

  // Google Places API (New) includes weekdayDescriptions — use them directly
  if (
    hours &&
    typeof hours === "object" &&
    "weekdayDescriptions" in hours &&
    Array.isArray(
      (hours as { weekdayDescriptions: unknown[] }).weekdayDescriptions,
    )
  ) {
    const descriptions = (hours as { weekdayDescriptions: string[] })
      .weekdayDescriptions;
    if (descriptions.length > 0) {
      return (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {descriptions.map((desc) => (
            <Typography
              key={desc}
              level="body-sm"
              sx={{ color: "text.secondary" }}
            >
              {desc}
            </Typography>
          ))}
        </Stack>
      );
    }
  }

  // Fall back to parsing periods
  if (
    hours &&
    typeof hours === "object" &&
    "periods" in hours &&
    Array.isArray((hours as { periods: unknown[] }).periods)
  ) {
    type HourPeriod = {
      open: { day: number; hour?: number; minute?: number; time?: string };
      close?: { day: number; hour?: number; minute?: number; time?: string };
    };
    const periods = (hours as { periods: HourPeriod[] }).periods;

    const byDay = new Map<number, HourPeriod[]>();
    for (const period of periods) {
      const day = period.open.day;
      const existing = byDay.get(day) ?? [];
      existing.push(period);
      byDay.set(day, existing);
    }

    return (
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        {Array.from({ length: 7 }, (_, i) => {
          const dayPeriods = byDay.get(i);
          return (
            <Stack key={DAY_NAMES[i]} direction="row" spacing={2}>
              <Typography
                level="body-sm"
                sx={{ minWidth: 90, fontWeight: "md" }}
              >
                {DAY_NAMES[i]}
              </Typography>
              <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                {dayPeriods
                  ? dayPeriods
                      .map(
                        (p) =>
                          `${formatOpeningPoint(p.open)}${p.close ? ` – ${formatOpeningPoint(p.close)}` : " – Open"}`,
                      )
                      .join(", ")
                  : "Closed"}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    );
  }

  return (
    <Typography level="body-sm" sx={{ mt: 1 }}>
      {String(hours)}
    </Typography>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

interface PlaceDetailsProps {
  placeId: string;
  /** The old `getServerUserId()`; unused — the API knows the viewer. */
  userId?: string;
}

export function PlaceDetails({ placeId, userId = "" }: PlaceDetailsProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [isMarkingVisited, setIsMarkingVisited] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    color: "success" | "danger" | "neutral";
  } | null>(null);
  const [tierListModalOpen, setTierListModalOpen] = useState(false);

  const {
    place: placeData,
    userInteraction,
    menuItems,
    enrichment,
    googlePhotos,
    tierListEntries,
    fetching,
    failure,
    isEnriching,
    refetch,
    setInteraction,
  } = usePlaceDetails(placeId);
  const currentMenu = menuItems.length > 0;

  // ── Action Handlers ────────────────────────────────────────────────

  const handleDirections = () => {
    if (!placeData) return;
    const address = placeData.street_address
      ? `${placeData.street_address}, ${placeData.locality ?? ""}`
      : placeData.name;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
      "_blank",
    );
  };

  const handleCall = () => {
    const phone = enrichment?.phone ?? placeData?.phone;
    if (!phone) return;
    const cleanPhone = phone.replace(/[^\d+]/g, "");
    window.open(`tel:${cleanPhone}`, "_self");
  };

  const handleWebsite = () => {
    const website = enrichment?.website ?? placeData?.website;
    if (!website) return;
    let url = website;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    window.open(url, "_blank");
  };

  const handleShare = async () => {
    if (!placeData) return;
    const placeUrl = `${window.location.origin}/places/${placeData.id}`;
    const shareData = {
      title: placeData.name,
      text: `Check out ${placeData.name}${placeData.street_address ? ` at ${placeData.street_address}` : ""}`,
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

  const handleToggleFavorite = async () => {
    if (!placeData) return;
    setIsTogglingFavorite(true);
    try {
      const error = await setInteraction({
        isFavorite: !userInteraction?.is_favorite,
      });
      if (error) {
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
      }
    } catch {
      setFeedback({ message: "Failed to update favorite", color: "danger" });
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  const handleMarkVisited = async () => {
    if (!placeData) return;
    setIsMarkingVisited(true);
    const willBeVisited = !userInteraction?.is_visited;
    try {
      const error = await setInteraction({ isVisited: willBeVisited });
      if (error) {
        setFeedback({
          message: "Failed to update visited status",
          color: "danger",
        });
      } else {
        setFeedback({
          message: willBeVisited ? "Marked as visited" : "Unmarked",
          color: "success",
        });
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

  // ── Loading / Error ────────────────────────────────────────────────

  if (fetching) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  // "Not found" and "not yours to see" are one state (§1.6).
  if (failure && failure.code !== "NOT_FOUND") {
    return (
      <Box sx={{ p: 2 }}>
        <Alert color="danger">
          Failed to load place details: {failure.message}
        </Alert>
      </Box>
    );
  }

  if (!placeData) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert color="warning">Place not found</Alert>
      </Box>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────

  // Merge Google enrichment data (Google takes precedence when available)
  const mergedRating = enrichment?.rating ?? placeData.rating;
  const mergedPriceLevel = enrichment?.priceLevel ?? placeData.price_level;
  const mergedPhone = enrichment?.phone ?? placeData.phone;
  const mergedWebsite = enrichment?.website ?? placeData.website;

  const openNow = (() => {
    const hours = enrichment?.openingHours;
    if (!hours || typeof hours !== "object") return null;
    const h = hours as Record<string, unknown>;
    // Google Places API (New) uses camelCase: openNow
    if ("openNow" in h) return (h.openNow as boolean) ?? null;
    // Legacy format uses snake_case: open_now
    if ("open_now" in h) return (h.open_now as boolean) ?? null;
    return null;
  })();

  const MainCategoryIcon = getCategoryIcon(
    placeData.primary_category ?? placeData.categories[0],
  );

  const fullAddress = [
    placeData.street_address,
    placeData.locality,
    placeData.region,
    placeData.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      {/* Hero Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Box
              sx={{
                p: 1.5,
                borderRadius: "md",
                backgroundColor: "primary.100",
                color: "primary.600",
                flexShrink: 0,
              }}
            >
              <MainCategoryIcon size={28} />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography level="h2" sx={{ mb: 0.5 }}>
                {placeData.name}
              </Typography>
              {placeData.display_name &&
                placeData.display_name !== placeData.name && (
                  <Typography
                    level="body-lg"
                    sx={{ color: "text.secondary", mb: 0.5 }}
                  >
                    {placeData.display_name}
                  </Typography>
                )}

              {/* Rating / Price / Review count row */}
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ mb: 1, flexWrap: "wrap" }}
              >
                {mergedRating != null && (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <MdStar
                      size={18}
                      style={{ color: "var(--joy-palette-warning-400)" }}
                    />
                    <Typography level="body-sm" sx={{ fontWeight: "md" }}>
                      {mergedRating.toFixed(1)}
                      {(enrichment?.userRatingsTotal ??
                        placeData.review_count) != null &&
                        ` (${enrichment?.userRatingsTotal ?? placeData.review_count})`}
                    </Typography>
                  </Stack>
                )}
                {mergedPriceLevel != null && (
                  <Typography
                    level="body-sm"
                    sx={{ color: "success.600", fontWeight: "md" }}
                  >
                    {getPriceLevelText(mergedPriceLevel)}
                  </Typography>
                )}
                {openNow != null && (
                  <Typography
                    level="body-sm"
                    sx={{
                      color: openNow ? "success.600" : "danger.600",
                      fontWeight: "md",
                    }}
                  >
                    {openNow ? "Open" : "Closed"}
                  </Typography>
                )}
                {isEnriching && (
                  <CircularProgress
                    size="sm"
                    sx={{ "--CircularProgress-size": "16px" }}
                  />
                )}
                {placeData.is_verified && (
                  <Chip size="sm" variant="soft" color="success">
                    Verified
                  </Chip>
                )}
              </Stack>

              {/* Address with map link */}
              {fullAddress && (
                <Link
                  href={`/map?placeId=${placeData.id}`}
                  style={{ textDecoration: "none" }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      cursor: "pointer",
                      "&:hover .address-text": { color: "primary.500" },
                    }}
                  >
                    <MdMap
                      size={18}
                      style={{
                        color: "var(--joy-palette-primary-500)",
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      className="address-text"
                      level="body-sm"
                      sx={{
                        color: "primary.600",
                        transition: "color 0.15s",
                      }}
                    >
                      {fullAddress}
                    </Typography>
                  </Stack>
                </Link>
              )}
            </Box>
          </Stack>

          {/* Categories */}
          {placeData.categories && placeData.categories.length > 0 && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}
            >
              {placeData.categories.map((category: string) => (
                <Chip key={category} variant="soft" color="neutral" size="sm">
                  {formatCategoryName(category)}
                </Chip>
              ))}
            </Stack>
          )}

          {/* Visit info */}
          {userInteraction?.last_visited_at && (
            <Typography level="body-xs" sx={{ mt: 2, color: "text.tertiary" }}>
              Last visited:{" "}
              <Timestamp
                iso={userInteraction.last_visited_at}
                precision="date"
              />
              {userInteraction.visit_count != null &&
                userInteraction.visit_count > 1 &&
                ` (${userInteraction.visit_count} visits)`}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Business Status Warning */}
      {enrichment?.businessStatus &&
        (enrichment.businessStatus === "CLOSED_TEMPORARILY" ||
          enrichment.businessStatus === "CLOSED_PERMANENTLY") && (
          <Alert
            color={
              enrichment.businessStatus === "CLOSED_PERMANENTLY"
                ? "danger"
                : "warning"
            }
            sx={{ mb: 3 }}
          >
            {enrichment.businessStatus === "CLOSED_PERMANENTLY"
              ? "This place is permanently closed"
              : "This place is temporarily closed"}
          </Alert>
        )}

      {/* Google Photo */}
      {googlePhotos[0]?.url && (
        <Card sx={{ mb: 3, p: 0, overflow: "hidden" }}>
          <AspectRatio ratio="16/9">
            <Image
              src={googlePhotos[0].url}
              alt={placeData.name}
              fill
              sizes="(max-width: 720px) 100vw, 720px"
              style={{ objectFit: "cover" }}
            />
          </AspectRatio>
        </Card>
      )}

      {/* Action Buttons */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={1.5}>
            <Button
              variant="solid"
              color="primary"
              startDecorator={<MdDirections />}
              fullWidth
              onClick={handleDirections}
            >
              Directions
            </Button>

            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                color="neutral"
                startDecorator={<MdPhone />}
                disabled={!mergedPhone}
                sx={{ flex: 1 }}
                onClick={handleCall}
              >
                Call
              </Button>
              <Button
                variant="outlined"
                color="neutral"
                startDecorator={<MdLanguage />}
                disabled={!mergedWebsite}
                sx={{ flex: 1 }}
                onClick={handleWebsite}
              >
                Website
              </Button>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                variant={userInteraction?.is_favorite ? "solid" : "outlined"}
                color={userInteraction?.is_favorite ? "danger" : "neutral"}
                startDecorator={
                  userInteraction?.is_favorite ? (
                    <MdFavorite />
                  ) : (
                    <MdFavoriteBorder />
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
                variant={userInteraction?.is_visited ? "solid" : "outlined"}
                color={userInteraction?.is_visited ? "success" : "neutral"}
                startDecorator={
                  userInteraction?.is_visited ? (
                    <MdCheckCircle />
                  ) : (
                    <MdRadioButtonUnchecked />
                  )
                }
                onClick={handleMarkVisited}
                loading={isMarkingVisited}
                disabled={isMarkingVisited}
                sx={{ flex: 1 }}
              >
                {userInteraction?.is_visited ? "Visited" : "Mark Visited"}
              </Button>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                color="neutral"
                startDecorator={<MdShare />}
                sx={{ flex: 1 }}
                onClick={handleShare}
              >
                Share
              </Button>
              <Button
                variant="outlined"
                color="neutral"
                startDecorator={<MdFormatListNumbered />}
                sx={{ flex: 1 }}
                onClick={() => setTierListModalOpen(true)}
              >
                Add to Tier List
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Editorial Summary */}
      {enrichment?.editorialSummary && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography level="body-md" sx={{ fontStyle: "italic" }}>
              {enrichment.editorialSummary}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Contact Info */}
      {(mergedPhone || mergedWebsite) && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack spacing={1.5}>
              {mergedPhone && (
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
                    {mergedPhone}
                  </Typography>
                </Stack>
              )}
              {mergedPhone && mergedWebsite && <Divider />}
              {mergedWebsite && (
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
                    {mergedWebsite
                      .replace(/^https?:\/\//, "")
                      .replace(/\/$/, "")}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Tier lists this place belongs to (G8: visible lists only) */}
      <Box sx={{ mb: 3 }}>
        <ItemTierLists entries={tierListEntries} />
      </Box>

      {/* Google Attribution (the Places terms require the blocks too) */}
      <GoogleAttribution
        enrichment={enrichment}
        photos={googlePhotos.slice(0, 1)}
      />

      {/* Content tabs */}
      <Card>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value as number)}
        >
          <TabList>
            <Tab>
              Menu
              {menuItems.length > 0 && (
                <Chip size="sm" variant="soft" color="primary" sx={{ ml: 1 }}>
                  {menuItems.length}
                </Chip>
              )}
            </Tab>
            <Tab>Camera Scan</Tab>
            <Tab>Info</Tab>
          </TabList>

          <TabPanel value={0}>
            {currentMenu ? (
              <PlaceMenuItems
                placeId={placeData.id}
                userId={userId}
                menuItems={menuItems}
              />
            ) : (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <MdRestaurant
                  size={48}
                  style={{
                    color: "var(--joy-palette-text-tertiary)",
                    marginBottom: 16,
                  }}
                />
                <Typography level="title-lg" sx={{ mb: 1 }}>
                  No menu discovered yet
                </Typography>
                <Typography level="body-md" sx={{ color: "text.secondary" }}>
                  Scan a menu at this location using the &quot;Camera Scan&quot;
                  tab above.
                </Typography>
              </Box>
            )}
          </TabPanel>

          <TabPanel value={1}>
            <MenuScanner
              placeId={placeData.id}
              userId={userId}
              onScanComplete={() => refetch()}
            />
          </TabPanel>

          <TabPanel value={2}>
            <Stack spacing={2}>
              {(enrichment?.openingHours ?? placeData.hours) != null && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography
                      level="title-md"
                      startDecorator={<MdSchedule />}
                    >
                      Hours
                    </Typography>
                    <HoursDisplay
                      hours={enrichment?.openingHours ?? placeData.hours}
                    />
                  </CardContent>
                </Card>
              )}

              <Card variant="outlined">
                <CardContent>
                  <Typography level="title-md">Details</Typography>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {placeData.primary_category && (
                      <Typography level="body-sm">
                        <strong>Primary Category:</strong>{" "}
                        {formatCategoryName(placeData.primary_category)}
                      </Typography>
                    )}
                    {placeData.categories &&
                      placeData.categories.length > 0 && (
                        <Typography level="body-sm">
                          <strong>Categories:</strong>{" "}
                          {placeData.categories
                            .map((c: string) => formatCategoryName(c))
                            .join(", ")}
                        </Typography>
                      )}
                    {placeData.confidence != null && (
                      <Typography level="body-sm">
                        <strong>Data Confidence:</strong>{" "}
                        {(placeData.confidence * 100).toFixed(0)}%
                      </Typography>
                    )}
                    {mergedPriceLevel != null && (
                      <Typography level="body-sm">
                        <strong>Price Level:</strong>{" "}
                        {"$".repeat(mergedPriceLevel)}
                      </Typography>
                    )}
                    {placeData.is_verified && (
                      <Typography level="body-sm">
                        <strong>Verified:</strong> Yes
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </TabPanel>
        </Tabs>
      </Card>

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
        entityId={placeData.id}
        entityType="place"
        entityName={placeData.name}
        userId={userId}
      />
    </Box>
  );
}
