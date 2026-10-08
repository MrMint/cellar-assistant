"use client";

import { useEffect } from "react";

/**
 * Any Radix/vaul modal layer still mounted and open: dialogs and sheets,
 * confirms, menus, and select listboxes (each sets the lock while it is up).
 */
const OPEN_MODAL = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[data-slot="dropdown-menu-content"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
].join(", ");

/**
 * Whether `body` is stuck: Radix set `pointer-events: none` for a modal that
 * is no longer open. Pure, for the test.
 */
export function isStalePointerLock(doc: Document): boolean {
  return (
    doc.body.style.pointerEvents === "none" &&
    doc.querySelector(OPEN_MODAL) === null
  );
}

/**
 * STOPGAP — remove once `app/AppBar` defers an overflow item's `onSelect`
 * until its sheet (phones) or dropdown (desktop) has closed.
 *
 * Opening a second Radix modal (a `ConfirmSheet`) from the item of a first
 * one that is still closing is a known way to leave `body` with
 * `pointer-events: none` after both are gone: the second captures the first's
 * "before" value, which is already `none`, and restores it on close. The whole
 * app is then untappable until a reload — on an iOS standalone PWA, until the
 * app is killed.
 *
 * This watches `body`'s style and, a frame after it changes, clears a lock
 * that no open modal accounts for. It never touches a lock an open modal
 * holds.
 */
export function ModalPointerGuard() {
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      // Two frames: let Radix finish its own open/close bookkeeping first.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (isStalePointerLock(document)) {
            document.body.style.removeProperty("pointer-events");
          }
        });
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
    });
    // A modal closing changes the tree, not body's style.
    const tree = new MutationObserver(check);
    tree.observe(document.body, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      tree.disconnect();
    };
  }, []);
  return null;
}
