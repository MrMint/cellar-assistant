/**
 * X18 — a friend's profile as plain data: the API's answer → what the page
 * draws. No React, so the rules are tested as data (`adapter.test.ts`).
 */
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { entryContext } from "@/components/drink-log/log-draft";
import { itemHref } from "@/components/item-api/itemTypes";
import type { ResultOf } from "@/lib/api/graphql";
import { type ApiResult, unwrapResult } from "@/lib/api/result";
import { type Page, toPage } from "@/lib/paging/paged-connection";
import { formatVintage } from "@/utilities";
import { displayItemName } from "@/utilities/smart-title-case";
import type {
  FriendLogEntryFragment,
  FriendLogPageQuery,
  FriendProfileQuery,
} from "./queries";

type Profile = Extract<
  NonNullable<ResultOf<typeof FriendProfileQuery>["friendProfile"]>,
  { __typename: "FriendProfile" }
>;
type LogEntry = ResultOf<typeof FriendLogEntryFragment>;

export type ProfileListRow = {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  /** "9 entries · Friends only", or the privacy alone for an empty list. */
  readonly description: string;
};

export type ProfileCellarRow = {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  /** "12 bottles", or nothing for an empty cellar (counts hide at zero). */
  readonly description: string | undefined;
};

export type ProfileLogRow = {
  readonly id: string;
  readonly createdAt: string;
  /** The item's name, its vintage first when it has one. */
  readonly title: string;
  readonly href: string;
  readonly itemType: ApiItemType | null;
  readonly score: number | null;
  readonly note: string | null;
  readonly tags: readonly string[];
  /** "with Sam · at Cork & Barrel", or "". */
  readonly context: string;
};

export type FriendProfileView = {
  readonly userId: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  /** "Friends since Oct 2026". */
  readonly sinceLine: string;
  readonly tierLists: readonly ProfileListRow[];
  readonly tierListCount: number;
  readonly cellars: readonly ProfileCellarRow[];
  readonly cellarCount: number;
  readonly logs: Page<ProfileLogRow>;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * "Friends since Oct 2026". From the instant's UTC parts, by hand: the server
 * renders this, and a month and year read the same in every zone but the
 * last hours of a month — never through `Intl`, whose output differs between
 * the server's ICU and the browser's (`Timestamp`'s doc has the story).
 */
export const friendsSinceLine = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Friends";
  return `Friends since ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

const PRIVACY_WORDS: Record<string, string> = {
  PUBLIC: "Public",
  FRIENDS: "Friends only",
};

const entries = (count: number): string =>
  `${count} ${count === 1 ? "entry" : "entries"}`;

export const listRow = (
  node: Profile["tierLists"]["edges"][number]["node"],
): ProfileListRow => ({
  id: node.id,
  name: node.name,
  href: `/tier-lists/${node.id}`,
  description: [
    node.itemCount > 0 ? entries(node.itemCount) : null,
    PRIVACY_WORDS[node.privacy] ?? null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · "),
});

export const cellarRow = (
  node: Profile["cellars"]["edges"][number]["node"],
): ProfileCellarRow => {
  const bottles = node.itemCounts.total;
  return {
    id: node.id,
    name: node.name,
    href: `/cellars/${node.id}`,
    description:
      bottles === 0
        ? undefined
        : `${bottles} ${bottles === 1 ? "bottle" : "bottles"}`,
  };
};

const ITEM_TYPES = new Set<string>([
  "WINE",
  "BEER",
  "SPIRIT",
  "COFFEE",
  "SAKE",
  "TEA",
]);

export const logRow = (entry: LogEntry): ProfileLogRow => {
  const item = entry.item;
  const vintage =
    item.__typename === "Wine"
      ? formatVintage(item.vintage)
      : item.__typename === "Sake"
        ? formatVintage(item.vintageYear)
        : undefined;
  const name = displayItemName(item.name);
  const place = entry.place;
  return {
    id: entry.id,
    createdAt: entry.createdAt as string,
    title: vintage === undefined ? name : `${vintage} ${name}`,
    href: itemHref(item.type, item.id),
    itemType: ITEM_TYPES.has(item.type) ? (item.type as ApiItemType) : null,
    score: entry.score,
    note: entry.note === null || entry.note.trim() === "" ? null : entry.note,
    tags: entry.tags,
    context: entryContext({
      companionNames: entry.companions.edges.map(
        (edge) => edge.node.displayName,
      ),
      companionCount: entry.companionIds.length,
      placeName: place === null ? null : (place.displayName ?? place.name),
    }),
  };
};

type LogConnection = {
  readonly edges: readonly { readonly node: LogEntry }[];
  readonly pageInfo: {
    readonly hasNextPage: boolean;
    readonly endCursor?: string | null;
  };
  readonly totalCount?: number | null;
};

/** One page of `FriendProfile.checkIns` → rows. */
export const logPage = (connection: LogConnection): Page<ProfileLogRow> =>
  toPage(connection, (edge) => logRow(edge.node));

/** `FriendLogPage`'s answer → the next page, or the refusal it carried. */
export const logPageResult = (
  answer: ResultOf<typeof FriendLogPageQuery>["friendProfile"] | undefined,
): ApiResult<Page<ProfileLogRow>> => {
  const result = unwrapResult(answer, "FriendProfile");
  return result.ok ? { ok: true, data: logPage(result.data.checkIns) } : result;
};

/** The whole answer → the page's view. */
export const friendProfileView = (profile: Profile): FriendProfileView => ({
  userId: profile.id,
  name: profile.user.displayName,
  avatarUrl: profile.user.avatarUrl ?? null,
  sinceLine: friendsSinceLine(profile.since as string),
  tierLists: profile.tierLists.edges.map((edge) => listRow(edge.node)),
  tierListCount: profile.tierLists.totalCount ?? profile.tierLists.edges.length,
  cellars: profile.cellars.edges.map((edge) => cellarRow(edge.node)),
  cellarCount: profile.cellars.totalCount ?? profile.cellars.edges.length,
  logs: logPage(profile.checkIns),
});

/** Whether the friend has shared anything at all with the viewer. */
export const sharesNothing = (view: FriendProfileView): boolean =>
  view.tierLists.length === 0 &&
  view.cellars.length === 0 &&
  view.logs.rows.length === 0;

/** "Showing 20 of 26" under a section the page did not show whole. */
export const moreLine = (shown: number, total: number): string | null =>
  total > shown ? `Showing ${shown} of ${total}` : null;
