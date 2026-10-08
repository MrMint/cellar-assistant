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
          "Make it public or friends-only from Edit, then share the link.",
      }
    : null;
};
