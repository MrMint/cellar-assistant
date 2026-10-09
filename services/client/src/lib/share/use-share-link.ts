"use client";

import { useCallback } from "react";
import { notify } from "@/components/app/notify";
import { type ShareOutcome, type ShareRequest, shareLink } from "./share-link";

/**
 * `shareLink` with its outcome said out loud: "Link copied" when the link
 * went to the clipboard, and the link itself when nothing worked, so the
 * person can still copy it by hand. A finished or cancelled share sheet says
 * nothing — the sheet was the feedback.
 *
 * Call the returned function straight from the tap (or from an `AppBar`
 * overflow row, which runs its action as the sheet closes): the share sheet
 * needs the tap's user activation.
 */
export function useShareLink(): (
  request: ShareRequest,
) => Promise<ShareOutcome> {
  return useCallback(async (request) => {
    const outcome = await shareLink(request, navigator);
    if (outcome === "copied") {
      notify("Link copied", { tone: "success" });
    } else if (outcome === "failed") {
      notify("Couldn't share from this browser", {
        tone: "error",
        description: request.url,
      });
    }
    return outcome;
  }, []);
}
