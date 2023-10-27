import { graphql } from "../_gql";

export const addItemOnboarding = graphql(`
  mutation AddItemOnboarding($onboarding: item_onboardings_insert_input!) {
    insert_item_onboardings_one(object: $onboarding) {
      id
    }
  }
`);
