/**
 * B7b — what a tier list's entries actually *are*, resolved for the prompt.
 *
 * ## The problem this exists to fix
 *
 * B7 shipped `InsightsGenerator` taking `TierListItemDto`s, which carry an
 * entry's **type and id** and nothing else. `ai/prompts.ts` therefore rendered
 * every ranked row as the bare word `place` or `wine`:
 *
 * ```
 * 1. [Outstanding, #1 in tier] place
 * 2. [Very Good, #1 in tier] place
 * ```
 *
 * and told the model, in the prompt, *"do not invent names, places or cuisines
 * that are not in the data"*. The six fields it then asks for — a palate
 * profile, blind spots, a hot take, an archetype — are all reads of **what the
 * person ranked**, and none of them is answerable from a band histogram. The
 * old Nhost function built the same six fields from names, cities, categories,
 * price levels, public ratings and editorial summaries.
 *
 * That is the consequence the row is about, and it is not "slightly worse
 * prose". Asked for a confident personality read with the identifying
 * information removed, a model does not abstain; it invents the list it wishes
 * it had been given. This is the same failure `item-defaults.ts` measured on
 * the running Ollama — a Château d'Yquem, vintage and all, at confidence 0.9,
 * from no input at all — arriving through a different door.
 *
 * ## How the data is obtained, and why this is not a new call edge
 *
 * `places` and the six item tables belong to `PlaceActor` and `ItemActor`.
 * §8.5 enumerates a closed set of synchronous entity→entity edges and this is
 * not one of them, so `TierListActor` does **not** call those actors. It reads
 * their tables directly, which §1.1 grants every actor ("May read: … + FK
 * lookups") and which `TierListActor.#friendshipsOf` and
 * `UserActor.#itemExists` already do for exactly this reason: the single-writer
 * rule is about writes. Nothing here writes.
 *
 * Reads are batched — one statement per entry type present, never one per row —
 * so a 50-entry list costs at most seven queries regardless of its mix.
 *
 * ## Which columns, and why not a hand-picked list
 *
 * For items the descriptive columns are taken from
 * `CONSTRAINED_ITEM_ATTRIBUTES` in `ai/vocabulary.ts` rather than typed out
 * again here. That table already names, per item type, the columns whose values
 * come from a closed vocabulary — `wines.style`, `wines.variety`,
 * `coffees.roast_level`, `sakes.category` — derived from `ITEM_TYPE_SPECS`,
 * whose columns `item-spec-schema.test.ts` holds against `information_schema`,
 * and each is read through its `ITEM_BINDINGS` property rather than by name. Those are also precisely the columns
 * worth showing a model: a closed vocabulary is a real signal about taste,
 * where free text is noise. An eleventh reference table added to that map
 * widens this descriptor for free.
 */
import type {
  ItemType,
  TierListEntryRef,
  TierListEntryType,
} from "@cellar-assistant/contracts";
import { ConflictError } from "@cellar-assistant/contracts";
import { placeGoogleEnrichments, places } from "@cellar-assistant/db";
import type { Column, SQL } from "@cellar-assistant/db/orm";
import { eq, getTableColumns, inArray, sql } from "@cellar-assistant/db/orm";
import { CONSTRAINED_ITEM_ATTRIBUTES } from "./ai/vocabulary.ts";
import type { DbOrTx } from "./db.ts";
import { boundProperty, ITEM_TABLES } from "./item-bindings.ts";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One labelled fact about an entry — `style: RED`, `category: wine_bar`.
 *
 * A list of labelled pairs rather than a per-type record so the prompt has one
 * rendering path for all seven entry types, and so widening a type's columns
 * never changes this module's exported shape.
 */
export type TierListEntryAttribute = {
  readonly label: string;
  readonly value: string;
};

/**
 * What an insights prompt is allowed to know about one ranked entry.
 *
 * Deliberately closed and small. Every field here is one the old Nhost prompt
 * consumed; nothing is carried "in case it is useful later", because an opaque
 * blob would put whatever a table happens to hold — `created_by_id`,
 * `barcode_code`, a `google_place_id` — into a third-party model's context.
 */
export type TierListEntryDescriptor = {
  readonly ref: TierListEntryRef;
  /**
   * `null` only when the referenced row could not be read. Every entry column
   * on `tier_list_items` is a foreign key with no `on delete` clause, so
   * Postgres refuses to delete a place or item that a list still ranks — this
   * is a torn-read guard, not an expected state.
   */
  readonly name: string | null;
  /** Place: its categories. Item: its closed-vocabulary columns. */
  readonly attributes: readonly TierListEntryAttribute[];
  /** `locality, region, country` for a place; `region, country` for an item. */
  readonly location: string | null;
  /** A place's editorial summary, or an item's own description. */
  readonly summary: string | null;
  /** Crowd consensus, places only — the old prompt's most load-bearing signal. */
  readonly publicRating: number | null;
  readonly publicRatingCount: number | null;
  readonly priceLevel: number | null;
};

/** `${type}:${id}`, the key `resolveTierListEntries` returns its map under. */
export const entryKey = (ref: TierListEntryRef): string =>
  `${ref.type}:${ref.id}`;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Trimmed text, or `null` — `""` and `"   "` are absence, not content. */
const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/** `numeric` arrives as a string from `pg`; `real`/`integer` as a number. */
const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const joinLocation = (...parts: readonly unknown[]): string | null => {
  const present = parts
    .map(text)
    .filter((part): part is string => part !== null);
  return present.length === 0 ? null : present.join(", ");
};

const attribute = (
  label: string,
  value: unknown,
): TierListEntryAttribute | null => {
  const resolved = text(value);
  return resolved === null ? null : { label, value: resolved };
};

const compact = (
  entries: readonly (TierListEntryAttribute | null)[],
): readonly TierListEntryAttribute[] =>
  entries.filter((entry): entry is TierListEntryAttribute => entry !== null);

/**
 * The Drizzle columns to read for one item type: `id`, `name`, `description`,
 * and every closed-vocabulary column `CONSTRAINED_ITEM_ATTRIBUTES` names.
 *
 * Keyed by the **answer field** (`style`, `spiritType`, `roastLevel`) rather
 * than the database column, so the label the model sees is the one the rest of
 * the AI layer already uses for that concept.
 */
const itemSelection = (
  type: ItemType,
): {
  /**
   * Wrapped as `SQL` rather than passed as bare `Column`s: Drizzle's
   * `SelectedFields` accepts a `string`-indexed record of `SQL`, but not one of
   * `Column` (a `Column` has no index signature, so the structural check
   * fails). `sql`${column}`` renders the identical identifier.
   */
  readonly fields: Record<string, SQL>;
  /** Kept separately and concretely typed, for `inArray` in the `where`. */
  readonly idColumn: Column;
  /** The attribute labels to read off each row, `country` excluded. */
  readonly labels: readonly string[];
} => {
  const table = ITEM_TABLES[type];
  const columns = getTableColumns(table) as Record<string, Column>;
  const byDatabaseName = new Map<string, Column>(
    Object.values(columns).map((column) => [column.name, column]),
  );
  const idColumn = table.id;

  const fields: Record<string, SQL> = {
    id: sql`${columns.id}`,
    name: sql`${columns.name}`,
    description: sql`${columns.description}`,
  };
  const labels: string[] = [];

  for (const constrained of CONSTRAINED_ITEM_ATTRIBUTES[type]) {
    // `country` is a core column, the rest are attributes with a binding.
    const property =
      constrained.on === "input"
        ? constrained.field
        : boundProperty(type, constrained.field);
    const column = columns[property];
    if (column === undefined) {
      // Unreachable: `ITEM_BINDINGS` only compiles against real properties.
      throw new ConflictError(
        `${type} has no row property ${property} for ${constrained.column}`,
      );
    }
    fields[constrained.field] = sql`${column}`;
    // `country` is read, but rendered as part of the location rather than as a
    // free-standing attribute — otherwise every entry says `country: FR` twice.
    if (constrained.field !== "country") labels.push(constrained.field);
  }
  // `region` is not a closed vocabulary, but it is the one free-text column the
  // old place prompt leant on hardest, and three item types have it.
  const region = byDatabaseName.get("region");
  if (region !== undefined) fields.region = sql`${region}`;

  return { fields, idColumn, labels };
};

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

const resolvePlaces = async (
  db: DbOrTx,
  ids: readonly string[],
): Promise<readonly TierListEntryDescriptor[]> => {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      displayName: places.displayName,
      categories: places.categories,
      primaryCategory: places.primaryCategory,
      locality: places.locality,
      region: places.region,
      countryCode: places.countryCode,
      priceLevel: places.priceLevel,
      rating: places.rating,
      reviewCount: places.reviewCount,
      description: places.description,
      googleRating: placeGoogleEnrichments.googleRating,
      googleRatingCount: placeGoogleEnrichments.googleUserRatingsTotal,
      googlePriceLevel: placeGoogleEnrichments.googlePriceLevel,
      googleSummary: placeGoogleEnrichments.googleEditorialSummary,
    })
    .from(places)
    .leftJoin(
      placeGoogleEnrichments,
      eq(placeGoogleEnrichments.placeId, places.id),
    )
    .where(inArray(places.id, [...ids]));

  return rows.map((row) => ({
    ref: { type: "PLACE" as TierListEntryType, id: row.id },
    name: text(row.displayName) ?? text(row.name),
    attributes: compact(
      (row.categories ?? [])
        .slice(0, 4)
        .map((value) => attribute("category", value)),
    ),
    location: joinLocation(row.locality, row.region, row.countryCode),
    // Google's editorial summary is what the old prompt called "what these
    // places are known for"; the Overture description is the fallback.
    summary: text(row.googleSummary) ?? text(row.description),
    publicRating: numeric(row.googleRating) ?? numeric(row.rating),
    publicRatingCount:
      numeric(row.googleRatingCount) ?? numeric(row.reviewCount),
    priceLevel: numeric(row.googlePriceLevel) ?? numeric(row.priceLevel),
  }));
};

const resolveItems = async (
  db: DbOrTx,
  type: ItemType,
  ids: readonly string[],
): Promise<readonly TierListEntryDescriptor[]> => {
  if (ids.length === 0) return [];
  const { fields, idColumn, labels } = itemSelection(type);
  const table = ITEM_TABLES[type];
  const rows = await db
    .select(fields)
    .from(table)
    .where(inArray(idColumn, [...ids]));

  return rows.map((row) => {
    const id = text(row.id) ?? "";
    return {
      ref: { type: type as TierListEntryType, id },
      name: text(row.name),
      attributes: compact(labels.map((label) => attribute(label, row[label]))),
      location: joinLocation(row.region, row.country),
      summary: text(row.description),
      // Items carry no crowd consensus in this schema. `check_ins` holds
      // personal scores, which is a different thing and is not this prompt's
      // business; leaving these null is honest rather than approximate.
      publicRating: null,
      publicRatingCount: null,
      priceLevel: null,
    };
  });
};

/**
 * Every entry a tier list ranks, described.
 *
 * Returns a map keyed by {@link entryKey}. An entry that could not be read is
 * simply absent from the map; callers render it as unresolved rather than
 * failing the whole generation over one torn read.
 */
export const resolveTierListEntries = async (
  db: DbOrTx,
  refs: readonly TierListEntryRef[],
): Promise<ReadonlyMap<string, TierListEntryDescriptor>> => {
  const byType = new Map<TierListEntryType, Set<string>>();
  for (const ref of refs) {
    const existing = byType.get(ref.type);
    if (existing === undefined) byType.set(ref.type, new Set([ref.id]));
    else existing.add(ref.id);
  }

  const batches = await Promise.all(
    [...byType.entries()].map(async ([type, ids]) =>
      type === "PLACE"
        ? await resolvePlaces(db, [...ids])
        : await resolveItems(db, type, [...ids]),
    ),
  );

  const resolved = new Map<string, TierListEntryDescriptor>();
  for (const batch of batches) {
    for (const descriptor of batch) {
      resolved.set(entryKey(descriptor.ref), descriptor);
    }
  }
  return resolved;
};

/* -------------------------------------------------------------------------- */
/* The abstention gate                                                         */
/* -------------------------------------------------------------------------- */

/**
 * How many entries must be describable before insights are worth asking for.
 *
 * The same number `TierListActor` skips under (`MIN_ITEMS_FOR_INSIGHTS`, the
 * old Nhost function's `MIN_ITEMS`), kept here so the actor's *count* gate and
 * this *substance* gate are one constant rather than two that can drift.
 */
export const MIN_GROUNDED_ENTRIES = 3;

/**
 * An entry the model can say something grounded about: it has a name, a note
 * the user wrote, or at least one vocabulary attribute.
 */
export const isSubstantive = (entry: {
  readonly name: string | null;
  readonly notes: string | null;
  readonly attributes: readonly TierListEntryAttribute[];
}): boolean =>
  entry.name !== null || entry.notes !== null || entry.attributes.length > 0;

/**
 * Refuse to ask for a personality read of a list nothing is known about.
 *
 * `requireExtractableInput` in `item-defaults.ts` is the precedent and the
 * reason: a model asked to characterise input it cannot see answers with a
 * confident invention rather than an abstention, and every one of the six
 * fields this prompt requests is phrased as a *finding*. A field listed in
 * `INSIGHTS_SCHEMA.required` compiles into the sampler's grammar, so "I could
 * not tell" is not a reachable completion for it — the refusal has to happen
 * before the call, not in the answer.
 *
 * `minimum` defaults to {@link MIN_GROUNDED_ENTRIES}, which is also the
 * constant `TierListActor` skips under, so the two gates cannot drift apart.
 */
export const requireGroundedEntries = (
  entries: readonly {
    readonly name: string | null;
    readonly notes: string | null;
    readonly attributes: readonly TierListEntryAttribute[];
  }[],
  minimum: number = MIN_GROUNDED_ENTRIES,
): void => {
  const grounded = entries.filter(isSubstantive).length;
  if (grounded >= minimum) return;
  throw new ConflictError(
    `this tier list has ${entries.length} entr${entries.length === 1 ? "y" : "ies"} ` +
      `but only ${grounded} that carry a name, a note or a known attribute, and ` +
      `insights need at least ${minimum}. Every field the insights prompt asks ` +
      "for is a claim about what was ranked; asked for one with the entries " +
      "stripped out, a model invents a list rather than abstaining (see " +
      "requireExtractableInput in lib/item-defaults.ts for the measurement " +
      "that established this). Nothing was written and nothing was consumed.",
  );
};
