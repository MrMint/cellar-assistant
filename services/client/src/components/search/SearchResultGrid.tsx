"use client";

import { VirtualGrid } from "@/components/common/VirtualGrid";
import { ItemCard } from "@/components/item/ItemCard";
import { itemHref } from "@/components/item-api/itemTypes";
import type { SearchResultItem } from "./adapter";

interface SearchResultGridProps {
  items: SearchResultItem[];
}

/**
 * `82450ad1:src/components/search/SearchResultGrid.tsx`, restored. The card
 * link is absolute (`/wines/<id>`): the old relative `wines/<id>` resolved
 * against `/search` only by luck of the route depth (§7).
 */
export function SearchResultGrid({ items }: SearchResultGridProps) {
  return (
    <VirtualGrid
      items={items}
      cacheKey="search-results"
      getItemKey={(item) => item.id}
      gridBreakpoints={{ xs: items.length > 6 ? 6 : 12, sm: 6, md: 4, lg: 2 }}
      emptyMessage="No results found"
      renderItem={(item, onBeforeNavigate) => (
        <ItemCard
          item={item}
          type={item.type}
          href={itemHref(item.type, item.id)}
          onClick={onBeforeNavigate}
        />
      )}
    />
  );
}
