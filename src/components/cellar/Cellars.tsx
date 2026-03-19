"use client";

import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { Box, Button, Link, Stack } from "@mui/joy";
import { useMemo } from "react";
import { MdAdd } from "react-icons/md";
import { CellarCardClient } from "@/components/cellar/CellarCardClient";
import { HeaderBar } from "@/components/common/HeaderBar";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { CellarCardFragment } from "./fragments";

interface CellarsProps {
  cellars: Array<FragmentOf<typeof CellarCardFragment>>;
  userId: string;
}

export function Cellars({ cellars, userId }: CellarsProps) {
  const cellarItems = useMemo(
    () =>
      cellars.map((cellar) => ({
        data: readFragment(CellarCardFragment, cellar),
      })),
    [cellars],
  );

  return (
    <Box>
      <Stack spacing={2}>
        <HeaderBar
          serverBreadcrumbs={{}}
          endComponent={
            <Button
              component={Link}
              href={"cellars/add"}
              startDecorator={<MdAdd />}
            >
              Add cellar
            </Button>
          }
        />
        <VirtualGrid
          items={cellarItems}
          cacheKey="cellars"
          getItemKey={(x) => x.data.id}
          gridBreakpoints={{ xs: 12, sm: 6, md: 4, lg: 3 }}
          estimatedRowHeight={120}
          emptyMessage="No cellars found"
          renderItem={(x, onBeforeNavigate) => (
            <Box onClick={onBeforeNavigate}>
              <CellarCardClient
                userId={userId}
                cellar={{
                  ...x.data,
                  coOwners: x.data.coOwners.map((co) => co.user),
                  itemCounts: {
                    wines: x.data.item_counts?.wines?.count ?? 0,
                    beers: x.data.item_counts?.beers?.count ?? 0,
                    spirits: x.data.item_counts?.spirits?.count ?? 0,
                    coffees: x.data.item_counts?.coffees?.count ?? 0,
                    sakes: x.data.item_counts?.sakes?.count ?? 0,
                  },
                }}
              />
            </Box>
          )}
        />
      </Stack>
    </Box>
  );
}
