"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { LogDrinkSheet } from "@/components/drink-log/LogDrinkSheet";
import type { LogSubject } from "@/components/drink-log/log-draft";
import { useDrinkLogFeedback } from "@/components/drink-log/useDrinkLogFeedback";
import { type PourBottle, PourSheet } from "@/components/pour/PourSheet";

/** The bottle a drink is poured from, when there is one. */
export type LogBottle = {
  readonly cellarId: string;
  readonly cellarItemId: string;
};

export type ItemActions = {
  /**
   * Open "Log a drink" for this item. `undefined` logs from the page's
   * default bottle (the selected one when it is yours, else your one open
   * bottle); `null` logs with no bottle; a bottle logs from that bottle.
   */
  logDrink: (bottle?: LogBottle | null) => void;
  /** Open X03's Pour sheet (open + log + level in one) for this bottle. */
  pour: (bottle: PourBottle) => void;
  /** Bumped after every saved log or Undo, so "Your log" can re-read. */
  logVersion: number;
  /**
   * After a write made elsewhere on the page that may have logged a drink —
   * a pour (X03's Pour sheet logs one) or its Undo: re-read "Your log" and
   * refresh the page.
   */
  changed: () => void;
};

const ItemActionsContext = createContext<ItemActions | null>(null);

/** The page's actions, or null outside an item page (YourLog's tests). */
export const useItemActions = (): ItemActions | null =>
  useContext(ItemActionsContext);

/**
 * X09: one "Log a drink" sheet for the whole item page.
 *
 * Three places open it — the ActionBar's primary, a "Your bottles" row's
 * Log, and "Your log"'s own button — and each must land in the same list
 * afterwards. So the sheet lives here, once, and `logVersion` tells "Your
 * log" (which reads `Item.checkIns(scope: MINE)` itself) to re-read; the
 * page is refreshed too, for the bottles and anything else that counts
 * drinks. A new log toasts with Undo (`useDrinkLogFeedback`).
 *
 * X03's Pour sheet is here once too, for the ActionBar's Pour (a bottle URL
 * of yours) and each "Your bottles" row's. Held above the rows rather than
 * in one: the last pour finishes the bottle, which takes it out of "Your
 * bottles" on the refresh that follows, and the sheet — its rating and
 * tier-list steps and its Undo toasts — must not go with the row.
 */
export function ItemActionsProvider({
  subject,
  defaultBottle,
  children,
}: {
  subject: Omit<LogSubject, "bottle">;
  defaultBottle: LogBottle | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bottle, setBottle] = useState<LogBottle | null>(null);
  const [logVersion, setLogVersion] = useState(0);
  const [pourTarget, setPourTarget] = useState<PourBottle | null>(null);
  const [pouring, setPouring] = useState(false);

  const onChanged = useCallback(() => {
    setLogVersion((version) => version + 1);
    router.refresh();
  }, [router]);
  const onSaved = useDrinkLogFeedback({
    itemName: subject.itemName,
    onChanged,
  });

  const logDrink = useCallback(
    (target?: LogBottle | null) => {
      setBottle(target === undefined ? defaultBottle : target);
      setOpen(true);
    },
    [defaultBottle],
  );

  const pour = useCallback((target: PourBottle) => {
    setPourTarget(target);
    setPouring(true);
  }, []);

  const value = useMemo(
    () => ({ logDrink, pour, logVersion, changed: onChanged }),
    [logDrink, pour, logVersion, onChanged],
  );

  return (
    <ItemActionsContext.Provider value={value}>
      {children}
      <LogDrinkSheet
        open={open}
        onOpenChange={setOpen}
        subject={{ ...subject, bottle }}
        mode={{ kind: "new" }}
        onSaved={onSaved}
      />
      {pourTarget !== null && (
        <PourSheet
          // One bottle's finish state and toasts are that bottle's.
          key={pourTarget.cellarItemId}
          open={pouring}
          onOpenChange={setPouring}
          bottle={pourTarget}
          subject={subject}
          onChanged={onChanged}
        />
      )}
    </ItemActionsContext.Provider>
  );
}
