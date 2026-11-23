"use client";

import { useState } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { DeleteTierListMutation } from "@/components/tier-list/queries";
import { Button } from "@/components/ui/button";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { CloneTierListMutation } from "./queries";

/**
 * L03 "clone": copy someone's list into a new PRIVATE list of yours. Undo
 * deletes the copy — the server's clone is one edit on a list nobody else
 * can see, so deleting it leaves nothing behind. The source is never
 * touched. A list you may not see answers like a missing one, and says so.
 */
export function CloneTierListButton({
  tierListId,
  name,
}: {
  tierListId: string;
  name: string;
}) {
  const [, clone] = useMutation(CloneTierListMutation);
  const [, remove] = useMutation(DeleteTierListMutation);
  const [busy, setBusy] = useState(false);

  const onCopy = async () => {
    setBusy(true);
    const response = await clone({ sourceTierListId: tierListId });
    setBusy(false);
    const result =
      response.error === undefined
        ? unwrapResult(response.data?.cloneTierList, "TierList")
        : { ok: false as const, error: failureFromTransport(response.error) };
    if (!result.ok) {
      notify("Couldn't copy that list", {
        tone: "error",
        description: result.error.message,
      });
      return;
    }
    const copyId = result.data.id;
    notify(`Copied "${result.data.name}" to your lists`, {
      description: "Private to you.",
      undo: () => {
        void remove({ id: copyId }).then((undo) => {
          const undone =
            undo.error === undefined &&
            unwrapResult(undo.data?.deleteTierList, "DeletedTierList").ok;
          if (!undone) notify("Couldn't undo the copy", { tone: "error" });
        });
      },
    });
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      className="min-h-11 min-w-11 rounded-full"
      disabled={busy}
      aria-label={`Copy ${name} to your lists`}
      onClick={() => void onCopy()}
    >
      Copy
    </Button>
  );
}
