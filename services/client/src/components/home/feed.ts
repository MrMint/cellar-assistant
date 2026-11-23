/**
 * Home's Friends feed (X10): what friends did, as sentences, with bursts
 * folded into one line.
 *
 * The rows are `me.friendsFeed`'s, through `/search`'s adapter
 * (`activityEntryFromNode`) for the item's name, picture and link. Two things
 * are added here:
 *
 * - **Sentences.** "Sam rated Barolo ★4.5", "Sam added 3 bottles to Weekend
 *   Wines", "Sam had Pliny the Elder · with you · at Old Mill". A sentence is
 *   a list of tokens, so the page links the item and the cellar or list
 *   inside it without parsing anything.
 * - **Bursts.** Someone adding a case of wine is one event, not twelve rows:
 *   consecutive entries by the same person, of the same kind and into the
 *   same cellar or list, each within {@link BURST_WINDOW_MS} of the one
 *   before, become one line ("added 12 bottles to Garage") with the first
 *   few names under it. Grouping runs over everything loaded so far, so a
 *   burst that a page boundary cut in two joins up when the next page lands.
 *
 * Pure — `feed.test.ts`.
 */

import { formatRating } from "@/components/common/rating/rating";
import { joinNames } from "@/components/drink-log/log-draft";
import type { ActivityEntry } from "@/components/search/adapter";
import { activityEntryFromNode } from "@/components/search/adapter";
import type { ResultOf } from "@/lib/api/graphql";
import type { HomeFriendsFeedQuery } from "./queries";

/** L44: what a Made-it log whose recipe was deleted names. */
export { DELETED_RECIPE_NAME } from "@/components/search/adapter";

export type FeedNode = NonNullable<
  ResultOf<typeof HomeFriendsFeedQuery>["me"]
>["friendsFeed"]["edges"][number]["node"];

/** One feed row, with what a burst groups by. */
export type FeedEntry = {
  readonly entry: ActivityEntry;
  /** The cellar (ADDED) or list (TIER_LISTED) it went into. */
  readonly target: {
    readonly id: string;
    readonly name: string;
    readonly href: string;
  } | null;
  /** CHECKED_IN: "with you and Ana · at The Corner Bar", or "". */
  readonly context: string;
  /**
   * ux-c L08: a "Made it" log — a recipe, not an item ("Sam made Negroni").
   * `activityEntryFromNode` builds them (H-12): the recipe stands for the item.
   */
  readonly made: boolean;
};

/**
 * The people at a logged drink, the viewer named "you" and first — the
 * search feed's `context` names them all by display name, which reads oddly
 * when one of them is you.
 */
const drinkContext = (node: FeedNode, viewerId: string | null): string => {
  const log = node.checkIn;
  if (log === null) return "";
  const others = log.companions.edges
    .map((edge) => edge.node)
    .filter((person) => person.id !== viewerId)
    .map((person) => person.displayName);
  const withYou = viewerId !== null && log.companionIds.includes(viewerId);
  const names = withYou ? ["you", ...others] : others;
  // Companions past the first page are still counted.
  const hidden = Math.max(
    0,
    log.companionIds.length - log.companions.edges.length,
  );
  const place =
    log.place === null ? null : (log.place.displayName ?? log.place.name);
  return [
    names.length > 0 ? `with ${joinNames(names, names.length + hidden)}` : null,
    place === null ? null : `at ${place}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
};

/** The feed's nodes as entries, skipping any whose edge the server nulled. */
export const feedEntriesFromNodes = (
  nodes: readonly FeedNode[],
  viewerId: string | null,
): FeedEntry[] =>
  nodes.flatMap((node): FeedEntry[] => {
    const entry = activityEntryFromNode(node, viewerId);
    if (entry === null) return [];
    const list = node.tierListItem?.tierList ?? null;
    const target =
      node.kind === "ADDED" && node.cellar !== null
        ? {
            id: node.cellar.id,
            name: node.cellar.name,
            href: `/cellars/${node.cellar.id}/items`,
          }
        : node.kind === "TIER_LISTED" && list !== null
          ? { id: list.id, name: list.name, href: `/tier-lists/${list.id}` }
          : null;
    return [
      {
        entry,
        target,
        context: drinkContext(node, viewerId),
        made: entry.kind === "drank" && entry.itemType === "RECIPE",
      },
    ];
  });

/** One piece of a sentence: plain words, or a name that links somewhere. */
export type Token = {
  readonly text: string;
  readonly href?: string;
  /** A name the eye should find: the person, the thing, the place. */
  readonly strong?: boolean;
};

export type FeedBurst = {
  /** The newest entry's id — stable as older pages join the burst. */
  readonly id: string;
  readonly kind: ActivityEntry["kind"];
  readonly userId: string;
  readonly userName: string;
  readonly userAvatar: string | null;
  /** The newest entry's instant. */
  readonly timestamp: string;
  /** Newest first. */
  readonly entries: readonly ActivityEntry[];
  readonly sentence: readonly Token[];
  /** The line under it: the names in a burst, a log's note, or null. */
  readonly detail: string | null;
  /** Where tapping the row goes: the thing, or the cellar/list of a burst. */
  readonly href: string;
};

/** How close together two entries must be to count as one burst. */
export const BURST_WINDOW_MS = 3 * 60 * 60 * 1000;

/** How many names a burst lists before "and N more". */
const BURST_NAMES = 3;

const score = (value: number | null): string | null =>
  value === null ? null : `★${formatRating(value)}`;

const countOf = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "Barolo, Pliny the Elder and 2 more". */
const namesLine = (entries: readonly ActivityEntry[]): string => {
  const names = entries.slice(0, BURST_NAMES).map((entry) => entry.itemName);
  const more = entries.length - names.length;
  if (more > 0) return `${names.join(", ")} and ${more} more`;
  return joinNames(names, names.length);
};

const sentenceOf = (burst: {
  entries: readonly FeedEntry[];
}): { sentence: Token[]; detail: string | null; href: string } => {
  const [first] = burst.entries;
  if (first === undefined) throw new Error("an empty burst");
  const { entry, target } = first;
  const who: Token = { text: entry.userName || "A friend", strong: true };
  const thing: Token =
    entry.itemHref === ""
      ? { text: entry.itemName }
      : { text: entry.itemName, href: entry.itemHref, strong: true };
  const where: Token | null =
    target === null
      ? null
      : { text: target.name, href: target.href, strong: true };
  const n = burst.entries.length;
  const all = burst.entries.map((e) => e.entry);
  const many = n > 1;

  switch (entry.kind) {
    case "added":
      return {
        sentence: [
          who,
          { text: " added " },
          many ? { text: countOf(n, "bottle", "bottles") } : thing,
          ...(where === null ? [] : [{ text: " to " }, where]),
        ],
        detail: many ? namesLine(all) : null,
        href: many && where?.href !== undefined ? where.href : entry.itemHref,
      };
    case "tier-listed":
      return {
        sentence: [
          who,
          { text: " ranked " },
          many ? { text: countOf(n, "entry", "entries") } : thing,
          ...(many ? [] : [{ text: ` #${entry.rank}` }]),
          ...(where === null ? [] : [{ text: " in " }, where]),
        ],
        detail: many ? namesLine(all) : null,
        href: many && where?.href !== undefined ? where.href : entry.itemHref,
      };
    case "reviewed": {
      if (many) {
        return {
          sentence: [who, { text: ` rated ${countOf(n, "thing", "things")}` }],
          detail: all
            .slice(0, BURST_NAMES)
            .map((e) =>
              e.kind === "reviewed" && e.score !== null
                ? `${e.itemName} ${score(e.score)}`
                : e.itemName,
            )
            .join(" · ")
            .concat(n > BURST_NAMES ? ` · and ${n - BURST_NAMES} more` : ""),
          href: entry.itemHref,
        };
      }
      const stars = score(entry.score);
      return {
        sentence: [
          who,
          { text: stars === null ? " reviewed " : " rated " },
          thing,
          ...(stars === null ? [] : [{ text: ` ${stars}` }]),
        ],
        detail: null,
        href: entry.itemHref,
      };
    }
    case "drank": {
      if (many) {
        return {
          sentence: [who, { text: ` had ${countOf(n, "drink", "drinks")}` }],
          detail: namesLine(all),
          href: entry.itemHref,
        };
      }
      const stars = score(entry.score);
      return {
        sentence: [
          who,
          { text: first.made ? " made " : " had " },
          thing,
          ...(stars === null ? [] : [{ text: ` · ${stars}` }]),
          ...(first.context === "" ? [] : [{ text: ` · ${first.context}` }]),
        ],
        detail:
          entry.note ?? (entry.tags.length > 0 ? entry.tags.join(", ") : null),
        href: entry.itemHref,
      };
    }
  }
};

/** Whether `next` (older) continues the burst whose oldest entry is `last`. */
const continues = (last: FeedEntry, next: FeedEntry): boolean => {
  if (last.entry.userId !== next.entry.userId) return false;
  if (last.entry.kind !== next.entry.kind) return false;
  if ((last.target?.id ?? null) !== (next.target?.id ?? null)) return false;
  const gap =
    Date.parse(last.entry.timestamp) - Date.parse(next.entry.timestamp);
  return Number.isFinite(gap) && gap >= 0 && gap <= BURST_WINDOW_MS;
};

/** The feed, newest first, folded into bursts. */
export const groupBursts = (entries: readonly FeedEntry[]): FeedBurst[] => {
  const runs: FeedEntry[][] = [];
  for (const entry of entries) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (run !== undefined && last !== undefined && continues(last, entry)) {
      run.push(entry);
    } else {
      runs.push([entry]);
    }
  }
  return runs.map((run) => {
    const [first] = run;
    if (first === undefined) throw new Error("an empty run");
    const { sentence, detail, href } = sentenceOf({ entries: run });
    return {
      id: first.entry.id,
      kind: first.entry.kind,
      userId: first.entry.userId,
      userName: first.entry.userName,
      userAvatar: first.entry.userAvatar,
      timestamp: first.entry.timestamp,
      entries: run.map((e) => e.entry),
      sentence,
      detail,
      href,
    };
  });
};

/** A sentence as plain text, for an accessible name or a test. */
export const sentenceText = (sentence: readonly Token[]): string =>
  sentence.map((token) => token.text).join("");
