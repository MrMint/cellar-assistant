"use client";

import { Box } from "@mui/joy";
import { graphql } from "@shared/gql";
import { isNotNil, omit } from "ramda";
import { useQuery } from "urql";
import { CoffeeForm } from "@/components/coffee/CoffeeForm";
import { nullsToUndefined } from "@/utilities";

const editCoffeePageQuery = graphql(`
  query EditCoffeePageQuery($itemId: uuid!) {
    coffees_by_pk(id: $itemId) {
      id
      name
      created_by_id
      description
      barcode_code
      country
    }
  }
`);

const EditCoffee = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const [{ data, fetching, operation }] = useQuery({
    query: editCoffeePageQuery,
    variables: { itemId },
  });

  const isLoading = fetching || operation === undefined;

  let coffee = undefined;
  if (
    isLoading === false &&
    data !== undefined &&
    isNotNil(data.coffees_by_pk)
  ) {
    coffee = nullsToUndefined(data.coffees_by_pk);
  }
  return (
    <>
      {coffee !== undefined && (
        <CoffeeForm
          id={itemId}
          onCreated={() => {}}
          defaultValues={{
            name: coffee.name,
            description: coffee.description,
            barcode_code: coffee.barcode_code,
          }}
        />
      )}
    </>
  );
};

export default EditCoffee;
