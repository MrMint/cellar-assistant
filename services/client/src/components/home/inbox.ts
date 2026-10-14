/**
 * "Waiting on you" (X10): the one list of things only the viewer can finish,
 * each a row that goes straight to where it is finished.
 *
 * | row                         | from                                  | goes to                  |
 * |-----------------------------|---------------------------------------|--------------------------|
 * | menu matches to confirm     | `myDiscoveries`, grouped by scan      | the scan's results       |
 * | a capture draft to check    | `aiJobs` LABEL_READ, READY            | `/add?draft=…`           |
 * | a friend request            | `myFriendRequests(INCOMING)`          | `/friends` (or Accept)   |
 * | finished insights           | `aiJobs` TIER_LIST_INSIGHTS, READY    | the tier list            |
 * | a read menu, a read recipe  | `aiJobs` MENU_SCAN / RECIPE_PHOTO     | the scan / the recipe    |
 *
 * This is where `/discoveries` and the `/map/scans` list went (D1).
 *
 * A finished result stops waiting once it has been opened or dismissed —
 * remembered per browser (`seen`: hashes of the job **and** when it
 * finished, so insights generated again come back; `seen-cookie.ts`). Matches and requests need no such
 * memory: answering them is what removes them.
 *
 * Pure — `ai-jobs.test.ts` ("buildInbox").
 */
import type { AiJob } from "./ai-jobs";
import { aiJobHref } from "./ai-jobs";
import { seenHash } from "./seen-cookie";

export type PendingSuggestion = {
  readonly id: string;
  readonly menuScanId: string | null;
  readonly accepted: boolean | null;
  readonly rejected: boolean | null;
  readonly menuItemName: string;
  readonly createdAt: string | null;
  readonly place: { readonly id: string; readonly name: string };
};

export type IncomingRequest = {
  readonly id: string;
  readonly status: "PENDING" | "ACCEPTED";
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly avatarUrl: string | null;
  };
};

export type InboxItem =
  | {
      readonly kind: "matches";
      readonly id: string;
      readonly scanId: string;
      readonly placeName: string;
      readonly count: number;
      /** The first few lines, for the row's second line. */
      readonly names: readonly string[];
      readonly href: string;
    }
  | {
      readonly kind: "request";
      readonly id: string;
      readonly requestId: string;
      readonly user: IncomingRequest["user"];
      readonly href: string;
    }
  | {
      readonly kind: "job";
      readonly id: string;
      readonly job: AiJob;
      /** What `seen` remembers once it is opened or dismissed. */
      readonly seenKey: string;
      readonly href: string;
    };

/** A finished job's memory key: the job, and when it finished. */
export const seenKeyOf = (job: AiJob): string =>
  `${job.id}@${job.finishedAt ?? ""}`;

/** Order on the page: what blocks something else first. */
const JOB_ORDER: Readonly<Record<AiJob["kind"], number>> = {
  LABEL_READ: 1,
  MENU_SCAN: 3,
  RECIPE_PHOTO: 3,
  TIER_LIST_INSIGHTS: 3,
};

const rankOf = (item: InboxItem): number =>
  item.kind === "matches"
    ? 0
    : item.kind === "request"
      ? 2
      : JOB_ORDER[item.job.kind];

export const buildInbox = ({
  jobs,
  suggestions,
  requests,
  seen,
}: {
  readonly jobs: readonly AiJob[];
  readonly suggestions: readonly PendingSuggestion[];
  readonly requests: readonly IncomingRequest[];
  /** Hashes of seen keys (`seenHash(seenKeyOf(job))`). */
  readonly seen: ReadonlySet<string>;
}): InboxItem[] => {
  const byScan = new Map<string, PendingSuggestion[]>();
  for (const suggestion of suggestions) {
    // Acted on already, or a suggestion that cannot be acted on by scan.
    if (suggestion.accepted !== null || suggestion.rejected !== null) continue;
    if (suggestion.menuScanId === null) continue;
    byScan.set(suggestion.menuScanId, [
      ...(byScan.get(suggestion.menuScanId) ?? []),
      suggestion,
    ]);
  }
  const matches: InboxItem[] = Array.from(byScan.entries()).map(
    ([scanId, rows]) => ({
      kind: "matches",
      id: `matches:${scanId}`,
      scanId,
      placeName: rows[0]?.place.name ?? "",
      count: rows.length,
      names: rows.slice(0, 3).map((row) => row.menuItemName),
      href: `/map/scans/${scanId}`,
    }),
  );

  const asks: InboxItem[] = requests
    .filter((request) => request.status === "PENDING")
    .map((request) => ({
      kind: "request",
      id: `request:${request.id}`,
      requestId: request.id,
      user: request.user,
      href: "/friends",
    }));

  const finished: InboxItem[] = jobs.flatMap((job): InboxItem[] => {
    if (job.status !== "READY") return [];
    // The matches row already says this scan was read, and more usefully.
    if (job.kind === "MENU_SCAN" && byScan.has(job.subjectId)) return [];
    const key = seenKeyOf(job);
    if (seen.has(seenHash(key))) return [];
    const href = aiJobHref(job);
    if (href === null) return [];
    return [{ kind: "job", id: job.id, job, seenKey: key, href }];
  });

  return [...matches, ...asks, ...finished]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rankOf(a.item) - rankOf(b.item) || a.index - b.index)
    .map(({ item }) => item);
};
