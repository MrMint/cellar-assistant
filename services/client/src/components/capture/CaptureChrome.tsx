"use client";

import type { ReactNode } from "react";
import { IconButton } from "@/components/app/IconButton";
import { Close } from "@/components/app/icons";
import { canGoBack } from "@/components/app/nav-history";
import { useNavigate } from "@/components/app/useNavigate";
import { feedback } from "@/lib/feedback";
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

/**
 * The surface's header row (Capture-Camera 01): Close at the left, the title
 * centred — a plain heading, or the "Add to … ▾" button — and an optional
 * action at the right.
 */
export function CaptureHeader({
  leading,
  title,
  trailing,
}: {
  leading?: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="grid min-h-14 grid-cols-[44px_1fr_44px] items-center gap-1 px-2">
      <div className="flex justify-start">{leading}</div>
      <div className="flex min-w-0 justify-center">
        {typeof title === "string" ? (
          <h1 className="t-head min-w-0 truncate text-ink">{title}</h1>
        ) : (
          <h1 className="m-0 flex min-w-0 justify-center">{title}</h1>
        )}
      </div>
      <div className="flex justify-end">{trailing}</div>
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
      className="keep-dark relative aspect-[3/4] max-h-[64dvh] w-full overflow-hidden bg-raised md:rounded-lg"
    >
      {/* biome-ignore lint/performance/noImgElement: a local capture (data URL); nothing for /_next/image to optimise. */}
      <img src={photo} alt={alt} className="size-full object-cover" />
      {onRetake !== undefined && (
        <div className="absolute inset-x-0 top-0 flex justify-end p-3">
          <button
            type="button"
            onClick={() => {
              feedback("press");
              onRetake();
            }}
            className="t-head inline-flex min-h-11 items-center rounded-lg bg-glass px-4 text-on-glass outline-none transition-transform duration-(--ca-dur-micro) focus-visible:outline-2 focus-visible:outline-act-on-glass active:scale-97 motion-reduce:active:scale-100"
          >
            Retake
          </button>
        </div>
      )}
      {children !== undefined && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-scrim-pk to-transparent px-4 pt-10 pb-4 text-center text-on-glass">
          {children}
        </div>
      )}
    </div>
  );
}
