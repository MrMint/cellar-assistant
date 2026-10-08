"use client";

import { Share } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { inviteShareData, shareInvite } from "./invite";

/**
 * The no-friends state's one action (design §3.6: "Invite a friend"): the
 * system share sheet with a link to sign up, or the link copied where the
 * browser has no sheet. A toast says which happened; a dismissed sheet says
 * nothing.
 */
export function InviteFriendButton() {
  const invite = async () => {
    const outcome = await shareInvite(inviteShareData(window.location.origin), {
      share:
        typeof navigator.share === "function"
          ? (data) => navigator.share(data)
          : undefined,
      clipboard: navigator.clipboard,
    });
    if (outcome === "copied") {
      notify("Invite link copied", { tone: "success" });
    } else if (outcome === "failed") {
      notify("Couldn't share the invite link", { tone: "error" });
    }
  };
  return (
    <Button onClick={() => void invite()}>
      <Share aria-hidden />
      Invite a friend
    </Button>
  );
}
