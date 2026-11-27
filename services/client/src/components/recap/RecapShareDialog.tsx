"use client";

/**
 * Share a recap card (Social-Recap board 15, desktop 05): "Share · Image only ·
 * no link", the 4:5 image itself as the preview (the owner-only route, so what
 * you see is what goes), then Share image and Save image. A sheet on phones, a
 * dialog from `md`. If the image will not draw: "Couldn't make the image" and
 * Try again. Sharing sends a file, never a link (L16).
 */
import { type ReactNode, useState } from "react";
import { ErrorState } from "@/components/app/EmptyState";
import { ICON_STROKE, Photo, ShareOut } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { browserDownload, shareRecapImage } from "./share-card";

type ImageState = "loading" | "ready" | "failed";

export function RecapShareDialog({
  open,
  onOpenChange,
  imagePath,
  fileName,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imagePath: string;
  fileName: string;
  /** The preview's alternative text: what the card says. */
  description: string;
}) {
  const [state, setState] = useState<ImageState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  const send = async (how: "share" | "save") => {
    setBusy(true);
    const outcome = await shareRecapImage(imagePath, fileName, {
      fetch: (url) => fetch(url, { credentials: "same-origin" }),
      navigator:
        how === "share" && typeof navigator !== "undefined"
          ? navigator
          : undefined,
      download: browserDownload,
    });
    setBusy(false);
    if (outcome === "failed") {
      feedback("refuse");
      setState("failed");
      return;
    }
    if (outcome === "downloaded") {
      feedback("success");
      notify("Image saved");
    }
    if (outcome !== "cancelled") onOpenChange(false);
  };

  const retry = () => {
    feedback("tick");
    setState("loading");
    setAttempt((n) => n + 1);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share"
      description="Image only · no link"
    >
      <div className="flex flex-col gap-4 pb-2">
        {state === "failed" ? (
          <ErrorState
            boxed
            title="Couldn’t make the image"
            action={
              <Button variant="outline" onClick={retry}>
                Try again
              </Button>
            }
          />
        ) : (
          <div className="relative mx-auto aspect-[4/5] w-[216px] overflow-hidden rounded-md border border-edge-2">
            {state === "loading" && (
              <Skeleton className="absolute inset-0 rounded-none" />
            )}
            {/* biome-ignore lint/performance/noImgElement: a private, uncached PNG from our own route; next/image would cache it */}
            <img
              key={attempt}
              src={`${imagePath}${imagePath.includes("?") ? "&" : "?"}v=${attempt}`}
              alt={description}
              onLoad={() => setState("ready")}
              onError={() => setState("failed")}
              className={cn(
                "size-full object-cover",
                state !== "ready" && "opacity-0",
              )}
            />
          </div>
        )}
        <div className="flex flex-col">
          <ShareRow
            disabled={state !== "ready" || busy}
            onClick={() => void send("share")}
            icon={
              <ShareOut
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-6 text-act-ink"
              />
            }
          >
            Share image
          </ShareRow>
          <ShareRow
            disabled={state !== "ready" || busy}
            onClick={() => void send("save")}
            icon={
              <Photo
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-6 text-act-ink"
              />
            }
          >
            Save image
          </ShareRow>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function ShareRow({
  disabled,
  onClick,
  icon,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={() => feedback("press", { phase: "down" })}
      onPointerUp={() => feedback("press", { phase: "up" })}
      onClick={onClick}
      className="t-body flex min-h-14 items-center gap-4 text-left text-ink-1 active:bg-sel disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  );
}
