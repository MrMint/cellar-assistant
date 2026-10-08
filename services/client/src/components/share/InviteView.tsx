"use client";

import { useState } from "react";
import { useMutation } from "urql";
import { ICON_STROKE, People } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
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
 * `/invite/<token>` for a signed-in viewer (X17): who invited you, and the one
 * thing to do about it. Accepting makes the friendship through the existing
 * two-sided write (`acceptFriendInvite`); the inviter's side follows through
 * the outbox, and either side reads as friends at once (`isFriend`).
 */
export function InviteView({
  token,
  inviterDisplayName,
  inviterAvatarUrl,
  status,
}: InviteViewProps) {
  const [{ fetching }, accept] = useMutation(AcceptFriendInviteMutation);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = accepted ? "ACCEPTED" : status;

  const onAccept = async () => {
    setError(null);
    const result = await accept({ token });
    const outcome = unwrapResult(
      result.data?.acceptFriendInvite,
      "AcceptFriendInvitePayload",
    );
    if (outcome.ok) setAccepted(true);
    else setError(acceptFailureCopy(inviterDisplayName, outcome.error));
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <InviteHero
        name={inviterDisplayName}
        avatarUrl={inviterAvatarUrl}
        state={state}
      />
      {state === "CAN_ACCEPT" && (
        <Button
          className="w-full max-w-[360px]"
          disabled={fetching}
          aria-busy={fetching || undefined}
          onClick={() => void onAccept()}
        >
          {fetching ? (
            <Spinner aria-hidden />
          ) : (
            <People aria-hidden strokeWidth={ICON_STROKE} />
          )}
          Add {inviterDisplayName} as a friend
        </Button>
      )}
      {error !== null && (
        <p role="alert" className="type-callout text-destructive">
          {error}
        </p>
      )}
      {state !== "CAN_ACCEPT" && (
        <Button asChild variant="secondary" className="w-full max-w-[360px]">
          <Link href="/friends" underline="none">
            {state === "OWN_INVITE" ? "Manage your invite" : "See your friends"}
          </Link>
        </Button>
      )}
    </div>
  );
}
