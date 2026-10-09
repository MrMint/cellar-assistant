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
  /** Bumped after every saved log or Undo, so "Your log" can re-read. */
  logVersion: number;
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

  const value = useMemo(
    () => ({ logDrink, logVersion }),
    [logDrink, logVersion],
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
    </ItemActionsContext.Provider>
  );
}
