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
 * - **Nothing is sent over a push that has not landed.** Two things the App
 *   Router does decide this, and they pull in opposite directions. A
 *   navigation whose route it has not seen yet is fetched before it is
 *   applied, and the next navigation discards it, history update and all
 *   (`next/dist/client/components/app-router-instance.js`:
 *   `actionQueue.pending.discarded = true`) — so a `replace` sent over it
 *   overwrites the entry the push was meant to keep, and Back skips the view
 *   you started from. A navigation to a route it knows is applied at once and
 *   commits in order — so a second `push` sent over it lands as a second entry
 *   (measured on the UX lane, 2026-10-08: a 1.5 s search typed at 700 ms a key
 *   left `?q=wi`, `?q=win` and `?q=wine` in history). From outside the router
 *   the two cannot be told apart, so the box sends neither: while its push is
 *   in flight, typing only changes the text, and when the push lands the box
 *   sends what it holds by then as one `replace`. A push likewise waits for an
 *   in-flight `replace`, which it could otherwise discard. A `replace` over a
 *   `replace` goes at once: whichever of the two lands, the entry is right.
 * - **A commit closes the session** — Enter, the clear button, or leaving the
 *   field. The URL is brought up to date at once (a pending debounce is
 *   flushed; while a push is in flight, as soon as it lands), and the next
 *   keystroke opens a new session, so the committed search keeps its own entry
 *   when you start the next one.
 * - **The URL can change under the box** (Back, Forward, a link to
 *   `/search?q=…`). A URL query that differs from the one the box last sent
 *   is someone else's; the box takes it and closes its session. The box's own
 *   navigations echo back as an equal query and are ignored, so the echo of an
 *   older keystroke can never overwrite newer typing.
 */

/** The 300 ms pause the old box waited before navigating. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Close on the search sheet (X10, leftovers 9): back to where it was opened
 * from, Home on a cold open, by *replacing* the sheet's entry. A push would
 * leave `/search` in the history, so Back after Close reopened the sheet.
 */
export const closeSearch = (
  navigate: { replace(href: string, opts?: { kind?: "back" }): void },
  origin: string | null,
): void => navigate.replace(origin ?? "/", { kind: "back" });

/** Where a text query goes: `/search?q=<trimmed>`, or `/search` when blank. */
export const textSearchHref = (value: string): string => {
  const query = value.trim();
  return query === "" ? "/search" : `/search?q=${encodeURIComponent(query)}`;
};

export type SearchNavigation = {
  method: "push" | "replace";
  href: string;
};

export type SearchNavState = {
  /** The trimmed query the URL holds, or that the box last sent to it. */
  sentQuery: string;
  /** A typing session has navigated since the last commit. */
  sessionOpen: boolean;
  /** The box's last navigation, while it has not landed. */
  inFlight: SearchNavigation["method"] | null;
  /**
   * A commit arrived while a navigation was in flight and could not be sent:
   * the landing sends it, then closes the session.
   */
  commitOnLand: boolean;
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
  inFlight: null,
  commitOnLand: false,
});

/**
 * The debounce fired while typing: replace within a session, push to open one
 * — and send nothing while a navigation it could be discarded by, or could
 * discard, is in flight (`planLandedNavigation` sends it when that lands).
 */
export const planTypingNavigation = (
  state: SearchNavState,
  value: string,
): SearchNavStep => {
  const query = value.trim();
  if (query === state.sentQuery) return { state, navigation: null };
  const method = state.sessionOpen ? "replace" : "push";
  if (
    state.inFlight === "push" ||
    (state.inFlight !== null && method === "push")
  )
    return { state, navigation: null };
  return {
    state: {
      sentQuery: query,
      sessionOpen: true,
      inFlight: method,
      commitOnLand: false,
    },
    navigation: { method, href: textSearchHref(query) },
  };
};

/**
 * Enter, clear, or blur: flush what the box holds and close the session. A
 * value the URL already shows navigates nowhere; one it does not yet show
 * (the debounce had not fired) lands the same way a keystroke would have —
 * or, while a navigation is in flight, as soon as that lands.
 */
export const planCommitNavigation = (
  state: SearchNavState,
  value: string,
): SearchNavStep => {
  const typed = planTypingNavigation(state, value);
  if (typed.navigation === null && value.trim() !== state.sentQuery)
    return { state: { ...state, commitOnLand: true }, navigation: null };
  return {
    state: { ...typed.state, sessionOpen: false, commitOnLand: false },
    navigation: typed.navigation,
  };
};

/**
 * The router settled: when the URL shows what the box last sent and nothing is
 * in flight, the box's navigation has landed.
 */
export const landNavigation = (
  state: SearchNavState,
  urlQuery: string | null | undefined,
  navigating: boolean,
): SearchNavState =>
  state.inFlight !== null &&
  !navigating &&
  (urlQuery?.trim() ?? "") === state.sentQuery
    ? { ...state, inFlight: null }
    : state;

/**
 * The box's navigation just landed, and no debounce is waiting: send what the
 * box held back while it was in flight — as the commit it was, if one came in.
 */
export const planLandedNavigation = (
  state: SearchNavState,
  value: string,
): SearchNavStep =>
  state.commitOnLand
    ? planCommitNavigation({ ...state, commitOnLand: false }, value)
    : planTypingNavigation(state, value);

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
    state: initialSearchNavState(query),
    value: query,
  };
};
