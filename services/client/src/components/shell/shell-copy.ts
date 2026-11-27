/**
 * The words the app shell says when a page cannot be shown. A plain module —
 * no JSX, no Joy — so the decisions live apart from the markup that the
 * shadcn migration (D20) will replace, and so they can be tested.
 */

export interface ShellCopy {
  title: string;
  body: string;
}

/**
 * D24: **one** message for "missing" and "private", on purpose. A page that
 * said "this cellar is private" would confirm, to anyone holding a guessed or
 * stale id, that the cellar exists. So the copy never distinguishes the two,
 * and neither may any page that renders it.
 */
export const NOT_FOUND_COPY: ShellCopy = {
  title: "Can't open this page",
  body: "It's gone, or it isn't shared with you.",
};

export const OFFLINE_COPY: ShellCopy = {
  title: "You're offline",
  // No page is kept for offline reading yet (that is roadmap L07), so the
  // copy promises nothing about what is saved.
  body: "Opening this page needs a connection. It will reload by itself as soon as you're back online.",
};

/**
 * What an error boundary says. Offline is the most common reason a page
 * fails on a phone and the one the viewer can do something about, so it gets
 * its own words; everything else is ours, and the copy says so instead of
 * blaming the viewer. Never the error's own message: in production a server
 * error's message is a generic placeholder, and a client one can be anything.
 */
export const describeBoundaryError = ({
  online,
}: {
  online: boolean;
}): ShellCopy =>
  online
    ? {
        title: "Couldn't load this page",
        body: "",
      }
    : {
        title: "You're offline",
        body: "It opens by itself when you're back",
      };

/**
 * The reference shown under an error, so a report can be matched to the
 * server log (`error.digest`). Nothing for a client-side error, which has no
 * digest.
 */
export const errorReference = (digest: string | undefined): string | null =>
  digest === undefined || digest === "" ? null : `Reference: ${digest}`;
