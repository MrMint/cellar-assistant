import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * `/users/edit`, against the new API (`services/api`). `updateProfile` proxies to
 * better-auth's `user` table at the storage level (B4 outcome) — `role`,
 * `disabled` and `emailVerified` are deliberately absent from
 * `UpdateProfileInput`, so there is no field here that could write them.
 *
 * Nothing outside `/users/edit` imports this module.
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

/**
 * MC-avatar: make an uploaded file the viewer's picture. The file id is the
 * only thing sent; the API writes the viewer's own row, and refuses a file
 * that is not the viewer's own verified `avatar` upload (`avatar.test.ts`).
 */
export const SetAvatarMutation = graphql(
  `
  mutation SetAvatar($fileId: ID!) {
    setAvatar(fileId: $fileId) {
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

/** Clear the viewer's picture; `avatarUrl` falls back to the provider's. */
export const RemoveAvatarMutation = graphql(
  `
  mutation RemoveAvatar {
    removeAvatar {
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
