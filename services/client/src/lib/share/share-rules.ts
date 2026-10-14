/**
 * When a Share button should say "not yet" instead of opening the share
 * sheet (X17). The API decides who can see what; this only keeps the app
 * from handing someone a link that is certain to say "doesn't exist or isn't
 * shared with you" to everyone they send it to.
 */

export type ShareBlock = { message: string; description: string };

/**
 * A tier list's privacy, as the viewer sees it:
 *
 * - PUBLIC: anyone, signed in or not — share.
 * - FRIENDS: the owner's friends after signing in — share; anyone else gets
 *   the sign-in page and then the not-found message, which is the point.
 * - PRIVATE: the owner only. Their own link would work for them alone, so
 *   say how to change that rather than share a dead link.
 */
export const tierListShareBlock = (
  privacy: string,
  isOwner: boolean,
): ShareBlock | null => {
  if (privacy !== "PRIVATE") return null;
  return isOwner
    ? {
        message: "Only you can see this list",
        description:
          "Make it public or friends-only with Edit list, then share the link.",
      }
    : null;
};

/**
 * A recipe's privacy and draft state, as the viewer sees it (X15 / D22):
 *
 * - PUBLIC, saved: anyone — share (signed out, the link is its share page).
 * - FRIENDS, saved: the author's friends after signing in — share, as for a
 *   tier list.
 * - PRIVATE, or a draft whatever its privacy: the author only — say how to
 *   change that rather than hand out a link that 404s for everyone else.
 *
 * Nobody but the author ever sees a PRIVATE recipe or a draft, so for anyone
 * else this is never a block.
 */
export const recipeShareBlock = (
  privacy: string,
  isDraft: boolean,
  isOwner: boolean,
): ShareBlock | null => {
  if (!isOwner) return null;
  if (isDraft) {
    return {
      message: "This is still a draft",
      description:
        "Check it and save it first, then make it public or friends-only to share it.",
    };
  }
  if (privacy !== "PRIVATE") return null;
  return {
    message: "Only you can see this recipe",
    description:
      "Make it public or friends-only with Edit recipe, then share the link.",
  };
};
