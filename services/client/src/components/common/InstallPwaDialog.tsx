"use client";

import { track } from "@vercel/analytics/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "urql";
import {
  Add,
  type AppIcon,
  Check,
  ICON_STROKE,
  Share,
} from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import {
  OPEN_INSTALL_EVENT,
  takeInstallPrompt,
  useInstallOffer,
} from "@/components/pwa/install-offer";
import {
  hasSeenFirstSave,
  isPromptAllowed,
  PWA_DISMISS_KEY,
  PWA_DISMISS_PERMANENT_KEY,
  PWA_FIRST_SAVE_KEY,
  SAVED_EVENT,
} from "@/components/pwa/install-prompt";
// The query Home already runs for its stats line: one document, one cache entry.
import { SearchCollectionStatsQuery } from "@/components/search/queries";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";

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

type Step = { icon: AppIcon; text: string };

/** Add to Home Screen, in the words of the browser it is in. */
const STEPS: Readonly<Record<"ios" | "chrome-ios", readonly Step[]>> = {
  ios: [
    { icon: Share, text: "Tap Share at the bottom of Safari" },
    { icon: Add, text: "Choose Add to Home Screen" },
    { icon: Check, text: "Tap Add" },
  ],
  "chrome-ios": [
    { icon: Share, text: "Tap Share in the address bar" },
    { icon: Add, text: "Choose Add to Home Screen" },
    { icon: Check, text: "Tap Add" },
  ],
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable: the answer lasts this page load.
  }
};

/**
 * "Install the app" (N15, Shell-Entry): Chrome's own install prompt where
 * the browser offers one, and the Add to Home Screen steps on iPhone and
 * iPad (`install-offer.ts` says which).
 *
 * It opens by itself once, after the viewer's first save — asking someone
 * to install an app they have not used yet is the wrong first impression —
 * and never again once put off for good, or for a week after Later. Stop
 * asking says where the way back is (Settings' "Install the app" row, which
 * opens this sheet with `OPEN_INSTALL_EVENT` whatever was said before).
 */
export const InstallPwaDialog = () => {
  const offer = useInstallOffer();
  const [open, setOpen] = useState(false);
  const shown = useRef(false);
  const candidate = offer.kind !== null && allowed();
  const saved = useFirstSave(candidate && !shown.current);

  useEffect(() => {
    const onOpen = () => {
      shown.current = true;
      setOpen(true);
    };
    const onInstalled = () => {
      setOpen(false);
      track("pwa_installed");
    };
    window.addEventListener(OPEN_INSTALL_EVENT, onOpen);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(OPEN_INSTALL_EVENT, onOpen);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Open once a page load, when both hold: a way to install, and a first
  // save behind it.
  useEffect(() => {
    if (!candidate || !saved || shown.current) return;
    shown.current = true;
    setOpen(true);
    track("pwa_install_prompt_shown", {
      platform: offer.kind === "prompt" ? "android" : "ios",
    });
  }, [candidate, saved, offer.kind]);

  useEffect(() => {
    navigator.storage?.persist();
  }, []);

  const later = () => {
    write(PWA_DISMISS_KEY, new Date().toISOString());
    track("pwa_install_dismissed", { type: "remind_later" });
    setOpen(false);
  };

  const stopAsking = () => {
    write(PWA_DISMISS_PERMANENT_KEY, "true");
    track("pwa_install_dismissed", { type: "permanent" });
    setOpen(false);
    notify("Won't ask again · it's in Settings", {
      undo: () => write(PWA_DISMISS_PERMANENT_KEY, null),
    });
  };

  const install = async () => {
    const event = takeInstallPrompt();
    if (event !== undefined) {
      const result = await event.prompt();
      track("pwa_install_result", result);
    }
    setOpen(false);
  };

  const steps =
    offer.kind === "ios" || offer.kind === "chrome-ios"
      ? STEPS[offer.kind]
      : null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        // Swiped or closed without an answer: the same as Later.
        if (!next) later();
      }}
      title="Install the app"
      footer={
        <div className="flex w-full flex-col gap-3">
          {offer.kind === "prompt" && (
            <Button className="w-full" onClick={() => void install()}>
              Install
            </Button>
          )}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={later}>
              Later
            </Button>
            <Button variant="outline" className="flex-1" onClick={stopAsking}>
              Stop asking
            </Button>
          </div>
        </div>
      }
    >
      {/* The sheet and the dialog pad their own content. */}
      <div className="flex flex-col gap-4 pb-2">
        <p className="t-body m-0 text-ink-2">
          It opens full screen, like any app.
        </p>
        {steps !== null && (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {steps.map((step, index) => (
              <li
                key={step.text}
                className="flex min-h-12 items-center gap-3"
                onPointerDown={() => feedback("tick")}
              >
                <span className="t-cap tabular w-4 shrink-0 text-ink-3">
                  {index + 1}
                </span>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-raised text-glyph">
                  <step.icon
                    aria-hidden
                    className="size-5"
                    strokeWidth={ICON_STROKE}
                  />
                </span>
                <span className="t-body text-ink">{step.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </ResponsiveDialog>
  );
};
