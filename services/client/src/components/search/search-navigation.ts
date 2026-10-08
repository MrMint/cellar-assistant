/**
 * How the search box talks to the URL (N01) — pure, so the rules are tested
 * without a router and survive the shadcn migration untouched.
 *
 * The rules:
 *
 * - **Typing never floods history.** The first navigation of a typing session
 *   pushes (so the search or landing view you were on keeps its entry); every
 *   later keystroke-driven navigation in the same session replaces it. One
 *   typing session is at most one history entry, however many pauses it had.
 * - **A push counts once it has landed.** The App Router discards a pending
 *   navigation, its history update included, when the next one starts
 *   (`next/dist/client/components/app-router-instance.js`:
 *   `actionQueue.pending.discarded = true`). A search that streams for longer
 *   than the next pause would otherwise lose its push to a `replace`, which
 *   then overwrites the entry the push was meant to keep — Back skips the
 *   view you started from. So until the URL shows a push's query with nothing
 *   in flight, the session's next navigation pushes again.
 * - **A commit closes the session** — Enter, the clear button, or leaving the
 *   field. The URL is brought up to date at once (a pending debounce is
 *   flushed), and the next keystroke opens a new session, so the committed
 *   search keeps its own entry when you start the next one.
 * - **The URL can change under the box** (Back, Forward, a link to
 *   `/search?q=…`). A URL query that differs from the one the box last sent
 *   is someone else's; the box takes it and closes its session. The box's own
 *   navigations echo back as an equal query and are ignored, so the echo of an
 *   older keystroke can never overwrite newer typing.
 */

/** The 300 ms pause the old box waited before navigating. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Where a text query goes: `/search?q=<trimmed>`, or `/search` when blank. */
export const textSearchHref = (value: string): string => {
  const query = value.trim();
  return query === "" ? "/search" : `/search?q=${encodeURIComponent(query)}`;
};

export type SearchNavState = {
  /** The trimmed query the URL holds, or that the box last sent to it. */
  sentQuery: string;
  /** A typing session has navigated since the last commit. */
  sessionOpen: boolean;
  /** The box's last push has not landed yet, so the next navigation pushes. */
  pushPending: boolean;
};

export type SearchNavigation = {
  method: "push" | "replace";
  href: string;
};

export type SearchNavStep = {
  state: SearchNavState;
  /** The navigation to perform, or null when the URL already says this. */
  navigation: SearchNavigation | null;
};

export const initialSearchNavState = (
  urlQuery: string | null | undefined,
): SearchNavState => ({
  sentQuery: urlQuery?.trim() ?? "",
  sessionOpen: false,
  pushPending: false,
});

/**
 * The debounce fired while typing: replace within a session, push to open one
 * — and push again while the session's push has not landed.
 */
export const planTypingNavigation = (
  state: SearchNavState,
  value: string,
): SearchNavStep => {
  const query = value.trim();
  if (query === state.sentQuery) return { state, navigation: null };
  const method = state.sessionOpen && !state.pushPending ? "replace" : "push";
  return {
    state: {
      sentQuery: query,
      sessionOpen: true,
      pushPending: method === "push",
    },
    navigation: { method, href: textSearchHref(query) },
  };
};

/**
 * Enter, clear, or blur: flush what the box holds and close the session. A
 * value the URL already shows navigates nowhere; one it does not yet show
 * (the debounce had not fired) lands the same way a keystroke would have.
 */
export const planCommitNavigation = (
  state: SearchNavState,
  value: string,
): SearchNavStep => {
  const typed = planTypingNavigation(state, value);
  return {
    state: { ...typed.state, sessionOpen: false },
    navigation: typed.navigation,
  };
};

/**
 * The router settled: when the URL shows what the box last sent and nothing is
 * in flight, its push (if one was pending) has landed, and the session may
 * replace from here.
 */
export const landNavigation = (
  state: SearchNavState,
  urlQuery: string | null | undefined,
  navigating: boolean,
): SearchNavState =>
  state.pushPending &&
  !navigating &&
  (urlQuery?.trim() ?? "") === state.sentQuery
    ? { ...state, pushPending: false }
    : state;

export type SearchUrlSync = {
  state: SearchNavState;
  /** The value the box should now show, or null to leave it alone. */
  value: string | null;
};

/**
 * The URL's query changed. While the box is busy (a debounce is waiting or a
 * navigation is in flight) nothing is taken: what arrives may be the echo of
 * an older keystroke. Once idle, a query that is not the one the box sent came
 * from elsewhere, and the box shows it.
 */
export const syncFromUrl = (
  state: SearchNavState,
  urlQuery: string | null | undefined,
  busy: boolean,
): SearchUrlSync => {
  const query = urlQuery?.trim() ?? "";
  if (busy || query === state.sentQuery) return { state, value: null };
  return {
    state: { sentQuery: query, sessionOpen: false, pushPending: false },
    value: query,
  };
};
