"use client";

import { AspectRatio, Grid, Sheet, Stack, Typography } from "@mui/joy";
import Image from "next/image";
import { isNil, isNotNil } from "ramda";
import { useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemType } from "@/constants";
import { graphql } from "@/gql";
import spirit1 from "@/images/spirit1.png";
import {
  formatAsPercentage,
  formatVintage,
  getNextPlaceholder,
  nhostImageLoader,
} from "@/utilities";

const getSpiritQuery = graphql(`
  query GetSpirit($itemId: uuid!) {
    cellar_spirit_by_pk(id: $itemId) {
      spirit {
        id
        name
        created_by_id
        vintage
        type
        description
        alcohol_content_percentage
        style
        country
      }
      display_image {
        file_id
        placeholder
      }
      cellar {
        name
      }
    }
  }
`);
const SpiritDetails = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const [{ data, fetching, operation }] = useQuery({
    query: getSpiritQuery,
    variables: { itemId },
  });
  const isLoading = fetching || operation === undefined;

  let spirit = undefined;
  let cellar = undefined;
  const displayImage = data?.cellar_spirit_by_pk?.display_image;

  if (
    isLoading === false &&
    isNotNil(data) &&
    isNotNil(data.cellar_spirit_by_pk) &&
    isNotNil(data.cellar_spirit_by_pk.spirit)
  ) {
    cellar = data.cellar_spirit_by_pk.cellar;
    spirit = data.cellar_spirit_by_pk.spirit;
  }

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemId={itemId}
        itemName={spirit?.name}
        itemType={ItemType.Spirit}
        cellarId={cellarId}
        cellarName={cellar?.name}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack>
            <AspectRatio ratio={1}>
              {isNotNil(displayImage) && (
                <Image
                  src={displayImage.file_id}
                  alt="An picture of a bottle of spirits"
                  height={300}
                  width={300}
                  loader={nhostImageLoader}
                  placeholder={getNextPlaceholder(displayImage.placeholder)}
                />
              )}
              {isNil(displayImage) && (
                <Image
                  src={spirit1}
                  alt="A picture of a bottle of spirits"
                  placeholder="blur"
                  fill
                />
              )}
            </AspectRatio>
          </Stack>
        </Grid>
        <Grid xs={12} sm={8}>
          <Sheet>
            {isLoading === false && spirit !== undefined && (
              <ItemDetails
                title={spirit.name}
                subTitlePhrases={[
                  formatVintage(spirit.vintage),
                  spirit.type,
                  spirit.style,
                  formatAsPercentage(spirit.alcohol_content_percentage),
                ]}
                description={spirit.description}
              />
            )}
          </Sheet>
        </Grid>
        <Grid></Grid>
      </Grid>
    </Stack>
  );
};

export default SpiritDetails;
