/**
 * L04 / L16 — share a recap card **as a file**. The image is fetched from the
 * owner-only route and handed to Web Share as a `File`, with no `url` and no
 * `text`: nothing in the share links back to the app, and there is no public
 * recap page to link to. Where the browser cannot share files, the same image
 * is downloaded instead.
 *
 * The environment is passed in, so the fallback is testable without a browser.
 */

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "failed";

export type ShareEnvironment = {
  readonly fetch: (url: string) => Promise<Response>;
  readonly navigator?: {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  /** Saves `file` to the device (an `<a download>` click in the browser). */
  readonly download: (file: File) => void;
};

export const recapFileName = (period: string, index: number): string =>
  `cellar-recap-${period}-${index + 1}.png`;

export const shareRecapImage = async (
  url: string,
  fileName: string,
  env: ShareEnvironment,
): Promise<ShareOutcome> => {
  let file: File;
  try {
    const response = await env.fetch(url);
    if (!response.ok) return "failed";
    const blob = await response.blob();
    file = new File([blob], fileName, { type: "image/png" });
  } catch {
    return "failed";
  }
  const data: ShareData = { files: [file] };
  const nav = env.navigator;
  if (
    typeof nav?.share === "function" &&
    typeof nav.canShare === "function" &&
    nav.canShare(data)
  ) {
    try {
      await nav.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled";
      }
      // A share sheet that fails for another reason still leaves a download.
    }
  }
  env.download(file);
  return "downloaded";
};

/** The browser's download: an object URL clicked through `<a download>`. */
export const browserDownload = (file: File): void => {
  const href = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
};
