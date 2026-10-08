/**
 * The search box's URL rules (N01): replace while typing, a push only where a
 * history entry is owed, and the URL's own changes taken only when they are
 * not an echo of the box's navigations.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { searchStateFromParams } from "./adapter";
import {
  initialSearchNavState,
  landNavigation,
  planCommitNavigation,
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
      pushPending: false,
    });
  });

  test("while the session's push is in flight, the next pause pushes again", () => {
    // The App Router discards the pending push when the next navigation
    // starts; a replace here would overwrite the landing view's entry.
    const { navigations, state } = typeAll(
      initialSearchNavState(null),
      ["w", "wine"],
      { land: false },
    );
    assert.deepEqual(navigations, [
      { method: "push", href: "/search?q=w" },
      { method: "push", href: "/search?q=wine" },
    ]);
    assert.equal(state.pushPending, true);
    const landed = landNavigation(state, "wine", false);
    assert.deepEqual(planTypingNavigation(landed, "wines").navigation, {
      method: "replace",
      href: "/search?q=wines",
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
      pushPending: true,
    });
  });

  test("Enter while the session's push is in flight pushes", () => {
    const typed = typeAll(initialSearchNavState(null), ["bar"], {
      land: false,
    });
    assert.deepEqual(planCommitNavigation(typed.state, "barolo").navigation, {
      method: "push",
      href: "/search?q=barolo",
    });
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
      pushPending: false,
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
      pushPending: false,
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

  test("the URL showing the sent query, settled, is a landed push", () => {
    assert.deepEqual(landNavigation(inFlight, " wine ", false), {
      sentQuery: "wine",
      sessionOpen: true,
      pushPending: false,
    });
  });
});
