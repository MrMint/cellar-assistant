"use client";

import { Box, Button, Grid, Link, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { useRouter } from "next/navigation";
import { isNil } from "ramda";
import { useCallback } from "react";
import { MdAdd } from "react-icons/md";
import { useQuery } from "urql";
import { CellarCard } from "@/components/cellar/CellarCard";
import { HeaderBar } from "@/components/common/HeaderBar";
import withAuth from "@/hocs/withAuth";

const cellarsQuery = graphql(`
  query GetCellars {
    cellars {
      id
      name
      createdBy {
        id
        displayName
        avatarUrl
      }
      coOwners: co_owners {
        user {
          id
          displayName
          avatarUrl
        }
      }
    }
  }
`);

const Cellars = () => {
  const [{ data }] = useQuery({ query: cellarsQuery });
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Nil UserId");
  const router = useRouter();

  const handleEditClick = useCallback(
    (cellarId: string) => router.push(`/cellars/${cellarId}/edit`),
    [router],
  );

  return (
    <Box>
      <Stack spacing={2}>
        <HeaderBar
          breadcrumbs={[{ url: "/cellars", text: "Cellars" }]}
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
          {data?.cellars.map((x, i) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={3}>
              <CellarCard
                userId={userId}
                cellar={{ ...x, coOwners: x.coOwners.map((y) => y.user) }}
                index={i}
                onEditClick={handleEditClick}
              />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
};

export default withAuth(Cellars);
