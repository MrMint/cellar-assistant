"use client";

import { Grid, Stack, Typography } from "@mui/joy";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CheckInButton } from "@/components/cellar-api/CheckInButton";
import { ItemCard } from "@/components/item/ItemCard";
import { type CellarGridItem, cellarBottleHref } from "./adapter";

/**
 * The overview's "Open and recent" preview: restored `ItemCard`s in the old
 * items grid's breakpoints, each with the one bottle action this page keeps —
 * "Check in" — because the cellar's check-in history is what the page is for
 * and the bottle page that will own check-ins (wave 3) is not restored yet.
 * Open / pour / empty / remove go with decision 2's "per-card bottle
 * controls"; they return on the bottle page.
 *
 * A check-in re-renders the server page, so the history below updates.
 */
export function CellarOverviewItems({
  cellarId,
  items,
  viewerId,
}: {
  cellarId: string;
  items: CellarGridItem[];
  viewerId: string | null;
}) {
  const router = useRouter();
  const onCheckedIn = useCallback(() => router.refresh(), [router]);

  if (items.length === 0) {
    return (
      <Typography level="body-md" sx={{ textAlign: "center", py: 4 }}>
        No items in this cellar
      </Typography>
    );
  }

  return (
    <Grid container spacing={2}>
      {items.map((x) => (
        <Grid
          key={x.item.id}
          xs={items.length > 6 ? 6 : 12}
          sm={6}
          md={4}
          lg={3}
          xl={2}
        >
          <Stack spacing={1}>
            <ItemCard
              item={x.item}
              type={x.type}
              href={cellarBottleHref(cellarId, x)}
            />
            <CheckInButton
              cellarId={cellarId}
              cellarItemId={x.item.id}
              itemName={x.item.name}
              viewerId={viewerId}
              onCheckedIn={onCheckedIn}
            />
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}
