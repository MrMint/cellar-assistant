"use client";

import { Box, Button, Grid, Stack } from "@mui/joy";
import { MdAdd } from "react-icons/md";
import { useQuery } from "urql";
import TopNavigationBar from "@/components/common/HeaderBar";
import Link from "@/components/common/Link";
import { ItemCard } from "@/components/item/ItemCard";
import { ItemType } from "@/constants";
import { graphql } from "@/gql";
import withAuth from "@/hocs/withAuth";

const itemsSub = graphql(`
  query GetItemsQuery($cellarId: uuid!) {
    cellar_beer(where: { cellar_id: { _eq: $cellarId } }) {
      id
      display_image {
        file_id
        placeholder
      }
      beer {
        name
      }
    }
    cellar_wine(where: { cellar_id: { _eq: $cellarId } }) {
      id
      display_image {
        file_id
        placeholder
      }
      wine {
        name
        vintage
      }
    }
    cellar_spirit(where: { cellar_id: { _eq: $cellarId } }) {
      id
      display_image {
        file_id
        placeholder
      }
      spirit {
        name
        vintage
      }
    }
    cellars_by_pk(id: $cellarId) {
      id
      name
    }
  }
`);

const Items = ({ params: { cellarId } }: { params: { cellarId: string } }) => {
  const [res] = useQuery({
    query: itemsSub,
    variables: { cellarId },
  });

  return (
    <Box>
      <Stack spacing={2}>
        <TopNavigationBar
          breadcrumbs={[
            { url: "/cellars", text: "Cellars" },
            {
              url: `items`,
              text: res.data?.cellars_by_pk?.name ?? "loading...",
            },
          ]}
          endComponent={
            <Button
              component={Link}
              href={"items/add"}
              startDecorator={<MdAdd />}
            >
              Add item
            </Button>
          }
        />
        <Grid container spacing={2}>
          {res?.data?.cellar_beer.map((x) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={2}>
              <ItemCard
                item={{
                  id: x.id,
                  name: x.beer.name,
                  displayImageId: x.display_image?.file_id,
                  placeholder: x.display_image?.placeholder,
                }}
                type={ItemType.Beer}
                href={`${ItemType[ItemType.Beer].toLowerCase()}s/${x.id}`}
              />
            </Grid>
          ))}
          {res?.data?.cellar_wine.map((x) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={2}>
              <ItemCard
                item={{
                  id: x.id,
                  name: x.wine.name,
                  vintage: x.wine.vintage,
                  displayImageId: x.display_image?.file_id,
                  placeholder: x.display_image?.placeholder,
                }}
                type={ItemType.Wine}
                href={`${ItemType[ItemType.Wine].toLowerCase()}s/${x.id}`}
              />
            </Grid>
          ))}
          {res?.data?.cellar_spirit.map((x) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={2}>
              <ItemCard
                item={{
                  id: x.id,
                  name: x.spirit.name,
                  displayImageId: x.display_image?.file_id,
                  placeholder: x.display_image?.placeholder,
                }}
                type={ItemType.Spirit}
                href={`${ItemType[ItemType.Spirit].toLowerCase()}s/${x.id}`}
              />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
};

export default withAuth(Items);
