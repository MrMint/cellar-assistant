"use client";

import { isNotNil, omit } from "ramda";
import { useQuery } from "urql";
import { SpiritForm } from "@/components/spirit/SpiritForm";
import { graphql } from "@/gql";
import { nullsToUndefined } from "@/utilities";

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
      barcode_code
      country
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
    <>
      {spirit !== undefined && (
        <SpiritForm
          id={itemId}
          cellarId={cellarId}
          onCreated={() => {}}
          // returnUrl={`/cellars/${cellarId}/spirits/${itemId}`}
          defaultValues={{
            name: spirit.name,
            description: spirit.description,
            style: spirit.style,
            vintage: spirit.vintage,
            type: spirit.type,
            alcohol_content_percentage: spirit.alcohol_content_percentage,
            barcode_code: spirit.barcode_code,
          }}
        />
      )}
    </>
  );
};

export default EditSpirit;
