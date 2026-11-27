"use client";

import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { MORE, TABS } from "../nav";
import { ResponsiveDialog } from "../ResponsiveDialog";
import { useNavigate } from "../useNavigate";
import { handleAppKey, KEY_ROWS, OPEN_MORE_EVENT } from "./app-keys";
import { Kbd } from "./Kbd";

/** The tabs' own keys, then More, then the rest (kit-desktop-09-keys). */
export const KEYS_DIALOG_ROWS: readonly { keys: string; does: string }[] = [
  ...TABS.map((tab) => ({ keys: tab.keys, does: tab.label })),
  { keys: MORE.keys, does: MORE.label },
  ...KEY_ROWS.filter((row) => !TABS.some((tab) => tab.keys === row.keys)),
];

/** The keys dialog (`?`): every key the app answers, as keycaps. */
export function KeysDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Keys">
      <KeysList />
    </ResponsiveDialog>
  );
}

/** The dialog's list, drawn alone for the kit gallery. */
export function KeysList() {
  return (
    <dl data-slot="keys-list" className="grid grid-cols-[auto_1fr] gap-x-4">
      {KEYS_DIALOG_ROWS.map((row) => (
        <div
          key={`${row.keys}-${row.does}`}
          className="col-span-2 grid min-h-10 grid-cols-subgrid items-center border-b border-hair last:border-b-0"
        >
          <dt>
            <Kbd keys={row.keys} />
          </dt>
          <dd className="t-body text-ink">{row.does}</dd>
        </div>
      ))}
    </dl>
  );
}

const SEARCH_SELECTOR = "[data-app-search] input, input[type='search']";

/**
 * The shell's keys, for the app element's `onKeyDown` (never the document:
 * a key typed into a field, a dialog or another app on the page is not
 * ours). Returns the handler and the keys dialog's state.
 */
export function useShellKeys(): {
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  keysOpen: boolean;
  setKeysOpen: (open: boolean) => void;
} {
  const navigate = useNavigate();
  const [keysOpen, setKeysOpen] = useState(false);
  const chord = useRef({ armed: false });

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const handled = handleAppKey(
        event,
        {
          navigate: (href) => navigate.push(href),
          openKeys: () => setKeysOpen(true),
          openMore: () => window.dispatchEvent(new Event(OPEN_MORE_EVENT)),
          focusSearch: () => {
            const field =
              document.querySelector<HTMLInputElement>(SEARCH_SELECTOR);
            if (field === null) return false;
            field.focus();
            return true;
          },
        },
        chord.current,
      );
      if (handled) event.preventDefault();
    },
    [navigate],
  );

  return { onKeyDown, keysOpen, setKeysOpen };
}
