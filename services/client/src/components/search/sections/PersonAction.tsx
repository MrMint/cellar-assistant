"use client";

import { useState } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { PersonRow } from "@/components/app/parts/PersonRow";
import {
  AcceptFriendRequestMutation,
  RejectFriendRequestMutation,
  SendFriendRequestMutation,
} from "@/components/friend/fragments";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";
import { addFriendOutcome } from "../AddFriendButton";
import type { PersonRelation } from "../universal-search";
import { usePendingRequest } from "./person-requests";

type Standing = Exclude<PersonRelation, "FRIEND"> | "FRIEND";

/** The status line under a person's name, by where things stand. */
export const STANDING_LINES: Readonly<Record<Standing, string | undefined>> = {
  FRIEND: "Friend",
  REQUEST_RECEIVED: "Wants to be friends",
  REQUEST_SENT: "Request sent",
  NONE: undefined,
};

/**
 * A person's row action (Recipes-Search 25–28): Add friend; Cancel request
 * once one is out (`rejectFriendRequest`, L2 — no new mutation); Accept when
 * they asked first. Each acts at once; Add friend's toast carries Undo, and
 * a failure puts the row back as it was. Outlined, as every action inside a
 * row is (CROSS-LOT); Cancel is quiet.
 */
export function PersonAction({
  userId,
  name,
  relation,
  onStanding,
}: {
  userId: string;
  name: string;
  relation: Exclude<PersonRelation, "FRIEND">;
  /** The row's status line follows the action. */
  onStanding?: (standing: Standing) => void;
}) {
  const [, send] = useMutation(SendFriendRequestMutation);
  const [, reject] = useMutation(RejectFriendRequestMutation);
  const [, accept] = useMutation(AcceptFriendRequestMutation);
  const [standing, setStandingState] = useState<Standing>(relation);
  // The request this row sent, so Cancel needs no lookup.
  const [sentId, setSentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The id Cancel or Accept needs, read only while one could be tapped.
  const outgoing = usePendingRequest(
    standing === "REQUEST_SENT" && sentId === null ? "OUTGOING" : null,
    userId,
  );
  const incoming = usePendingRequest(
    standing === "REQUEST_RECEIVED" ? "INCOMING" : null,
    userId,
  );

  const setStanding = (next: Standing) => {
    setStandingState(next);
    onStanding?.(next);
  };

  const failed = (words: string, back: Standing) => {
    setStanding(back);
    feedback("refuse");
    notify(words, { tone: "error" });
  };

  const cancel = async (known: string | null) => {
    setBusy(true);
    setStanding("NONE");
    const requestId = known ?? outgoing.id;
    if (requestId === null) {
      setBusy(false);
      failed(`Couldn't cancel the request to ${name}`, "REQUEST_SENT");
      return;
    }
    const response = await reject({ requestId });
    setBusy(false);
    if (
      response.data?.rejectFriendRequest.__typename !==
      "RejectFriendRequestPayload"
    ) {
      failed(`Couldn't cancel the request to ${name}`, "REQUEST_SENT");
      return;
    }
    setSentId(null);
  };

  const add = async () => {
    setBusy(true);
    setStanding("REQUEST_SENT");
    const response = await send({ userId });
    setBusy(false);
    const sent = response.data?.sendFriendRequest;
    if (sent?.__typename === "FriendRequest") {
      setSentId(sent.id);
      notify(`Request sent to ${name}`, { undo: () => void cancel(sent.id) });
      return;
    }
    const outcome = addFriendOutcome({
      ok: false,
      reason:
        sent !== undefined && "reason" in sent ? (sent.reason ?? null) : null,
    });
    if (outcome === "already-sent") return;
    if (outcome === "already-received") return setStanding("REQUEST_RECEIVED");
    if (outcome === "already-friends") return setStanding("FRIEND");
    failed(`Couldn't send ${name} a request`, "NONE");
  };

  const acceptRequest = async () => {
    setBusy(true);
    setStanding("FRIEND");
    const requestId = incoming.id;
    if (requestId === null) {
      setBusy(false);
      failed(`Couldn't accept ${name}'s request`, "REQUEST_RECEIVED");
      return;
    }
    const response = await accept({ requestId });
    setBusy(false);
    if (
      response.data?.acceptFriendRequest.__typename !==
      "AcceptFriendRequestPayload"
    ) {
      failed(`Couldn't accept ${name}'s request`, "REQUEST_RECEIVED");
      return;
    }
    feedback("success");
    // Shell-Home's wording wins (CROSS-LOT, friend accepted toast).
    notify(`${name} is your friend`, { tone: "success" });
  };

  const stop = (event: { preventDefault(): void; stopPropagation(): void }) => {
    event.preventDefault();
    event.stopPropagation();
  };

  switch (standing) {
    case "FRIEND":
      return null;
    case "NONE":
      return (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 min-w-11"
          disabled={busy}
          aria-label={`Add ${name} as a friend`}
          onClick={(event) => {
            stop(event);
            void add();
          }}
        >
          Add friend
        </Button>
      );
    case "REQUEST_SENT":
      return (
        <Button
          variant="quiet-muted"
          size="sm"
          className="min-h-11 min-w-11"
          disabled={busy || outgoing.fetching}
          aria-label={`Cancel the request to ${name}`}
          onClick={(event) => {
            stop(event);
            void cancel(sentId);
          }}
        >
          Cancel request
        </Button>
      );
    case "REQUEST_RECEIVED":
      return (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 min-w-11"
          disabled={busy || incoming.fetching}
          aria-label={`Accept ${name}'s request`}
          onClick={(event) => {
            stop(event);
            void acceptRequest();
          }}
        >
          Accept
        </Button>
      );
  }
}

/**
 * A person who is not your friend yet: the kit's person row, its status
 * line following the action in the row.
 */
export function PersonResultRow({
  userId,
  name,
  avatarUrl,
  relation,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null;
  relation: Exclude<PersonRelation, "FRIEND">;
}) {
  const [standing, setStanding] = useState<Standing>(relation);
  return (
    <PersonRow
      name={name}
      displayName={name}
      avatarUrl={avatarUrl}
      status={STANDING_LINES[standing]}
      actions={
        <PersonAction
          userId={userId}
          name={name}
          relation={relation}
          onStanding={setStanding}
        />
      }
    />
  );
}
