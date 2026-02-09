"use client";

import { graphql } from "@cellar-assistant/shared";
import { FormatListNumbered } from "@mui/icons-material";
import { Card, CardContent, Chip, Stack, Typography } from "@mui/joy";
import { useQuery } from "urql";
import { Link } from "../common/Link";
import { BAND_JOY_COLORS, BAND_LABELS } from "../tier-list/constants";

const GetTierListsForEntityQuery = graphql(`
  query GetTierListsForEntity(
    $placeId: uuid
    $wineId: uuid
    $beerId: uuid
    $spiritId: uuid
    $coffeeId: uuid
    $sakeId: uuid
  ) {
    tier_list_items(
      where: {
        _or: [
          { place_id: { _eq: $placeId } }
          { wine_id: { _eq: $wineId } }
          { beer_id: { _eq: $beerId } }
          { spirit_id: { _eq: $spiritId } }
          { coffee_id: { _eq: $coffeeId } }
          { sake_id: { _eq: $sakeId } }
        ]
      }
    ) {
      id
      band
      tier_list {
        id
        name
      }
    }
  }
`);

type EntityType = "place" | "wine" | "beer" | "spirit" | "coffee" | "sake";

interface ItemTierListsProps {
  entityId: string;
  entityType: EntityType;
}

function buildVariables(entityId: string, entityType: EntityType) {
  return {
    placeId: entityType === "place" ? entityId : undefined,
    wineId: entityType === "wine" ? entityId : undefined,
    beerId: entityType === "beer" ? entityId : undefined,
    spiritId: entityType === "spirit" ? entityId : undefined,
    coffeeId: entityType === "coffee" ? entityId : undefined,
    sakeId: entityType === "sake" ? entityId : undefined,
  };
}

export function ItemTierLists({ entityId, entityType }: ItemTierListsProps) {
  const [{ data, fetching }] = useQuery({
    query: GetTierListsForEntityQuery,
    variables: buildVariables(entityId, entityType),
  });

  const items = data?.tier_list_items ?? [];

  if (fetching || items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <FormatListNumbered fontSize="small" />
          <Typography level="title-lg">On Lists</Typography>
        </Stack>
        <Stack spacing={1}>
          {items.map((item) => (
            <Stack
              key={item.id}
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
            >
              <Link
                href={`/tier-lists/${item.tier_list.id}`}
                sx={{ textDecoration: "none" }}
              >
                <Typography level="title-sm">{item.tier_list.name}</Typography>
              </Link>
              <Chip
                size="sm"
                variant="soft"
                color={BAND_JOY_COLORS[item.band] ?? "neutral"}
              >
                {BAND_LABELS[item.band] ?? `Band ${item.band}`}
              </Chip>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
