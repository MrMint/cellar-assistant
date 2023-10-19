"use client";

import WineForm from "@/components/wine/WineForm";
import { graphql } from "@/gql";
import { nullsToUndefined } from "@/utilities";
import { Box } from "@mui/joy";
import { isNotNil, omit } from "ramda";
import { useQuery } from "urql";

const editWinePageQuery = graphql(`
  query EditWinePageQuery($itemId: uuid!) {
    wines_by_pk(id: $itemId) {
      id
      name
      description
      created_by_id
      vintage
      description
      alcohol_content_percentage
      price
      ean_13
      upc_12
      special_designation
      vineyard_designation
      variety
      region
    }
  }
`);

const EditWine = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const [{ data, fetching, operation }] = useQuery({
    query: editWinePageQuery,
    variables: { itemId },
  });

  const isLoading = fetching || operation === undefined;

  let wine = undefined;
  if (isLoading === false && data !== undefined && isNotNil(data.wines_by_pk)) {
    wine = nullsToUndefined(data.wines_by_pk);
  }
  return (
    <Box>
      {wine !== undefined && (
        <WineForm
          id={itemId}
          cellarId={cellarId}
          returnUrl={`/cellars/${cellarId}/wines/${itemId}`}
          defaultValues={{
            name: wine.name,
            description: wine.description,
            vintage: wine.vintage,
            alcohol_content_percentage: wine.alcohol_content_percentage,
            ean_13: wine.ean_13,
            price: wine.price,
            upc_12: wine.upc_12,
            region: wine.region,
            special_designation: wine.special_designation,
            variety: wine.variety,
            vineyard_designation: wine.vineyard_designation,
          }}
        />
      )}
    </Box>
  );
};

export default EditWine;
