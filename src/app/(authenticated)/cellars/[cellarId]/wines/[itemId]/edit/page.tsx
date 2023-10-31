"use client";

import { Box } from "@mui/joy";
import { isNotNil, omit } from "ramda";
import { useQuery } from "urql";
import { WineForm } from "@/components/wine/WineForm";
import { graphql } from "@/gql";
import { nullsToUndefined } from "@/utilities";

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
      barcode_code
      special_designation
      vineyard_designation
      variety
      region
      style
      country
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
    <>
      {wine !== undefined && (
        <WineForm
          id={itemId}
          cellarId={cellarId}
          onCreated={() => {}}
          // returnUrl={`/cellars/${cellarId}/wines/${itemId}`}
          defaultValues={{
            name: wine.name,
            description: wine.description,
            vintage: wine.vintage,
            alcohol_content_percentage: wine.alcohol_content_percentage,
            barcode_code: wine.barcode_code,
            region: wine.region,
            country: wine.country,
            special_designation: wine.special_designation,
            variety: wine.variety,
            style: wine.style,
            vineyard_designation: wine.vineyard_designation,
          }}
        />
      )}
    </>
  );
};

export default EditWine;
