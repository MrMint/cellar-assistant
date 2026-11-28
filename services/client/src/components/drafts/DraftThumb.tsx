"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A draft's photo, or its kind glyph flat on the raised well (the kit's
 * no-photo plate under 75 px). The URL arrives with the draft (F-71).
 */
export function DraftThumb({
  imageUrl,
  glyph,
  className,
}: {
  /** The presigned URL, or null for none. */
  imageUrl?: string | null;
  glyph: ReactNode;
  className?: string;
}) {
  const url = imageUrl ?? null;
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
