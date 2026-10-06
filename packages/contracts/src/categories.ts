/**
 * The six actor categories (migration plan §1.1). The category fixes what an
 * actor may read and write, and A4's single-writer test keys off it.
 */
export const ACTOR_CATEGORIES = [
  "entity",
  "collection",
  "search",
  "view",
  "reference",
  "job",
] as const;

export type ActorCategory = (typeof ACTOR_CATEGORIES)[number];

export const isActorCategory = (value: string): value is ActorCategory =>
  (ACTOR_CATEGORIES as readonly string[]).includes(value);

/**
 * §1.1's table, in code. `mayWrite` is the only field anything branches on:
 * `ActorBase.tx()` refuses to open a transaction for a category that may not
 * write, so a read-only actor cannot acquire a write handle by accident. The
 * prose fields are documentation kept next to the value they describe.
 */
export type CategoryRule = {
  /** Whether this category may open a write transaction at all. */
  readonly mayWrite: boolean;
  /** What it may write, when it may write. */
  readonly writes: string;
  /** What it may read. */
  readonly reads: string;
  /** What the actor id means. */
  readonly keyedBy: string;
  /** What it holds in memory between turns. Always a cache (§1.3). */
  readonly cache: string;
};

export const CATEGORY_RULES = {
  entity: {
    mayWrite: true,
    writes: "its owned tables only",
    reads: "its owned tables (+ FK lookups via other actors)",
    keyedBy: "row id (or natural key)",
    cache: "its aggregate, loaded on activate",
  },
  collection: {
    mayWrite: false,
    writes: "nothing",
    reads: "any table, directly via Drizzle",
    keyedBy: "viewer id (or a scope id)",
    cache: "none, or short-lived",
  },
  search: {
    mayWrite: false,
    writes: "nothing",
    reads: "any table, directly via Drizzle; external APIs",
    keyedBy: "hash of all inputs",
    cache: "the result, idle-evicted",
  },
  view: {
    mayWrite: false,
    writes: "nothing",
    reads: "any table, directly via Drizzle",
    keyedBy: "viewer id",
    cache: "screen-shaped projection",
  },
  reference: {
    mayWrite: false,
    writes: "nothing (data changes by migration)",
    reads: "reference tables",
    keyedBy: "singleton",
    cache: "everything, loaded on activate",
  },
  job: {
    mayWrite: true,
    writes: "its own `jobs` row; everything else via entity actors",
    reads: "any table",
    keyedBy: "job id",
    cache: "progress cursor",
  },
} as const satisfies Record<ActorCategory, CategoryRule>;

export const mayWrite = (category: ActorCategory): boolean =>
  CATEGORY_RULES[category].mayWrite;
