"use client";

import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { Box, Button, Link, Stack } from "@mui/joy";
import { useMemo } from "react";
import { MdAdd } from "react-icons/md";
import { HeaderBar } from "@/components/common/HeaderBar";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { TierListCardFragment } from "./fragments";
import { TierListCard } from "./TierListCard";

interface TierListsPageProps {
  tierLists: Array<FragmentOf<typeof TierListCardFragment>>;
}

export function TierListsPage({ tierLists }: TierListsPageProps) {
  const tierListItems = useMemo(
    () =>
      tierLists.map((tierList) => readFragment(TierListCardFragment, tierList)),
    [tierLists],
  );

  return (
    <Box>
      <Stack spacing={2}>
        <HeaderBar
          serverBreadcrumbs={{}}
          endComponent={
            <Button
              component={Link}
              href="/tier-lists/add"
              startDecorator={<MdAdd />}
            >
              New tier list
            </Button>
          }
        />
        <VirtualGrid
          items={tierListItems}
          cacheKey="tier-lists"
          getItemKey={(data) => data.id}
          gridBreakpoints={{ xs: 12, sm: 6, md: 4, lg: 3 }}
          emptyMessage="No tier lists found"
          renderItem={(data, onBeforeNavigate) => (
            <Box onClick={onBeforeNavigate}>
              <TierListCard tierList={data} />
            </Box>
          )}
        />
      </Stack>
    </Box>
  );
}
