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
  FriendCellarRowFragment,
  FriendCellarsPageQuery,
  FriendLogEntryFragment,
  FriendLogPageQuery,
  FriendProfileQuery,
  FriendTierListRowFragment,
  FriendTierListsPageQuery,
} from "./queries";

type Profile = Extract<
  NonNullable<ResultOf<typeof FriendProfileQuery>["friendProfile"]>,
  { __typename: "FriendProfile" }
>;
type LogEntry = ResultOf<typeof FriendLogEntryFragment>;
type ListNode = ResultOf<typeof FriendTierListRowFragment>;
type CellarNode = ResultOf<typeof FriendCellarRowFragment>;

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
  /** ux-c L08: an item log, or a recipe made ("Made it"). */
  readonly kind: "item" | "recipe";
  /**
   * The item's name, its vintage first when it has one — or the recipe's
   * name, or {@link DELETED_RECIPE_TITLE}.
   */
  readonly title: string;
  /** Into the item or the recipe; `null` when the recipe was deleted. */
  readonly href: string | null;
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
  /** The first page of each; "Show more" walks on (leftovers 6). */
  readonly tierLists: Page<ProfileListRow>;
  readonly cellars: Page<ProfileCellarRow>;
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

export const listRow = (node: ListNode): ProfileListRow => ({
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

export const cellarRow = (node: CellarNode): ProfileCellarRow => {
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

/** L44: a "Made it" log whose recipe has since been deleted. */
export const DELETED_RECIPE_TITLE = "A recipe that was deleted";

/** What the row is about: an item, or a recipe someone made (ux-c L08). */
const logSubject = (
  entry: LogEntry,
): Pick<ProfileLogRow, "title" | "href" | "itemType" | "kind"> => {
  const item = entry.item;
  if (item === null) {
    const recipe = entry.recipe;
    return recipe === null
      ? {
          kind: "recipe",
          title: DELETED_RECIPE_TITLE,
          href: null,
          itemType: null,
        }
      : {
          kind: "recipe",
          title: recipe.name,
          href: `/recipes/${recipe.id}`,
          itemType: null,
        };
  }
  const vintage =
    item.__typename === "Wine"
      ? formatVintage(item.vintage)
      : item.__typename === "Sake"
        ? formatVintage(item.vintageYear)
        : undefined;
  const name = displayItemName(item.name);
  return {
    kind: "item",
    title: vintage === undefined ? name : `${vintage} ${name}`,
    href: itemHref(item.type, item.id),
    itemType: ITEM_TYPES.has(item.type) ? (item.type as ApiItemType) : null,
  };
};

export const logRow = (entry: LogEntry): ProfileLogRow => {
  const place = entry.place;
  return {
    id: entry.id,
    createdAt: entry.createdAt as string,
    ...logSubject(entry),
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

type Connection<TNode> = {
  readonly edges: readonly { readonly node: TNode }[];
  readonly pageInfo: {
    readonly hasNextPage: boolean;
    readonly endCursor?: string | null;
  };
  readonly totalCount?: number | null;
};

/** One page of `FriendProfile.checkIns` → rows. */
export const logPage = (
  connection: Connection<LogEntry>,
): Page<ProfileLogRow> => toPage(connection, (edge) => logRow(edge.node));

/** One page of `FriendProfile.tierLists` → rows. */
export const listPage = (
  connection: Connection<ListNode>,
): Page<ProfileListRow> => toPage(connection, (edge) => listRow(edge.node));

/** One page of `FriendProfile.cellars` → rows. */
export const cellarPage = (
  connection: Connection<CellarNode>,
): Page<ProfileCellarRow> => toPage(connection, (edge) => cellarRow(edge.node));

/** `FriendTierListsPage`'s answer → the next page, or its refusal. */
export const listPageResult = (
  answer:
    | ResultOf<typeof FriendTierListsPageQuery>["friendProfile"]
    | undefined,
): ApiResult<Page<ProfileListRow>> => {
  const result = unwrapResult(answer, "FriendProfile");
  return result.ok
    ? { ok: true, data: listPage(result.data.tierLists) }
    : result;
};

/** `FriendCellarsPage`'s answer → the next page, or its refusal. */
export const cellarPageResult = (
  answer: ResultOf<typeof FriendCellarsPageQuery>["friendProfile"] | undefined,
): ApiResult<Page<ProfileCellarRow>> => {
  const result = unwrapResult(answer, "FriendProfile");
  return result.ok
    ? { ok: true, data: cellarPage(result.data.cellars) }
    : result;
};

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
  tierLists: listPage(profile.tierLists),
  cellars: cellarPage(profile.cellars),
  logs: logPage(profile.checkIns),
});

/** Whether the friend has shared anything at all with the viewer. */
export const sharesNothing = (view: FriendProfileView): boolean =>
  view.tierLists.rows.length === 0 &&
  view.cellars.rows.length === 0 &&
  view.logs.rows.length === 0;
