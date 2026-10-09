/**
 * The AI job tray, inbox and toasts (X10): one table of words, N07's typed
 * outcomes for failures, and toasts only for work seen running.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createAiJobStore } from "./ai-job-store";
import {
  type AiJob,
  aiJobHref,
  anyRunning,
  isWatchedAt,
  readyLine,
  runningLine,
  settledSince,
  snapshotOf,
  toastFor,
} from "./ai-jobs";
import { buildInbox, seenKeyOf } from "./inbox";
import {
  parseSeenCookie,
  seenHash,
  serializeSeen,
  withSeen,
} from "./seen-cookie";

const job = (overrides: Partial<AiJob>): AiJob => ({
  __typename: "AiJob",
  id: "MENU_SCAN:s1",
  kind: "MENU_SCAN",
  status: "RUNNING",
  subjectId: "s1",
  itemType: null,
  placeId: null,
  placeName: null,
  count: null,
  tierListName: null,
  recipeId: null,
  recipeName: null,
  startedAt: "2026-10-09T12:00:00.000Z",
  finishedAt: null,
  failureCode: null,
  failureReason: null,
  retryAt: null,
  ...overrides,
});

describe("words", () => {
  test("each kind says what it is reading, and what is ready", () => {
    assert.equal(
      runningLine(job({ placeName: "Cork & Barrel" })),
      "Reading the menu at Cork & Barrel",
    );
    assert.equal(
      runningLine(job({ kind: "LABEL_READ", itemType: "WINE" })),
      "Reading your wine label",
    );
    assert.equal(
      readyLine(job({ kind: "LABEL_READ", itemType: "SAKE", status: "READY" })),
      "Your sake draft is ready to check",
    );
    assert.equal(
      readyLine(
        job({
          kind: "TIER_LIST_INSIGHTS",
          status: "READY",
          tierListName: "Reds, ranked",
        }),
      ),
      "New insights on Reds, ranked",
    );
  });

  test("each kind deep-links to where it is finished", () => {
    assert.equal(
      aiJobHref(job({ kind: "LABEL_READ", subjectId: "o1", itemType: "WINE" })),
      "/add?draft=o1&type=WINE",
    );
    assert.equal(aiJobHref(job({})), "/map/scans/s1");
    assert.equal(
      aiJobHref(job({ kind: "RECIPE_PHOTO", status: "READY", recipeId: "r1" })),
      "/recipes/r1",
    );
    assert.equal(aiJobHref(job({ kind: "RECIPE_PHOTO" })), null);
    assert.equal(
      aiJobHref(job({ kind: "TIER_LIST_INSIGHTS", subjectId: "t1" })),
      "/tier-lists/t1",
    );
  });
});

describe("toastFor", () => {
  test("a read menu offers to open it", () => {
    const toast = toastFor(
      job({ status: "READY", placeName: "Cork & Barrel", count: 8 }),
    );
    assert.deepEqual(toast, {
      message: "The menu at Cork & Barrel is read",
      description: "8 lines read",
      href: "/map/scans/s1",
      actionLabel: "Open",
      tone: "success",
    });
  });

  test("a limit is worded by N07, calmly, with no retry", () => {
    const toast = toastFor(
      job({
        status: "FAILED",
        failureCode: "BUDGET_EXCEEDED",
        failureReason: "USER_CAP",
      }),
    );
    assert.equal(toast?.tone, undefined);
    assert.equal(toast?.actionLabel, "Open");
    assert.match(toast?.description ?? "", /try again/i);
  });

  test("an unclassified failure can be tried again", () => {
    const toast = toastFor(job({ status: "FAILED" }));
    assert.equal(toast?.tone, "error");
    assert.equal(toast?.actionLabel, "Try again");
  });

  test("nothing while running", () => {
    assert.equal(toastFor(job({})), null);
  });
});

describe("isWatchedAt", () => {
  test("no toast where the screen already says it", () => {
    const scan = job({ status: "READY", placeId: "p1" });
    assert.equal(isWatchedAt(scan, "/map/scans/s1"), true);
    assert.equal(isWatchedAt(scan, "/places/p1"), true);
    assert.equal(isWatchedAt(scan, "/"), false);
    const recipe = job({
      kind: "RECIPE_PHOTO",
      status: "READY",
      recipeId: "r1",
    });
    assert.equal(isWatchedAt(recipe, "/recipes/ai-generator"), true);
    assert.equal(isWatchedAt(recipe, "/cellars"), false);
    assert.equal(isWatchedAt(job({ kind: "LABEL_READ" }), "/"), true);
  });
});

describe("settledSince", () => {
  test("only work seen running, now settled", () => {
    const before = snapshotOf([
      job({ id: "a", status: "RUNNING" }),
      job({ id: "b", status: "RUNNING" }),
      job({ id: "c", status: "READY" }),
    ]);
    const now = [
      job({ id: "a", status: "READY" }),
      job({ id: "b", status: "RUNNING" }),
      job({ id: "c", status: "READY" }),
      job({ id: "d", status: "FAILED" }),
    ];
    assert.deepEqual(
      settledSince(before, now).map((j) => j.id),
      ["a"],
    );
    assert.equal(anyRunning(now), true);
    assert.equal(anyRunning([job({ status: "READY" })]), false);
  });
});

describe("buildInbox", () => {
  const suggestion = (id: string, scan: string | null, acted = false) => ({
    id,
    menuScanId: scan,
    accepted: acted ? true : null,
    rejected: null,
    menuItemName: `Line ${id}`,
    createdAt: null,
    place: { id: "p1", name: "Cork & Barrel" },
  });

  test("matches by scan first, then drafts, requests and finished results", () => {
    const draft = job({
      id: "LABEL_READ:o1",
      kind: "LABEL_READ",
      status: "READY",
      subjectId: "o1",
      itemType: "WINE",
      finishedAt: "2026-10-09T12:01:00.000Z",
    });
    const insights = job({
      id: "TIER_LIST_INSIGHTS:t1",
      kind: "TIER_LIST_INSIGHTS",
      status: "READY",
      subjectId: "t1",
      finishedAt: "2026-10-09T12:02:00.000Z",
    });
    const items = buildInbox({
      jobs: [insights, draft, job({ status: "RUNNING" })],
      suggestions: [
        suggestion("m1", "s9"),
        suggestion("m2", "s9"),
        suggestion("m3", "s9", true),
        suggestion("m4", null),
      ],
      requests: [
        {
          id: "f1",
          status: "PENDING",
          user: { id: "u1", displayName: "Sam", avatarUrl: null },
        },
      ],
      seen: new Set(),
    });
    assert.deepEqual(
      items.map((item) => item.id),
      ["matches:s9", "LABEL_READ:o1", "request:f1", "TIER_LIST_INSIGHTS:t1"],
    );
    const matches = items[0];
    assert.equal(matches?.kind === "matches" && matches.count, 2);
  });

  test("a seen result stays gone until it finishes again", () => {
    const insights = job({
      id: "TIER_LIST_INSIGHTS:t1",
      kind: "TIER_LIST_INSIGHTS",
      status: "READY",
      finishedAt: "2026-10-09T12:02:00.000Z",
    });
    const seen = new Set([seenHash(seenKeyOf(insights))]);
    assert.deepEqual(
      buildInbox({ jobs: [insights], suggestions: [], requests: [], seen }),
      [],
    );
    const again = { ...insights, finishedAt: "2026-10-10T12:02:00.000Z" };
    assert.equal(
      buildInbox({ jobs: [again], suggestions: [], requests: [], seen }).length,
      1,
    );
  });

  test("a read menu with matches waiting shows the matches row only", () => {
    const items = buildInbox({
      jobs: [job({ status: "READY", subjectId: "s9", id: "MENU_SCAN:s9" })],
      suggestions: [suggestion("m1", "s9")],
      requests: [],
      seen: new Set(),
    });
    assert.deepEqual(
      items.map((item) => item.kind),
      ["matches"],
    );
  });
});

describe("aiJobStore", () => {
  test("a kick before anyone listens is held for the first listener", () => {
    const store = createAiJobStore();
    store.kick();
    let kicks = 0;
    const stop = store.listen(() => {
      kicks += 1;
    });
    assert.equal(kicks, 1);
    store.kick();
    assert.equal(kicks, 2);
    stop();
    store.kick();
    assert.equal(kicks, 2);
  });

  test("publishing tells every subscriber", () => {
    const store = createAiJobStore();
    let told = 0;
    store.subscribe(() => {
      told += 1;
    });
    assert.equal(store.getSnapshot(), null);
    store.publish([job({})]);
    assert.equal(told, 1);
    assert.equal(store.getSnapshot()?.length, 1);
  });

  test("reset (sign-out) forgets the jobs and a held kick", () => {
    const store = createAiJobStore();
    store.publish([job({})]);
    store.kick();
    store.reset();
    assert.equal(store.getSnapshot(), null);
    let kicks = 0;
    store.listen(() => {
      kicks += 1;
    });
    assert.equal(kicks, 0);
  });
});

describe("seen cookie", () => {
  test("round-trips, newest last, capped, and drops what it did not write", () => {
    let hashes: string[] = [];
    for (let i = 0; i < 70; i += 1) hashes = withSeen(hashes, `job:${i}`);
    assert.equal(hashes.length, 60);
    assert.equal(hashes.at(-1), seenHash("job:69"));
    const again = withSeen(hashes, "job:20");
    assert.equal(again.at(-1), seenHash("job:20"));
    assert.equal(again.length, 60);
    assert.deepEqual(parseSeenCookie(serializeSeen(hashes)), hashes);
    assert.deepEqual(parseSeenCookie("abc.<script>.DEF.zz9"), ["abc", "zz9"]);
    assert.deepEqual(parseSeenCookie(undefined), []);
  });
});
