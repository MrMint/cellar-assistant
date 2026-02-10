"use client";

import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { Box, Button, Grid, Link, Stack } from "@mui/joy";
import { MdAdd } from "react-icons/md";
import { HeaderBar } from "@/components/common/HeaderBar";
import { TierListCardFragment } from "./fragments";
import { TierListCard } from "./TierListCard";

interface TierListsPageProps {
  tierLists: Array<FragmentOf<typeof TierListCardFragment>>;
}

export function TierListsPage({ tierLists }: TierListsPageProps) {
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
        <Grid container spacing={2} sx={{ flexGrow: 1 }}>
          {tierLists.map((tierList) => {
            const data = readFragment(TierListCardFragment, tierList);
            return (
              <Grid key={data.id} xs={12} sm={6} md={4} lg={3}>
                <TierListCard tierList={data} />
              </Grid>
            );
          })}
        </Grid>
      </Stack>
    </Box>
  );
}
