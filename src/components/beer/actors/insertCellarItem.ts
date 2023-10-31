import { isNil } from "ramda";
import { fromPromise } from "xstate";
import { graphql } from "@/gql";
import {
  InsertCellarItemInput,
  InsertCellarItemResult,
} from "../../common/OnboardingWizard/actors/types";

const addBeerMutation = graphql(`
  mutation HeaderAddBeerMutation($input: cellar_beer_insert_input!) {
    insert_cellar_beer_one(object: $input) {
      id
      cellar_id
    }
  }
`);

export const insertCellarItem = fromPromise(
  async ({
    input: { itemId, cellarId, urqlClient },
  }: {
    input: InsertCellarItemInput;
  }): Promise<InsertCellarItemResult> => {
    const addResult = await urqlClient.mutation(addBeerMutation, {
      input: { beer_id: itemId, cellar_id: cellarId },
    });
    if (isNil(addResult.data?.insert_cellar_beer_one?.id)) throw Error();
    return { itemId: addResult.data?.insert_cellar_beer_one?.id ?? "" };
  },
);