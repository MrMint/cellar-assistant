"use client";

import { useEffect, useState } from "react";
import { Scan } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Button } from "@/components/ui/button";
import {
  captureHrefWithPhoto,
  photoHandoff,
} from "@/lib/capture/photo-handoff";
import { cn } from "@/lib/utils";

/**
 * Photo search's fallback (X06): a photo the catalogue did not recognise —
 * or a deployment that cannot search by photo — is **read as a label** in
 * Add instead, with the same bytes. The Photo button left the capture in the
 * hand-off under the search file's id, so the link carries only that id
 * (`/add?mode=bottle&photo=<id>`); Add opens on the photo with the type row
 * (the last type used) and "Read this label".
 *
 * After a reload the bytes are gone (the search photo itself is discarded
 * once searched, G32), so the same place offers a fresh snap instead.
 */
export function ReadLabelInstead({
  imageFileId,
  prominent = false,
  className,
}: {
  imageFileId: string;
  /** Nothing matched: the fallback is the next step, not a footnote. */
  prominent?: boolean;
  className?: string;
}) {
  // The hand-off lives in this tab's memory; the server cannot see it.
  const [carried, setCarried] = useState(false);
  useEffect(() => setCarried(photoHandoff.has(imageFileId)), [imageFileId]);
  const href = carried
    ? captureHrefWithPhoto("bottle", imageFileId)
    : "/add?mode=bottle";
  const label = carried ? "Read the label instead" : "Snap the label instead";

  return (
    <div
      data-slot="read-label-instead"
      className={cn("flex flex-col items-center gap-2 text-center", className)}
    >
      <p className="type-callout text-ink-2">
        {prominent
          ? "Not in the catalog yet? Read its label and add it."
          : "Not one of these?"}
      </p>
      <Button variant={prominent ? "default" : "secondary"} asChild>
        <Link href={href} underline="none">
          <Scan aria-hidden />
          {label}
        </Link>
      </Button>
    </div>
  );
}
