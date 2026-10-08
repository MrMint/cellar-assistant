"use client";

import { track } from "@vercel/analytics/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQuery } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import { ICON_STROKE, Share } from "@/components/app/icons";
import {
  detectPlatform,
  hasSeenFirstSave,
  type InstallPlatform,
  isPromptAllowed,
  PWA_DISMISS_KEY,
  PWA_DISMISS_PERMANENT_KEY,
  PWA_FIRST_SAVE_KEY,
  SAVED_EVENT,
} from "@/components/pwa/install-prompt";
// The query Home already runs for its stats line: one document, one cache entry.
import { SearchCollectionStatsQuery } from "@/components/search/queries";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { BeforeInstallPromptEvent } from "@/constants";

const isInStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone: boolean }).standalone);

/** `localStorage`, or nothing where reading it throws (private mode). */
const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const allowed = () => {
  const store = storage();
  return store === undefined ? true : isPromptAllowed(store);
};

const ShareGlyph = () => (
  <Share
    role="img"
    aria-label="Share"
    className="inline size-[18px] align-middle"
    strokeWidth={ICON_STROKE}
  />
);

/**
 * Whether the viewer has saved anything yet — the install prompt waits for
 * that (N15). Remembered on the device once true, so it is asked at most
 * until the first bottle; asked again on each route change before that (the
 * save itself happens on another screen), and at once when a save announces
 * itself (`announceSave`).
 */
function useFirstSave(enabled: boolean): boolean {
  const pathname = usePathname();
  const [saved, setSaved] = useState(false);

  const markSaved = useCallback(() => {
    try {
      storage()?.setItem(PWA_FIRST_SAVE_KEY, "true");
    } catch {
      // localStorage unavailable: remembered for this session only.
    }
    setSaved(true);
  }, []);

  useEffect(() => {
    const store = storage();
    if (store !== undefined && hasSeenFirstSave(store)) setSaved(true);
    window.addEventListener(SAVED_EVENT, markSaved);
    return () => window.removeEventListener(SAVED_EVENT, markSaved);
  }, [markSaved]);

  // `collectionStats` counts bottles still in the viewer's own and co-owned
  // cellars (G36) — exactly "has put something away". Network-only: a save
  // made elsewhere since the last read must count.
  const [{ data }, reread] = useQuery({
    query: SearchCollectionStatsQuery,
    pause: !enabled || saved,
    requestPolicy: "network-only",
  });
  const total = data?.me?.collectionStats.itemCounts.total ?? 0;
  useEffect(() => {
    if (total > 0) markSaved();
  }, [total, markSaved]);

  // The save itself happens on another screen: ask again on each route change.
  const asked = useRef(pathname);
  useEffect(() => {
    if (asked.current === pathname) return;
    asked.current = pathname;
    if (enabled && !saved) reread({ requestPolicy: "network-only" });
  }, [pathname, enabled, saved, reread]);

  return saved;
}

/**
 * "Install Cellar Assistant" (N15): Chrome's own install prompt where the
 * browser offers one, and Add to Home Screen steps on iPhone and iPad.
 *
 * Shown only after the viewer's first save — asking someone to install an
 * app they have not used yet is the wrong first impression — and never again
 * once put off for good, or for a week after "Remind me later". A bottom sheet
 * (N27): the same copy, steps and buttons as the Joy-era modal.
 */
export const InstallPwaDialog = () => {
  const checkboxId = useId();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>({
    ios: false,
    chromeIos: false,
  });
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent>();
  /** An install path exists on this device and the viewer has not put it off. */
  const [candidate, setCandidate] = useState(false);
  const saved = useFirstSave(candidate);

  useEffect(() => {
    const onBeforePrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallEvent(event);
      if (allowed()) setCandidate(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforePrompt);

    const onInstalled = () => {
      setOpen(false);
      setCandidate(false);
      track("pwa_installed");
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforePrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const detected = detectPlatform(
      window.navigator.userAgent,
      window.navigator.maxTouchPoints ?? 0,
    );
    setPlatform(detected);
    if (!isInStandaloneMode() && detected.ios && allowed()) setCandidate(true);
  }, []);

  // Open once, when both hold: an install path, and a first save behind it.
  useEffect(() => {
    if (!candidate || !saved) return;
    setOpen(true);
    track("pwa_install_prompt_shown", {
      platform: installEvent !== undefined ? "android" : "ios",
    });
    // One showing per page load; dismissing records the choice.
    setCandidate(false);
  }, [candidate, saved, installEvent]);

  useEffect(() => {
    navigator.storage?.persist();
  }, []);

  const handleDismiss = () => {
    try {
      if (dontShowAgain) {
        localStorage.setItem(PWA_DISMISS_PERMANENT_KEY, "true");
        track("pwa_install_dismissed", { type: "permanent" });
      } else {
        localStorage.setItem(PWA_DISMISS_KEY, new Date().toISOString());
        track("pwa_install_dismissed", { type: "remind_later" });
      }
    } catch {
      // localStorage unavailable
    }
    setOpen(false);
  };

  const handleInstallClick = async () => {
    if (installEvent !== undefined) {
      const result = await installEvent.prompt();
      track("pwa_install_result", result);
    }
    setOpen(false);
  };

  const steps =
    installEvent !== undefined || !platform.ios
      ? null
      : platform.chromeIos
        ? [
            <>
              Tap the share icon <ShareGlyph /> in the toolbar.
            </>,
            <>
              Tap <strong>&quot;Add to Home Screen&quot;</strong>.
            </>,
          ]
        : [
            <>Make sure you are using Safari.</>,
            <>
              Tap the share icon <ShareGlyph /> at the bottom of the screen.
            </>,
            <>
              Scroll down and tap{" "}
              <strong>&quot;Add to Home Screen&quot;</strong>.
            </>,
          ];

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDismiss();
      }}
      title="Install Cellar Assistant"
      footer={
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkboxId}
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <Label htmlFor={checkboxId} className="type-callout font-normal">
              Don&apos;t show this again
            </Label>
          </div>
          <div className="flex flex-row justify-end gap-3">
            {installEvent === undefined ? (
              <Button onClick={handleDismiss}>
                {dontShowAgain ? "Close" : "Remind me later"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleDismiss}>
                  {dontShowAgain ? "No Thanks" : "Remind me later"}
                </Button>
                <Button onClick={() => void handleInstallClick()}>
                  Install
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-2">
        <p className="type-body text-ink-2">
          To get the full experience of Cellar Assistant we recommend installing
          it as an app. This will allow easy access from the home screen.
        </p>
        {steps !== null && (
          <ol className="type-body flex list-decimal flex-col gap-1 pl-6 text-ink-1">
            {steps.map((step, i) => (
              // Static steps, never reordered.
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed list.
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    </BottomSheet>
  );
};
