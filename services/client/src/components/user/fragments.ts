import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * `/users/edit`, against the new API (`services/api`). `updateProfile` proxies to
 * better-auth's `user` table at the storage level (B4 outcome) — `role`,
 * `disabled` and `emailVerified` are deliberately absent from
 * `UpdateProfileInput`, so there is no field here that could write them.
 *
 * A rewrite of the Nhost-era `fragments.ts` rather than an edit to it; nothing
 * outside `/users/edit` imports this module.
 */

export const ViewerProfileFragment = graphql(`
  fragment ViewerProfile on UserProfile @_unmask {
    id
    displayName
    avatarUrl
    locale
    email
  }
`);

export const MyProfileQuery = graphql(
  `
  query MyProfile {
    me {
      id
      profile {
        ...ViewerProfile
      }
    }
  }
`,
  [ViewerProfileFragment],
);

export const UpdateProfileMutation = graphql(
  `
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      __typename
      ... on UserProfile {
        ...ViewerProfile
      }
      ...ActorErrorFields
    }
  }
`,
  [ViewerProfileFragment, ActorErrorFieldsFragment],
);
