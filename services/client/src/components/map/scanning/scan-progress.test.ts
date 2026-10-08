/**
 * N06a — the rules the scanner and the results page share: when a scan is
 * done, when the scanner hands off, what one line is, and the headline.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MenuItemView, SuggestionView } from "../adapter";
import {
  isExtractionDone,
  isScanSettled,
  type LineMatch,
  lineMatch,
  POLL_GIVE_UP_MS,
  pollDelayMs,
  type ScanMatchStatus,
  type ScanProgress,
  scanHeadline,
  scanPhase,
  shouldOpenResults,
} from "./scan-progress";

const scan = (
  processingStatus: ScanProgress["processingStatus"],
  matchStatus: ScanMatchStatus,
): ScanProgress => ({ processingStatus, matchStatus });

const line = (
  id: string,
  matched: MenuItemView["matched_item"] = null,
): Pick<MenuItemView, "id" | "matched_item"> => ({ id, matched_item: matched });

const suggestion = (
  id: string,
  lineId: string,
  state: { accepted?: boolean; rejected?: boolean } = {},
): SuggestionView => ({
  id,
  menu_scan_id: "s",
  place_menu_item_id: lineId,
  menu_item_name: `line ${lineId}`,
  confidence_score: 0.8,
  match_reasoning: null,
  created_at: null,
  pending: state.accepted === undefined && state.rejected === undefined,
  accepted: state.accepted === true,
  suggested: { id: `item-${id}`, name: `Item ${id}`, href: `/wines/${id}` },
});

describe("settling", () => {
  test("extraction completing is not the scan being done", () => {
    // The race N06a fixes: `completed` used to be read as "done".
    const extracted = scan("completed", "running");
    assert.equal(isExtractionDone(extracted), true);
    assert.equal(isScanSettled(extracted), false);
    assert.equal(isScanSettled(scan("completed", "queued")), false);
  });

  test("settled once the match run settles, or extraction failed", () => {
    for (const status of ["completed", "failed", "skipped"] as const) {
      assert.equal(isScanSettled(scan("completed", status)), true);
    }
    assert.equal(isScanSettled(scan("failed", "skipped")), true);
    assert.equal(isScanSettled(scan("pending", "waiting")), false);
    assert.equal(isScanSettled(scan("processing", "waiting")), false);
  });

  test("the scanner's phases follow both statuses", () => {
    assert.equal(scanPhase(null), "uploading");
    assert.equal(scanPhase(scan("pending", "waiting")), "reading");
    assert.equal(scanPhase(scan("processing", "waiting")), "reading");
    assert.equal(scanPhase(scan("completed", "queued")), "matching");
    assert.equal(scanPhase(scan("completed", "running")), "matching");
    assert.equal(scanPhase(scan("completed", "completed")), "done");
    assert.equal(scanPhase(scan("failed", "skipped")), "done");
  });

  test("the scanner opens the results once lines were read — not for a failure or an empty read", () => {
    assert.equal(
      shouldOpenResults({ ...scan("completed", "queued"), itemsDetected: 8 }),
      true,
    );
    assert.equal(
      shouldOpenResults({ ...scan("completed", "skipped"), itemsDetected: 0 }),
      false,
    );
    assert.equal(
      shouldOpenResults({ ...scan("failed", "skipped"), itemsDetected: null }),
      false,
    );
    assert.equal(
      shouldOpenResults({ ...scan("processing", "waiting"), itemsDetected: 3 }),
      false,
    );
  });

  test("polling starts quick, backs off, and is capped", () => {
    assert.equal(pollDelayMs(0), 2_000);
    assert.equal(pollDelayMs(4), 2_000);
    assert.ok(pollDelayMs(6) > pollDelayMs(5));
    assert.equal(pollDelayMs(100), 15_000);
    assert.ok(POLL_GIVE_UP_MS >= 60_000);
  });
});

describe("lineMatch", () => {
  const href = (m: { id: string; type: string }) => `/${m.type}s/${m.id}`;

  test("a verified match on the line wins", () => {
    const got = lineMatch(
      line("l1", { id: "w1", name: "Pinot", type: "wine" }),
      [suggestion("a", "l1")],
      new Map(),
      href,
    );
    assert.deepEqual(got, {
      kind: "matched",
      name: "Pinot",
      href: "/wines/w1",
      optimistic: false,
    });
  });

  test("Accept turns the line Matched at once, before the server answers", () => {
    const got = lineMatch(
      line("l1"),
      [suggestion("a", "l1")],
      new Map([["a", "ACCEPT"]]),
    );
    assert.equal(got.kind, "matched");
    assert.equal(got.kind === "matched" && got.optimistic, true);
    assert.equal(got.kind === "matched" && got.name, "Item a");
  });

  test("an accepted suggestion stays the match while place_menu_items has not caught up", () => {
    // The old page re-rendered this line "not yet matched": the acceptance
    // reaches `matched_item` only through an outbox hop (and a recipe never).
    const got = lineMatch(line("l1"), [
      suggestion("a", "l1", { accepted: true }),
    ]);
    assert.deepEqual(got, {
      kind: "matched",
      name: "Item a",
      href: "/wines/a",
      optimistic: false,
    });
  });

  test("Reject moves straight to the next candidate, then to new", () => {
    const both = [suggestion("a", "l1"), suggestion("b", "l1")];
    const first = lineMatch(line("l1"), both);
    assert.equal(first.kind === "suggested" && first.suggestion.id, "a");
    const next = lineMatch(line("l1"), both, new Map([["a", "REJECT"]]));
    assert.equal(next.kind === "suggested" && next.suggestion.id, "b");
    const none = lineMatch(
      line("l1"),
      both,
      new Map([
        ["a", "REJECT"],
        ["b", "REJECT"],
      ]),
    );
    assert.deepEqual(none, { kind: "new" });
    assert.deepEqual(
      lineMatch(line("l1"), [suggestion("a", "l1", { rejected: true })]),
      { kind: "new" },
    );
  });

  test("another line's suggestions are not this line's", () => {
    assert.deepEqual(lineMatch(line("l1"), [suggestion("a", "l2")]), {
      kind: "new",
    });
  });
});

describe("scanHeadline", () => {
  const matched: LineMatch = {
    kind: "matched",
    name: "x",
    href: null,
    optimistic: false,
  };
  const suggested: LineMatch = {
    kind: "suggested",
    suggestion: suggestion("a", "l1"),
  };
  const fresh: LineMatch = { kind: "new" };
  const lines = [matched, suggested, ...Array(6).fill(fresh)];

  test('settled: "8 read · 1 matched · 1 to confirm · 6 new" — a suggestion is not a match', () => {
    const headline = scanHeadline(
      { ...scan("completed", "completed"), itemsDetected: 8 },
      lines,
    );
    assert.equal(headline.text, "8 read · 1 matched · 1 to confirm · 6 new");
    assert.equal(headline.matched, 1);
    assert.equal(headline.toConfirm, 1);
    assert.equal(headline.fresh, 6);
  });

  test("nothing to confirm drops that part", () => {
    assert.equal(
      scanHeadline({ ...scan("completed", "completed"), itemsDetected: 8 }, [
        matched,
        matched,
        ...Array(6).fill(fresh),
      ]).text,
      "8 read · 2 matched · 6 new",
    );
  });

  test("a menu longer than the loaded page is counted by the server", () => {
    // 100 lines loaded, 140 read: counting the page would undercount.
    const page = [matched, suggested, ...Array(98).fill(fresh)];
    const headline = scanHeadline(
      { ...scan("completed", "completed"), itemsDetected: 140 },
      page,
      { server: { lines: 140, matched: 12, toConfirm: 5 }, complete: false },
    );
    assert.equal(
      headline.text,
      "140 read · 12 matched · 5 to confirm · 123 new",
    );
  });

  test("with every line loaded the page's own count wins, so a fresh Accept shows at once", () => {
    const headline = scanHeadline(
      { ...scan("completed", "completed"), itemsDetected: 8 },
      [matched, matched, ...Array(6).fill(fresh)],
      // The server has not seen the acceptance yet.
      { server: { lines: 8, matched: 1, toConfirm: 1 }, complete: true },
    );
    assert.equal(headline.text, "8 read · 2 matched · 6 new");
  });

  test("while matching, it says so instead of calling every line new", () => {
    for (const status of ["queued", "running"] as const) {
      assert.equal(
        scanHeadline({ ...scan("completed", status), itemsDetected: 8 }, [])
          .text,
        "8 read · matching…",
      );
    }
  });

  test("extracting, failed, and nothing to match", () => {
    assert.equal(
      scanHeadline({ ...scan("processing", "waiting"), itemsDetected: 0 }, [])
        .text,
      "Reading…",
    );
    assert.equal(
      scanHeadline({ ...scan("failed", "skipped"), itemsDetected: 0 }, []).text,
      "Not read",
    );
    assert.equal(
      scanHeadline({ ...scan("completed", "skipped"), itemsDetected: 3 }, [])
        .text,
      "3 read",
    );
  });

  test("a failed match run still reports what it found", () => {
    assert.equal(
      scanHeadline({ ...scan("completed", "failed"), itemsDetected: 8 }, lines)
        .text,
      "8 read · 1 matched · 1 to confirm · 6 new",
    );
  });
});
