"use server";

import { graphql, type ResultOf } from "@cellar-assistant/shared";
import { getSearchVectorQuery } from "@cellar-assistant/shared/queries";
import { redirect } from "next/navigation";
import { defaultTo, isNil, isNotNil } from "ramda";
import type { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";
import {
  beerItemCardFragment,
  coffeeItemCardFragment,
  sakeItemCardFragment,
  spiritItemCardFragment,
  wineItemCardFragment,
} from "@/components/item/ItemCard/fragments";
import type { Barcode } from "@/constants";
import { serverQuery } from "@/lib/urql/server";
import { buildItemSubtitle, formatVintage, getItemType } from "@/utilities";
import { getServerUserId } from "@/utilities/auth-server";

const textSearchQuery = graphql(
  `
    query TextSearchQuery($text: String!, $userId: uuid!) {
      text_search(
        args: { text: $text }
        where: { distance: { _lte: 1 } }
        order_by: { distance: asc }
        limit: 10
      ) {
        distance
        beer {
          ...beerItemCardFragment
        }
        wine {
          ...wineItemCardFragment
        }
        spirit {
          ...spiritItemCardFragment
        }
        coffee {
          ...coffeeItemCardFragment
        }
        sake {
          ...sakeItemCardFragment
        }
      }
    }
  `,
  [
    beerItemCardFragment,
    wineItemCardFragment,
    spiritItemCardFragment,
    coffeeItemCardFragment,
    sakeItemCardFragment,
  ],
);

const imageSearchQuery = graphql(
  `
    query ImageSearchQuery($image: String!, $userId: uuid!) {
      image_search(
        args: { image: $image }
        where: { distance: { _lte: 0.3 } }
        order_by: { distance: asc }
        limit: 10
      ) {
        beer {
          ...beerItemCardFragment
        }
        wine {
          ...wineItemCardFragment
        }
        spirit {
          ...spiritItemCardFragment
        }
        coffee {
          ...coffeeItemCardFragment
        }
        sake {
          ...sakeItemCardFragment
        }
      }
    }
  `,
  [
    beerItemCardFragment,
    wineItemCardFragment,
    spiritItemCardFragment,
    coffeeItemCardFragment,
    sakeItemCardFragment,
  ],
);

// Type definitions using gql.tada for full type safety
type TextSearchResult = ResultOf<typeof textSearchQuery>;
type TextSearchItem = TextSearchResult["text_search"][number];
type ImageSearchResult = ResultOf<typeof imageSearchQuery>;
type ImageSearchItem = ImageSearchResult["image_search"][number];

// Extract item data with proper typing
function extractItemFromSearchResult(searchResult: TextSearchItem) {
  if (searchResult.beer) {
    return { item: searchResult.beer, type: "beer" as const };
  }
  if (searchResult.wine) {
    return { item: searchResult.wine, type: "wine" as const };
  }
  if (searchResult.spirit) {
    return { item: searchResult.spirit, type: "spirit" as const };
  }
  if (searchResult.coffee) {
    return { item: searchResult.coffee, type: "coffee" as const };
  }
  if (searchResult.sake) {
    return { item: searchResult.sake, type: "sake" as const };
  }
  return null;
}

export async function searchByText(
  query: string,
): Promise<BarcodeSearchResult[]> {
  // Ensure user is authenticated first
  const userId = await getServerUserId();

  if (isNil(query) || query.trim() === "") return [];

  // Get vector representation of search text
  const vectorData = await serverQuery(getSearchVectorQuery, {
    text: query.trim(),
  });

  if (isNil(vectorData?.create_search_vector)) {
    return [];
  }

  // Execute vector similarity search
  const searchData = await serverQuery(textSearchQuery, {
    text: JSON.stringify(vectorData.create_search_vector),
    userId,
  });

  return searchData.text_search
    .map((searchResult: TextSearchItem) => {
      const extracted = extractItemFromSearchResult(searchResult);

      if (!extracted) return undefined;

      const { item } = extracted;

      return {
        id: item.id,
        type: getItemType(
          item.__typename as "beers" | "wines" | "spirits" | "coffees",
        ),
        itemId: item.id,
        name: item.name,
        vintage: "vintage" in item ? formatVintage(item.vintage) : undefined,
        subtitle: buildItemSubtitle(
          item as Parameters<typeof buildItemSubtitle>[0],
        ),
        displayImageId: item.item_images?.[0]?.file_id,
        placeholder: item.item_images?.[0]?.placeholder,
        score: item.reviews_aggregate?.aggregate?.avg?.score,
        reviewCount: item.reviews_aggregate?.aggregate?.count,
        favoriteCount: item.item_favorites_aggregate?.aggregate?.count,
        favoriteId: item.item_favorites?.[0]?.id,
        reviewed: defaultTo(0, item.user_reviews?.aggregate?.count) > 0,
      } satisfies BarcodeSearchResult;
    })
    .filter(isNotNil);
}

export async function searchByBarcode(
  _barcode: Barcode,
): Promise<BarcodeSearchResult[]> {
  // This would need to be implemented with the actual barcode search logic
  // For now, returning empty array as placeholder
  return [];
}

export async function searchByImage(
  imageDataUrl: string,
): Promise<BarcodeSearchResult[]> {
  // Ensure user is authenticated first
  const userId = await getServerUserId();

  if (isNil(imageDataUrl) || imageDataUrl.trim() === "") return [];

  // Get vector representation of the image
  const vectorData = await serverQuery(getSearchVectorQuery, {
    image: imageDataUrl,
  });

  if (isNil(vectorData?.create_search_vector)) {
    return [];
  }

  // Execute vector similarity search
  const searchData = await serverQuery(imageSearchQuery, {
    image: JSON.stringify(vectorData.create_search_vector),
    userId,
  });

  return searchData.image_search
    .map((searchResult: ImageSearchItem) => {
      const extracted = extractItemFromSearchResult(
        searchResult as unknown as TextSearchItem,
      );

      if (!extracted) return undefined;

      const { item } = extracted;

      return {
        id: item.id,
        type: getItemType(
          item.__typename as "beers" | "wines" | "spirits" | "coffees",
        ),
        itemId: item.id,
        name: item.name,
        vintage: "vintage" in item ? formatVintage(item.vintage) : undefined,
        subtitle: buildItemSubtitle(
          item as Parameters<typeof buildItemSubtitle>[0],
        ),
        displayImageId: item.item_images?.[0]?.file_id,
        placeholder: item.item_images?.[0]?.placeholder,
        score: item.reviews_aggregate?.aggregate?.avg?.score,
        reviewCount: item.reviews_aggregate?.aggregate?.count,
        favoriteCount: item.item_favorites_aggregate?.aggregate?.count,
        favoriteId: item.item_favorites?.[0]?.id,
        reviewed: defaultTo(0, item.user_reviews?.aggregate?.count) > 0,
      } satisfies BarcodeSearchResult;
    })
    .filter(isNotNil);
}

export async function searchAction(formData: FormData) {
  const query = formData.get("query") as string;

  if (query?.trim()) {
    redirect(`/search?q=${encodeURIComponent(query.trim())}`);
  } else {
    redirect("/search");
  }
}

export async function barcodeSearchAction(formData: FormData) {
  const barcode = formData.get("barcode") as string;

  if (barcode) {
    const results = await searchByBarcode(JSON.parse(barcode));
    // For now, redirect to search with results as query param
    if (results.length > 0) {
      redirect(
        `/search?barcode_results=${encodeURIComponent(JSON.stringify(results))}`,
      );
    } else {
      redirect("/search?barcode_no_results=true");
    }
  } else {
    redirect("/search");
  }
}

export async function imageSearchAction(formData: FormData) {
  const imageDataUrl = formData.get("image") as string;

  if (imageDataUrl) {
    const results = await searchByImage(imageDataUrl);
    // For now, redirect to search with results as query param
    if (results.length > 0) {
      redirect(
        `/search?image_results=${encodeURIComponent(JSON.stringify(results))}`,
      );
    } else {
      redirect("/search?image_no_results=true");
    }
  } else {
    redirect("/search");
  }
}
