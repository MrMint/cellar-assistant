"use client";

import SpiritForm from "@/components/spirit/SpiritForm";
import { graphql } from "@/gql";
import { nullsToUndefined } from "@/utilities";
import { Box } from "@mui/joy";
import { isNotNil, omit } from "ramda";
import { useQuery } from "urql";

const editSpiritPageQuery = graphql(`
  query EditSpiritPageQuery($itemId: uuid!) {
    spirits_by_pk(id: $itemId) {
      id
      name
      created_by_id
      vintage
      type
      style
      description
      alcohol_content_percentage
      price
      upc_12
      ean_13
    }
  }
`);

const EditSpirit = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const [{ data, fetching, operation }] = useQuery({
    query: editSpiritPageQuery,
    variables: { itemId },
  });

  const isLoading = fetching || operation === undefined;

  let spirit = undefined;
  if (
    isLoading === false &&
    data !== undefined &&
    isNotNil(data.spirits_by_pk)
  ) {
    spirit = nullsToUndefined(data.spirits_by_pk);
  }
  return (
    <Box
      sx={(theme) => ({
        width: theme.breakpoints.values.sm,
      })}
    >
      {spirit !== undefined && (
        <SpiritForm
          id={itemId}
          cellarId={cellarId}
          returnUrl={`/cellars/${cellarId}/spirits/${itemId}`}
          defaultValues={{
            name: spirit.name,
            description: spirit.description,
            style: spirit.style,
            vintage: spirit.vintage,
            type: spirit.type,
            alcohol_content_percentage: spirit.alcohol_content_percentage,
            ean_13: spirit.ean_13,
            price: spirit.price,
            upc_12: spirit.upc_12,
          }}
        />
      )}
    </Box>
  );
};

export default EditSpirit;
