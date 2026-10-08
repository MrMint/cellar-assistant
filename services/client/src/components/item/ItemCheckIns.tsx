"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BulkCheckInMutation,
  CheckInMutation,
  CheckInRowFragment,
} from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { Timestamp } from "../common/Timestamp";
import { groupCheckInsByDay } from "./adapter";
import { HeldBackNote } from "./HeldBackNote";
import { ItemSection } from "./ItemSection";
import { useOptimisticRows } from "./useOptimisticRows";

type User = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

type CheckIn = {
  id: string;
  createdAt: string;
  user: User;
};

export type ItemCheckInsProps = {
  checkIns: CheckIn[];
  /** The bottle (`cellar_items.id`). */
  itemId: string;
  cellarId: string;
  friends: User[];
  user: User;
  /**
   * `checkIns.totalCount`: the API returns the newest 100 (newest first), so
   * past that the oldest are held back and the card says so.
   */
  total?: number | null;
  /**
   * The bottle is finished: a check-in is still allowed (logs survive the
   * bottle, D5), but it is no longer the page's main action.
   */
  finished?: boolean;
};

/**
 * `82450ad1:src/components/item/ItemCheckIns.tsx`, restored.
 *
 * `addCheckInAction(cellarItemId)` → `checkIn` with a client-minted
 * `checkInId` (a retry writes one row); `addBulkCheckInsAction` →
 * `bulkCheckIn`, whose ids must be the viewer or friends — which is exactly
 * what the picker offers. The list is `CellarItem.checkIns` (G14) with
 * `CheckIn.user` (G4). Rows are grouped by UTC day and dated through
 * `common/Timestamp` instead of date-fns (the hydration rule), so a check-in
 * near midnight can sit under its UTC day rather than the viewer's.
 *
 * Optimistic (X24): "Check In" draws the viewer's avatar under today the
 * moment it is tapped — the row's id is the `checkInId` the write carries, so
 * the server's row, when `router.refresh()` brings it, is the same row and
 * replaces it without a blink. "Bulk Check In" closes its picker on submit
 * and draws everyone picked the same way. Unconfirmed avatars are dimmed
 * (`data-pending`); a refused write takes them away and says why. The button
 * is held while its write is in flight (a check-in is a drink, so a double
 * tap must not log two) but shows no spinner: the new avatar is the answer.
 */
export const ItemCheckIns = ({
  checkIns,
  itemId,
  cellarId,
  friends,
  user,
  total,
  finished = false,
}: ItemCheckInsProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bulk, setBulk] = useState([] as string[]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [, checkIn] = useMutation(CheckInMutation);
  const [, bulkCheckIn] = useMutation(BulkCheckInMutation);
  const rows = useOptimisticRows(checkIns);

  const refused = (message: string) => {
    setError(message);
    notify("Couldn't check in", { tone: "error", description: message });
  };

  const handleClickCheckIn = () => {
    const row: CheckIn = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      user,
    };
    startTransition(async () => {
      setError(null);
      rows.add([row]);
      const response = await checkIn({
        cellarId,
        cellarItemId: itemId,
        checkInId: row.id,
      });
      if (response.error) {
        refused(failureFromTransport(response.error).message);
        return;
      }
      const result = unwrapResult(response.data?.checkIn, "CheckIn");
      if (!result.ok) {
        refused(result.error.message);
        return;
      }
      startTransition(() => rows.hold([row]));
      router.refresh();
    });
  };

  const handleClickBulk = () => {
    setOpen(true);
  };

  const handleBulkCheckIn = () => {
    const people = [user, ...friends];
    const now = new Date().toISOString();
    const drawn: CheckIn[] = bulk.flatMap((id) => {
      const person = people.find((p) => p.id === id);
      return person === undefined
        ? []
        : [
            {
              id: `pending-${crypto.randomUUID()}`,
              createdAt: now,
              user: person,
            },
          ];
    });
    const userIds = bulk;
    setOpen(false);
    startTransition(async () => {
      setError(null);
      rows.add(drawn);
      const response = await bulkCheckIn({
        cellarId,
        cellarItemId: itemId,
        userIds,
      });
      if (response.error) {
        refused(failureFromTransport(response.error).message);
        return;
      }
      const result = unwrapResult(
        response.data?.bulkCheckIn,
        "BulkCheckInPayload",
      );
      if (!result.ok) {
        refused(result.error.message);
        return;
      }
      // The server's own rows (their ids are its), held until the refresh.
      const written = result.data.checkIns.edges.flatMap(({ node }) => {
        const row = readFragment(CheckInRowFragment, node);
        const person = people.find((p) => p.id === row.userId);
        return person === undefined
          ? []
          : [{ id: row.id, createdAt: row.createdAt, user: person }];
      });
      startTransition(() => rows.hold(written));
      router.refresh();
    });
  };

  const handleClickBulkUser = (userId: string) => {
    if (bulk.includes(userId)) {
      setBulk(bulk.filter((id) => id !== userId));
    } else {
      setBulk(bulk.concat([userId]));
    }
  };

  useEffect(() => {
    if (!open) {
      setBulk([]);
    }
  }, [open]);

  const emphasis = finished ? "secondary" : "primary";

  return (
    <>
      <ItemSection>
        <div className="flex gap-4">
          <Button
            variant={finished ? "outline" : "default"}
            // The page's main action until the bottle is finished — said in
            // the markup so a test can check it without a library's classes.
            data-emphasis={emphasis}
            onClick={handleClickCheckIn}
            disabled={isPending}
            aria-busy={isPending || undefined}
            className="flex-1"
          >
            Check In
          </Button>
          {friends.length > 0 && (
            <Button
              variant={finished ? "outline" : "default"}
              data-emphasis={emphasis}
              onClick={handleClickBulk}
              disabled={isPending}
              className="flex-1"
            >
              Bulk Check In
            </Button>
          )}
        </div>
        {error !== null && (
          <p role="alert" className="type-callout text-destructive">
            {error}
          </p>
        )}
        {rows.shown.length > 0 && (
          <ul
            aria-label="Check-ins"
            className="flex flex-col divide-y divide-line border-line border-y"
          >
            {groupCheckInsByDay(rows.shown).map(([dateKey, x]) => (
              <li
                key={dateKey}
                className="flex min-h-12 items-center justify-between gap-3 py-2"
              >
                <span className="flex -space-x-2">
                  {x.map((y) => {
                    const pending = rows.isPending(y.id);
                    return (
                      <span
                        key={y.id}
                        data-pending={pending || undefined}
                        className={cn(
                          "inline-flex transition-opacity duration-(--ca-dur-short) ease-standard",
                          // Only a new, unconfirmed avatar fades in: rows the
                          // page arrived with are visible at rest (§4.1).
                          pending && "fade-in-0 animate-in opacity-60",
                        )}
                      >
                        <UserAvatar
                          avatarUrl={y.user.avatarUrl}
                          displayName={y.user.displayName}
                          title={y.user.displayName}
                          className="ring-2 ring-surface-1"
                        />
                      </span>
                    );
                  })}
                </span>
                <span className="type-body tabular text-ink-2">
                  <Timestamp
                    iso={x[0]?.createdAt ?? dateKey}
                    precision="date"
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <HeldBackNote
          shown={checkIns.length}
          total={total}
          noun="check-ins"
          order="newest"
        />
      </ItemSection>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Select Friends"
        footer={
          <div className="flex w-full flex-col gap-2 md:flex-row-reverse md:justify-start">
            <Button onClick={handleBulkCheckIn} disabled={bulk.length === 0}>
              Check In
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        }
      >
        <ul className="flex flex-col gap-2">
          {[user].concat(friends).map((person) => {
            const id = `bulk-check-in-${person.id}`;
            return (
              <li key={person.id}>
                <label
                  htmlFor={id}
                  className="flex min-h-14 items-center gap-3 rounded-md bg-surface-2 px-3 active:bg-surface-3"
                >
                  <Checkbox
                    id={id}
                    checked={bulk.includes(person.id)}
                    onCheckedChange={() => handleClickBulkUser(person.id)}
                    className="size-5"
                  />
                  <UserAvatar
                    avatarUrl={person.avatarUrl}
                    displayName={person.displayName}
                  />
                  <span className="type-headline min-w-0 flex-1 truncate">
                    {person.displayName}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </ResponsiveDialog>
    </>
  );
};
