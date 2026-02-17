import { readFragment } from "@cellar-assistant/shared";
import type { TadaDocumentNode } from "gql.tada";
import { parse } from "graphql";
import { notFound } from "next/navigation";
import {
  TierListFullFragment,
  TierListItemFragment,
} from "@/components/tier-list/fragments";
import {
  GetTierListQuery,
  GetUserItemReviewsQuery,
} from "@/components/tier-list/queries";
import { TierListViewPage } from "@/components/tier-list/TierListViewPage";
import type {
  TierListData,
  TierListInsightsData,
  TierListInsightsItem,
  TierListItemDisplay,
} from "@/components/tier-list/types";
import { serverQuery } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

type GetTierListEditingLockQueryResult = {
  tier_lists_by_pk: {
    is_editing_locked: boolean;
  } | null;
};

type GetTierListEditingLockQueryVariables = {
  id: string;
};

const getTierListEditingLockQuery = parse(`
  query GetTierListEditingLock($id: uuid!) {
    tier_lists_by_pk(id: $id) {
      is_editing_locked
    }
  }
`) as unknown as TadaDocumentNode<
  GetTierListEditingLockQueryResult,
  GetTierListEditingLockQueryVariables
>;

import { formatCategoryName } from "@/components/tier-list/utils";

type Props = {
  params: Promise<{ tierListId: string }>;
};

function getItemHref(item: {
  place?: { id: string } | null;
  wine?: { id: string } | null;
  beer?: { id: string } | null;
  spirit?: { id: string } | null;
  coffee?: { id: string } | null;
  sake?: { id: string } | null;
}): string {
  if (item.place) return `/places/${item.place.id}`;
  if (item.wine) return `/wines/${item.wine.id}`;
  if (item.beer) return `/beers/${item.beer.id}`;
  if (item.spirit) return `/spirits/${item.spirit.id}`;
  if (item.coffee) return `/coffees/${item.coffee.id}`;
  if (item.sake) return `/sakes/${item.sake.id}`;
  return "#";
}

function getEntityId(item: {
  wine?: { id: string } | null;
  beer?: { id: string } | null;
  spirit?: { id: string } | null;
  coffee?: { id: string } | null;
  sake?: { id: string } | null;
}): { type: string; id: string } | null {
  if (item.wine) return { type: "wine", id: item.wine.id };
  if (item.beer) return { type: "beer", id: item.beer.id };
  if (item.spirit) return { type: "spirit", id: item.spirit.id };
  if (item.coffee) return { type: "coffee", id: item.coffee.id };
  if (item.sake) return { type: "sake", id: item.sake.id };
  return null;
}

export default async function TierListPage({ params }: Props) {
  const { tierListId } = await params;
  const userId = await getServerUserId();
  const [rawData, lockData] = await Promise.all([
    serverQuery(GetTierListQuery, { id: tierListId }),
    serverQuery(getTierListEditingLockQuery, { id: tierListId }),
  ]);

  if (!rawData.tier_lists_by_pk) {
    notFound();
  }

  const tierList = readFragment(TierListFullFragment, rawData.tier_lists_by_pk);
  const resolvedItems = tierList.items.map((raw) =>
    readFragment(TierListItemFragment, raw),
  );

  // Collect item entity IDs by type for the review scores query
  const wineIds: string[] = [];
  const beerIds: string[] = [];
  const spiritIds: string[] = [];
  const coffeeIds: string[] = [];
  const sakeIds: string[] = [];

  for (const item of resolvedItems) {
    const entity = getEntityId(item);
    if (!entity) continue;
    switch (entity.type) {
      case "wine":
        wineIds.push(entity.id);
        break;
      case "beer":
        beerIds.push(entity.id);
        break;
      case "spirit":
        spiritIds.push(entity.id);
        break;
      case "coffee":
        coffeeIds.push(entity.id);
        break;
      case "sake":
        sakeIds.push(entity.id);
        break;
    }
  }

  // Fetch user's review scores for non-place items (server-side, no $userId in fragments)
  const hasItems =
    wineIds.length +
      beerIds.length +
      spiritIds.length +
      coffeeIds.length +
      sakeIds.length >
    0;

  const reviewScoreMap = new Map<string, number>();

  if (hasItems) {
    const reviews = await serverQuery(GetUserItemReviewsQuery, {
      userId,
      wineIds,
      beerIds,
      spiritIds,
      coffeeIds,
      sakeIds,
    });
    for (const review of reviews.item_reviews) {
      const entityId =
        review.wine_id ??
        review.beer_id ??
        review.spirit_id ??
        review.coffee_id ??
        review.sake_id;
      if (entityId) {
        reviewScoreMap.set(entityId, review.score);
      }
    }
  }

  // Resolve all items into plain display data
  const items: TierListItemDisplay[] = resolvedItems.map((item) => {
    let name = "Unknown item";
    let subtitle = "";
    let reviewScore: number | null = null;

    let publicRating: number | null = null;
    let publicRatingCount: number | null = null;

    if (item.place) {
      name = item.place.display_name ?? item.place.name;
      const formattedCategory = item.place.primary_category
        ? formatCategoryName(item.place.primary_category)
        : null;
      subtitle = [
        formattedCategory,
        item.place.locality,
        item.place.country_code,
      ]
        .filter(Boolean)
        .join(" · ");
      reviewScore = item.place.user_place_interactions[0]?.rating ?? null;
      publicRating = item.place.google_enrichment?.google_rating ?? null;
      publicRatingCount =
        item.place.google_enrichment?.google_user_ratings_total ?? null;
    } else if (item.wine) {
      name = item.wine.name;
      subtitle = [item.wine.variety, item.wine.vintage, item.wine.country]
        .filter(Boolean)
        .join(" · ");
      reviewScore = reviewScoreMap.get(item.wine.id) ?? null;
    } else if (item.beer) {
      name = item.beer.name;
      subtitle = item.beer.style ?? "";
      reviewScore = reviewScoreMap.get(item.beer.id) ?? null;
    } else if (item.spirit) {
      name = item.spirit.name;
      subtitle = item.spirit.type ?? "";
      reviewScore = reviewScoreMap.get(item.spirit.id) ?? null;
    } else if (item.coffee) {
      name = item.coffee.name;
      subtitle = item.coffee.country ?? "";
      reviewScore = reviewScoreMap.get(item.coffee.id) ?? null;
    } else if (item.sake) {
      name = item.sake.name;
      subtitle = [item.sake.category, item.sake.region]
        .filter(Boolean)
        .join(" · ");
      reviewScore = reviewScoreMap.get(item.sake.id) ?? null;
    }

    return {
      id: item.id,
      band: item.band,
      position: item.position,
      name,
      subtitle,
      href: getItemHref(item),
      reviewScore,
      publicRating,
      publicRatingCount,
    };
  });

  // Build insights items for place-type lists
  const insightsItems: TierListInsightsItem[] = resolvedItems
    .filter((item) => item.place != null)
    .map((item) => ({
      id: item.id,
      band: item.band,
      name: item.place?.display_name ?? item.place?.name ?? "Unknown",
      countryCode: (item.place?.country_code as string) ?? null,
      region: (item.place?.region as string) ?? null,
      primaryCategory: (item.place?.primary_category as string) ?? null,
    }));

  // Parse AI insights from JSONB if available
  const rawInsights = tierList.ai_insights as {
    palateProfile?: string;
    blindSpots?: string;
    hotTake?: string;
    archetype?: string;
    archetypeDescription?: string;
    recommendation?: string;
    generatedAt?: string;
  } | null;

  const insightsData: TierListInsightsData = {
    items: insightsItems,
    aiInsights:
      rawInsights?.palateProfile && rawInsights?.blindSpots
        ? {
            palateProfile: rawInsights.palateProfile,
            blindSpots: rawInsights.blindSpots,
            hotTake: rawInsights.hotTake,
            archetype: rawInsights.archetype,
            archetypeDescription: rawInsights.archetypeDescription,
            recommendation: rawInsights.recommendation,
            generatedAt: rawInsights.generatedAt ?? "",
          }
        : null,
    contentUpdatedAt: (tierList.content_updated_at as string) ?? null,
  };

  const data: TierListData = {
    id: tierList.id,
    name: tierList.name,
    description: tierList.description ?? null,
    privacy: tierList.privacy,
    listType: tierList.list_type,
    isOwner: tierList.created_by_id === userId,
    isEditingLocked: lockData.tier_lists_by_pk?.is_editing_locked ?? false,
    itemCount: items.length,
    items,
  };

  return <TierListViewPage data={data} insightsData={insightsData} />;
}
