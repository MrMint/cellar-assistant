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
 *
 * On shadcn (S8, parity only — X20 rebuilds this page): the Joy cards are
 * borderless `surface-1` sections, the tabs are `ui/tabs`, and the feedback
 * Snackbar is `notify`.
 */

import Image from "next/image";
import { type ReactNode, useState } from "react";
import {
  Directions,
  ICON_STROKE,
  MapIcon,
  Phone,
  Public,
  Ranked,
  Restaurant,
  Schedule,
  Share,
  Star,
  Warning,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { Page } from "@/components/app/Page";
import { Timestamp } from "@/components/common/Timestamp";
import { ItemTierLists } from "@/components/item/ItemTierLists";
import { NotFoundMessage } from "@/components/shell/NotFoundMessage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WantToTryButton } from "@/components/want-to-try/WantToTryButton";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { cn } from "@/lib/utils";
import { AddToTierListModal } from "../../tier-list/AddToTierListModal";
import { usePlaceDetails } from "../hooks/usePlaceDetails";
import { usePlaceToggles } from "../hooks/usePlaceToggles";
import { MenuScanner } from "../scanning/MenuScanner";
import { GoogleAttribution } from "./GoogleAttribution";
import {
  LoveToggleButton,
  PlaceCategoryTile,
  VisitedToggleButton,
} from "./PlaceActionButtons";
import { PlaceDetailsShell, type PlaceHero } from "./PlaceDetailsShell";
import { PlaceMenuItems } from "./PlaceMenuItems";
import { PlaceReviewPanel } from "./PlaceReviewPanel";
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

type PlaceTab = "menu" | "scan" | "info";

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
    return <p className="type-callout mt-2 text-ink-1">{hours}</p>;
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
        <ul className="mt-2 flex flex-col gap-1">
          {descriptions.map((desc) => (
            <li key={desc} className="type-callout text-ink-2">
              {desc}
            </li>
          ))}
        </ul>
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
      <dl className="mt-2 flex flex-col gap-1">
        {Array.from({ length: 7 }, (_, i) => {
          const dayPeriods = byDay.get(i);
          return (
            <div key={DAY_NAMES[i]} className="flex flex-row gap-4">
              <dt className="type-callout min-w-[90px] font-medium text-ink-1">
                {DAY_NAMES[i]}
              </dt>
              <dd className="type-callout tabular text-ink-2">
                {dayPeriods
                  ? dayPeriods
                      .map(
                        (p) =>
                          `${formatOpeningPoint(p.open)}${p.close ? ` – ${formatOpeningPoint(p.close)}` : " – Open"}`,
                      )
                      .join(", ")
                  : "Closed"}
              </dd>
            </div>
          );
        })}
      </dl>
    );
  }

  return <p className="type-callout mt-2 text-ink-1">{String(hours)}</p>;
}

/** A borderless section surface — the old Joy `Card` (design §3.3). */
function Section({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg bg-surface-1 p-4", className)}>
      {children}
    </section>
  );
}

/** A tappable phone / website line (the old clickable `Stack`). */
function ContactRow({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Phone;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="type-callout flex min-h-11 w-full flex-row items-center gap-4 rounded-sm text-left text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Icon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-ink-2"
      />
      <span className="min-w-0 break-all">{children}</span>
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

interface PlaceDetailsProps {
  placeId: string;
  /**
   * The name and category the server already read (X24): drawn in the
   * loading shell while the full read is on its way.
   */
  hero?: PlaceHero;
  /** The old `getServerUserId()`; unused — the API knows the viewer. */
  userId?: string;
}

export function PlaceDetails({
  placeId,
  hero,
  userId = "",
}: PlaceDetailsProps) {
  const [activeTab, setActiveTab] = useState<PlaceTab>("menu");
  // N07/D25: menu scanning is hidden, not refused, where no AI can read one.
  // A tab picked before the answer arrived falls back to Menu if it hides.
  const menuScanOffered = isOffered(useAiCapabilities(), "menuScan");
  const [tierListModalOpen, setTierListModalOpen] = useState(false);

  const {
    place: placeData,
    userInteraction,
    menuItems,
    menuItemCount,
    hasMoreMenuItems,
    loadingMoreMenuItems,
    menuLoadMoreError,
    loadMoreMenuItems,
    enrichment,
    googlePhotos,
    tierListEntries,
    fetching,
    failure,
    isEnriching,
    detailsPending,
    refetch,
    setInteraction,
  } = usePlaceDetails(placeId);
  const currentMenu = menuItems.length > 0;
  // Love / Mark Visited flip on the tap (X24); a refusal puts them back.
  const { love, visit } = usePlaceToggles({
    placeId: placeData?.id,
    loved: !!userInteraction?.is_favorite,
    visited: !!userInteraction?.is_visited,
    wantToTry: userInteraction?.want_to_visit === true,
    setInteraction,
  });

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
        notify("Link copied to clipboard", { tone: "success" });
      }
    } catch {
      notify("Failed to share", { tone: "error" });
    }
  };

  // ── Loading / Error ────────────────────────────────────────────────

  if (fetching) {
    // The route's shell, now with the real hero (X24) — not a spinner.
    return <PlaceDetailsShell hero={hero} />;
  }

  // "Not found" and "not yours to see" are one state (§1.6).
  if (failure && failure.code !== "NOT_FOUND") {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load place details: {failure.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // The page 404s a missing place on the server; this is the same message
  // for one that disappears while the page is open (D24).
  if (!placeData) {
    return <NotFoundMessage />;
  }

  // ── Derived ────────────────────────────────────────────────────────

  // Merge Google enrichment data (Google takes precedence when available)
  const mergedRating = enrichment?.rating ?? placeData.rating;
  const mergedPriceLevel = enrichment?.priceLevel ?? placeData.price_level;
  const mergedPhone = enrichment?.phone ?? placeData.phone;
  const mergedWebsite = enrichment?.website ?? placeData.website;
  const ratingCount = enrichment?.userRatingsTotal ?? placeData.review_count;

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

  const fullAddress = [
    placeData.street_address,
    placeData.locality,
    placeData.region,
    placeData.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const closedStatus =
    enrichment?.businessStatus === "CLOSED_TEMPORARILY" ||
    enrichment?.businessStatus === "CLOSED_PERMANENTLY"
      ? enrichment.businessStatus
      : null;

  const hours = enrichment?.openingHours ?? placeData.hours;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <Page>
      {/* Hero Header */}
      <Section>
        <div className="flex flex-row items-start gap-4">
          <PlaceCategoryTile
            category={placeData.primary_category ?? placeData.categories[0]}
            large
          />

          <div className="min-w-0 flex-1">
            <h1 className="type-title-1 mb-1 text-ink-1">{placeData.name}</h1>
            {placeData.display_name &&
              placeData.display_name !== placeData.name && (
                <p className="type-body mb-1 text-ink-2">
                  {placeData.display_name}
                </p>
              )}

            {/* Rating / Price / Review count row */}
            <div className="mb-2 flex flex-row flex-wrap items-center gap-x-4 gap-y-1">
              {mergedRating != null && (
                <span className="type-callout tabular flex flex-row items-center gap-1 font-medium text-ink-1">
                  <Star
                    aria-hidden
                    strokeWidth={0}
                    className="size-[18px] fill-current text-ink-2"
                  />
                  {mergedRating.toFixed(1)}
                  {ratingCount != null && ` (${ratingCount})`}
                </span>
              )}
              {mergedPriceLevel != null && (
                <span className="type-callout font-medium text-success">
                  {getPriceLevelText(mergedPriceLevel)}
                </span>
              )}
              {openNow != null && (
                <span
                  className={cn(
                    "type-callout font-medium",
                    openNow ? "text-success" : "text-destructive",
                  )}
                >
                  {openNow ? "Open" : "Closed"}
                </span>
              )}
              {/* N22: capped at 8 s, then a calm line rather than a spinner */}
              {isEnriching && (
                <Spinner aria-label="Loading details" className="text-ink-2" />
              )}
              {!isEnriching && detailsPending && (
                <span className="type-footnote">Details pending</span>
              )}
              {placeData.is_verified && (
                <Badge variant="secondary" className="text-success">
                  Verified
                </Badge>
              )}
            </div>

            {/* Address with map link */}
            {fullAddress && (
              <Link
                href={`/map?placeId=${placeData.id}`}
                className="type-callout inline-flex flex-row items-center gap-2 text-primary"
              >
                <MapIcon
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-[18px] shrink-0"
                />
                {fullAddress}
              </Link>
            )}
          </div>
        </div>

        {/* Categories */}
        {placeData.categories && placeData.categories.length > 0 && (
          <div className="mt-4 flex flex-row flex-wrap gap-2">
            {placeData.categories.map((category: string) => (
              <Badge key={category} variant="secondary">
                {formatCategoryName(category)}
              </Badge>
            ))}
          </div>
        )}

        {/* Visit info */}
        {userInteraction?.last_visited_at && (
          <p className="type-footnote mt-4">
            Last visited:{" "}
            <Timestamp iso={userInteraction.last_visited_at} precision="date" />
            {userInteraction.visit_count != null &&
              userInteraction.visit_count > 1 &&
              ` (${userInteraction.visit_count} visits)`}
          </p>
        )}
      </Section>

      {/* X27 / D28: the creator's review state, controls and suggestions.
          The panel carries the status badge itself, directly under this
          header, so the header does not repeat it. */}
      <PlaceReviewPanel
        placeId={placeData.id}
        placeName={placeData.name}
        status={placeData.review_status}
        rejectionReason={placeData.rejection_reason}
        categories={placeData.categories}
        description={placeData.description}
        suggestedCategories={placeData.suggested_categories}
        suggestedDescription={placeData.suggested_description}
        refetch={refetch}
      />

      {/* Business Status Warning */}
      {closedStatus && (
        <Alert
          variant={
            closedStatus === "CLOSED_PERMANENTLY" ? "destructive" : "default"
          }
        >
          <Warning aria-hidden />
          <AlertDescription>
            {closedStatus === "CLOSED_PERMANENTLY"
              ? "This place is permanently closed"
              : "This place is temporarily closed"}
          </AlertDescription>
        </Alert>
      )}

      {/* Google Photo */}
      {googlePhotos[0]?.url && (
        <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-1">
          <Image
            src={googlePhotos[0].url}
            alt={placeData.name}
            fill
            sizes="(max-width: 720px) 100vw, 720px"
            className="object-cover"
          />
        </div>
      )}

      {/* Action Buttons */}
      <Section className="flex flex-col gap-3">
        <Button className="w-full" onClick={handleDirections}>
          <Directions aria-hidden />
          Directions
        </Button>

        <div className="flex flex-row gap-2">
          <Button
            variant="outline"
            disabled={!mergedPhone}
            className="flex-1"
            onClick={handleCall}
          >
            <Phone aria-hidden />
            Call
          </Button>
          <Button
            variant="outline"
            disabled={!mergedWebsite}
            className="flex-1"
            onClick={handleWebsite}
          >
            <Public aria-hidden />
            Website
          </Button>
        </div>

        {/* D27's order: Save (Want to try) and Log (visited) first, then
            Love. The bookmark follows the server's state, so the refetch
            after Mark visited (which takes it off the list) empties it. */}
        <div className="flex flex-row gap-2">
          <WantToTryButton
            variant="button"
            target={{ kind: "PLACE", placeId: placeData.id }}
            saved={userInteraction?.want_to_visit ?? false}
            name={placeData.name}
            className="flex-1"
          />
          <VisitedToggleButton
            on={visit.on}
            pending={visit.pending}
            onClick={visit.toggle}
            className="flex-1"
          />
        </div>

        <div className="flex flex-row gap-2">
          <LoveToggleButton
            on={love.on}
            pending={love.pending}
            onClick={love.toggle}
            className="flex-1"
          />
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => void handleShare()}
          >
            <Share aria-hidden />
            Share
          </Button>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => setTierListModalOpen(true)}
        >
          <Ranked aria-hidden />
          Add to Tier List
        </Button>
      </Section>

      {/* Editorial Summary */}
      {enrichment?.editorialSummary && (
        <Section>
          <p className="type-body text-ink-1 italic">
            {enrichment.editorialSummary}
          </p>
        </Section>
      )}

      {/* Contact Info */}
      {(mergedPhone || mergedWebsite) && (
        <Section className="flex flex-col gap-1 py-2">
          {mergedPhone && (
            <ContactRow icon={Phone} onClick={handleCall}>
              {mergedPhone}
            </ContactRow>
          )}
          {mergedPhone && mergedWebsite && <Separator />}
          {mergedWebsite && (
            <ContactRow icon={Public} onClick={handleWebsite}>
              {mergedWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </ContactRow>
          )}
        </Section>
      )}

      {/* Tier lists this place belongs to (G8: visible lists only) */}
      <ItemTierLists entries={tierListEntries} />

      {/* Google Attribution (the Places terms require the blocks too) */}
      <GoogleAttribution
        enrichment={enrichment}
        photos={googlePhotos.slice(0, 1)}
        className="mb-0"
      />

      {/* Content tabs */}
      <Section className="px-0 pt-2">
        <Tabs
          value={!menuScanOffered && activeTab === "scan" ? "menu" : activeTab}
          onValueChange={(value) => setActiveTab(value as PlaceTab)}
        >
          <TabsList
            variant="line"
            className="w-full justify-start border-line border-b px-2 group-data-[orientation=horizontal]/tabs:h-11"
          >
            <TabsTrigger value="menu" className="flex-none px-3">
              Menu
              {menuItems.length > 0 && (
                <Badge variant="secondary" className="tabular">
                  {menuItemCount}
                </Badge>
              )}
            </TabsTrigger>
            {menuScanOffered && (
              <TabsTrigger value="scan" className="flex-none px-3">
                Camera Scan
              </TabsTrigger>
            )}
            <TabsTrigger value="info" className="flex-none px-3">
              Info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="menu" className="px-4 pt-4">
            {currentMenu ? (
              <PlaceMenuItems
                placeId={placeData.id}
                userId={userId}
                menuItems={menuItems}
                hasMore={hasMoreMenuItems}
                loadingMore={loadingMoreMenuItems}
                loadMoreError={menuLoadMoreError}
                onLoadMore={loadMoreMenuItems}
              />
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <Restaurant
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="mb-4 size-12 text-ink-3"
                />
                <h2 className="type-headline mb-2 text-ink-1">
                  No menu discovered yet
                </h2>
                {menuScanOffered && (
                  <p className="type-body text-ink-2">
                    Scan a menu at this location using the &quot;Camera
                    Scan&quot; tab above.
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          {menuScanOffered && (
            <TabsContent value="scan" className="px-4 pt-4">
              <MenuScanner
                placeId={placeData.id}
                userId={userId}
                // Fires once the scan's match run has settled, by which time
                // its lines are filed on this place (N06a), not when extraction
                // completes — that refetch read the menu before it existed.
                onScanComplete={refetch}
              />
            </TabsContent>
          )}

          <TabsContent value="info" className="flex flex-col gap-4 px-4 pt-4">
            {hours != null && (
              <div className="rounded-md bg-surface-2 p-4">
                <h2 className="type-headline flex flex-row items-center gap-2 text-ink-1">
                  <Schedule
                    aria-hidden
                    strokeWidth={ICON_STROKE}
                    className="size-5 text-ink-2"
                  />
                  Hours
                </h2>
                <HoursDisplay hours={hours} />
              </div>
            )}

            <div className="rounded-md bg-surface-2 p-4">
              <h2 className="type-headline text-ink-1">Details</h2>
              <div className="type-callout mt-2 flex flex-col gap-2 text-ink-1">
                {placeData.primary_category && (
                  <p>
                    <strong>Primary Category:</strong>{" "}
                    {formatCategoryName(placeData.primary_category)}
                  </p>
                )}
                {placeData.categories && placeData.categories.length > 0 && (
                  <p>
                    <strong>Categories:</strong>{" "}
                    {placeData.categories
                      .map((c: string) => formatCategoryName(c))
                      .join(", ")}
                  </p>
                )}
                {placeData.confidence != null && (
                  <p>
                    <strong>Data Confidence:</strong>{" "}
                    {(placeData.confidence * 100).toFixed(0)}%
                  </p>
                )}
                {mergedPriceLevel != null && (
                  <p>
                    <strong>Price Level:</strong> {"$".repeat(mergedPriceLevel)}
                  </p>
                )}
                {placeData.is_verified && (
                  <p>
                    <strong>Verified:</strong> Yes
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Section>

      {/* Add to Tier List Modal */}
      <AddToTierListModal
        open={tierListModalOpen}
        onClose={() => setTierListModalOpen(false)}
        entityId={placeData.id}
        entityType="place"
        entityName={placeData.name}
        userId={userId}
      />
    </Page>
  );
}
