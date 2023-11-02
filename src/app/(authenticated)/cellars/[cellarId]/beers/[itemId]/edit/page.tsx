"use client";

import { Box } from "@mui/joy";
import { isNotNil, omit } from "ramda";
import { useQuery } from "urql";
import { BeerForm } from "@/components/beer/BeerForm";
import { graphql } from "@/gql";
import { nullsToUndefined } from "@/utilities";

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
      barcode_code
      international_bitterness_unit
      country
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
    <>
      {beer !== undefined && (
        <BeerForm
          id={itemId}
          onCreated={() => {}}
          // returnUrl={`/cellars/${cellarId}/beers/${itemId}`}
          defaultValues={{
            name: beer.name,
            description: beer.description,
            style: beer.style,
            vintage: beer.vintage,
            alcohol_content_percentage: beer.alcohol_content_percentage,
            barcode_code: beer.barcode_code,
            international_bitterness_unit: beer.international_bitterness_unit,
          }}
        />
      )}
    </>
  );
};

export default EditBeer;
