"use client";

import { Grid } from "@mui/joy";
import type { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";
import { ItemCard } from "@/components/item/ItemCard";
import { formatItemType } from "@/utilities";
import { useScrollPositionRestore } from "@/utilities/hooks";

interface SearchResultGridProps {
  items: BarcodeSearchResult[];
}

export function SearchResultGrid({ items }: SearchResultGridProps) {
  const { sentinelRef, saveScrollPosition } = useScrollPositionRestore();

  return (
    <>
      <div ref={sentinelRef} style={{ height: 0, overflow: "hidden" }} />
      <Grid container spacing={2}>
        {items.map((item) => (
          <Grid
            key={item.id}
            xs={items.length > 6 ? 6 : 12}
            sm={6}
            md={4}
            lg={2}
          >
            <ItemCard
              item={item}
              type={item.type}
              href={`${formatItemType(item.type).toLowerCase()}s/${item.id}`}
              onClick={saveScrollPosition}
            />
          </Grid>
        ))}
      </Grid>
    </>
  );
}
