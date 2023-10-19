"use client";

import { BeerForm } from "@/components/beer/BeerForm";
import { graphql } from "@/gql";
import { nullsToUndefined } from "@/utilities";
import { Box } from "@mui/joy";
import { isNotNil, omit } from "ramda";
import { useQuery } from "urql";

const editBeerPageQuery = graphql(`
  query EditBeerPageQuery($itemId: uuid!) {
    beers_by_pk(id: $itemId) {
      id
      name
      created_by_id
      vintage
      style
      description
      alcohol_content_percentage
      price
      upc_12
      ean_13
      international_bitterness_unit
    }
  }
`);

const EditBeer = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const [{ data, fetching, operation }] = useQuery({
    query: editBeerPageQuery,
    variables: { itemId },
  });

  const isLoading = fetching || operation === undefined;

  let beer = undefined;
  if (isLoading === false && data !== undefined && isNotNil(data.beers_by_pk)) {
    beer = nullsToUndefined(data.beers_by_pk);
  }
  return (
    <Box>
      {beer !== undefined && (
        <BeerForm
          id={itemId}
          cellarId={cellarId}
          returnUrl={`/cellars/${cellarId}/beers/${itemId}`}
          defaultValues={{
            name: beer.name,
            description: beer.description,
            style: beer.style,
            vintage: beer.vintage,
            alcohol_content_percentage: beer.alcohol_content_percentage,
            ean_13: beer.ean_13,
            price: beer.price,
            upc_12: beer.upc_12,
            international_bitterness_unit: beer.international_bitterness_unit,
          }}
        />
      )}
    </Box>
  );
};

export default EditBeer;
