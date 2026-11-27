"use client";

import { UserMinus } from "lucide-react";
import { useState } from "react";
import { useMutation } from "urql";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { ICON_STROKE } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { useNavigate } from "@/components/app/useNavigate";
import { RemoveFriendMutation } from "@/components/friend/fragments";
import { Button } from "@/components/ui/button";

/**
 * "Remove friend", at the foot of their profile (Social-Friends 05, 07; lead's
 * ruling 2): it asks first, because being friends again takes a new request
 * the other person must accept, so Undo could not bring it back (KIT § 4).
 * Only the confirm's button writes, and only for the person this profile is
 * of. Then back to Friends with "You and Maya Chen are no longer friends"
 * (15) — or, in the desktop pane, whatever `onRemoved` does.
 */
export function RemoveFriend({
  userId,
  name,
  onRemoved,
}: {
  userId: string;
  name: string;
  onRemoved?: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, removeFriend] = useMutation(RemoveFriendMutation);

  const onConfirm = async () => {
    const result = await removeFriend({ userId });
    const payload = result.data?.removeFriend;
    setOpen(false);
    if (payload?.__typename !== "RemoveFriendPayload") {
      notify(`Couldn't remove ${name}`, { tone: "error" });
      return;
    }
    notify(`You and ${name} are no longer friends`);
    if (onRemoved === undefined) navigate.push("/friends");
    else onRemoved();
  };

  return (
    <div className="border-hair border-t pt-2">
      <Button
        variant="ghost"
        className="px-1 text-danger hover:text-danger"
        onClick={() => setOpen(true)}
      >
        <UserMinus aria-hidden strokeWidth={ICON_STROKE} />
        Remove friend
      </Button>
      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${name}?`}
        description="You stop seeing each other’s friends-only lists."
        cancelLabel="Keep it"
        confirmLabel="Remove"
        pending={state.fetching}
        onConfirm={() => void onConfirm()}
      />
    </div>
  );
}
