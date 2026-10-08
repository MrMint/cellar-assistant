/**
 * The one share action (X17): the system share sheet when the device has one,
 * otherwise the link on the clipboard.
 *
 * Every Share in the app goes through here, so they behave alike: a phone
 * opens its own sheet (Messages, WhatsApp, AirDrop…); a desktop browser
 * without `navigator.share` copies the link and says so. The share sheet's
 * own Cancel is not a failure and says nothing.
 *
 * Kept free of React and of `notify` so the decision table is testable with a
 * fake navigator; `useShareLink` is the hook that wires it to a toast.
 */

export type ShareRequest = {
  /** The absolute URL. */
  readonly url: string;
  /** The thing's name — the share sheet's subject line. */
  readonly title?: string;
  /** One short line that names the thing, for apps that show text. */
  readonly text?: string;
};

export type ShareOutcome =
  /** The share sheet finished. */
  | "shared"
  /** No share sheet (or it refused): the link is on the clipboard. */
  | "copied"
  /** The viewer closed the share sheet. Say nothing. */
  | "dismissed"
  /** Neither worked. Offer the link some other way. */
  | "failed";

/** The two browser capabilities this needs — `navigator`, or a test fake. */
export type ShareCapabilities = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
  clipboard?: { writeText(text: string): Promise<void> };
};

const isAbort = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

export const shareLink = async (
  request: ShareRequest,
  nav: ShareCapabilities,
): Promise<ShareOutcome> => {
  const data: ShareData = {
    url: request.url,
    ...(request.title === undefined ? {} : { title: request.title }),
    ...(request.text === undefined ? {} : { text: request.text }),
  };

  // `canShare` is feature-tested before it is called: it is absent on desktop
  // Firefox, where the old item button threw.
  const canShare =
    typeof nav.share === "function" &&
    (typeof nav.canShare !== "function" || nav.canShare(data));
  if (canShare && nav.share !== undefined) {
    try {
      await nav.share(data);
      return "shared";
    } catch (error) {
      // Cancel is a choice, not an error. Anything else — a sheet refused
      // because the tap's activation had lapsed, say — falls through to copy.
      if (isAbort(error)) return "dismissed";
    }
  }

  if (nav.clipboard !== undefined) {
    try {
      await nav.clipboard.writeText(request.url);
      return "copied";
    } catch {
      // Clipboard refused (an insecure context, or permission).
    }
  }
  return "failed";
};
