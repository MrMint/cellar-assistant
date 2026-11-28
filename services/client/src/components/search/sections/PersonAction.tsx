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
import { useUndoableWrite } from "@/components/friend/undoable-write";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";
import { addFriendOutcome } from "../AddFriendButton";
import type { PersonRelation } from "../universal-search";

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
 * they asked first. Cancel and Accept use the row's own `pendingRequestId`
 * (F-43, F-105), or the id Add friend just got back: no lookup.
 *
 * Add friend acts at once, and its toast's Undo cancels. Cancel can't be put
 * back without a second request, so it is held until its Undo toast closes
 * (`friend/undoable-write`, KIT § 4, H-91): the row turns at once, Undo sends
 * nothing, and Add friend while it is held takes it back. A failure puts the
 * row back as it was. An Undo is itself quiet: it raises no second toast.
 * Outlined, as every action inside a row is (CROSS-LOT); Cancel is quiet.
 */
export function PersonAction({
  userId,
  name,
  relation,
  requestId = null,
  onStanding,
}: {
  userId: string;
  name: string;
  relation: Exclude<PersonRelation, "FRIEND">;
  /** The open request between you (`UserSearchResult.pendingRequestId`). */
  requestId?: string | null;
  /** The row's status line follows the action. */
  onStanding?: (standing: Standing) => void;
}) {
  const [, send] = useMutation(SendFriendRequestMutation);
  const [, reject] = useMutation(RejectFriendRequestMutation);
  const [, accept] = useMutation(AcceptFriendRequestMutation);
  const { hold, drop } = useUndoableWrite();
  const [standing, setStandingState] = useState<Standing>(relation);
  // The open request: the row's own, then the one this row sent.
  const [pending, setPending] = useState<string | null>(requestId);
  const [busy, setBusy] = useState(false);

  const setStanding = (next: Standing) => {
    setStandingState(next);
    onStanding?.(next);
  };

  const failed = (words: string, back: Standing) => {
    setStanding(back);
    feedback("refuse");
    notify(words, { tone: "error" });
  };

  /** Sends the cancel now: Add's Undo, or a held cancel going. */
  const sendCancel = async (id: string) => {
    const response = await reject({ requestId: id });
    if (
      response.data?.rejectFriendRequest.__typename !==
      "RejectFriendRequestPayload"
    ) {
      failed(`Couldn't cancel the request to ${name}`, "REQUEST_SENT");
      return;
    }
    setPending((now) => (now === id ? null : now));
  };

  const cancel = (id: string) => {
    setStanding("NONE");
    hold(userId, {
      message: `Request to ${name} canceled`,
      commit: () => void sendCancel(id),
      restore: () => setStanding("REQUEST_SENT"),
    });
  };

  const add = async (undoable = true) => {
    // A cancel still held is taken back rather than sent and asked again.
    if (drop(userId)) {
      setStanding("REQUEST_SENT");
      return;
    }
    setBusy(true);
    setStanding("REQUEST_SENT");
    const response = await send({ userId });
    setBusy(false);
    const sent = response.data?.sendFriendRequest;
    if (sent?.__typename === "FriendRequest") {
      setPending(sent.id);
      if (undoable)
        notify(`Request sent to ${name}`, {
          undo: () => {
            setStanding("NONE");
            void sendCancel(sent.id);
          },
        });
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

  const acceptRequest = async (id: string) => {
    setBusy(true);
    setStanding("FRIEND");
    const response = await accept({ requestId: id });
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
          disabled={busy || pending === null}
          aria-label={`Cancel the request to ${name}`}
          onClick={(event) => {
            stop(event);
            if (pending !== null) cancel(pending);
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
          disabled={busy || pending === null}
          aria-label={`Accept ${name}'s request`}
          onClick={(event) => {
            stop(event);
            if (pending !== null) void acceptRequest(pending);
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
  requestId = null,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null;
  relation: Exclude<PersonRelation, "FRIEND">;
  requestId?: string | null;
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
          requestId={requestId}
          onStanding={setStanding}
        />
      }
    />
  );
}
