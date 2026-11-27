"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "urql";
import { AppBar } from "@/components/app/AppBar";
import { ICON_STROKE, Lock, PersonAdd } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { Page } from "@/components/app/Page";
import {
  AcceptFriendRequestMutation,
  RejectFriendRequestMutation,
  SendFriendRequestMutation,
} from "@/components/friend/fragments";
import {
  requestWith,
  useAllFriendRequests,
} from "@/components/friend/friend-lists";
import { Button } from "@/components/ui/button";
import { ProfileHeader, personCrumbs } from "./FriendProfile";

export type LockedPerson = {
  readonly userId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
};

/**
 * Someone you are not friends with (Social-Friends 17, 18): who they are, a
 * lock, "Only friends see Test Two's lists", and the one thing to do — Add
 * friend; then "Request sent" with Cancel request; or, when they asked you,
 * Accept. Every write names this person or a request whose other side is
 * exactly them (`requestWith`), never anyone else's.
 */
export function LockedProfile({ person }: { person: LockedPerson }) {
  const router = useRouter();
  const outgoing = useAllFriendRequests("OUTGOING");
  const incoming = useAllFriendRequests("INCOMING");
  const [sentId, setSentId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [sendState, send] = useMutation(SendFriendRequestMutation);
  const [rejectState, reject] = useMutation(RejectFriendRequestMutation);
  const [acceptState, accept] = useMutation(AcceptFriendRequestMutation);

  const listedSent = requestWith(outgoing.rows, person.userId);
  const sent = cancelled ? null : (sentId ?? listedSent?.id ?? null);
  const asked = requestWith(incoming.rows, person.userId);
  const busy =
    sendState.fetching || rejectState.fetching || acceptState.fetching;

  const refresh = () => {
    outgoing.refresh();
    incoming.refresh();
  };

  const cancel = async (requestId: string) => {
    const result = await reject({ requestId });
    if (
      result.data?.rejectFriendRequest.__typename !==
      "RejectFriendRequestPayload"
    ) {
      notify("Couldn't cancel the request", { tone: "error" });
      return;
    }
    setSentId(null);
    setCancelled(true);
    refresh();
  };

  const addFriend = async () => {
    const result = await send({ userId: person.userId });
    const payload = result.data?.sendFriendRequest;
    if (payload?.__typename !== "FriendRequest") {
      refresh();
      notify(`Couldn't send a request to ${person.name}`, { tone: "error" });
      return;
    }
    const requestId = payload.id;
    setSentId(requestId);
    setCancelled(false);
    refresh();
    notify(`Request sent to ${person.name}`, {
      undo: () => void cancel(requestId),
    });
  };

  const acceptAsked = async (requestId: string) => {
    const result = await accept({ requestId });
    if (
      result.data?.acceptFriendRequest.__typename !==
      "AcceptFriendRequestPayload"
    ) {
      notify("Couldn't accept the request", { tone: "error" });
      return;
    }
    notify(`${person.name} is your friend`);
    router.refresh();
  };

  return (
    <Page>
      <AppBar parent="/friends" breadcrumbs={personCrumbs(person.name)} />
      <div data-slot="locked-profile" className="flex flex-col gap-10">
        <ProfileHeader name={person.name} avatarUrl={person.avatarUrl} />
        <div className="flex flex-col items-center gap-3 text-center">
          <Lock
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-8 text-glyph"
          />
          <p className="t-head text-ink">
            Only friends see {person.name}’s lists
          </p>
          {asked !== undefined ? (
            <>
              <p className="t-cap text-ink-2">Wants to be friends</p>
              <Button
                disabled={busy}
                aria-busy={acceptState.fetching || undefined}
                onClick={() => void acceptAsked(asked.id)}
              >
                Accept
              </Button>
            </>
          ) : sent !== null ? (
            <>
              <p className="t-cap text-ink-2">Request sent</p>
              <Button
                variant="quiet"
                disabled={busy}
                aria-busy={rejectState.fetching || undefined}
                onClick={() => void cancel(sent)}
              >
                Cancel request
              </Button>
            </>
          ) : (
            <Button
              disabled={busy || outgoing.loading}
              aria-busy={sendState.fetching || undefined}
              onClick={() => void addFriend()}
            >
              <PersonAdd aria-hidden strokeWidth={ICON_STROKE} />
              Add friend
            </Button>
          )}
        </div>
      </div>
    </Page>
  );
}
