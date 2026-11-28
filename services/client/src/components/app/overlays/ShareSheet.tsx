"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { feedback, HapticOverlay } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { type AppIcon, CopyLink, Send, ShareOut } from "../icons";
import { notify } from "../notify";
import { ResponsiveDialog } from "../ResponsiveDialog";
import { PRESS_CLASS, pressFeedback } from "./press";
import { QrCode } from "./QrCode";

export type ShareSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is shared: the list's, recipe's or bottle's name. */
  title: string;
  /** Who can open it and what it holds: "Share · friends can open it · 113 places". */
  subtitle?: ReactNode;
  /** The link the code and Copy carry (absolute). */
  url: string;
  /** "Send to a friend", when the surface can (L34: each owner wires it). */
  onSendToFriend?: () => void;
  /** Drawn above the code (H-104): a preview of what is shared. */
  preview?: ReactNode;
  /** Extra `<li>` rows after the built-in ones (F-174): an invite's own rows. */
  footer?: ReactNode;
};

const noop = () => () => {};

/** Whether this browser has the system share sheet. */
export function useCanShare(): boolean {
  return useSyncExternalStore(
    noop,
    () => typeof navigator.share === "function",
    () => false,
  );
}

/** Copy `url`, saying so in a toast ("Link copied"); never throws. */
export async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    notify("Link copied");
    return true;
  } catch {
    notify("Couldn’t copy the link", { tone: "error" });
    return false;
  }
}

function ShareRow({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: AppIcon;
  label: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        {...pressFeedback()}
        onClick={() => {
          feedback("tick");
          onSelect();
        }}
        className={cn(
          "t-body relative flex min-h-13 w-full items-center gap-4 rounded-md px-1 text-left text-ink outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring",
          PRESS_CLASS,
        )}
      >
        <Icon aria-hidden className="size-5 shrink-0 text-act-ink" />
        <span>{label}</span>
        <HapticOverlay />
      </button>
    </li>
  );
}

/** The sheet's body, drawn alone for the kit gallery. */
export function ShareSheetBody({
  title,
  url,
  onSendToFriend,
  preview,
  footer,
  onDone,
}: Pick<
  ShareSheetProps,
  "title" | "url" | "onSendToFriend" | "preview" | "footer"
> & {
  onDone?: () => void;
}) {
  const canShare = useCanShare();
  return (
    <div data-slot="share-sheet" className="flex flex-col gap-4 pb-2">
      {preview}
      <QrCode
        value={url}
        label={`QR code for ${title}`}
        className="mx-auto w-54 max-w-full"
      />
      <ul className="flex flex-col">
        <ShareRow
          icon={CopyLink}
          label="Copy link"
          onSelect={() => {
            void copyLink(url);
          }}
        />
        {onSendToFriend !== undefined && (
          <ShareRow
            icon={Send}
            label="Send to a friend"
            onSelect={() => {
              onDone?.();
              onSendToFriend();
            }}
          />
        )}
        {canShare && (
          <ShareRow
            icon={ShareOut}
            label="More ways"
            onSelect={() => {
              navigator.share({ title, url }).catch(() => {
                /* The person closed the system sheet: nothing to say. */
              });
            }}
          />
        )}
        {footer}
      </ul>
    </div>
  );
}

/**
 * Share with a code (KIT kit-10; L14): the name, who can open it, a real QR
 * code on its white plate, then Copy link, Send to a friend and More ways
 * (the system share sheet, where there is one). A sheet on a phone, a 440
 * dialog on desktop. Each surface's owner wires it on its own page (L34).
 */
export function ShareSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  url,
  onSendToFriend,
  preview,
  footer,
}: ShareSheetProps) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={subtitle}
    >
      <ShareSheetBody
        title={title}
        url={url}
        onSendToFriend={onSendToFriend}
        preview={preview}
        footer={footer}
        onDone={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}
