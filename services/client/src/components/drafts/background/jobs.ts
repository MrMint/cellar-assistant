/**
 * K2 · background work (Capture-Place 16 to 20): what the viewfinder pill
 * counts and the "In the background" sheet lists.
 *
 * The jobs are the viewer's AI work as `me.aiJobs` reports it (H1's
 * `aiJobStore`, which the shell's watcher polls): label reads and menu scans,
 * running or settled in the last half hour, less any the person dismissed.
 * The photo of a label read comes from K1's in-memory `captureDrafts`, read
 * as it is (L41); after a reload it is gone and the row shows its glyph.
 *
 * Pure — `jobs.test.ts`.
 */
import type { AiJob } from "@/components/home/ai-jobs";
import { DRAFT_TTL_MS } from "@/lib/capture/draft-store";

/** The kinds the camera starts. */
const CAPTURE_KINDS: ReadonlySet<AiJob["kind"]> = new Set<AiJob["kind"]>([
  "LABEL_READ",
  "MENU_SCAN",
]);

const ORDER: Readonly<Record<AiJob["status"], number>> = {
  FAILED: 0,
  READY: 1,
  RUNNING: 2,
};

/**
 * The sheet's rows: failures first (they need the person), then results,
 * then what is still reading; newest first within each.
 */
export const backgroundJobs = (
  jobs: readonly AiJob[] | null,
  dismissed: ReadonlySet<string>,
  now: number,
): AiJob[] =>
  (jobs ?? [])
    .filter((job) => CAPTURE_KINDS.has(job.kind) && !dismissed.has(job.id))
    .filter((job) => {
      if (job.status === "RUNNING") return true;
      const finished = Date.parse(job.finishedAt ?? job.startedAt);
      return Number.isFinite(finished) && now - finished <= DRAFT_TTL_MS;
    })
    .sort(
      (a, b) =>
        ORDER[a.status] - ORDER[b.status] ||
        Date.parse(b.startedAt) - Date.parse(a.startedAt),
    );

/** The pill: "2 reading · 1 ready · 1 failed", or null when there is none. */
export const pillLine = (jobs: readonly AiJob[]): string | null => {
  const reading = jobs.filter((job) => job.status === "RUNNING").length;
  const ready = jobs.filter((job) => job.status === "READY").length;
  const failed = jobs.filter((job) => job.status === "FAILED").length;
  const parts = [
    reading > 0 ? `${reading} reading` : null,
    ready > 0 ? `${ready} ready` : null,
    failed > 0 ? `${failed} failed` : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
};

/** A row's title, in the board's words. */
export const jobTitle = (job: AiJob): string => {
  const label = job.kind === "LABEL_READ";
  switch (job.status) {
    case "RUNNING":
      return label ? "Reading a label" : "Reading a menu";
    case "READY":
      return label ? "Your label is read" : "Your menu is read";
    case "FAILED":
      return label ? "Couldn't read this label" : "Couldn't read this menu";
  }
};

/** A ready row's second line: "Corner bar · 12 lines". */
export const readyDetailLine = (job: AiJob): string | null => {
  if (job.kind === "LABEL_READ") return "Check it, then add it";
  const lines =
    job.count === null || job.count === 0
      ? null
      : `${job.count} ${job.count === 1 ? "line" : "lines"}`;
  const parts = [job.placeName, lines].filter(
    (part): part is string => part !== null && part !== "",
  );
  return parts.length === 0 ? null : parts.join(" · ");
};
