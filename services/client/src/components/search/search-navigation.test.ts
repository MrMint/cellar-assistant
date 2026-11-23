/**
 * The search box's URL rules (N01): replace while typing, a push only where a
 * history entry is owed, and the URL's own changes taken only when they are
 * not an echo of the box's navigations.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { searchStateFromParams } from "./adapter";
import {
  closeSearch,
  initialSearchNavState,
  landNavigation,
  planCommitNavigation,
  planLandedNavigation,
  planTypingNavigation,
  type SearchNavigation,
  type SearchNavState,
  syncFromUrl,
  textSearchHref,
} from "./search-navigation";

/**
 * Feed a sequence of debounced values through, collecting navigations. By
 * default each navigation lands before the next pause (the router settled on
 * the URL it was sent to); `land: false` keeps them all in flight.
 */
const typeAll = (
  start: SearchNavState,
  values: string[],
  { land = true }: { land?: boolean } = {},
) => {
  let state = start;
  const navigations: SearchNavigation[] = [];
  for (const value of values) {
    const step = planTypingNavigation(state, value);
    state = step.state;
    if (step.navigation) navigations.push(step.navigation);
    if (land) state = landNavigation(state, state.sentQuery, false);
  }
  return { state, navigations };
};

describe("textSearchHref", () => {
  test("a query is trimmed and encoded into ?q=", () => {
    assert.equal(textSearchHref("  pinot noir "), "/search?q=pinot%20noir");
    assert.equal(textSearchHref("r&d?"), "/search?q=r%26d%3F");
  });

  test("blank is the landing view", () => {
    assert.equal(textSearchHref(""), "/search");
    assert.equal(textSearchHref("   "), "/search");
  });

  test("round-trips through searchStateFromParams", () => {
    const href = textSearchHref(" café & co ");
    const q = new URL(href, "http://x").searchParams.get("q") ?? undefined;
    assert.equal(searchStateFromParams({ q }).query, "café & co");
  });
});

describe("planTypingNavigation", () => {
  test("from the landing view: one push, then replaces", () => {
    const { navigations, state } = typeAll(initialSearchNavState(null), [
      "w",
      "wi",
      "wine",
    ]);
    assert.deepEqual(navigations, [
      { method: "push", href: "/search?q=w" },
      { method: "replace", href: "/search?q=wi" },
      { method: "replace", href: "/search?q=wine" },
    ]);
    assert.deepEqual(state, {
      sentQuery: "wine",
      sessionOpen: true,
      inFlight: null,
      commitOnLand: false,
    });
  });

  test("while the session's push is in flight, typing sends nothing", () => {
    // Over a push the router has not applied yet, a replace would discard it
    // and overwrite the landing view's entry; over one it has, a second push
    // would land as a second entry (the UX lane's ?q=wi, ?q=win, ?q=wine).
    const { navigations, state } = typeAll(
      initialSearchNavState(null),
      ["w", "wi", "win", "wine"],
      { land: false },
    );
    assert.deepEqual(navigations, [{ method: "push", href: "/search?q=w" }]);
    assert.deepEqual(state, {
      sentQuery: "w",
      sessionOpen: true,
      inFlight: "push",
      commitOnLand: false,
    });
  });

  test("when the push lands, what the box holds goes as one replace", () => {
    const { state } = typeAll(initialSearchNavState(null), ["w", "wine"], {
      land: false,
    });
    const landed = landNavigation(state, "w", false);
    const step = planLandedNavigation(landed, "wine");
    assert.deepEqual(step.navigation, {
      method: "replace",
      href: "/search?q=wine",
    });
    assert.equal(step.state.sessionOpen, true);
    assert.equal(step.state.inFlight, "replace");
    // Nothing held back: the landing sends nothing.
    assert.equal(planLandedNavigation(landed, "w").navigation, null);
  });

  test("a replace over an in-flight replace goes at once", () => {
    const { state } = typeAll(initialSearchNavState(null), ["w"]);
    const { navigations } = typeAll(state, ["wi", "win"], { land: false });
    assert.deepEqual(navigations, [
      { method: "replace", href: "/search?q=wi" },
      { method: "replace", href: "/search?q=win" },
    ]);
  });

  test("a new session's push waits for the last session's replace to land", () => {
    let state = typeAll(initialSearchNavState(null), ["w"]).state;
    state = planCommitNavigation(state, "wine").state; // replace, in flight
    assert.equal(state.inFlight, "replace");
    assert.equal(planTypingNavigation(state, "b").navigation, null);
    const landed = landNavigation(state, "wine", false);
    assert.deepEqual(planLandedNavigation(landed, "beer").navigation, {
      method: "push",
      href: "/search?q=beer",
    });
  });

  test("a value the URL already shows goes nowhere, and opens no session", () => {
    const start = initialSearchNavState("wine");
    const step = planTypingNavigation(start, " wine  ");
    assert.equal(step.navigation, null);
    assert.equal(step.state, start);
  });

  test("deleting back to empty replaces with the landing view inside a session", () => {
    const { navigations } = typeAll(initialSearchNavState("wine"), ["win", ""]);
    assert.deepEqual(navigations, [
      { method: "push", href: "/search?q=win" },
      { method: "replace", href: "/search" },
    ]);
  });

  test("whitespace-only edits never navigate", () => {
    const { navigations } = typeAll(initialSearchNavState("wine"), [
      "wine ",
      " wine",
    ]);
    assert.deepEqual(navigations, []);
  });
});

describe("planCommitNavigation", () => {
  test("Enter before the debounce fired flushes it (push when no session yet)", () => {
    const step = planCommitNavigation(initialSearchNavState(null), "barolo");
    assert.deepEqual(step.navigation, {
      method: "push",
      href: "/search?q=barolo",
    });
    assert.deepEqual(step.state, {
      sentQuery: "barolo",
      sessionOpen: false,
      inFlight: "push",
      commitOnLand: false,
    });
  });

  test("Enter while the session's push is in flight is sent when it lands", () => {
    const typed = typeAll(initialSearchNavState(null), ["bar"], {
      land: false,
    });
    const step = planCommitNavigation(typed.state, "barolo");
    assert.equal(step.navigation, null);
    assert.equal(step.state.commitOnLand, true);
    const landed = landNavigation(step.state, "bar", false);
    const sent = planLandedNavigation(landed, "barolo");
    assert.deepEqual(sent.navigation, {
      method: "replace",
      href: "/search?q=barolo",
    });
    assert.equal(sent.state.sessionOpen, false);
    assert.equal(sent.state.commitOnLand, false);
  });

  test("Enter inside a session replaces the session's entry", () => {
    const typed = typeAll(initialSearchNavState(null), ["bar"]);
    const step = planCommitNavigation(typed.state, "barolo");
    assert.deepEqual(step.navigation, {
      method: "replace",
      href: "/search?q=barolo",
    });
    assert.equal(step.state.sessionOpen, false);
  });

  test("Enter on what the URL already shows only closes the session", () => {
    const typed = typeAll(initialSearchNavState(null), ["barolo"]);
    const step = planCommitNavigation(typed.state, "barolo");
    assert.equal(step.navigation, null);
    assert.deepEqual(step.state, {
      sentQuery: "barolo",
      sessionOpen: false,
      inFlight: null,
      commitOnLand: false,
    });
  });

  test("after a commit, the next typing session pushes, keeping the committed search", () => {
    let state = typeAll(initialSearchNavState(null), ["wine"]).state;
    state = planCommitNavigation(state, "wine").state;
    const { navigations } = typeAll(state, ["b", "beer"]);
    assert.deepEqual(navigations, [
      { method: "push", href: "/search?q=b" },
      { method: "replace", href: "/search?q=beer" },
    ]);
  });

  test("clear inside a session replaces with the landing view", () => {
    const typed = typeAll(initialSearchNavState(null), ["wine"]);
    assert.deepEqual(planCommitNavigation(typed.state, "").navigation, {
      method: "replace",
      href: "/search",
    });
  });

  test("clear from a committed search pushes the landing view", () => {
    assert.deepEqual(
      planCommitNavigation(initialSearchNavState("wine"), "").navigation,
      { method: "push", href: "/search" },
    );
  });
});

describe("syncFromUrl", () => {
  test("the echo of the box's own navigation is ignored", () => {
    const typed = typeAll(initialSearchNavState(null), ["wine"]);
    const sync = syncFromUrl(typed.state, "wine", false);
    assert.equal(sync.value, null);
    assert.equal(sync.state, typed.state);
  });

  test("an older keystroke's echo arriving while busy never overwrites typing", () => {
    const typed = typeAll(initialSearchNavState(null), ["wi", "wine"]);
    assert.equal(syncFromUrl(typed.state, "wi", true).value, null);
  });

  test("Back to another query, while idle, is taken and closes the session", () => {
    const typed = typeAll(initialSearchNavState("wine"), ["b", "beer"]);
    const sync = syncFromUrl(typed.state, "wine", false);
    assert.equal(sync.value, "wine");
    assert.deepEqual(sync.state, {
      sentQuery: "wine",
      sessionOpen: false,
      inFlight: null,
      commitOnLand: false,
    });
  });

  test("Back to the landing view empties the box", () => {
    const typed = typeAll(initialSearchNavState(null), ["wine"]);
    assert.equal(syncFromUrl(typed.state, null, false).value, "");
  });
});

describe("landNavigation", () => {
  const inFlight = typeAll(initialSearchNavState(null), ["wine"], {
    land: false,
  }).state;

  test("a push has not landed while a navigation is in flight", () => {
    assert.equal(landNavigation(inFlight, "wine", true), inFlight);
  });

  test("nor while the URL shows something else", () => {
    assert.equal(landNavigation(inFlight, null, false), inFlight);
  });

  test("Back while a push is in flight: the box takes the URL", () => {
    const sync = syncFromUrl(
      landNavigation(inFlight, null, false),
      null,
      false,
    );
    assert.equal(sync.value, "");
    assert.deepEqual(sync.state, initialSearchNavState(null));
  });

  test("the URL showing the sent query, settled, is a landed push", () => {
    assert.deepEqual(landNavigation(inFlight, " wine ", false), {
      sentQuery: "wine",
      sessionOpen: true,
      inFlight: null,
      commitOnLand: false,
    });
  });
});

describe("closeSearch", () => {
  const record = () => {
    const calls: Array<[string, string, unknown]> = [];
    return {
      calls,
      nav: {
        push: (href: string, opts?: unknown) => calls.push(["push", href, opts]),
        replace: (href: string, opts?: unknown) =>
          calls.push(["replace", href, opts]),
      },
    };
  };
  test("replaces the sheet's entry with where it was opened from", () => {
    const { calls, nav } = record();
    closeSearch(nav, "/cellars");
    assert.deepEqual(calls, [["replace", "/cellars", { kind: "back" }]]);
  });
  test("goes Home on a cold open, still by replacing", () => {
    const { calls, nav } = record();
    closeSearch(nav, null);
    assert.deepEqual(calls, [["replace", "/", { kind: "back" }]]);
  });
});
