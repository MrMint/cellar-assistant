/**
 * The install prompt's decisions, apart from its markup so they can be
 * tested: which platform is asking, whether the viewer has put it off, and
 * whether they have saved anything yet (N15: the prompt waits until after the
 * first save — asking a brand-new viewer to install an app they have not
 * used yet is the wrong first impression).
 *
 * No `"use client"`, no JSX.
 */

export const PWA_DISMISS_KEY = "pwa-install-dismissed";
export const PWA_DISMISS_PERMANENT_KEY = "pwa-install-dismissed-permanently";
/** Set once the viewer has a saved bottle, so later visits skip the query. */
export const PWA_FIRST_SAVE_KEY = "pwa-install-first-save";
export const REMIND_LATER_DAYS = 7;

const DAY_MS = 1000 * 60 * 60 * 24;

export type InstallPlatform = {
  /** iPhone, iPod or iPad — including iPadOS, which reports itself as a Mac. */
  ios: boolean;
  /** Chrome on iOS: its share button is in the toolbar, not at the bottom. */
  chromeIos: boolean;
};

/**
 * iOS detection. iPadOS 13+ sends a desktop Safari user agent
 * ("Macintosh"), so the old `/iphone|ipad|ipod/` test never matched an iPad
 * and iPad users never got instructions (N15). A "Mac" with a touch screen is
 * an iPad: no Mac has one.
 */
export function detectPlatform(
  userAgent: string,
  maxTouchPoints: number,
): InstallPlatform {
  const ua = userAgent.toLowerCase();
  const ios =
    /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && maxTouchPoints > 1);
  return { ios, chromeIos: ios && /crios/.test(ua) };
}

type KeyValueStore = Pick<Storage, "getItem">;

/** Put off for good ("Don't show this again"). */
export function isDismissedPermanently(store: KeyValueStore): boolean {
  try {
    return store.getItem(PWA_DISMISS_PERMANENT_KEY) === "true";
  } catch {
    return false;
  }
}

/** "Remind me later", less than `REMIND_LATER_DAYS` ago. */
export function isDismissedTemporarily(
  store: KeyValueStore,
  now: Date = new Date(),
): boolean {
  try {
    const dismissedAt = store.getItem(PWA_DISMISS_KEY);
    if (dismissedAt === null) return false;
    const since = now.getTime() - new Date(dismissedAt).getTime();
    return since / DAY_MS < REMIND_LATER_DAYS;
  } catch {
    return false;
  }
}

/** Neither put off for good nor put off recently. */
export function isPromptAllowed(
  store: KeyValueStore,
  now: Date = new Date(),
): boolean {
  return !isDismissedPermanently(store) && !isDismissedTemporarily(store, now);
}

/** Whether a first save has already been seen on this device. */
export function hasSeenFirstSave(store: KeyValueStore): boolean {
  try {
    return store.getItem(PWA_FIRST_SAVE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * The window event a save can announce itself with, so the prompt can open
 * the moment the first bottle lands rather than on the next navigation.
 * Optional: without it the prompt still finds the save through the viewer's
 * collection count when the route changes.
 */
export const SAVED_EVENT = "ca:saved";

/** Announce a save (a bottle added, a cellar item created). */
export function announceSave(target: EventTarget = window): void {
  target.dispatchEvent(new Event(SAVED_EVENT));
}
