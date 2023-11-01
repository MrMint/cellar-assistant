"use client";

import { graphql } from "@/gql";
import withAuth from "@/hocs/withAuth";
import { Box, Button, Grid, Link, Stack } from "@mui/joy";
import { MdAdd } from "react-icons/md";
import { useQuery } from "urql";
import TopNavigationBar from "@/components/common/HeaderBar";
import { CellarCard } from "@/components/cellar/CellarCard";

const cellarsQuery = graphql(`
  query GetCellars {
    cellars {
      id
      name
      createdBy {
        displayName
        avatarUrl
      }
    }
  }
`);

const Cellars = () => {
  const [{ data }] = useQuery({ query: cellarsQuery });

  return (
    <Box>
      <Stack spacing={2}>
        <TopNavigationBar
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
              <CellarCard cellar={x} index={i} />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
};

export default withAuth(Cellars);
