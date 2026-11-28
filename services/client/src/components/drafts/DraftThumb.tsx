"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useQuery } from "urql";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { DraftImageQuery } from "./queries";

/**
 * A draft's photo, or its kind glyph flat on the raised well (the kit's
 * no-photo plate under 75 px). The page loads the first screenful's URLs on
 * the server; any other draft (`imageUrl` undefined) reads its own once it
 * scrolls into view, so a long list never sends a read per row at once (F-71).
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
  const ref = useRef<HTMLDivElement>(null);
  const wants = imageUrl === undefined && imageId !== null;
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!wants || seen) return;
    const node = ref.current;
    if (node === null || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [wants, seen]);
  const [{ data }] = useQuery({
    query: DraftImageQuery,
    variables: { id: imageId ?? "" },
    pause: !wants || !seen,
  });
  const read = data === undefined ? null : unwrapResult(data.file, "File");
  const url = imageUrl ?? (read?.ok === true ? read.data.url : null);
  return (
    <div
      ref={ref}
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
