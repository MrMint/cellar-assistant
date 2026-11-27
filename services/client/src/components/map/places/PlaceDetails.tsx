"use client";

/**
 * The place page (Places-Place 01, 02, 20, desktop 01) and, at pane width,
 * its body in the map's desktop pane (`PlacePane`).
 *
 * One scrolling page, not tabs (the Places-Place report merges Menu, Scan a
 * menu and Info): the hero under glass discs, Your rank, where it is with
 * the screen's one primary (Directions), Visited / Want to try / Share, On
 * your lists, the Menu card (its lines, or "No menu yet" with Scan a menu),
 * then Info. From `md` the page is two columns: the photo, name and menu on
 * the left, the rank, address and lists in a 400 column on the right.
 *
 * Data: one `PlaceDetailsQuery` through `usePlaceDetails` (P1's hook).
 * - On your lists is `Place.tierListEntries` (G8): visible lists only. Their
 *   ranks are read from each list (`ListRanksQuery`), as Add to a list does.
 * - Changing a band from here waits on `tierListEntries` saying whose list
 *   an entry is on: until then the rank opens its list rather than offering
 *   a band sheet that could write to a friend's list (hand-off to P1).
 * - Love / Visited flip on the tap (X24) through `usePlaceToggles`; a refusal
 *   puts them back.
 */

import { useState } from "react";
import { AppBar, type AppBarOverflowItem } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import { Camera, ICON_STROKE, Share, Warning } from "@/components/app/icons";
import { ShareSheet } from "@/components/app/overlays/ShareSheet";
import { Page } from "@/components/app/Page";
import { Heart } from "@/components/app/parts/Heart";
import { useNavigate } from "@/components/app/useNavigate";
import { Timestamp } from "@/components/common/Timestamp";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { cn } from "@/lib/utils";
import { AddToTierListModal } from "../../tier-list/AddToTierListModal";
import { usePlaceDetails } from "../hooks/usePlaceDetails";
import { usePlaceToggles } from "../hooks/usePlaceToggles";
import { MenuScanner } from "../scanning/MenuScanner";
import { GoogleAttribution } from "./GoogleAttribution";
import {
  PlaceDetailsShell,
  type PlaceHero as PlaceHeroData,
} from "./PlaceDetailsShell";
import { PlaceHero } from "./PlaceHero";
import { PlaceMenuItems } from "./PlaceMenuItems";
import { PlaceReviewPanel } from "./PlaceReviewPanel";
import {
  PlaceActionsRow,
  PlaceCard,
  PlaceInfoCard,
  PlaceListsCard,
  PlaceRankBlock,
  PlaceWhereCard,
} from "./PlaceSections";
import { formatCategoryName, getPriceLevelText } from "./place-utils";

interface PlaceDetailsProps {
  placeId: string;
  /**
   * The name and category the server already read (X24): drawn in the
   * loading shell while the full read is on its way.
   */
  hero?: PlaceHeroData;
  /** The old `getServerUserId()`; unused — the API knows the viewer. */
  userId?: string;
  /**
   * `page`: the route, with its bar and, from `md`, two columns. `pane`: the
   * same sections in one column inside the map's pane, which has its own
   * chrome.
   */
  variant?: "page" | "pane";
}

export function PlaceDetails({
  placeId,
  hero,
  userId = "",
  variant = "page",
}: PlaceDetailsProps) {
  const pane = variant === "pane";
  // From md the page is two columns; the pane stays one at any width.
  const desktop = useMediaQuery(breakpointUp("md")) && !pane;
  // N07/D25: menu scanning is hidden, not refused, where no AI can read one.
  const menuScanOffered = isOffered(useAiCapabilities(), "menuScan");
  const [listModalOpen, setListModalOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const navigate = useNavigate();

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
  const { love, visit } = usePlaceToggles({
    placeId: placeData?.id,
    loved: !!userInteraction?.is_favorite,
    visited: !!userInteraction?.is_visited,
    wantToTry: userInteraction?.want_to_visit === true,
    setInteraction,
  });

  if (fetching) {
    // The route's shell, now with the real hero (X24) — not a spinner.
    return <PlaceDetailsShell hero={hero} />;
  }

  // "Not found" and "not yours to see" are one state (§1.6); any other
  // failure says it could not open and offers the read again.
  if (failure && failure.code !== "NOT_FOUND") {
    return (
      <Page>
        <EmptyState
          title="Couldn't open this place"
          description={failure.message}
          action={
            <Button variant="outline" onClick={refetch}>
              Try again
            </Button>
          }
        />
      </Page>
    );
  }

  if (!placeData) {
    return (
      <Page>
        <EmptyState
          title="Place not found"
          description="It's gone, or it isn't yours to see."
          action={
            <Button variant="outline" onClick={() => navigate.push("/map")}>
              Back to the map
            </Button>
          }
        />
      </Page>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────

  const rating = enrichment?.rating ?? placeData.rating;
  const ratingCount = enrichment?.userRatingsTotal ?? placeData.review_count;
  const priceLevel = enrichment?.priceLevel ?? placeData.price_level;
  const phone = enrichment?.phone ?? placeData.phone;
  const website = enrichment?.website ?? placeData.website;
  const hours = enrichment?.openingHours ?? placeData.hours;
  const summary = placeData.description ?? enrichment?.editorialSummary ?? null;
  const closedStatus =
    enrichment?.businessStatus === "CLOSED_TEMPORARILY" ||
    enrichment?.businessStatus === "CLOSED_PERMANENTLY"
      ? enrichment.businessStatus
      : null;

  const heroCategory: string | undefined =
    placeData.primary_category ?? placeData.categories[0];
  const meta = [
    ...placeData.categories.slice(0, 2).map(formatCategoryName),
    ...(priceLevel != null ? [getPriceLevelText(priceLevel)] : []),
  ].join(" · ");

  const placeUrl =
    typeof window === "undefined"
      ? `/places/${placeData.id}`
      : `${window.location.origin}/places/${placeData.id}`;

  const openList = () => setListModalOpen(true);
  const overflow: AppBarOverflowItem[] = [
    { label: "Add to a list", onSelect: openList },
    { label: "Share", onSelect: () => setShareOpen(true) },
    {
      label: "Show on the map",
      onSelect: () => navigate.push(`/map?placeId=${placeData.id}`),
    },
  ];

  const heart = (
    <Heart
      size="page"
      on={love.on}
      onToggle={love.toggle}
      label={`Love ${placeData.name}`}
    />
  );

  // ── Sections ───────────────────────────────────────────────────────

  const heroBlock = (
    <div
      className={cn("relative", !pane && !desktop && "-mt-4")}
      data-slot="place-hero-block"
    >
      <PlaceHero
        name={placeData.name}
        category={heroCategory}
        categoryLabel={meta}
        photoUrl={googlePhotos[0]?.url}
        heart={heart}
        // Desktop 01: the photo is a framed r8 block in its column, no fade.
        className={cn(
          desktop &&
            "mx-0 [&>div:first-child]:h-[360px] [&>div:first-child]:rounded-lg [&>div:first-child>div[aria-hidden]]:hidden [&>div:last-child]:px-0",
        )}
      />
      {!pane && !desktop && (
        <AppBar tone="photo" parent="/map" overflow={overflow} />
      )}
    </div>
  );

  const intro = (summary !== null ||
    isEnriching ||
    detailsPending ||
    placeData.display_name) && (
    <div className="flex flex-col gap-1">
      {placeData.display_name && placeData.display_name !== placeData.name && (
        <p className="t-body text-ink-2">{placeData.display_name}</p>
      )}
      {summary !== null && <p className="t-body text-ink-2">{summary}</p>}
      {/* N22: capped at 8 s, then a calm line rather than a spinner */}
      {isEnriching && (
        <p className="t-cap inline-flex items-center gap-2 text-ink-2">
          <Spinner aria-hidden className="size-4" />
          Loading details
        </p>
      )}
      {!isEnriching && detailsPending && (
        <p className="t-cap text-ink-2">Details pending</p>
      )}
    </div>
  );

  const closedNotice = closedStatus && (
    <div
      role="status"
      data-slot="place-closed"
      className="t-body flex items-center gap-3 rounded-lg bg-surface-1 p-4 text-ink"
    >
      <Warning
        aria-hidden
        strokeWidth={ICON_STROKE}
        className={cn(
          "size-5 shrink-0",
          closedStatus === "CLOSED_PERMANENTLY" ? "text-danger" : "text-glyph",
        )}
      />
      {closedStatus === "CLOSED_PERMANENTLY"
        ? "This place is permanently closed"
        : "This place is temporarily closed"}
    </div>
  );

  const rank = (
    <PlaceRankBlock
      entries={tierListEntries}
      rating={rating}
      ratingCount={ratingCount}
      onAddToList={openList}
    />
  );

  const actionsRow = (
    <PlaceActionsRow
      placeId={placeData.id}
      placeName={placeData.name}
      visited={visit}
      wantToTry={userInteraction?.want_to_visit ?? false}
      onShare={() => setShareOpen(true)}
    />
  );

  const lastVisited = userInteraction?.last_visited_at && (
    <p className="t-cap text-ink-2">
      Last visited{" "}
      <Timestamp iso={userInteraction.last_visited_at} precision="date" />
      {userInteraction.visit_count != null &&
        userInteraction.visit_count > 1 &&
        ` · ${userInteraction.visit_count} visits`}
    </p>
  );

  const hasMenu = menuItems.length > 0;
  const menuCard = (
    <PlaceCard
      label="Menu"
      data-slot="place-menu"
      action={
        hasMenu ? (
          <span className="t-cap tabular text-ink-2">{menuItemCount}</span>
        ) : undefined
      }
    >
      {hasMenu && (
        <PlaceMenuItems
          placeId={placeData.id}
          placeName={placeData.name}
          userId={userId}
          onChanged={refetch}
          menuItems={menuItems}
          hasMore={hasMoreMenuItems}
          loadingMore={loadingMoreMenuItems}
          loadMoreError={menuLoadMoreError}
          onLoadMore={loadMoreMenuItems}
        />
      )}
      {menuScanOffered ? (
        <MenuScanner
          placeId={placeData.id}
          userId={userId}
          // Fires once the scan's match run has settled, by which time its
          // lines are filed on this place (N06a).
          onScanComplete={refetch}
          idle={(start) => (
            <div
              className={cn(
                "flex items-center gap-3",
                hasMenu ? "justify-end" : "justify-between",
              )}
            >
              {!hasMenu && <p className="t-body text-ink-2">No menu yet</p>}
              <Button variant="outline" onClick={start}>
                <Camera aria-hidden strokeWidth={ICON_STROKE} />
                Scan a menu
              </Button>
            </div>
          )}
        />
      ) : (
        !hasMenu && <p className="t-body text-ink-2">No menu yet</p>
      )}
    </PlaceCard>
  );

  const info = <PlaceInfoCard hours={hours} phone={phone} website={website} />;

  const review = (
    // X27 / D28: the creator's review state, controls and suggestions.
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
  );

  const footer = (
    // The Places terms require Google's blocks wherever its data shows.
    <GoogleAttribution
      enrichment={enrichment}
      photos={googlePhotos.slice(0, 1)}
      className="mb-0 text-center"
    />
  );

  const overlays = (
    <>
      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={placeData.name}
        url={placeUrl}
      />
      <AddToTierListModal
        open={listModalOpen}
        onClose={() => setListModalOpen(false)}
        entityId={placeData.id}
        entityType="place"
        entityName={placeData.name}
        userId={userId}
      />
    </>
  );

  if (!desktop) {
    // A phone, and the pane at any width: one column.
    return (
      <Page>
        {heroBlock}
        {intro}
        {review}
        {closedNotice}
        {rank}
        <PlaceWhereCard place={placeData} />
        {actionsRow}
        {lastVisited}
        <PlaceListsCard entries={tierListEntries} />
        {menuCard}
        {info}
        {footer}
        {overlays}
      </Page>
    );
  }

  return (
    <Page wide>
      {/* Desktop 01: the page's own bar — Map crumbs, Share, ⋯. */}
      <AppBar
        parent="/map"
        breadcrumbs={[
          { label: "Map", href: "/map" },
          { label: placeData.name },
        ]}
        actions={[
          { label: "Share", icon: Share, onSelect: () => setShareOpen(true) },
        ]}
        overflow={overflow.filter((item) => item.label !== "Share")}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {heroBlock}
          {intro}
          {menuCard}
          {info}
        </div>
        <aside className="flex flex-col gap-4">
          {review}
          {closedNotice}
          <PlaceCard>{rank}</PlaceCard>
          <PlaceWhereCard place={placeData}>
            <PlaceActionsRow
              placeId={placeData.id}
              placeName={placeData.name}
              visited={visit}
              wantToTry={userInteraction?.want_to_visit ?? false}
              onShare={() => setShareOpen(true)}
              share={false}
            />
            {lastVisited}
          </PlaceWhereCard>
          <PlaceListsCard entries={tierListEntries} />
        </aside>
      </div>
      {footer}
      {overlays}
    </Page>
  );
}
