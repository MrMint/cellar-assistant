"use client";

/**
 * `82450ad1:src/components/tier-list/TierListCard.tsx`, restored. Only the
 * field names change: `items_aggregate.count` → `itemCount`, `list_type` →
 * `listType`; `createdBy` is G4's `UserProfile` (null when signed out, which
 * reads "Unknown user" as before).
 */

import { Card, CardContent, Chip, Stack, Typography } from "@mui/joy";
import Link from "next/link";
import { MdGroup, MdLock, MdPublic } from "react-icons/md";
import type { ResultOf } from "@/lib/api/graphql";
import { UserAvatar } from "../common/UserAvatar";
import type { TierListCardFragment } from "./fragments";

/** The unmasked `TierListCard` fragment. */
export type TierListCardData = ResultOf<typeof TierListCardFragment>;

type TierListCardProps = {
  tierList: TierListCardData;
};

const privacyIcons: Record<string, typeof MdLock> = {
  PRIVATE: MdLock,
  FRIENDS: MdGroup,
  PUBLIC: MdPublic,
};

const listTypeLabels: Record<string, string> = {
  place: "Places",
  wine: "Wines",
  beer: "Beers",
  spirit: "Spirits",
  coffee: "Coffees",
  sake: "Sake",
  tea: "Teas",
};

export function TierListCard({ tierList }: TierListCardProps) {
  const PrivacyIcon = privacyIcons[tierList.privacy] ?? MdLock;
  const itemCount = tierList.itemCount;
  const typeLabel = listTypeLabels[tierList.listType] ?? tierList.listType;
  const creatorName = tierList.createdBy?.displayName ?? "Unknown user";

  return (
    <Link
      href={`/tier-lists/${tierList.id}`}
      style={{ textDecoration: "none" }}
    >
      <Card
        variant="outlined"
        sx={{
          cursor: "pointer",
          transition: "border-color 0.2s",
          "&:hover": { borderColor: "primary.300" },
          height: "100%",
        }}
      >
        <CardContent>
          <Stack spacing={1}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
            >
              <Typography level="title-lg" sx={{ flex: 1, minWidth: 0 }}>
                {tierList.name}
              </Typography>
              <PrivacyIcon
                style={{
                  fontSize: 18,
                  color: "var(--joy-palette-neutral-500)",
                }}
              />
            </Stack>

            {tierList.description && (
              <Typography
                level="body-sm"
                sx={{
                  color: "text.secondary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {tierList.description}
              </Typography>
            )}

            <Stack direction="row" spacing={1} alignItems="center">
              <Chip variant="soft" color="neutral" size="sm">
                {typeLabel}
              </Chip>
              <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <UserAvatar
                avatarUrl={tierList.createdBy?.avatarUrl}
                displayName={creatorName}
                size="sm"
                sx={{ width: 20, height: 20 }}
              />
              <Typography level="body-xs" sx={{ color: "text.secondary" }}>
                {creatorName}
              </Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Link>
  );
}
