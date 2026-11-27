"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "urql";
import { ICON_STROKE, Settings } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { PersonRow } from "@/components/app/parts/PersonRow";
import { UserAvatar } from "@/components/app/UserAvatar";
import { AcceptFriendRequestMutation } from "@/components/friend/fragments";
import { Button } from "@/components/ui/button";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { EditProfileSheet } from "./EditProfileSheet";
import type { HubRequest } from "./me-hub-data";
import { PressLink } from "./PressLink";

/**
 * The hub's header (Shell-Me): the viewer's picture, name and email, which
 * open Edit profile in a sheet, and the gear into Settings. Without script
 * the header is a plain link to `/users/edit`.
 */
export function MeHeader({
  name,
  email,
  avatarUrl,
  displayName,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  displayName: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <header className="flex items-center gap-3 pt-2">
      <div className="relative flex min-w-0 flex-1 items-center gap-4">
        {/* Decorative: the name is the heading beside it. */}
        <UserAvatar
          aria-hidden
          avatarUrl={avatarUrl}
          displayName={name}
          size="xl"
        />
        <div className="flex min-w-0 flex-col">
          <h1 className="t-title m-0 truncate text-ink">
            <PressLink
              href="/users/edit"
              overlay
              underline="none"
              className="text-ink"
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                setEditing(true);
              }}
            >
              {name}
            </PressLink>
          </h1>
          {name !== email && (
            <p className="t-cap m-0 truncate text-ink-2">{email}</p>
          )}
        </div>
      </div>
      <PressLink
        href="/me/settings"
        aria-label="Settings"
        underline="none"
        className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full text-glyph outline-none focus-visible:outline-2 focus-visible:outline-act-ink active:bg-raised"
      >
        <Settings aria-hidden className="size-6" strokeWidth={ICON_STROKE} />
      </PressLink>
      <EditProfileSheet
        open={editing}
        onOpenChange={setEditing}
        profile={{ displayName, avatarUrl }}
      />
    </header>
  );
}

/**
 * A friend request sent to the viewer, answered in place (Shell-Me,
 * People): an outlined Accept that sends only the request's id — the API
 * answers it as the viewer, so there is no one else's request to accept.
 */
export function MeRequestRow({ request }: { request: HubRequest }) {
  const router = useRouter();
  const [, accept] = useMutation(AcceptFriendRequestMutation);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <PersonRow
      className="pr-2 pl-3.5"
      name={request.displayName}
      displayName={request.displayName}
      avatarUrl={request.avatarUrl}
      status="Wants to be friends"
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          aria-busy={busy || undefined}
          aria-label={`Accept ${request.displayName}`}
          onClick={async () => {
            setBusy(true);
            const response = await accept({ requestId: request.id });
            const failure = response.error
              ? failureFromTransport(response.error)
              : (() => {
                  const result = unwrapResult(
                    response.data?.acceptFriendRequest,
                    "AcceptFriendRequestPayload",
                  );
                  return result.ok ? null : result.error;
                })();
            setBusy(false);
            if (failure !== null) {
              feedback("refuse");
              notify("That request couldn't be accepted", {
                description: "Try again from Friends.",
                tone: "error",
              });
              return;
            }
            feedback("success");
            setDone(true);
            notify(`${request.displayName} is your friend`);
            router.refresh();
          }}
        >
          Accept
        </Button>
      }
    />
  );
}
