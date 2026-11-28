/**
 * "Waiting on you" (X10): the one list of things only the viewer can finish,
 * each a row that goes straight to where it is finished.
 *
 * | row                         | from                                  | goes to                  |
 * |-----------------------------|---------------------------------------|--------------------------|
 * | menu matches to confirm     | `myDiscoveries`, grouped by scan      | the scan's results       |
 * | Needs details · n bottles   | `needsDetailsCount` (MC-drafts, L41)  | `/needs-details` (K2)    |
 * | n to check                  | open bottles' `unconfirmedFields`     | the first one's page     |
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
import {
  type ApiItemType,
  cellarItemHref,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";
import { retryPhrase } from "@/lib/ai/outcome";
import { displayItemName } from "@/utilities/smart-title-case";
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

/** One row of `myAiQuota` (MC-quota). */
export type AiQuotaRow = {
  readonly kind: string;
  /** F-230: which allowance; absent reads as an AI one. */
  readonly service?: "AI_MODEL" | "GOOGLE_PLACES";
  readonly used: number;
  readonly limit: number;
  readonly resetsAt: string;
};

/**
 * "Limit reached · resets tomorrow after 9:00 AM": the reset a USER_CAP
 * refusal carries (`retryAt`), or else the soonest reset of an allowance
 * that is used up (MC-quota: the two are the same instant). Null when
 * neither says when — then the caller keeps the plain wording.
 *
 * F-231 / FR-16: Places has its own monthly allowance. When the spent one is
 * Places — the refusal's reset matches it, or it is the soonest spent — the
 * line says so, with its use ("Places limit reached · 200 of 200 · …"), so a
 * refusal always has a visible reason.
 */
export const limitResetLine = (
  retryAt: string | null,
  quotas: readonly AiQuotaRow[],
  options: { now?: Date; timeZone?: string; locale?: string } = {},
): string | null => {
  const spent = quotas
    .filter((quota) => quota.used >= quota.limit)
    .sort((a, b) => a.resetsAt.localeCompare(b.resetsAt));
  const instant = (at: string) => new Date(at).getTime();
  const candidates: { at: string | null; row: AiQuotaRow | undefined }[] = [
    {
      at: retryAt,
      row:
        retryAt === null
          ? undefined
          : spent.find((quota) => instant(quota.resetsAt) === instant(retryAt)),
    },
    ...spent.map((row) => ({ at: row.resetsAt, row })),
  ];
  for (const { at, row } of candidates) {
    const phrase = retryPhrase(at, options);
    if (phrase === null) continue;
    return row?.service === "GOOGLE_PLACES"
      ? `Places limit reached · ${row.used} of ${row.limit} · resets ${phrase}`
      : `Limit reached · resets ${phrase}`;
  }
  return null;
};

/**
 * "n to check": bottles with a guessed field nobody checked (MC-drafts) —
 * open or sealed, since a label read adds a sealed bottle (F-123).
 */
export type ToCheck = {
  readonly count: number;
  /** The first open one, named on the row; null when only sealed ones are. */
  readonly name: string | null;
  /** "country, from the label". */
  readonly fields: string;
  readonly href: string;
};

type ToCheckNode = {
  readonly id: string;
  readonly cellarId: string;
  readonly item: {
    readonly id: string;
    readonly type: string;
    readonly name: string;
    readonly unconfirmedFields: readonly string[];
  } | null;
};

const fieldWords = (field: string): string =>
  field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();

/**
 * The open bottles whose item still has guessed fields, one per item, named
 * and linked; `total` is the server's count over every bottle, sealed ones
 * too (`me.unconfirmedBottleCount`, F-76), which the open read cannot see.
 */
export const toCheckFromNodes = (
  nodes: readonly ToCheckNode[],
  total = 0,
): ToCheck | null => {
  const seen = new Set<string>();
  const rows: { node: ToCheckNode; type: ApiItemType }[] = [];
  for (const node of nodes) {
    const item = node.item;
    if (item === null || item.unconfirmedFields.length === 0) continue;
    if (!(ITEM_TYPES as readonly string[]).includes(item.type)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    rows.push({ node, type: item.type as ApiItemType });
  }
  const first = rows[0];
  if (first === undefined || first.node.item === null) {
    return total > 0
      ? {
          count: total,
          name: null,
          fields: "Guessed from a label",
          href: "/cellars",
        }
      : null;
  }
  return {
    count: Math.max(total, rows.length),
    name: displayItemName(first.node.item.name),
    fields: `${first.node.item.unconfirmedFields.map(fieldWords).join(", ")}, from the label`,
    href: cellarItemHref(first.node.cellarId, first.type, first.node.id),
  };
};

export type InboxItem =
  | {
      readonly kind: "needs-details";
      readonly id: "needs-details";
      readonly count: number;
      readonly href: string;
    }
  | {
      readonly kind: "to-check";
      readonly id: "to-check";
      readonly check: ToCheck;
    }
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

const rankOf = (item: InboxItem): number => {
  switch (item.kind) {
    case "matches":
      return 0;
    case "needs-details":
    case "to-check":
      return 1;
    case "request":
      return 2;
    case "job":
      return JOB_ORDER[item.job.kind];
  }
};

/** Where "Needs details" goes: K2's page (wave 5), linked as it is. */
export const NEEDS_DETAILS_HREF = "/needs-details";

export const buildInbox = ({
  jobs,
  suggestions,
  requests,
  needsDetails = 0,
  toCheck = null,
  seen,
}: {
  readonly jobs: readonly AiJob[];
  readonly suggestions: readonly PendingSuggestion[];
  readonly requests: readonly IncomingRequest[];
  /** `needsDetailsCount`: the viewer's own saved drafts. */
  readonly needsDetails?: number;
  readonly toCheck?: ToCheck | null;
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

  const drafts: InboxItem[] = [
    ...(needsDetails > 0
      ? [
          {
            kind: "needs-details",
            id: "needs-details",
            count: needsDetails,
            href: NEEDS_DETAILS_HREF,
          } as const,
        ]
      : []),
    ...(toCheck === null
      ? []
      : [{ kind: "to-check", id: "to-check", check: toCheck } as const]),
  ];

  return [...matches, ...drafts, ...asks, ...finished]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rankOf(a.item) - rankOf(b.item) || a.index - b.index)
    .map(({ item }) => item);
};
