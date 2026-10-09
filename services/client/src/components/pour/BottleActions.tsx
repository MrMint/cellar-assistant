"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ActionBar } from "@/components/app/ActionBar";
import { Cocktail, Pour } from "@/components/app/icons";
import {
  type DrinkLogFriend,
  LogDrinkSheet,
} from "@/components/drink-log/LogDrinkSheet";
import { useDrinkLogFeedback } from "@/components/drink-log/useDrinkLogFeedback";
import { Button } from "@/components/ui/button";
import { type PourBottle, PourSheet, type PourSubject } from "./PourSheet";

/**
 * The bottle page's one primary action, in the thumb zone (X03; design §2's
 * ActionBar, "Pour · Check in"):
 *
 * - **Pour** — for the cellar's owners while the bottle is not finished,
 *   **sealed or open**: the first pour opens it. The level, the log and
 *   the open in one sheet.
 * - **Log a drink** — beside it, for a glass that should not move the level
 *   (a taste at a friend's, a log after the fact); and the only action for
 *   a visitor to the cellar, or once the bottle is finished (logs survive
 *   the bottle, D5), where it is no longer emphasised for the owner.
 *
 * Both sheets stay mounted after a write, so their Undo toasts (the pour's,
 * and N13a's after the last pour) outlive a `router.refresh()`.
 */
export function BottleActions({
  bottle,
  subject,
  isOwner,
  finished,
  friends,
}: {
  bottle: PourBottle;
  subject: PourSubject;
  isOwner: boolean;
  finished: boolean;
  friends?: readonly DrinkLogFriend[];
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const [pouring, setPouring] = useState(false);
  const [logging, setLogging] = useState(false);
  const onLogged = useDrinkLogFeedback({
    itemName: subject.itemName,
    onChanged: refresh,
  });
  const canPour = isOwner && !finished;
  const logEmphasis =
    canPour || (isOwner && finished) ? "secondary" : "primary";

  return (
    <>
      <ActionBar role="toolbar" aria-label="This bottle">
        {canPour && (
          <Button onClick={() => setPouring(true)} aria-haspopup="dialog">
            <Pour aria-hidden />
            Pour
          </Button>
        )}
        <Button
          variant={logEmphasis === "primary" ? "default" : "secondary"}
          data-emphasis={logEmphasis}
          aria-haspopup="dialog"
          onClick={() => setLogging(true)}
        >
          <Cocktail aria-hidden />
          Log a drink
        </Button>
      </ActionBar>
      {isOwner && (
        <PourSheet
          open={pouring}
          onOpenChange={setPouring}
          bottle={bottle}
          subject={subject}
          friends={friends}
          onChanged={refresh}
        />
      )}
      <LogDrinkSheet
        open={logging}
        onOpenChange={setLogging}
        subject={{
          ...subject,
          bottle: {
            cellarId: bottle.cellarId,
            cellarItemId: bottle.cellarItemId,
          },
        }}
        friends={friends}
        onSaved={onLogged}
      />
    </>
  );
}
