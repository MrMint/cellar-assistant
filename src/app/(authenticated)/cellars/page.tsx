"use client";

import { graphql } from "@/gql";
import withAuth from "@/hocs/withAuth";
import { Avatar, Card, CardContent, Grid, Link, Typography } from "@mui/joy";
import NextLink from "next/link";
import { useQuery } from "urql";

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
    <Grid container spacing={2} sx={{ flexGrow: 1 }}>
      {data?.cellars.map((x) => (
        <Grid key={x.id} xs={6} md={4}>
          <Card>
            <Link overlay component={NextLink} href={`cellars/${x.id}/items`}>
              <Typography level="title-lg">{x.name}</Typography>
            </Link>
            <Typography level="body-sm">{x.createdBy.displayName}</Typography>
            <Avatar src={x.createdBy.avatarUrl} />
          </Card>
        </Grid>
      ))}
      <Grid key="add-new-cellar" xs={6} md={4}>
        <Card>
          <CardContent>
            <Link overlay component={NextLink} href={`cellars/add`}>
              <Typography level="title-md">Add a new cellar</Typography>
            </Link>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default withAuth(Cellars);
