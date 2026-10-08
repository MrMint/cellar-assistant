"use client";

import { useState } from "react";
import { useMutation, useQuery } from "urql";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { ICON_STROKE, Share } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { absoluteUrl, invitePath } from "@/lib/share/routes";
import { useShareLink } from "@/lib/share/use-share-link";
import {
  EnsureFriendInviteMutation,
  MyFriendInviteQuery,
  ResetFriendInviteMutation,
} from "./queries";

/** What the share sheet carries for an invite. */
export const inviteShareRequest = (origin: string, token: string) => ({
  url: absoluteUrl(origin, invitePath(token)),
  title: "Join me on Cellar Assistant",
  text: "Add me as a friend on Cellar Assistant:",
});

/**
 * "Invite friends" on `/friends` (X17): one link that makes whoever opens it
 * your friend — the way in for someone not on the app yet, who search cannot
 * find. The link is made on first use and kept; Reset replaces it, behind a
 * confirm, because every link already sent stops working.
 */
export function InviteFriendsCard() {
  const [{ data }, refetch] = useQuery({ query: MyFriendInviteQuery });
  const [ensuring, ensure] = useMutation(EnsureFriendInviteMutation);
  const [resetting, reset] = useMutation(ResetFriendInviteMutation);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const share = useShareLink();
  const existing = data?.me?.friendInvite?.token ?? null;

  const onShare = async () => {
    let token = existing;
    if (token === null) {
      const result = unwrapResult(
        (await ensure({})).data?.ensureFriendInvite,
        "FriendInvite",
      );
      if (!result.ok) {
        notify(result.error.message, { tone: "error" });
        return;
      }
      token = result.data.token;
      refetch({ requestPolicy: "network-only" });
    }
    await share(inviteShareRequest(window.location.origin, token));
  };

  const onReset = async () => {
    const result = unwrapResult(
      (await reset({})).data?.resetFriendInvite,
      "FriendInvite",
    );
    setConfirmOpen(false);
    if (!result.ok) {
      notify(result.error.message, { tone: "error" });
      return;
    }
    refetch({ requestPolicy: "network-only" });
    notify("New invite link ready. Old links no longer work.", {
      tone: "success",
    });
  };

  return (
    <section
      aria-labelledby="invite-friends"
      className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4"
    >
      <h2 id="invite-friends" className="type-headline">
        Invite friends
      </h2>
      <p className="type-callout text-ink-2">
        Send a link. Whoever opens it can add you as a friend, even if they're
        new to Cellar Assistant.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          disabled={ensuring.fetching}
          aria-busy={ensuring.fetching || undefined}
          onClick={() => void onShare()}
          className="sm:flex-1"
        >
          {ensuring.fetching ? (
            <Spinner aria-hidden />
          ) : (
            <Share aria-hidden strokeWidth={ICON_STROKE} />
          )}
          Share invite link
        </Button>
        {existing !== null && (
          <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
            Reset link
          </Button>
        )}
      </div>
      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset your invite link?"
        description="Links you've already sent will stop working. You'll get a new one to share."
        confirmLabel="Reset link"
        pending={resetting.fetching}
        onConfirm={() => void onReset()}
      />
    </section>
  );
}
