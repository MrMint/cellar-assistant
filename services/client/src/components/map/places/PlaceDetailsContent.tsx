"use client";

/**
 * `82450ad1:src/components/map/places/PlaceDetailsContent.tsx`, restored —
 * the map drawer's body. Save / Mark Visited arrive as `setInteraction`
 * (`recordPlaceInteraction` via `usePlaceDetails`) instead of two Hasura
 * upserts with a client-computed visit count; photos are presigned reads through `next/image`;
 * Google's attribution blocks print with "Powered by Google".
 *
 * On shadcn (S8): the feedback Snackbar is `notify`, the tooltips are
 * `ui/tooltip` (hover devices; on touch the `aria-label` names the button).
 */

import Image from "next/image";
import type React from "react";
import { useState } from "react";
import { IconButton, type IconButtonProps } from "@/components/app/IconButton";
import {
  Close,
  Directions,
  ICON_STROKE,
  Love,
  Phone,
  Public,
  Ranked,
  Recipe,
  Share,
  Star,
  Success,
  Unrated,
  Warning,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { TogglePop } from "@/components/app/TogglePop";
import { AddToTierListModal } from "@/components/tier-list/AddToTierListModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WantToTryButton } from "@/components/want-to-try/WantToTryButton";
import { cn } from "@/lib/utils";
import type { MenuItemView } from "../adapter";
import { usePlaceToggles } from "../hooks/usePlaceToggles";
import type { PlaceEnrichment, PlaceGooglePhoto } from "../types/places";
import { GoogleAttribution } from "./GoogleAttribution";
import {
  LoveToggleButton,
  PlaceCategoryTile,
  VisitedToggleButton,
} from "./PlaceActionButtons";
import { PlaceMenuItems } from "./PlaceMenuItems";
import { PlaceReviewBadge } from "./PlaceReviewBadge";
import { isUnshared, type ReviewStatus } from "./place-review";
import {
  formatCategoryName,
  formatTimeString,
  getPriceLevelText,
} from "./place-utils";

// ── Types ──────────────────────────────────────────────────────────────

export interface Place {
  id: string;
  name: string;
  /** X27: PENDING / REJECTED reach only the person who added the place. */
  review_status?: ReviewStatus;
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
  /** X08/D11: on the viewer's Want to try list. */
  want_to_visit?: boolean | null;
  visit_count?: number | null;
}

interface PlaceDetailsContentProps {
  place: Place;
  userInteraction?: UserInteraction;
  menuItems: MenuItemView[];
  /** The menu's `totalCount` — every line, not just those loaded. */
  menuItemCount?: number;
  hasMoreMenuItems?: boolean;
  loadingMoreMenuItems?: boolean;
  menuLoadMoreError?: string | null;
  onLoadMoreMenuItems?: () => void;
  loadingDetails: boolean;
  hasMenuItems: boolean;
  userId: string;
  variant: "desktop" | "mobile";
  drawerState?: DrawerState;
  onClose: () => void;
  refetch: () => void;
  /** Resolves to an error message, or null on success. */
  setInteraction: (patch: {
    isFavorite?: boolean;
    isVisited?: boolean;
  }) => Promise<string | null>;
  enrichment?: PlaceEnrichment | null;
  /** N22: Google details on their way — a skeleton, for at most 8 s. */
  isEnriching?: boolean;
  /** N22/D16: details owed but not coming yet — "Details pending". */
  detailsPending?: boolean;
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

const CLOSED_COPY = {
  CLOSED_PERMANENTLY: "This place is permanently closed",
  CLOSED_TEMPORARILY: "This place is temporarily closed",
} as const;

// ── Component ──────────────────────────────────────────────────────────

export function PlaceDetailsContent({
  place,
  userInteraction,
  menuItems,
  menuItemCount,
  hasMoreMenuItems,
  loadingMoreMenuItems,
  menuLoadMoreError,
  onLoadMoreMenuItems,
  loadingDetails,
  hasMenuItems,
  userId,
  variant,
  drawerState,
  onClose,
  refetch,
  setInteraction,
  enrichment,
  isEnriching,
  detailsPending,
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
  const wantToTry = userInteraction?.want_to_visit === true;
  // Love / Mark Visited flip on the tap (X24); a refusal puts them back.
  const { love, visit } = usePlaceToggles({
    placeId: place.id,
    loved: !!userInteraction?.is_favorite,
    visited: !!userInteraction?.is_visited,
    wantToTry,
    setInteraction,
  });

  const [tierListModalOpen, setTierListModalOpen] = useState(false);

  const isDesktop = variant === "desktop";
  const isCompact = variant === "mobile" && drawerState === "collapsed";
  const isFullyExpanded = variant === "desktop" || drawerState === "full";
  /** The old `px: isDesktop ? 0 : 2` on every section. */
  const gutter = isDesktop ? undefined : "px-4";

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
        notify("Link copied to clipboard", { tone: "success" });
      }
    } catch {
      notify("Failed to share", { tone: "error" });
    }
  };

  // Inside the drawer a tap must not reach the drawer's own handlers.
  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!place.id) return;
    love.toggle();
  };

  const handleMarkVisited = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!place.id) return;
    visit.toggle();
  };

  // ── Derived Values ─────────────────────────────────────────────────

  const openStatus = place.opening_hours
    ? getOpenStatusWithHours(place.opening_hours)
    : null;
  const maxCategories = isDesktop ? 4 : 3;
  const editorialSummary = enrichment?.editorialSummary;
  const ratingCount = enrichment?.userRatingsTotal;
  const closedStatus =
    enrichment?.businessStatus === "CLOSED_TEMPORARILY" ||
    enrichment?.businessStatus === "CLOSED_PERMANENTLY"
      ? enrichment.businessStatus
      : null;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className={cn("flex flex-row items-start gap-4 pb-4", gutter)}>
        <PlaceCategoryTile
          category={place.primary_category ?? place.categories[0]}
        />

        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              "mb-1 text-ink-1",
              isDesktop ? "type-title-2" : "type-headline",
            )}
          >
            <Link href={`/places/${place.id}`} underline="hover">
              {place.name}
            </Link>
          </h2>
          <PlaceReviewBadge status={place.review_status} className="mb-2" />

          <div className="mb-2 flex flex-row flex-wrap items-center gap-x-4 gap-y-1">
            {mergedPlace.rating && (
              <span className="type-callout tabular flex flex-row items-center gap-1 font-medium text-ink-1">
                <Star
                  aria-hidden
                  strokeWidth={0}
                  className="size-4 fill-current text-ink-2"
                />
                {mergedPlace.rating.toFixed(1)}
                {ratingCount ? ` (${ratingCount})` : ""}
              </span>
            )}
            {mergedPlace.price_level && (
              <span className="type-callout font-medium text-success">
                {getPriceLevelText(mergedPlace.price_level)}
              </span>
            )}
            {openStatus && (
              <span
                className={cn(
                  "type-callout font-medium",
                  openStatus.isOpen ? "text-success" : "text-destructive",
                )}
              >
                {openStatus.text}
              </span>
            )}
          </div>

          {place.street_address && (
            <p className="type-callout text-ink-2">
              {place.street_address}
              {place.locality && `, ${place.locality}`}
            </p>
          )}
        </div>

        <IconButton
          variant="secondary"
          size={isDesktop ? "default" : "sm"}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close place details"
          className="self-start"
        >
          <Close />
        </IconButton>
      </div>

      {/* X27: what "Under review" means, and where the controls are */}
      {!isCompact && isUnshared(place.review_status) && (
        <p
          className={cn("type-footnote pb-4 text-ink-2", gutter)}
          data-testid="drawer-review-note"
        >
          {place.review_status === "PENDING"
            ? "Only you can see this place until it's been checked. "
            : "Only you can see this place. "}
          <Link href={`/places/${place.id}`} underline="always">
            {place.review_status === "PENDING" ? "Edit or delete" : "See why"}
          </Link>
        </p>
      )}

      {/* Business Status Warning */}
      {!isCompact && closedStatus && (
        <div className={cn("pb-4", gutter)}>
          <Alert
            variant={
              closedStatus === "CLOSED_PERMANENTLY" ? "destructive" : "default"
            }
          >
            <Warning aria-hidden />
            <AlertDescription>{CLOSED_COPY[closedStatus]}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Photo — hidden when collapsed */}
      {!isCompact && googlePhotos?.[0]?.url && (
        <div className={cn("pb-4", gutter)}>
          <div
            className={cn(
              "relative overflow-hidden rounded-md bg-surface-2",
              isDesktop ? "aspect-video" : "aspect-[21/9]",
            )}
          >
            <Image
              src={googlePhotos[0].url}
              alt={place.name}
              fill
              sizes="(max-width: 600px) 100vw, 720px"
              className="object-cover"
            />
          </div>
        </div>
      )}

      {/* Categories — hidden when collapsed */}
      {!isCompact && place.categories.length > 0 && (
        <div
          className={cn(
            "flex flex-row flex-wrap pb-4",
            isDesktop ? "gap-2" : "gap-1",
            gutter,
          )}
        >
          {place.categories.slice(0, maxCategories).map((category) => (
            <Badge key={category} variant="secondary">
              {formatCategoryName(category)}
            </Badge>
          ))}
          {place.categories.length > maxCategories && (
            <Badge variant="secondary">
              +{place.categories.length - maxCategories} more
            </Badge>
          )}
        </div>
      )}

      {/* Action Buttons — layout differs by variant */}
      <div className={cn("pb-4", gutter)}>
        {isDesktop ? (
          <DesktopActions
            place={mergedPlace}
            loved={love.on}
            visited={visit.on}
            wantToTry={wantToTry}
            isTogglingFavorite={love.pending}
            isMarkingVisited={visit.pending}
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
            loved={love.on}
            visited={visit.on}
            wantToTry={wantToTry}
            isCompact={isCompact}
            isTogglingFavorite={love.pending}
            isMarkingVisited={visit.pending}
            onDirections={handleDirections}
            onCall={handleCall}
            onWebsite={handleWebsite}
            onShare={handleShare}
            onToggleFavorite={handleToggleFavorite}
            onMarkVisited={handleMarkVisited}
            onAddToTierList={() => setTierListModalOpen(true)}
          />
        )}
      </div>

      {/* Editorial Summary — from Google enrichment */}
      {!isCompact && editorialSummary && (
        <div className={cn("border-line border-t py-4", gutter)}>
          <p className="type-callout text-ink-2 italic">{editorialSummary}</p>
        </div>
      )}

      {/* Google details: a skeleton for at most 8 s, then a calm line (N22) */}
      {isEnriching && (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading details"
          className={cn("flex flex-col gap-2 pb-2", gutter)}
        >
          <Skeleton className="h-4 w-[70%]" />
          <Skeleton className="h-4 w-[45%]" />
        </div>
      )}
      {!isEnriching && detailsPending && (
        <p className={cn("type-footnote pb-2", gutter)}>Details pending</p>
      )}

      {/* Contact Info — hidden when collapsed */}
      {!isCompact && (mergedPlace.phone || mergedPlace.website) && (
        <div className={cn("border-line border-t py-4", gutter)}>
          <div className="flex flex-col gap-2">
            {mergedPlace.phone && (
              <ContactRow icon={Phone} onClick={handleCall}>
                {mergedPlace.phone}
              </ContactRow>
            )}
            {mergedPlace.website && (
              <ContactRow icon={Public} onClick={handleWebsite}>
                Visit website
              </ContactRow>
            )}
          </div>
        </div>
      )}

      {/* Menu Items — only when fully expanded */}
      {isFullyExpanded && (
        <div
          className={cn(
            "flex flex-[1_1_0] flex-col overflow-hidden border-line border-t",
            isDesktop ? "pt-6 pb-4" : "pt-4 pb-3",
            hasMenuItems && (isDesktop ? "min-h-[250px]" : "min-h-[200px]"),
            gutter,
          )}
        >
          <div className="mb-4 flex shrink-0 flex-row items-center gap-2">
            <Recipe
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5 text-ink-2"
            />
            <h3 className="type-headline text-ink-1">Menu Items</h3>
            {hasMenuItems && (
              <Badge variant="secondary" className="tabular">
                {menuItemCount ?? menuItems.length}
              </Badge>
            )}
          </div>

          {loadingDetails ? (
            <div className="flex justify-center py-4">
              <Spinner className="size-6 text-ink-2" />
            </div>
          ) : hasMenuItems ? (
            <div
              data-scrollable-content
              className="pointer-events-auto h-full min-h-0 flex-[1_1_0] overflow-y-auto"
            >
              <PlaceMenuItems
                placeId={place.id}
                placeName={mergedPlace.name}
                userId={userId}
                onChanged={refetch}
                menuItems={menuItems}
                hasMore={hasMoreMenuItems}
                loadingMore={loadingMoreMenuItems}
                loadMoreError={menuLoadMoreError}
                onLoadMore={onLoadMoreMenuItems}
              />
            </div>
          ) : (
            <p className="type-callout flex flex-row flex-wrap gap-1 rounded-md bg-surface-1 px-4 py-3 text-ink-1">
              <span>No menu discovered yet.</span>
              <Link
                href={`/places/${place.id}`}
                underline="always"
                className="text-primary"
              >
                Scan a menu
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Google Attribution */}
      {!isCompact && enrichment && (
        <div className={cn("pb-2", gutter)}>
          <GoogleAttribution
            enrichment={enrichment}
            photos={googlePhotos?.slice(0, 1)}
            className="mb-0"
          />
        </div>
      )}

      {/* Add to Tier List Modal */}
      <AddToTierListModal
        open={tierListModalOpen}
        onClose={() => setTierListModalOpen(false)}
        entityId={place.id}
        entityType="place"
        entityName={place.name}
        userId={userId}
      />
    </>
  );
}

/** A tappable phone / website line (the old clickable `Stack`). */
function ContactRow({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Phone;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="type-callout flex min-h-11 flex-row items-center gap-4 rounded-sm text-left text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Icon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-ink-2"
      />
      {children}
    </button>
  );
}

// ── Desktop Action Buttons ─────────────────────────────────────────────

interface ActionProps {
  place: Place;
  /** The drawn (optimistic) Love and Visited states (X24). */
  loved: boolean;
  visited: boolean;
  /** On the viewer's Want to try list: the bookmark follows the server. */
  wantToTry: boolean;
  /** A write in flight: `aria-busy` only, never disabled, never a spinner. */
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
  loved,
  visited,
  wantToTry,
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
    <div className="flex flex-col gap-4">
      <Button className="w-full" onClick={onDirections}>
        <Directions aria-hidden />
        Directions
      </Button>

      <div className="flex flex-row gap-2">
        <Button
          variant="outline"
          disabled={!place.phone}
          className="flex-1"
          onClick={onCall}
        >
          <Phone aria-hidden />
          Call
        </Button>
        <Button
          variant="outline"
          disabled={!place.website}
          className="flex-1"
          onClick={onWebsite}
        >
          <Public aria-hidden />
          Website
        </Button>
      </div>

      <div className="flex flex-row gap-2">
        <WantToTryButton
          variant="button"
          target={{ kind: "PLACE", placeId: place.id }}
          saved={wantToTry}
          name={place.name}
          className="flex-1"
        />
        <VisitedToggleButton
          on={visited}
          pending={isMarkingVisited}
          onClick={onMarkVisited}
          className="flex-1"
        />
        <LoveToggleButton
          on={loved}
          pending={isTogglingFavorite}
          onClick={onToggleFavorite}
          className="flex-1"
        />
      </div>

      <Button variant="outline" className="w-full" onClick={onShare}>
        <Share aria-hidden />
        Share
      </Button>

      <Button variant="outline" className="w-full" onClick={onAddToTierList}>
        <Ranked aria-hidden />
        Add to Tier List
      </Button>
    </div>
  );
}

// ── Mobile Action Buttons ──────────────────────────────────────────────

interface MobileActionProps extends ActionProps {
  isCompact: boolean;
}

/** An icon-only action with its name as a hover tooltip (the old Joy one). */
function TipIconButton({
  label,
  children,
  ...props
}: Omit<IconButtonProps, "aria-label"> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton {...props} aria-label={label}>
          {children}
        </IconButton>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function MobileActions({
  place,
  loved,
  visited,
  wantToTry,
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
    <div className="flex flex-row flex-wrap gap-2">
      <Button className="min-w-fit flex-auto" onClick={onDirections}>
        <Directions aria-hidden />
        Directions
      </Button>

      {!isCompact && (
        <>
          <Button variant="outline" disabled={!place.phone} onClick={onCall}>
            <Phone aria-hidden />
            Call
          </Button>
          <Button
            variant="outline"
            disabled={!place.website}
            onClick={onWebsite}
          >
            <Public aria-hidden />
            Web
          </Button>

          {/* Save first (D27): the Want to try bookmark, then Love, then Log. */}
          <WantToTryButton
            framed
            target={{ kind: "PLACE", placeId: place.id }}
            saved={wantToTry}
            name={place.name}
          />

          <TipIconButton
            label="Love"
            aria-pressed={loved}
            variant={loved ? "secondary" : "outline"}
            onClick={onToggleFavorite}
            aria-busy={isTogglingFavorite || undefined}
          >
            <TogglePop on={loved} pop={isTogglingFavorite}>
              <Love className={loved ? "fill-brand text-brand" : undefined} />
            </TogglePop>
          </TipIconButton>

          <TipIconButton
            label={visited ? "Mark as not visited" : "Mark as visited"}
            variant={visited ? "secondary" : "outline"}
            onClick={onMarkVisited}
            aria-busy={isMarkingVisited || undefined}
          >
            <TogglePop on={visited} pop={isMarkingVisited}>
              {visited ? <Success className="text-success" /> : <Unrated />}
            </TogglePop>
          </TipIconButton>

          <TipIconButton label="Share" variant="outline" onClick={onShare}>
            <Share />
          </TipIconButton>

          <TipIconButton
            label="Add to Tier List"
            variant="outline"
            onClick={onAddToTierList}
          >
            <Ranked />
          </TipIconButton>
        </>
      )}
    </div>
  );
}
