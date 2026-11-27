"use client";

import type { ReactNode } from "react";
import { useQuery } from "urql";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { DraftImageQuery } from "./queries";

/**
 * A draft's photo, or its kind glyph flat on the raised well (the kit's
 * no-photo plate under 75 px). The page loads URLs on the server; a draft
 * from a later page (`imageUrl` undefined) reads its own.
 */
export function DraftThumb({
  imageId,
  imageUrl,
  glyph,
  className,
}: {
  imageId: string | null;
  /** Known URL, `null` for none, `undefined` to read it here. */
  imageUrl?: string | null;
  glyph: ReactNode;
  className?: string;
}) {
  const [{ data }] = useQuery({
    query: DraftImageQuery,
    variables: { id: imageId ?? "" },
    pause: imageUrl !== undefined || imageId === null,
  });
  const read = data === undefined ? null : unwrapResult(data.file, "File");
  const url = imageUrl ?? (read?.ok === true ? read.data.url : null);
  return (
    <div
      data-slot="draft-thumb"
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-raised",
        className,
      )}
    >
      {url !== null ? (
        // Presigned and short-lived: not for the image optimiser's cache.
        // biome-ignore lint/performance/noImgElement: a presigned file URL
        <img
          src={url}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        glyph
      )}
    </div>
  );
}
