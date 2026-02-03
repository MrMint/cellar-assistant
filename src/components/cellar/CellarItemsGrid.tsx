"use client";

import { Grid } from "@mui/joy";
import type { TransformedCellarItem } from "./cellarItemsServer";
import { ItemCard } from "@/components/item/ItemCard";
import { formatItemType } from "@/utilities";
import { useScrollRestore } from "@/utilities/hooks";

interface CellarItemsGridProps {
  items: TransformedCellarItem[];
}

export function CellarItemsGrid({ items }: CellarItemsGridProps) {
  const { scrollId, setScrollId, scrollTargetRef } = useScrollRestore();

  return (
    <Grid container spacing={2}>
      {items.map((x) => (
        <Grid
          ref={scrollId === x.item.id ? scrollTargetRef : null}
          id={x.item.id}
          key={x.item.id}
          xs={items.length > 6 ? 6 : 12}
          sm={6}
          md={4}
          lg={3}
          xl={2}
        >
          <ItemCard
            item={x.item}
            type={x.type}
            href={`${formatItemType(x.type).toLowerCase()}s/${x.item.id}`}
            onClick={() => setScrollId(x.item.id)}
          />
        </Grid>
      ))}
    </Grid>
  );
}
