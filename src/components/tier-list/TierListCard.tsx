"use client";

import type { FragmentOf } from "@cellar-assistant/shared";
import { Avatar, Card, CardContent, Chip, Stack, Typography } from "@mui/joy";
import Link from "next/link";
import { MdGroup, MdLock, MdPublic } from "react-icons/md";
import type { TierListCardFragment } from "./fragments";

type TierListCardProps = {
  tierList: FragmentOf<typeof TierListCardFragment>;
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
};

export function TierListCard({ tierList }: TierListCardProps) {
  const PrivacyIcon = privacyIcons[tierList.privacy] ?? MdLock;
  const itemCount = tierList.items_aggregate.aggregate?.count ?? 0;
  const typeLabel = listTypeLabels[tierList.list_type] ?? tierList.list_type;
  const creatorName = tierList.createdBy?.displayName ?? "Unknown user";
  const creatorInitial = creatorName.charAt(0).toUpperCase();

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
              <Avatar
                src={tierList.createdBy?.avatarUrl ?? undefined}
                size="sm"
                sx={{ width: 20, height: 20 }}
              >
                {creatorInitial}
              </Avatar>
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
