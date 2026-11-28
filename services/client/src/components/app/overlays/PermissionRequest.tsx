"use client";

import { Button } from "@/components/ui/button";
import { feedback, HapticOverlay } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import {
  type AppIcon,
  Camera,
  CameraOff,
  LocationOff,
  MyLocation,
} from "../icons";
import { ResponsiveDialog } from "../ResponsiveDialog";
import { PRESS_CLASS, pressFeedback } from "./press";

export type PermissionKind = "camera" | "location";
/** `ask`: our words before the phone asks. `off`: the person said no. */
export type PermissionState = "ask" | "off";

type Words = {
  title: string;
  body: string;
  /** The primary (ask) or the way around it (off). */
  action: string;
  /** The quiet text button: "Not now", or "Open Settings". */
  quiet: string;
  icon: AppIcon;
};

/**
 * The kit's words (kit-16, kit-17): ask in our words first, then the phone
 * asks; off is never a dead end — it offers the way around and the setting.
 */
export const PERMISSION_WORDS: Record<
  PermissionKind,
  Record<PermissionState, Words>
> = {
  camera: {
    ask: {
      title: "Scan with your camera",
      body: "For labels, menus and barcodes.",
      action: "Allow camera",
      quiet: "Not now",
      icon: Camera,
    },
    off: {
      title: "Camera is off",
      body: "Turn it on in Settings to scan.",
      action: "Type it instead",
      quiet: "Open Settings",
      icon: CameraOff,
    },
  },
  location: {
    ask: {
      title: "Show what’s near you",
      body: "For distances and the map.",
      action: "Allow location",
      quiet: "Not now",
      icon: MyLocation,
    },
    off: {
      title: "Location is off",
      body: "Turn it on in Settings for distances.",
      action: "Pick a place instead",
      quiet: "Open Settings",
      icon: LocationOff,
    },
  },
};

export type PermissionRequestProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: PermissionKind;
  state: PermissionState;
  /** Ask: the person agreed (now let the phone ask). Off: the way around. */
  onAction: () => void;
  /** Ask: "Not now". Off: "Open Settings" (how depends on the platform). */
  onQuiet?: () => void;
  /** Words to use instead of the kit's, for a surface with its own reason. */
  words?: Partial<Words>;
};

/** The body of the request, drawn alone for the kit gallery. */
export function PermissionRequestBody({
  kind,
  state,
  onAction,
  onQuiet,
  words,
  className,
}: Omit<PermissionRequestProps, "open" | "onOpenChange"> & {
  className?: string;
}) {
  const w = { ...PERMISSION_WORDS[kind][state], ...words };
  const Icon = w.icon;
  return (
    <div
      data-slot="permission-request"
      data-kind={kind}
      data-state={state}
      className={cn(
        "flex flex-col items-center gap-3 pb-2 text-center",
        className,
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-raised">
        <Icon aria-hidden className="size-7 text-glyph" />
      </span>
      <p className="t-title text-ink">{w.title}</p>
      <p className="t-body text-ink-2">{w.body}</p>
      <Button
        variant={state === "ask" ? "default" : "outline"}
        {...pressFeedback(state === "ask" ? "primary" : "press")}
        onClick={() => {
          feedback("tick");
          onAction();
        }}
        className={cn(
          "t-head relative mt-1 h-11 w-full",
          state === "ask"
            ? "bg-act text-on-act hover:bg-act/90"
            : "border-edge-2 bg-transparent text-ink hover:bg-raised dark:border-edge-2 dark:bg-transparent",
          PRESS_CLASS,
        )}
      >
        {w.action}
        <HapticOverlay />
      </Button>
      {onQuiet !== undefined && (
        <Button
          variant="ghost"
          {...pressFeedback()}
          onClick={onQuiet}
          className={cn(
            "t-head h-11 min-w-11 text-act-ink hover:bg-transparent hover:text-act-ink",
            PRESS_CLASS,
          )}
        >
          {w.quiet}
        </Button>
      )}
    </div>
  );
}

/**
 * Asking for the camera or location (KIT "Asking for the camera or
 * location"): a sheet on a phone, a 440 dialog on desktop, with our reason
 * before the platform prompt, and a way around when it is off.
 */
export function PermissionRequest({
  open,
  onOpenChange,
  ...body
}: PermissionRequestProps) {
  const w = { ...PERMISSION_WORDS[body.kind][body.state], ...body.words };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={w.title}
      hideTitle
    >
      <PermissionRequestBody {...body} />
    </ResponsiveDialog>
  );
}
