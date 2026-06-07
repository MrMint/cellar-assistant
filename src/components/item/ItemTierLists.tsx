import { graphql } from "@cellar-assistant/shared";
import { Card, CardContent, Chip, Stack, Typography } from "@mui/joy";
import { MdFormatListNumbered } from "react-icons/md";
import { serverQuery } from "@/lib/urql/server";
import { Link } from "../common/Link";
import {
  BAND_JOY_COLORS,
  BAND_LABELS,
  type TierListEntityType,
} from "../tier-list/constants";

const GetTierListsForEntityQuery = graphql(`
  query GetTierListsForEntity(
    $placeId: uuid
    $wineId: uuid
    $beerId: uuid
    $spiritId: uuid
    $coffeeId: uuid
    $sakeId: uuid
    $teaId: uuid
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
          { tea_id: { _eq: $teaId } }
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

interface ItemTierListsProps {
  entityId: string;
  entityType: TierListEntityType;
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function buildVariables(entityId: string, entityType: TierListEntityType) {
  return {
    placeId: entityType === "place" ? entityId : NIL_UUID,
    wineId: entityType === "wine" ? entityId : NIL_UUID,
    beerId: entityType === "beer" ? entityId : NIL_UUID,
    spiritId: entityType === "spirit" ? entityId : NIL_UUID,
    coffeeId: entityType === "coffee" ? entityId : NIL_UUID,
    sakeId: entityType === "sake" ? entityId : NIL_UUID,
    teaId: entityType === "tea" ? entityId : NIL_UUID,
  };
}

/**
 * Server component showing which tier lists an entity already appears on.
 * Fetched server-side so it re-renders on router.refresh() (e.g. after the
 * "Add to Tier List" modal adds the item).
 */
export async function ItemTierLists({
  entityId,
  entityType,
}: ItemTierListsProps) {
  const data = await serverQuery(
    GetTierListsForEntityQuery,
    buildVariables(entityId, entityType),
  );

  const items = data?.tier_list_items ?? [];

  if (items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <MdFormatListNumbered size={20} />
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
              {item.tier_list ? (
                <Link
                  href={`/tier-lists/${item.tier_list.id}`}
                  sx={{ textDecoration: "none" }}
                >
                  <Typography level="title-sm">
                    {item.tier_list.name}
                  </Typography>
                </Link>
              ) : (
                <Typography level="title-sm">Unknown list</Typography>
              )}
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
