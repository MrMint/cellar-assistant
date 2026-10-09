"use client";

import { useState } from "react";
import { useMutation } from "urql";
import { ICON_STROKE, PersonAdd } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { SendFriendRequestMutation } from "@/components/friend/fragments";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";

/** What an answer to `sendFriendRequest` leaves the row saying. */
export type AddFriendOutcome =
  | "sent"
  | "already-sent"
  | "already-received"
  | "already-friends"
  | "failed";

/**
 * `sendFriendRequest`'s answer → what the row should now say. Asked twice,
 * or already friends, is not a failure the viewer can do anything about: the
 * row says where things actually stand — which is not always "Requested"
 * (they may have asked first, or a request may have been accepted since the
 * search ran).
 */
export const addFriendOutcome = (
  result:
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string | null },
): AddFriendOutcome => {
  if (result.ok) return "sent";
  switch (result.reason) {
    case "FRIEND_REQUEST_ALREADY_SENT":
      return "already-sent";
    case "FRIEND_REQUEST_ALREADY_RECEIVED":
      return "already-received";
    case "ALREADY_FRIENDS":
      return "already-friends";
    default:
      return "failed";
  }
};

/** The row's trailing words once the request is settled. */
export const ADD_FRIEND_SETTLED: Readonly<
  Record<Exclude<AddFriendOutcome, "failed">, string>
> = {
  sent: "Requested",
  "already-sent": "Requested",
  // Same words as a REQUEST_RECEIVED / FRIEND row (`universal-search.ts`).
  "already-received": "Wants to be friends",
  "already-friends": "Friend",
};

/**
 * People in universal search (X12): "Add" sends a friend request in place,
 * and the button becomes the request's state. A request is answered on the
 * other side, so there is no Undo here; it can be cancelled from Friends.
 */
export function AddFriendButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [, send] = useMutation(SendFriendRequestMutation);
  const [state, setState] = useState<
    "idle" | "pending" | Exclude<AddFriendOutcome, "failed">
  >("idle");

  const add = async () => {
    setState("pending");
    const response = await send({ userId });
    const result = unwrapResult(
      response.data?.sendFriendRequest,
      "FriendRequest",
    );
    const outcome = addFriendOutcome(
      result.ok
        ? { ok: true }
        : { ok: false, reason: result.error.reason ?? null },
    );
    if (outcome === "failed") {
      setState("idle");
      notify(`Couldn't send ${name} a request. Try again.`, { tone: "error" });
      return;
    }
    setState(outcome);
    if (outcome === "sent") {
      notify(`Friend request sent to ${name}`, { tone: "success" });
    }
  };

  if (state !== "idle" && state !== "pending") {
    return (
      <span className="type-footnote text-ink-3" role="status">
        {ADD_FRIEND_SETTLED[state]}
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      aria-label={`Add ${name} as a friend`}
      disabled={state === "pending"}
      aria-busy={state === "pending" || undefined}
      // `sm` is 36 px tall; the row is a phone row, so the target is grown
      // to 44 (design §3.3) without growing the button.
      className="relative after:absolute after:-inset-1 after:content-['']"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void add();
      }}
    >
      {state === "pending" ? (
        <Spinner />
      ) : (
        <PersonAdd aria-hidden strokeWidth={ICON_STROKE} />
      )}
      Add
    </Button>
  );
}
