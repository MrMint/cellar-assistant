import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * K2 · "Needs details" (MC-drafts): the viewer's saved drafts and the writes
 * that finish one. Every draft is owner-only on the server (§2.1): the list,
 * the count, `saveDraft` and `confirmItemOnboarding` all answer someone
 * else's onboarding as not found, so nothing here can reach another person's
 * bottle by naming its id.
 */

/** One saved draft, as its row and the finish-one sheet read it. */
export const NeedsDetailsDraftFragment = graphql(`
  fragment NeedsDetailsDraft on ItemOnboarding @_unmask {
    __typename
    id
    itemType
    status
    cellarId
    displayName
    displayMaker
    draftFields
    confirmedFields
    vintageAnswer
    imageId
    imageUrl
    updatedAt
  }
`);

/**
 * A page of drafts (newest first) and the count across every kind. `first` is
 * at most 100 (the API's page cap); one page of one flat connection costs
 * 100 rows, well under the 10,000-row limit (`queries-cost.test.ts`).
 */
export const NeedsDetailsQuery = graphql(
  `
  query NeedsDetails($cellarId: ID, $first: Int!, $after: String) {
    needsDetailsCount(cellarId: $cellarId)
    needsDetails(cellarId: $cellarId, first: $first, after: $after) {
      __typename
      ... on ItemOnboardingConnection {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            ...NeedsDetailsDraft
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [NeedsDetailsDraftFragment, ActorErrorFieldsFragment],
);

/** The cellar `?cellar=` names, for the subtitle ("12 bottles · Home"). */
export const NeedsDetailsCellarQuery = graphql(
  `
  query NeedsDetailsCellar($cellarId: ID!) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        name
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** Keep what the person filled in; the draft stays listed until confirmed. */
export const SaveNeedsDetailsDraftMutation = graphql(
  `
  mutation SaveNeedsDetailsDraft($input: SaveDraftInput!) {
    saveDraft(input: $input) {
      __typename
      ... on ItemOnboarding {
        ...NeedsDetailsDraft
      }
      ...ActorErrorFields
    }
  }
`,
  [NeedsDetailsDraftFragment, ActorErrorFieldsFragment],
);

/**
 * File a finished draft as a bottle. `cellarId` is left out on purpose: the
 * draft's own cellar, which `saveDraft` authorised against its owner.
 */
export const ConfirmNeedsDetailsDraftMutation = graphql(
  `
  mutation ConfirmNeedsDetailsDraft(
    $onboardingId: ID!
    $input: ConfirmItemOnboardingInput!
  ) {
    confirmItemOnboarding(onboardingId: $onboardingId, input: $input) {
      __typename
      ... on ConfirmedItemOnboarding {
        onboardingId
        itemId
        itemType
        cellarItemId
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * Delete a draft (F-65, H-133): the session becomes `DISCARDED`, which is
 * listed and counted nowhere. A discarded session refuses `saveDraft`, so
 * Undo is the wait before this is sent.
 */
export const DiscardNeedsDetailsDraftMutation = graphql(
  `
  mutation DiscardNeedsDetailsDraft($onboardingId: ID!) {
    discardDraft(onboardingId: $onboardingId) {
      __typename
      ... on ItemOnboarding {
        id
        status
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
