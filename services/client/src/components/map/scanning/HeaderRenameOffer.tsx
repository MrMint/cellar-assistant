"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { headerRenameProposal } from "@/components/capture/new-place";
import { usePlaceActions } from "@/components/map/actions";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";
import { renameFromHeader, ScanHeaderRenameQuery } from "./header-rename";

/**
 * L10 · "This menu says 'Bar Lumen'. Rename the place?" — offered only for
 * the person's own place still Under review (`headerRenameProposal`), and
 * applied only on Rename. Keep dismisses it; nothing is changed otherwise.
 */
export function HeaderRenameOffer({
  scanId,
  onRenamed,
}: {
  scanId: string;
  onRenamed?: () => void;
}) {
  const [{ data }, reexecute] = useQuery({
    query: ScanHeaderRenameQuery,
    variables: { id: scanId },
  });
  const { resubmitPlaceAction } = usePlaceActions();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = unwrapResult(data?.menuScan, "MenuScan");
  const scan = result.ok ? result.data : null;
  const place = scan?.place ?? null;
  const proposal = headerRenameProposal({
    headerName: scan?.headerName,
    place,
  });
  if (dismissed || proposal === null || place === null) return null;

  const rename = async () => {
    const input = renameFromHeader(place, { proposal, confirmed: true });
    if (input === null) {
      setError("This place has no position to save with the new name.");
      return;
    }
    setSaving(true);
    setError(null);
    const saved = await resubmitPlaceAction(place.id, input);
    setSaving(false);
    if (!saved.success) {
      setError(saved.error ?? "The place could not be renamed.");
      return;
    }
    setDismissed(true);
    reexecute({ requestPolicy: "network-only" });
    onRenamed?.();
  };

  return (
    <section
      data-slot="header-rename"
      aria-label="Rename the place"
      className="flex flex-col gap-3 rounded-xl bg-surface-1 p-4"
    >
      <p className="type-body text-ink-1">
        This menu says &ldquo;{proposal}&rdquo;. Rename the place?
      </p>
      <p className="type-footnote text-ink-3">
        It&rsquo;s still Under review, so only you see the name for now.
      </p>
      {error !== null && (
        <p role="alert" className="type-footnote text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={() => void rename()} disabled={saving}>
          Rename
        </Button>
        <Button
          variant="ghost"
          onClick={() => setDismissed(true)}
          disabled={saving}
        >
          Keep &ldquo;{place.name}&rdquo;
        </Button>
      </div>
    </section>
  );
}
