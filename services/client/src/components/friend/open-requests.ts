/**
 * W-13: which incoming requests are still open. Accepting is two-sided
 * (`UserActor.acceptFriendRequest`, §1.7): the recipient's actor writes the
 * friendship at once, and the request row is deleted by the requester's actor
 * when the outbox delivers `confirmFriendship` — a moment later. A re-read
 * straight after Accept can still return the request, so it stayed under
 * Incoming Requests (with Accept and Reject) until the next poll or a reload.
 *
 * A request from someone who is already your friend is closed, whatever the
 * list says, so the page hides it. This keeps holding across the polls in the
 * window before the delivery lands, where hiding the accepted id once would not.
 */
export const openIncomingRequests = <TRow extends { user: { id: string } }>(
  incoming: readonly TRow[],
  friendIds: Iterable<string>,
): readonly TRow[] => {
  const friends = new Set(friendIds);
  if (friends.size === 0) return incoming;
  return incoming.filter((row) => !friends.has(row.user.id));
};
