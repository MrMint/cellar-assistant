"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Cocktail } from "@/components/app/icons";
import { UserAvatar } from "@/components/app/UserAvatar";
import { LogDrinkSheet } from "@/components/drink-log/LogDrinkSheet";
import type { LogSubject } from "@/components/drink-log/log-draft";
import { useDrinkLogFeedback } from "@/components/drink-log/useDrinkLogFeedback";
import { Button } from "@/components/ui/button";
import { Timestamp } from "../common/Timestamp";
import { groupCheckInsByDay } from "./adapter";
import { HeldBackNote } from "./HeldBackNote";
import { ItemSection } from "./ItemSection";

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
  /** What a new log is about: the item, poured from this bottle. */
  subject: LogSubject;
  /** The viewer's friends, preloaded for the sheet's "Who with". */
  friends: User[];
  /**
   * `checkIns.totalCount`: the API returns the newest 100 (newest first), so
   * past that the oldest are held back and the card says so.
   */
  total?: number | null;
  /**
   * The bottle is finished: logging is still allowed (logs survive the
   * bottle, D5), but it is no longer the page's main action.
   */
  finished?: boolean;
};

/**
 * The bottle's check-ins, and "Log a drink" from it (X02).
 *
 * The list is `CellarItem.checkIns` (G14) with `CheckIn.user` (G4), grouped
 * by UTC day and dated through `common/Timestamp` (the hydration rule), as
 * `82450ad1:src/components/item/ItemCheckIns.tsx` drew it.
 *
 * The old pair of buttons — "Check In" and "Bulk Check In", each its own
 * mutation — is one now: "Log a drink" opens the drink-log sheet with this
 * bottle as its source. "Just me" is "Log it" with nothing filled in, and
 * "Bulk" is "Who with" (each friend gets the drink in their own log, the
 * `bulkCheckIn` rule). A log written here survives the bottle: removing or
 * finishing it keeps the history.
 */
export const ItemCheckIns = ({
  checkIns,
  subject,
  friends,
  total,
  finished = false,
}: ItemCheckInsProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const refresh = useCallback(() => router.refresh(), [router]);
  const onSaved = useDrinkLogFeedback({
    itemName: subject.itemName,
    onChanged: refresh,
  });

  const emphasis = finished ? "secondary" : "primary";

  return (
    <>
      <ItemSection>
        <Button
          variant={finished ? "outline" : "default"}
          // The page's main action until the bottle is finished — said in
          // the markup so a test can check it without a library's classes.
          data-emphasis={emphasis}
          onClick={() => setOpen(true)}
          className="w-full"
        >
          <Cocktail aria-hidden />
          Log a drink
        </Button>
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
      <LogDrinkSheet
        open={open}
        onOpenChange={setOpen}
        subject={subject}
        friends={friends}
        onSaved={onSaved}
      />
    </>
  );
};
