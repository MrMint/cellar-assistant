/**
 * "Invite a friend" (N15, design §3.6's no-friends state): what gets shared,
 * and how. Plain functions so the choice — the system share sheet where there
 * is one, the clipboard where there is not — can be tested without a browser.
 *
 * The link is the sign-up page on this origin: someone without an account
 * starts there, and someone with one is sent on from it (the page redirects a
 * signed-in viewer). No referral id or inviter is put in the URL — it would
 * say who sent it to anyone the link reaches.
 */

export type InviteShare = { title: string; text: string; url: string };

export const inviteShareData = (origin: string): InviteShare => ({
  title: "Cellar Assistant",
  text: "Compare what we're drinking — join me on Cellar Assistant.",
  url: new URL("/sign-up", origin).toString(),
});

export type InviteOutcome = "shared" | "copied" | "cancelled" | "failed";

type ShareTarget = {
  share?: (data: InviteShare) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

/**
 * Share `data`: the share sheet first; the clipboard where there is none, or
 * where the sheet itself failed (not where the viewer dismissed it — an
 * `AbortError` is their answer).
 */
export async function shareInvite(
  data: InviteShare,
  target: ShareTarget,
): Promise<InviteOutcome> {
  if (typeof target.share === "function") {
    try {
      await target.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }
  try {
    if (target.clipboard === undefined) return "failed";
    await target.clipboard.writeText(data.url);
    return "copied";
  } catch {
    return "failed";
  }
}
