import { eventually } from "./data.ts";
import type { Gql } from "./test.ts";

/**
 * X19 fixtures: a catalogue item of a type that can only be created through
 * the onboarding flow (`item_onboarding_id NOT NULL` on wines, beers,
 * spirits and coffees), made through the API rather than the wizard.
 *
 * `startItemOnboarding` with no photograph is refused (E2c: nothing to read)
 * but leaves the session open — or, on a stack with no AI provider, refused
 * `AI_UNCONFIGURED` with the same open row — and `confirmItemOnboarding`
 * works against it either way. The item is written by the outbox, so this
 * polls until it can be read. Items have no delete: they outlive the run.
 */
export async function onboardItem(
  api: Gql,
  input: {
    type: "WINE" | "COFFEE";
    name: string;
    description?: string | null;
    brandName?: string | null;
    attributes: Record<string, unknown>;
  },
): Promise<string> {
  const onboardingId = crypto.randomUUID();
  // The answer is a refusal (nothing to read); 04 asserts that. Only the
  // session it leaves behind matters here.
  await api.query(
    `mutation S($id: ID!, $type: ItemType!) {
       startItemOnboarding(input: { itemType: $type }, onboardingId: $id) {
         __typename
       }
     }`,
    { id: onboardingId, type: input.type },
  );
  const confirmed = await api.query(
    `mutation C($id: ID!, $input: ConfirmItemOnboardingInput!) {
       confirmItemOnboarding(onboardingId: $id, input: $input) {
         __typename
         ... on ConfirmedItemOnboarding { itemId }
         ... on Error { message }
       }
     }`,
    {
      id: onboardingId,
      input: {
        name: input.name,
        description: input.description ?? null,
        brandName: input.brandName ?? null,
        attributes: input.attributes,
      },
    },
  );
  if (
    confirmed.confirmItemOnboarding.__typename !== "ConfirmedItemOnboarding"
  ) {
    throw new Error(
      `confirmItemOnboarding refused: ${JSON.stringify(confirmed.confirmItemOnboarding)}`,
    );
  }
  const itemId: string = confirmed.confirmItemOnboarding.itemId;
  await eventually(
    async () => {
      const read = await api.query(
        `query I($id: ID!, $type: ItemType!) {
           item(id: $id, type: $type) { __typename }
         }`,
        { id: itemId, type: input.type },
      );
      return read.item.__typename === "QueryItemSuccess";
    },
    { timeoutMs: 45_000, what: `the outbox to write ${input.type} ${itemId}` },
  );
  return itemId;
}

/** The first value of a reference table, or a thrown "not seeded". */
export async function firstReferenceValue(
  api: Gql,
  kind: "WINE_STYLE",
): Promise<string> {
  const data = await api.query(
    `query R($kind: ReferenceKind!) { referenceData(kind: $kind, first: 1) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
    { kind },
  );
  const value = data.referenceData.edges[0]?.node.value;
  if (typeof value !== "string") throw new Error(`no ${kind} rows seeded`);
  return value;
}
