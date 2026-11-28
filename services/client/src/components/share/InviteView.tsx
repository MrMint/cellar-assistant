"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { RemoveFriendMutation } from "@/components/friend/fragments";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Spinner } from "@/components/ui/spinner";
import { PressLink } from "@/components/user/PressLink";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { acceptFailureCopy, InviteHero, type InviteStatus } from "./InviteHero";
import { AcceptFriendInviteMutation } from "./queries";

export type InviteViewProps = {
  token: string;
  inviterDisplayName: string;
  inviterAvatarUrl: string | null;
  /** Never `SIGNED_OUT`: the page renders `InviteHero` alone for that. */
  status: Exclude<InviteStatus, "SIGNED_OUT">;
};

/**
 * `/invite/<token>` for a signed-in viewer (X17, Shell-Entry): who invited
 * you, and the one thing to do about it. Accept makes the friendship through
 * the two-sided write (`acceptFriendInvite`) and says so with Undo. Undo
 * removes the friend by the id the API returned for this accept, and is
 * offered only when this tap made the friendship (`becameFriends`), so it
 * can never end one that was already there (`invite-accept.test.tsx`).
 */
export function InviteView({
  token,
  inviterDisplayName,
  inviterAvatarUrl,
  status,
}: InviteViewProps) {
  const router = useRouter();
  const [{ fetching }, accept] = useMutation(AcceptFriendInviteMutation);
  const [, removeFriend] = useMutation(RemoveFriendMutation);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = accepted ? "ACCEPTED" : status;
  const name = inviterDisplayName;

  const undo = async (friendId: string) => {
    const result = await removeFriend({ userId: friendId });
    const outcome = unwrapResult(
      result.data?.removeFriend,
      "RemoveFriendPayload",
    );
    if (!outcome.ok) {
      feedback("refuse");
      notify(`Couldn't undo. ${name} is still your friend`, { tone: "error" });
      return;
    }
    setAccepted(false);
    router.refresh();
  };

  const onAccept = async () => {
    setError(null);
    const result = await accept({ token });
    const outcome = unwrapResult(
      result.data?.acceptFriendInvite,
      "AcceptFriendInvitePayload",
    );
    if (!outcome.ok) {
      feedback("refuse");
      setError(acceptFailureCopy(name, outcome.error));
      return;
    }
    feedback("success");
    setAccepted(true);
    const { friendId, becameFriends } = outcome.data;
    notify(
      `You and ${name} are friends`,
      becameFriends ? { undo: () => void undo(friendId) } : {},
    );
    router.refresh();
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <InviteHero name={name} avatarUrl={inviterAvatarUrl} state={state} />
      {state === "CAN_ACCEPT" && (
        <Button
          className="w-full max-w-[360px]"
          disabled={fetching}
          aria-busy={fetching || undefined}
          onClick={() => void onAccept()}
        >
          {fetching && <Spinner aria-hidden />}
          Accept
        </Button>
      )}
      {error !== null && (
        <p role="alert" className="t-cap m-0 text-center text-destructive">
          {error}
        </p>
      )}
      {state !== "CAN_ACCEPT" && (
        <PressLink
          href="/friends"
          underline="none"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full max-w-[360px]",
          )}
        >
          {state === "OWN_INVITE" ? "Manage your invite" : "See your friends"}
        </PressLink>
      )}
    </div>
  );
}
