"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "urql";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { ErrorState } from "@/components/app/EmptyState";
import {
  type AppIcon,
  ICON_STROKE,
  ShareOut,
  Undo,
} from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { PRESS_CLASS, pressFeedback } from "@/components/app/overlays/press";
import {
  ShareSheetBody,
  useCanShare,
} from "@/components/app/overlays/ShareSheet";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { unwrapResult } from "@/lib/api/result";
import { feedback, HapticOverlay } from "@/lib/feedback";
import { absoluteUrl, invitePath } from "@/lib/share/routes";
import { cn } from "@/lib/utils";
import {
  EnsureFriendInviteMutation,
  MyFriendInviteQuery,
  ResetFriendInviteMutation,
} from "./queries";

/** What the share sheet carries for an invite. */
export const inviteShareRequest = (origin: string, token: string) => ({
  url: absoluteUrl(origin, invitePath(token)),
  title: "Join me on Cellar Assistant",
  text: "Add me as a friend on Cellar Assistant:",
});

/**
 * Your invite link (X17): one link that makes whoever opens it your friend.
 * It is made the first time it is asked for and kept; `reset` replaces it.
 * Minting is idempotent and inert: the secret reaches nobody until the
 * viewer shares it.
 */
function useInviteLink(active: boolean) {
  const [{ data, error }, refetch] = useQuery({
    query: MyFriendInviteQuery,
    pause: !active,
  });
  const [ensuring, ensure] = useMutation(EnsureFriendInviteMutation);
  const [resetting, resetInvite] = useMutation(ResetFriendInviteMutation);
  const [minted, setMinted] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const mintRequested = useRef(false);
  const token = minted ?? data?.me?.friendInvite?.token ?? null;

  const mint = useCallback(async () => {
    setFailed(false);
    const result = unwrapResult(
      (await ensure({})).data?.ensureFriendInvite,
      "FriendInvite",
    );
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setMinted(result.data.token);
  }, [ensure]);

  useEffect(() => {
    if (!active || data === undefined) return;
    if (data.me?.friendInvite !== null || mintRequested.current) return;
    mintRequested.current = true;
    void mint();
  }, [active, data, mint]);

  const reset = async (): Promise<boolean> => {
    const result = unwrapResult(
      (await resetInvite({})).data?.resetFriendInvite,
      "FriendInvite",
    );
    if (!result.ok) return false;
    setMinted(result.data.token);
    refetch({ requestPolicy: "network-only" });
    return true;
  };

  return {
    token,
    failed: failed || (error !== undefined && token === null),
    pending: ensuring.fetching,
    resetting: resetting.fetching,
    retry: () => {
      if (error !== undefined) refetch({ requestPolicy: "network-only" });
      void mint();
    },
    reset,
  };
}

/** Where there is no system share sheet, "More ways" is an email (F-93). */
export const inviteMailto = (url: string): string => {
  const share = { title: "Join me on Cellar Assistant", url };
  return `mailto:?subject=${encodeURIComponent(share.title)}&body=${encodeURIComponent(
    `Add me as a friend on Cellar Assistant: ${share.url}`,
  )}`;
};

/** One of the invite's own rows under the share body's (an `<li>`). */
function InviteRow({
  icon: Icon,
  label,
  tone = "ink",
  onSelect,
}: {
  icon: AppIcon;
  label: string;
  tone?: "ink" | "danger";
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
          "t-body relative flex min-h-13 w-full items-center gap-4 rounded-md px-1 text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring",
          tone === "danger" ? "text-danger" : "text-ink",
          PRESS_CLASS,
        )}
      >
        <Icon
          aria-hidden
          strokeWidth={ICON_STROKE}
          className={cn(
            "size-5 shrink-0",
            tone === "danger" ? undefined : "text-act-ink",
          )}
        />
        <span>{label}</span>
        <HapticOverlay />
      </button>
    </li>
  );
}

/**
 * The invite sheet's content, drawn without the sheet (for its tests): the
 * header with Done (Social-Friends 11), then the link's code with Copy link
 * and More ways, then Reset link. More ways is the system share sheet where
 * there is one (the share body's own row) and an email where there is not,
 * so the row is always there (F-93). While the link is being made the code
 * is a skeleton; if it can't be made, one way out.
 */
export function InviteSheetContent({
  url,
  failed,
  canShare,
  onDone,
  onRetry,
  onReset,
}: {
  url: string | null;
  failed: boolean;
  canShare: boolean;
  onDone: () => void;
  onRetry: () => void;
  onReset: () => void;
}) {
  return (
    <div data-slot="invite-sheet" className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div aria-hidden className="flex min-w-0 flex-1 flex-col">
          <span className="t-title text-ink">Invite a friend</span>
          <span className="t-body text-ink-2">
            Anyone with this link can add you
          </span>
        </div>
        <Button variant="quiet" className="-mr-2.5" onClick={onDone}>
          Done
        </Button>
      </div>
      {url !== null ? (
        <ShareSheetBody
          title="Invite a friend"
          url={url}
          onDone={onDone}
          footer={
            <>
              {!canShare && (
                <InviteRow
                  icon={ShareOut}
                  label="More ways"
                  onSelect={() => {
                    window.location.href = inviteMailto(url);
                  }}
                />
              )}
              <li aria-hidden className="my-1 border-hair border-t" />
              <InviteRow
                icon={Undo}
                label="Reset link"
                tone="danger"
                onSelect={onReset}
              />
            </>
          }
        />
      ) : failed ? (
        <ErrorState
          title="Couldn't make your link"
          action={
            <Button variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      ) : (
        <Skeleton
          data-slot="invite-qr-pending"
          className="mx-auto aspect-square w-54 max-w-full rounded-md"
        />
      )}
    </div>
  );
}

/**
 * "Invite a friend" (Social-Friends 11 to 14; L14, L34): the sheet on a
 * phone, a dialog from `md` up, drawn by {@link InviteSheetContent}. Reset
 * link confirms first because every link already sent stops working.
 */
export function InviteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invite = useInviteLink(open);
  const canShare = useCanShare();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const url =
    invite.token === null || typeof window === "undefined"
      ? null
      : inviteShareRequest(window.location.origin, invite.token).url;

  const onReset = async () => {
    const ok = await invite.reset();
    setConfirmOpen(false);
    if (!ok) {
      notify("Couldn't reset your link", { tone: "error" });
      return;
    }
    feedback("success");
    notify("New link ready", { tone: "success" });
  };

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Invite a friend"
        hideTitle
        description="Anyone with this link can add you"
      >
        <InviteSheetContent
          url={url}
          failed={invite.failed}
          canShare={canShare}
          onDone={() => onOpenChange(false)}
          onRetry={invite.retry}
          onReset={() => setConfirmOpen(true)}
        />
      </ResponsiveDialog>
      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset your invite link?"
        description="Links you already sent stop working."
        cancelLabel="Keep it"
        confirmLabel="Reset"
        pending={invite.resetting}
        onConfirm={() => void onReset()}
      />
    </>
  );
}
