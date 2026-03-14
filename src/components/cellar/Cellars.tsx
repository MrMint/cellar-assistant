"use client";

import { type FragmentOf, readFragment } from "@cellar-assistant/shared";
import { Box, Button, Grid, Link, Stack } from "@mui/joy";
import { MdAdd } from "react-icons/md";
import { CellarCardClient } from "@/components/cellar/CellarCardClient";
import { HeaderBar } from "@/components/common/HeaderBar";
import { useScrollPositionRestore } from "@/utilities/hooks";
import { CellarCardFragment } from "./fragments";

interface CellarsProps {
  cellars: Array<FragmentOf<typeof CellarCardFragment>>;
  userId: string;
}

export function Cellars({ cellars, userId }: CellarsProps) {
  const { sentinelRef, saveScrollPosition } = useScrollPositionRestore();

  return (
    <Box>
      <div ref={sentinelRef} style={{ height: 0, overflow: "hidden" }} />
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
        <Grid container spacing={2} sx={{ flexGrow: 1 }}>
          {cellars.map((cellar, i) => {
            const cellarData = readFragment(CellarCardFragment, cellar);
            return (
              <Grid
                key={cellarData.id}
                xs={12}
                sm={6}
                md={4}
                lg={3}
                onClick={saveScrollPosition}
              >
                <CellarCardClient
                  userId={userId}
                  cellar={{
                    ...cellarData,
                    coOwners: cellarData.coOwners.map((x) => x.user),
                  }}
                  index={i}
                />
              </Grid>
            );
          })}
        </Grid>
      </Stack>
    </Box>
  );
}
