import { fromPromise } from "xstate";
import {
  InsertCellarItemInput,
  InsertCellarItemResult,
} from "../../common/OnboardingWizard/actors/types";
import { isNil } from "ramda";
import { graphql } from "@/gql";

const addWineMutation = graphql(`
  mutation HeaderAddWineMutation($input: cellar_wine_insert_input!) {
    insert_cellar_wine_one(object: $input) {
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
    const addResult = await urqlClient.mutation(addWineMutation, {
      input: { wine_id: itemId, cellar_id: cellarId },
    });
    if (isNil(addResult.data?.insert_cellar_wine_one?.id)) throw Error();
    return { itemId: addResult.data?.insert_cellar_wine_one?.id ?? "" };
  },
);
