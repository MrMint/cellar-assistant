/**
 * The completeness half of the outbox allow-list (§1.4, §8.5): nothing but
 * `services/actors/src/lib/outbox.ts` inserts into `outbox`.
 *
 * The allow-list itself — the typed handles, and the scan that holds each
 * enqueue site's module and `targetId` to them — lives beside the code it
 * governs, in `services/actors/src/lib/outbox-targets.ts` and
 * `outbox-targets.test.ts`. That scan finds rows by their two enqueue
 * functions, so it is only complete if no module writes the table any other
 * way; this is the assertion that keeps it so, and it lives here because it is
 * a question for the writers scan beside it.
 */
import { PROGRAM_TIMEOUT_MS } from "@cellar-assistant/analysis";
import { beforeAll, describe, expect, it } from "vitest";
import { hostWrites, type WriteSite } from "./writers-scan.ts";

describe("outbox allow-list — completeness", () => {
  // The host's write scan — the full program and the checker's pass over it —
  // once, under a timeout sized for CPU (PROGRAM_TIMEOUT_MS says why).
  let sites: WriteSite[] = [];
  beforeAll(() => {
    sites = hostWrites().sites;
  }, PROGRAM_TIMEOUT_MS);

  it("is the whole surface: nothing else inserts into the outbox table", () => {
    // `writers.ts` exempts `outbox` from the single-writer rule precisely
    // because every actor may insert into it — which is what makes the
    // allow-list necessary *and* what would let a hand-rolled insert slip past
    // a scan that only knows two function names. It cannot: every insert
    // lives in `lib/outbox.ts` (the two enqueue functions and the drainer's
    // `insertCompensations`), and this keeps it that way.
    //
    // Inserts only. `OutboxActor` updates and deletes rows all over — that is
    // the drain, the reclaim sweep and the retention sweep — and none of those
    // can name a *new* `(target_actor, method)` pair, which is the thing being
    // fenced. An UPDATE that rewrote `target_actor` would; nothing does, and
    // the writers scan would surface it here as an `update` if one appeared.
    const inserts = sites
      .filter((site) => site.table === "outbox")
      .filter((site) => site.how === "insert" || /^\s*insert/i.test(site.text))
      .filter((site) => site.file !== "lib/outbox.ts");

    expect(
      inserts.map((s) => `${s.file}:${s.line} ${s.how}`),
      inserts.length === 0
        ? ""
        : [
            "",
            "`outbox` is inserted into outside lib/outbox.ts:",
            "",
            ...inserts.map((s) => `  ${s.file}:${s.line}  ${s.how}  ${s.text}`),
            "",
            "Every outbox row is a policy-off invocation, and the allow-list",
            "fences them at `enqueueOutbox` / `enqueueOutboxOnce`. An insert",
            "that goes around those two functions is a target nothing checks.",
            "Route it through services/actors/src/lib/outbox.ts.",
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  /** Negative control: the filter above is not vacuous. */
  it("sees the inserts lib/outbox.ts does make", () => {
    expect(
      sites.filter(
        (site) => site.table === "outbox" && site.file === "lib/outbox.ts",
      ).length,
    ).toBeGreaterThan(0);
  });
});
