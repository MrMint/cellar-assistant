"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useMutation } from "urql";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkCheckInMutation, CheckInMutation } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { Timestamp } from "../common/Timestamp";
import { groupCheckInsByDay } from "./adapter";
import { HeldBackNote } from "./HeldBackNote";
import { ItemSection } from "./ItemSection";
import { LoadingButton } from "./LoadingButton";

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
  const [isBulkPending, startBulkTransition] = useTransition();
  const [, checkIn] = useMutation(CheckInMutation);
  const [, bulkCheckIn] = useMutation(BulkCheckInMutation);

  const handleClickCheckIn = () => {
    startTransition(async () => {
      setError(null);
      const response = await checkIn({
        cellarId,
        cellarItemId: itemId,
        checkInId: crypto.randomUUID(),
      });
      const result = unwrapResult(response.data?.checkIn, "CheckIn");
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  const handleClickBulk = () => {
    setOpen(true);
  };

  const handleBulkCheckIn = () => {
    startBulkTransition(async () => {
      setError(null);
      const response = await bulkCheckIn({
        cellarId,
        cellarItemId: itemId,
        userIds: bulk,
      });
      const result = unwrapResult(
        response.data?.bulkCheckIn,
        "BulkCheckInPayload",
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
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
          <LoadingButton
            variant={finished ? "outline" : "default"}
            // The page's main action until the bottle is finished — said in
            // the markup so a test can check it without a library's classes.
            data-emphasis={emphasis}
            onClick={handleClickCheckIn}
            loading={isPending}
            className="flex-1"
          >
            Check In
          </LoadingButton>
          {friends.length > 0 && (
            <LoadingButton
              variant={finished ? "outline" : "default"}
              data-emphasis={emphasis}
              onClick={handleClickBulk}
              loading={isPending}
              className="flex-1"
            >
              Bulk Check In
            </LoadingButton>
          )}
        </div>
        {error !== null && (
          <p role="alert" className="type-callout text-destructive">
            {error}
          </p>
        )}
        {checkIns.length > 0 && (
          <ul
            aria-label="Check-ins"
            className="flex flex-col divide-y divide-line border-line border-y"
          >
            {groupCheckInsByDay(checkIns).map(([dateKey, x]) => (
              <li
                key={dateKey}
                className="flex min-h-12 items-center justify-between gap-3 py-2"
              >
                <span className="flex -space-x-2">
                  {x.map((y) => (
                    <UserAvatar
                      key={y.id}
                      avatarUrl={y.user.avatarUrl}
                      displayName={y.user.displayName}
                      title={y.user.displayName}
                      className="ring-2 ring-surface-1"
                    />
                  ))}
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
        onOpenChange={(next) => {
          if (!isBulkPending) setOpen(next);
        }}
        dismissible={!isBulkPending}
        title="Select Friends"
        footer={
          <div className="flex w-full flex-col gap-2 md:flex-row-reverse md:justify-start">
            <LoadingButton
              loading={isBulkPending}
              onClick={handleBulkCheckIn}
              disabled={bulk.length === 0}
            >
              Check In
            </LoadingButton>
            <Button
              variant="ghost"
              disabled={isBulkPending}
              onClick={() => setOpen(false)}
            >
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
