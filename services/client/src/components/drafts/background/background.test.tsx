/**
 * K2 · background work: which jobs the pill counts and the sheet lists, and
 * the pill itself over H1's `aiJobStore`.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/add" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/add",
  useSearchParams: () => new URLSearchParams(),
}));

window.matchMedia = ((query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList) as typeof window.matchMedia;

const { backgroundJobs, jobTitle, pillLine, readyDetailLine } = await import(
  "./jobs"
);
type AiJob = import("@/components/home/ai-jobs").AiJob;

const NOW = Date.parse("2026-11-27T12:00:00Z");
const job = (over: Partial<AiJob>): AiJob =>
  ({
    __typename: "AiJob",
    id: "j",
    kind: "LABEL_READ",
    status: "RUNNING",
    subjectId: "11111111-1111-4111-8111-111111111111",
    itemType: "BEER",
    placeId: null,
    placeName: null,
    count: null,
    tierListName: null,
    recipeId: null,
    recipeName: null,
    startedAt: "2026-11-27T11:59:00Z",
    finishedAt: null,
    failureCode: null,
    failureReason: null,
    retryAt: null,
    ...over,
  }) as AiJob;

const JOBS: AiJob[] = [
  job({ id: "r1" }),
  job({ id: "r2", startedAt: "2026-11-27T11:59:30Z" }),
  job({
    id: "m1",
    kind: "MENU_SCAN",
    status: "READY",
    placeName: "Demo Taproom",
    count: 12,
    finishedAt: "2026-11-27T11:58:00Z",
  }),
  job({
    id: "f1",
    status: "FAILED",
    failureCode: "NOTHING_READ",
    finishedAt: "2026-11-27T11:57:00Z",
  }),
  // Not the camera's work, and work long settled: never shown.
  job({ id: "t1", kind: "TIER_LIST_INSIGHTS", status: "READY" }),
  job({
    id: "old",
    status: "READY",
    finishedAt: "2026-11-27T10:00:00Z",
  }),
];

describe("backgroundJobs", () => {
  test("label reads and menu scans, failures first, the stale and the dismissed left out", () => {
    const rows = backgroundJobs(JOBS, new Set(), NOW);
    assert.deepEqual(
      rows.map((r) => r.id),
      ["f1", "m1", "r2", "r1"],
    );
    assert.equal(pillLine(rows), "2 reading · 1 ready · 1 failed");
    assert.deepEqual(
      backgroundJobs(JOBS, new Set(["f1"]), NOW).map((r) => r.id),
      ["m1", "r2", "r1"],
    );
    assert.equal(pillLine([]), null);
    assert.equal(pillLine(backgroundJobs(null, new Set(), NOW)), null);
  });

  test("the board's words", () => {
    assert.equal(jobTitle(job({})), "Reading a label");
    assert.equal(
      jobTitle(job({ status: "FAILED" })),
      "Couldn't read this label",
    );
    assert.equal(
      jobTitle(job({ kind: "MENU_SCAN", status: "READY" })),
      "Your menu is read",
    );
    assert.equal(
      readyDetailLine(
        job({
          kind: "MENU_SCAN",
          status: "READY",
          placeName: "Demo Taproom",
          count: 12,
        }),
      ),
      "Demo Taproom · 12 lines",
    );
  });
});

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { aiJobStore } = await import("@/components/home/ai-job-store");
const { BackgroundPill } = await import("./BackgroundPill");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  aiJobStore.reset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("BackgroundPill", () => {
  test("draws nothing until there is work; then counts it and opens the sheet", async () => {
    await act(async () => root.render(<BackgroundPill className="x-place" />));
    assert.equal(document.querySelector('[data-slot="background-pill"]'), null);

    const fresh = JOBS.map((j) =>
      j.finishedAt === null
        ? j
        : { ...j, finishedAt: new Date(Date.now() - 60_000).toISOString() },
    ).filter((j) => j.id !== "old");
    await act(async () => aiJobStore.publish(fresh));
    const pill = document.querySelector<HTMLButtonElement>(
      '[data-slot="background-pill"]',
    );
    assert.ok(pill);
    assert.equal(pill.textContent, "2 reading · 1 ready · 1 failed");
    assert.match(pill.className, /x-place/);

    await act(async () => pill.click());
    const text = document.body.textContent ?? "";
    assert.match(text, /In the background/);
    assert.match(text, /Your menu is read/);
    assert.match(text, /Couldn't read this label/);
    assert.equal(
      document.querySelectorAll('[role="progressbar"]').length,
      2,
      "two reads in progress",
    );
  });
});
