"use client";

/**
 * Whether this device can install the app now, shared by the install sheet
 * (`InstallPwaDialog`, which opens itself after the first save) and Settings'
 * "Install the app" row (Shell-Entry ruling 2: shown only when not installed,
 * and the way back after "Stop asking").
 *
 * Chrome hands out its install prompt once, as `beforeinstallprompt`, to
 * whoever is listening; this module is that listener, so the row and the
 * sheet use the same event. iPhone and iPad have no prompt: the offer there
 * is the Add to Home Screen steps, whenever the app is not already running
 * standalone.
 */
import { useSyncExternalStore } from "react";
import type { BeforeInstallPromptEvent } from "@/constants";
import { detectPlatform } from "./install-prompt";

export type InstallOffer = {
  /** How to install here, or `null` when there is no way (or it already is). */
  readonly kind: "prompt" | "ios" | "chrome-ios" | null;
};

/** Settings' row asks the mounted sheet to open with this event. */
export const OPEN_INSTALL_EVENT = "ca:install-open";

const NONE: InstallOffer = { kind: null };
const OFFERS: Readonly<
  Record<NonNullable<InstallOffer["kind"]>, InstallOffer>
> = {
  prompt: { kind: "prompt" },
  ios: { kind: "ios" },
  "chrome-ios": { kind: "chrome-ios" },
};

let promptEvent: BeforeInstallPromptEvent | undefined;
let installed = false;
let started = false;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => {
    listener();
  });
};

export const isStandalone = (win: Window): boolean =>
  win.matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in win.navigator &&
    (win.navigator as Navigator & { standalone?: boolean }).standalone ===
      true);

/** The offer for this device, from what the browser has told us so far. */
export function readInstallOffer(win: Window): InstallOffer {
  if (installed || isStandalone(win)) return NONE;
  if (promptEvent !== undefined) return OFFERS.prompt;
  const platform = detectPlatform(
    win.navigator.userAgent,
    win.navigator.maxTouchPoints ?? 0,
  );
  if (platform.chromeIos) return OFFERS["chrome-ios"];
  if (platform.ios) return OFFERS.ios;
  return NONE;
}

/** Start listening (once per page): idempotent, so any caller may run it. */
export function startInstallOffer(win: Window): void {
  if (started) return;
  started = true;
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event;
    emit();
  });
  win.addEventListener("appinstalled", () => {
    installed = true;
    promptEvent = undefined;
    emit();
  });
}

/** Chrome's event, to call `prompt()` on; spent once it has been used. */
export function takeInstallPrompt(): BeforeInstallPromptEvent | undefined {
  const event = promptEvent;
  promptEvent = undefined;
  emit();
  return event;
}

function subscribe(listener: () => void): () => void {
  startInstallOffer(window);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallOffer(): InstallOffer {
  return useSyncExternalStore(
    subscribe,
    () => readInstallOffer(window),
    () => NONE,
  );
}

/** Open the install sheet now, whatever was said before (Settings' row). */
export function openInstallSheet(): void {
  window.dispatchEvent(new Event(OPEN_INSTALL_EVENT));
}

/** Tests only: forget what this page has heard. */
export function resetInstallOfferForTests(): void {
  promptEvent = undefined;
  installed = false;
  started = false;
  listeners.clear();
}
