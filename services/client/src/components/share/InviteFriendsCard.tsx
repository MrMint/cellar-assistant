"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [minted, setMinted] = useState<string | null>(null);
  const mintRequested = useRef(false);
  const share = useShareLink();
  const token = minted ?? data?.me?.friendInvite?.token ?? null;

  const mint = useCallback(async (): Promise<string | null> => {
    const result = unwrapResult(
      (await ensure({})).data?.ensureFriendInvite,
      "FriendInvite",
    );
    if (!result.ok) return null;
    setMinted(result.data.token);
    return result.data.token;
  }, [ensure]);

  // The link is made before the tap, not inside it: a share sheet needs the
  // tap's user activation, and a network round trip spends it — iOS Safari
  // then refuses the sheet and the first invite would land on the fallback.
  // Minting is idempotent and inert: the secret reaches nobody until the
  // viewer shares it.
  useEffect(() => {
    if (data?.me?.friendInvite !== null || mintRequested.current) return;
    mintRequested.current = true;
    void mint();
  }, [data, mint]);

  const onShare = async () => {
    const link = token ?? (await mint());
    if (link === null) {
      notify("Couldn't make your invite link", {
        tone: "error",
        description: "Try again in a moment.",
      });
      return;
    }
    await share(inviteShareRequest(window.location.origin, link));
  };

  const onReset = async () => {
    const result = unwrapResult(
      (await reset({})).data?.resetFriendInvite,
      "FriendInvite",
    );
    setConfirmOpen(false);
    if (!result.ok) {
      notify("Couldn't reset your invite link", {
        tone: "error",
        description: "Your current link still works. Try again in a moment.",
      });
      return;
    }
    setMinted(result.data.token);
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
        {token !== null && (
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
