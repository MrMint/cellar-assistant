"use client";

import type { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { ItemCard } from "@/components/item/ItemCard";
import { formatItemType } from "@/utilities";

interface SearchResultGridProps {
  items: BarcodeSearchResult[];
}

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
          href={`${formatItemType(item.type).toLowerCase()}s/${item.id}`}
          onClick={onBeforeNavigate}
        />
      )}
    />
  );
}
