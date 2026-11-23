"use client";

import type { ReactNode } from "react";
import { IconButton } from "@/components/app/IconButton";
import { Close } from "@/components/app/icons";
import { canGoBack } from "@/components/app/nav-history";
import { useNavigate } from "@/components/app/useNavigate";
import { cn } from "@/lib/utils";

/**
 * Close, for the capture surface (X06): the tab bar steps aside there, so
 * this is the way out — back to the page ＋ was tapped on when there is one
 * in the app's own history, else to `fallbackHref` (a cold open of `/add`
 * lands on Home; a cellar's add page goes back to the cellar).
 */
export function CaptureClose({
  fallbackHref = "/",
  className,
}: {
  fallbackHref?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <IconButton
      aria-label="Close"
      variant="ghost"
      className={cn("-ml-2 shrink-0", className)}
      onClick={() => {
        if (canGoBack()) navigate.back();
        else navigate.push(fallbackHref);
      }}
    >
      <Close />
    </IconButton>
  );
}

/** The surface's header row: Close (or nothing), then the page's title. */
export function CaptureHeader({
  leading,
  title,
}: {
  leading?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-1">
      {leading}
      <h1 className="type-title-2 min-w-0 truncate text-ink-1">{title}</h1>
    </div>
  );
}

/**
 * A photo already taken, in the camera's frame — carried in from another
 * surface (`lib/capture/photo-handoff.ts`) or held while the menu's place is
 * settled. Retake puts the live camera back.
 */
export function CapturePhotoPreview({
  photo,
  alt,
  onRetake,
  children,
}: {
  photo: string;
  alt: string;
  onRetake?: () => void;
  /** Overlaid at the bottom of the picture (a status line). */
  children?: ReactNode;
}) {
  return (
    <div
      data-slot="capture-preview"
      className="relative aspect-[3/4] max-h-[64dvh] w-full overflow-hidden rounded-lg bg-surface-2"
    >
      {/* biome-ignore lint/performance/noImgElement: a local capture (data URL); nothing for /_next/image to optimise. */}
      <img src={photo} alt={alt} className="size-full object-cover" />
      {onRetake !== undefined && (
        <div className="absolute inset-x-0 top-0 flex justify-end bg-gradient-to-b from-black/45 to-transparent p-3 pb-8">
          <button
            type="button"
            onClick={onRetake}
            className="inline-flex min-h-11 items-center rounded-full bg-black/40 px-4 font-medium text-[15px] text-white backdrop-blur-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
          >
            Retake
          </button>
        </div>
      )}
      {children !== undefined && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-4 pt-10 pb-4 text-center text-white">
          {children}
        </div>
      )}
    </div>
  );
}
