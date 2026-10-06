/**
 * Query-cost controls for the public GraphQL surface.
 *
 * ## What this exists to stop
 *
 * Measured against this service before these limits landed: **1000 aliases of
 * `cellar(id:)` in one unauthenticated POST returned 200 OK in 0.21 s**. There
 * was no depth limit, no breadth limit, no complexity limit, no parser bound
 * and no body cap. `MAX_PAGE_SIZE = 100` is enforced at every connection site
 * and does not help here: it caps **rows per field**, and aliasing multiplies
 * *fields*, so a document can ask for a thousand capped pages and never touch
 * it.
 *
 * The sharpest instance costs money rather than CPU. `itemSearch(text:)`
 * reaches `EmbeddingActor.embed`, so N aliases of it in one request is N model
 * inferences — and so do a couple of dozen other fields, mutations included,
 * some inline and some through work they enqueue ({@link MODEL_BACKED_FIELDS}
 * lists them, and a test derives that list from source). When this file was
 * written nothing metered them. Since
 * `811cad82` every model call, embeddings included, is charged to
 * `BudgetActor` before it runs (`services/actors/src/lib/ai/seams.ts`; the caps
 * are `MODEL_SPENDERS` in `budget-actor.ts`). That gate is monthly and global
 * per seam, so it bounds the bill and not one request.
 * {@link MAX_MODEL_BACKED_FIELDS} is the per-request bound: it stops a single
 * document from spending a slice of everyone's monthly embedding allowance on
 * its own.
 *
 * ## Why these numbers
 *
 * Every limit below is calibrated against **the client's own documents**, which
 * are the only queries that have to keep working. Every `graphql()` body in
 * `services/client/src` was parsed, their fragment spreads inlined, and the
 * composed operations measured — 116 operations, nothing unresolved. The widest
 * and deepest real documents are named on each constant so that a future change
 * can re-derive the headroom instead of guessing at it. `client-documents.test.ts`
 * now repeats that measurement on every run, against the real limits, so a
 * limit tightened past a real document fails there by operation name.
 *
 * The body and fragment *counts* are deliberately not repeated here: they were
 * 158 and 42 when this table was first measured and 153 and 37 at `5adc5f64`,
 * because `a544aea7` retired `TYPED_ERROR_FRAGMENTS` in between. The operation
 * count and the maxima are what the limits stand on; a body count is a fact
 * about one commit's client.
 *
 * | limit                      | client's worst | chosen | headroom |
 * | -------------------------- | -------------- | ------ | -------- |
 * | depth                      | 10             | 15     | 1.5x     |
 * | root fields (aliases)      | 10             | 30     | 3x       |
 * | field nodes                | 145            | 1000   | ~7x      |
 * | model-backed fields        | 1              | 4      | 4x       |
 * | rows asked for             | 1000           | 10000  | 10x      |
 * | parser tokens              | 349            | 6000   | ~17x     |
 *
 * Five of the six count the *document*. {@link MAX_QUERY_ROWS} is the one that
 * counts what the document asks the backend for, and it was added after a
 * 337-byte query that passed all the others returned 53 MiB — see its docblock
 * for the measurement. The structural limits are graphql-js validation rules,
 * so they run **before execution** and cost one AST walk. The token bound runs
 * earlier still, inside `parse`, because a body large enough to hurt does its
 * damage in the lexer before any rule sees it. The body cap (see `index.ts`)
 * runs earliest of all, on the raw request.
 *
 * Deliberately *not* here: rate limiting, which needs shared state this
 * process does not have (it is horizontally scaled and holds no Redis handle),
 * and response-size accounting. The rate limits live in `services/actors`,
 * which owns that state — not at an edge: per client address on the auth
 * routes, via better-auth's limiter keyed on the real client
 * (`services/actors/src/auth/client-ip.ts`; the Next proxy vouches for the
 * address with `AUTH_PROXY_SECRET`), and per user on every paid seam, via
 * `BudgetActor`'s hourly and daily caps (`USER_CAPS`, `BUDGET_USER_CAPS`)
 * ahead of its global ones. A GraphQL request that reaches no paid seam is
 * bounded by the limits in this file and nothing per-client.
 */
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@cellar-assistant/contracts";
import type {
  ASTVisitor,
  FieldNode,
  FragmentDefinitionNode,
  GraphQLField,
  GraphQLFieldMap,
  GraphQLNamedType,
  GraphQLSchema,
  OperationDefinitionNode,
  SelectionSetNode,
  ValidationContext,
} from "graphql";
import {
  GraphQLError,
  getNamedType,
  isAbstractType,
  isInterfaceType,
  isObjectType,
  Kind,
  parse as parseGraphQL,
} from "graphql";
import type { Plugin } from "graphql-yoga";

/**
 * Deepest nesting of *fields* in one operation, fragment spreads inlined.
 *
 * The client's deepest documents are `query TierList` and
 * `mutation ReorderTierListBand` (both `services/client/src/lib/api/tier-lists.ts`),
 * at **10**. 15 leaves room for one more nested fragment layer.
 *
 * It used to say here that 15 also stopped the recursive blow-up —
 * "`Item -> brand -> items -> brand -> ...` is the shape this stops, and it
 * stops being affordable long before 15". **It does not, and never did.**
 * Three levels of `Item -> checkIns -> item -> checkIns` is depth 13, and
 * measured at 53 MiB. Depth bounds how *long* the chain may be; what it costs
 * is the product of the page sizes along it, which is {@link MAX_QUERY_ROWS}'s
 * job and nothing else's.
 */
export const MAX_QUERY_DEPTH = 15;

/**
 * Fields selected directly on `Query`/`Mutation` — i.e. how many aliases of a
 * root field one document may carry. **This is the limit that answers the
 * 1000-alias probe.**
 *
 * The client's widest is `query ReferenceOptions` at **10** aliased
 * `referenceData` reads (`services/client/src/lib/api/items.ts`), followed by
 * `query PlacesById` at 8. `PlacesById` is *deliberately* fixed at eight and
 * `PlaceExplorer.tsx` chunks its ids in slices of eight to match, for the
 * reason its own docblock gives — "a wide alias fan-out is a wide blast
 * radius", since one bad alias nulls the whole document. So root breadth here
 * is architecturally bounded rather than incidentally small, and 30 is three
 * times the widest thing that exists.
 */
export const MAX_ROOT_FIELDS = 30;

/**
 * Total field nodes in one operation, fragment spreads inlined and counted
 * once per spread site. A blunt complexity proxy, and the backstop for aliasing
 * that happens *below* the root where {@link MAX_ROOT_FIELDS} cannot see it.
 *
 * The client's largest is `query PlacesById` at 136 static field nodes; URQL
 * injects `__typename` into every selection set on the wire, which takes it to
 * ~145. `query ItemDetail` is 116 static / ~136 inflated. 1000 is roughly seven
 * times the worst real document and still an order of magnitude under the
 * ~3000 nodes the 1000-alias probe carried.
 */
export const MAX_FIELD_NODES = 1000;

/** One entry of {@link MODEL_BACKED_FIELDS}. */
export type ModelBackedField = {
  /**
   * The actor methods this field's resolver calls that reach a model — inline,
   * or through work they enqueue. `model-backed-fields.test.ts` derives these
   * from source and fails when an entry and the code disagree. Each also
   * carries `modelBacked: true` on its descriptor in
   * `@cellar-assistant/contracts`, held to the same derivation.
   */
  readonly via: readonly string[];
  /**
   * The field reaches a model only when this argument is given, and is charged
   * only then. A variable counts as given: its value is unknown at validation
   * time, and a cost limit may only be wrong by over-charging.
   */
  readonly onlyWithArgument?: string;
};

/**
 * Fields, by schema coordinate, whose resolver can start a model inference.
 *
 * ## It used to be three names, and that was the defect
 *
 * This was a hand-written set of `itemSearch`, `cellarItemSearch` and
 * `recipeSearch`, and it went stale without anything noticing. `placeSearch`
 * embeds its query on every call, and 25 aliased copies passed. One request of
 * 8 aliased `createRecipe` produced 8 embedding calls through the
 * `regenerateVector` each enqueues, and the root-field limit alone would have
 * allowed 30. `startItemOnboarding` runs a vision model inside the request,
 * `createPlace` an LLM review.
 *
 * So the list is no longer remembered. `model-backed-fields.test.ts` reads
 * the actors — every public method, through `this.` calls, constructor-injected
 * seams, `invokeActorMethod` hops and `enqueueOutbox` targets, down to the
 * seven seams the `SEAMS` table wires — and then the resolvers, and requires
 * this map to equal what it finds, `via` included. A new field that reaches a model
 * fails that test until it is listed here; an entry that stops reaching one
 * fails it too. That file's header says what the analysis cannot see.
 *
 * ## What is on it
 *
 *  - **Search** — `itemSearch`, `cellarItemSearch`, `recipeSearch`,
 *    `placeSearch`, and `Cellar.items` when given `semanticQuery`: each embeds
 *    its phrase through `EmbeddingActor` inside the request. `brandSearch` and
 *    `userSearch` are trigram lookups and are not here.
 *  - **Vision and LLM calls inside the request** — `startItemOnboarding`
 *    (`item_defaults`), `createPlace` (`place_review`).
 *  - **Vision and LLM calls it enqueues** — `createMenuScan` (menu extraction,
 *    then match verification), `startRecipePhotoJob` (`recipe_photo`), and the
 *    three tier-list edits that enqueue `generateInsights`.
 *  - **Embeddings it enqueues** — every write that enqueues an item's or a
 *    recipe's `regenerateVector`, directly or by recomputing a recipe group's
 *    canonical member.
 *
 * Coordinates rather than bare names, so a field of the same name on another
 * type is not charged by accident; `modelBackedEntry` also checks a field's
 * interfaces and possible types, so a coordinate is found whichever way a
 * document reaches it.
 *
 * ## The limit
 *
 * No client document selects more than **one** of these —
 * `client-documents.test.ts` checks every one of them against
 * {@link MAX_MODEL_BACKED_FIELDS} on each run. Four is generous and still turns
 * "one inference per alias, up to the root-field limit" into four.
 *
 * What it does not bound: the monthly spend (that is `BudgetActor`), and
 * repeats of one phrase (`EmbeddingActor` is keyed by the text and caches its
 * vector, so it is distinct phrases that cost).
 */
export const MODEL_BACKED_FIELDS: ReadonlyMap<string, ModelBackedField> =
  new Map<string, ModelBackedField>([
    // Search: an embedding inside the request.
    ["Query.itemSearch", { via: ["ItemSearchActor.results"] }],
    ["Query.cellarItemSearch", { via: ["CellarItemSearchActor.results"] }],
    ["Query.recipeSearch", { via: ["RecipeSearchActor.results"] }],
    ["Query.placeSearch", { via: ["PlaceSearchActor.results"] }],
    [
      "Cellar.items",
      { via: ["CellarActor.items"], onlyWithArgument: "semanticQuery" },
    ],
    // A vision or LLM call inside the request.
    ["Mutation.startItemOnboarding", { via: ["ItemOnboardingActor.start"] }],
    ["Mutation.createPlace", { via: ["PlaceCreationActor.createPlace"] }],
    // A vision or LLM call it enqueues.
    ["Mutation.createMenuScan", { via: ["MenuScanActor.create"] }],
    ["Mutation.startRecipePhotoJob", { via: ["RecipePhotoJobActor.start"] }],
    ["Mutation.addTierListItem", { via: ["TierListActor.addItem"] }],
    ["Mutation.removeTierListItem", { via: ["TierListActor.removeItem"] }],
    ["Mutation.reorderTierListBand", { via: ["TierListActor.reorderBand"] }],
    // An embedding it enqueues (`regenerateVector`).
    ["Mutation.createItem", { via: ["ItemActor.create"] }],
    ["Mutation.updateItem", { via: ["ItemActor.update"] }],
    // The same, when the configured embedding takes images: the item's
    // newest image is one of its vector's inputs.
    ["Mutation.attachItemImage", { via: ["ItemActor.attachImage"] }],
    ["Mutation.detachItemImage", { via: ["ItemActor.detachImage"] }],
    [
      "Mutation.confirmItemOnboarding",
      { via: ["ItemOnboardingActor.confirm"] },
    ],
    ["Mutation.createRecipe", { via: ["RecipeActor.create"] }],
    ["Mutation.updateRecipe", { via: ["RecipeActor.update"] }],
    ["Mutation.setRecipeIngredients", { via: ["RecipeActor.setIngredients"] }],
    [
      "Mutation.setRecipeInstructions",
      { via: ["RecipeActor.setInstructions"] },
    ],
    ["Mutation.deleteRecipe", { via: ["RecipeActor.delete"] }],
    ["Mutation.updateRecipeGroup", { via: ["RecipeGroupActor.update"] }],
    ["Mutation.voteOnRecipe", { via: ["RecipeGroupActor.vote"] }],
    ["Mutation.removeRecipeVote", { via: ["RecipeGroupActor.removeVote"] }],
  ]);

/** Field names that appear in any coordinate — the cheap first test. */
const MODEL_BACKED_NAMES: ReadonlySet<string> = new Set(
  [...MODEL_BACKED_FIELDS.keys()].map((coordinate) =>
    coordinate.slice(coordinate.indexOf(".") + 1),
  ),
);

/** @see MODEL_BACKED_FIELDS */
export const MAX_MODEL_BACKED_FIELDS = 4;

/**
 * Lexer tokens per document, enforced inside `parse` by graphql-js itself.
 *
 * This is the bound that matters for a large body: a validation rule only runs
 * on an AST that already exists, so parsing is where an oversized document is
 * actually paid for. The client's largest composed wire document is
 * `query ReferenceOptions` at **349 tokens / 2681 bytes** (operation plus every
 * fragment it spreads). 6000 is ~17x that, and below the 7995 tokens that
 * *every* client document concatenated would cost — a number no single request
 * can legitimately approach.
 */
export const MAX_PARSE_TOKENS = 6000;

/**
 * Result nodes one operation may ask the backend for, summed over every
 * connection in it and **multiplied down the nesting**.
 *
 * ## The hole this closes
 *
 * Every other limit here counts *the document*. None of them counts what the
 * document asks the database for, and `MAX_PAGE_SIZE = 100` is per field, so
 * capped pages nest inside capped pages and the product is bounded by nothing.
 * The docblock at the top of this file claimed depth was enough — "`Item ->
 * brand -> items -> brand -> ...` is the shape this stops, and it stops being
 * affordable long before 15". That was wrong, and the measurement is the
 * reason this constant exists.
 *
 * Measured against `cellar-stack` as `test@test.com`, with 100 check-ins on
 * one wine and the `Item -> checkIns -> item -> checkIns` cycle the schema
 * already allows — three legal levels, depth 13, 30 field nodes, one root
 * field, request body **337 bytes**:
 *
 * | levels | nodes returned | response  | time   | old verdict |
 * | ------ | -------------- | --------- | ------ | ----------- |
 * | 1      | 100            | 5.5 KB    | 0.014s | 200 OK      |
 * | 2      | 10,100         | 559 KB    | 0.15s  | 200 OK      |
 * | 3      | 1,010,100      | **53 MiB**| 12.2s  | 200 OK      |
 *
 * The same three shapes with `first: 1` return 150 bytes and are charged
 * *exactly the same* by every limit above — which is the defect stated
 * precisely: the cost function cannot see the one number the attacker is
 * turning. A fourth level is refused, but by `MAX_QUERY_DEPTH`, incidentally,
 * and only on this particular cycle.
 *
 * ## The hole *that* left open
 *
 * The walk above was proved against a single chain with uniform page sizes —
 * one connection nested three times, every level at the same `first` — and the
 * charge site read `if (rows > context.multiplier)`, which is `pageSize > 1`.
 * A connection asked for `first: 1` was therefore charged **nothing**, and each
 * *aliased* copy of it was charged nothing again. Aliases below the root are
 * bounded only by {@link MAX_FIELD_NODES}, so:
 *
 * ```graphql
 * myCellars(first: 50) { … items(first: 50) { … item {
 *   k0: checkIns(first: 1) { … }   # …and 200 more of these
 * } } }
 * ```
 *
 * Measured against `cellar-stack`: that document was **200 OK**, while the
 * byte-identical one at `first: 2` was refused at 52,550 rows. Pushed to one
 * `first: 99` level and ~247 aliases it returned **2,455,300 rows** for a
 * charge of ~10,000. The fix is one clause — charge a field because the schema
 * *pages* it, not because its page happens to be wider than one row — and
 * `pageSizeOf` answers that question out of band so the two cases stop sharing
 * the value 1.
 *
 * ## The number
 *
 * Calibrated the way the table at the top of this file was, and **re-derived
 * under the corrected charge**: every `graphql()` body in `services/client/src`
 * parsed, fragments inlined, and the composed operations costed by the same
 * function this rule uses (153 bodies, 116 operations, 37 fragments, nothing
 * unresolved, at `5adc5f64` with a clean `services/client`).
 *
 * The client's worst is **1000**, unchanged — `query ReferenceOptions`, ten
 * aliased `referenceData` reads at `first: 100` — then `ItemDetail` at 400.
 * Charging `first: 1` moved **8 of the 116**, none by more than 3x and none
 * above 300: `TierList`, `TierListItemPicker`, `ReorderTierListBand`,
 * `Rankings` and `MyFavorites` go 100 → 300, `ItemSearch` 100 → 200. All six
 * are the same real pattern — `images(first: 1)` for a thumbnail and
 * `brands(first: 1)` for the maker, on every row of a page — which is what
 * `first: 1` is legitimately for, and which does genuinely return one row per
 * parent. 10,000 is ten times the widest real document, in line with the
 * 1.5x–17x headroom the other five carry, and it turns the 53 MiB worst case
 * above into roughly 550 KB at the ~55 bytes per node those same measurements
 * give.
 */
export const MAX_QUERY_ROWS = 10_000;

/**
 * Request body bytes. The largest legitimate body is a composed document
 * (~2.7 KB) plus its variables; the only large variable in the schema is
 * `itemSearch(vector:)`, a 768-float embedding, at roughly 15 KB of JSON.
 * 128 KiB clears both by a wide margin and still refuses the 100 KB the
 * 1000-alias probe weighed.
 *
 * **It is not enforced on the raw stream**, whatever this comment used to say.
 * `index.ts` reads `Content-Length` and lets a request through when there is
 * none — which its own docblock has always been explicit about, so the claim
 * here was the only place that read as though the cap were a measurement.
 * Measured on the compose stack: a 50 MB body is refused in 1.5ms when it
 * declares a length and accepted in 0.21s when it is sent chunked. The
 * streaming half is `client_max_body_size 128k;` in
 * `infra/nginx-proxy/vhost.d/edge.conf` on the host's nginx-proxy, which counts
 * chunked bytes too (measured: a 200 KiB chunked POST is a 413 there,
 * docs/architecture/deploy-loki.md §8).
 */
export const MAX_BODY_BYTES = 128 * 1024;

export type CostLimits = {
  readonly maxDepth: number;
  readonly maxRootFields: number;
  readonly maxFieldNodes: number;
  readonly maxModelBackedFields: number;
  readonly maxQueryRows: number;
  readonly maxParseTokens: number;
};

export const DEFAULT_COST_LIMITS = {
  maxDepth: MAX_QUERY_DEPTH,
  maxRootFields: MAX_ROOT_FIELDS,
  maxFieldNodes: MAX_FIELD_NODES,
  maxModelBackedFields: MAX_MODEL_BACKED_FIELDS,
  maxQueryRows: MAX_QUERY_ROWS,
  maxParseTokens: MAX_PARSE_TOKENS,
} as const satisfies CostLimits;

/**
 * What one selection set costs, measured **once** and independent of where it
 * is used.
 *
 * Every count is relative to the selection set itself, so a fragment's cost can
 * be computed on its first spread and reused at every later one: `depth` adds
 * to the depth of the spread site, `rows` scales by the product of the pages
 * above it, and the rest add as they are. That is what makes the walk linear in
 * the document — see {@link fragmentCost} for the measurement that made it
 * necessary.
 */
type Cost = {
  /** Field levels at and below this selection set: `{ a { b } }` is 2. */
  readonly depth: number;
  /** Field nodes, a fragment's counted once per spread site. */
  readonly fieldNodes: number;
  /**
   * Fields selected directly on this set's own type, with fragment spreads and
   * inline fragments transparent. On an operation, that is its root fields.
   */
  readonly ownFields: number;
  readonly modelBackedFields: number;
  /** The {@link MODEL_BACKED_FIELDS} coordinates behind `modelBackedFields`. */
  readonly modelBackedCoordinates: ReadonlySet<string>;
  /**
   * Rows asked for with every enclosing page one row wide. The caller scales
   * it by the product of the page sizes above the set.
   */
  readonly rows: number;
};

const NONE: ReadonlySet<string> = new Set();

const NOTHING: Cost = {
  depth: 0,
  fieldNodes: 0,
  ownFields: 0,
  modelBackedFields: 0,
  modelBackedCoordinates: NONE,
  rows: 0,
};

/**
 * `a ∪ b`, allocating only when both have something — nearly every selection
 * set has no model-backed field, so nearly every union is free.
 */
const union = (
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): ReadonlySet<string> =>
  b.size === 0 ? a : a.size === 0 ? b : new Set([...a, ...b]);

/**
 * The {@link MODEL_BACKED_FIELDS} coordinate a selection of `fieldName` on
 * `parentType` resolves through, if any.
 *
 * Not just `Parent.field`: a field selected through an interface runs the
 * implementing type's resolver, and one selected on an object type may be
 * declared on an interface it implements. Both are looked for, so a
 * coordinate is charged whichever way a document reaches it.
 */
const modelBackedEntry = (
  schema: GraphQLSchema,
  parentType: GraphQLNamedType | undefined,
  fieldName: string,
): [string, ModelBackedField] | undefined => {
  if (parentType === undefined || !MODEL_BACKED_NAMES.has(fieldName)) {
    return undefined;
  }
  const candidates: GraphQLNamedType[] = [parentType];
  if (isObjectType(parentType)) candidates.push(...parentType.getInterfaces());
  if (isAbstractType(parentType)) {
    candidates.push(...schema.getPossibleTypes(parentType));
  }
  for (const candidate of candidates) {
    const coordinate = `${candidate.name}.${fieldName}`;
    const entry = MODEL_BACKED_FIELDS.get(coordinate);
    if (entry !== undefined) return [coordinate, entry];
  }
  return undefined;
};

/** Whether `field` passes `argument` anything but a literal `null`. */
const supplies = (field: FieldNode, argument: string): boolean =>
  field.arguments?.some(
    (arg) => arg.name.value === argument && arg.value.kind !== Kind.NULL,
  ) ?? false;

/**
 * How many rows one selection of `field` may return, given what the schema
 * says it accepts — or `undefined` when the field is not a paged one at all.
 *
 * **`undefined` rather than 1, and that distinction is the whole of the defect
 * this function shipped with.** A field that selects one object and a
 * connection asked for `first: 1` both return one row *per parent*, so both
 * multiply the walk by 1 — but only the second is a page, and only the second
 * has to be charged for the rows it returns (see {@link walk}). Collapsing the
 * two onto the same `1` made "is this a page?" unanswerable downstream, and the
 * caller's test for it — `rows > multiplier` — silently answered "no" for every
 * `first: 1` connection in the document. Returning a value out of band makes
 * the two cases distinguishable by type instead of by arithmetic.
 *
 * The paged cases, and the third is the one a syntactic rule would miss:
 *
 *  - **`first: <int>`** — that, capped at {@link MAX_PAGE_SIZE}, because
 *    `pageArgs` refuses anything larger at execution time anyway.
 *  - **paged, but `first` omitted or given as a variable** — the worst the
 *    server will honour. Omitted means {@link DEFAULT_PAGE_SIZE}; a variable
 *    has no value at validation time, so it is costed at `MAX_PAGE_SIZE`.
 *    Without this branch the whole limit is opt-in: leave `first` off every
 *    level and a three-deep cycle still asks for 20³ rows for free.
 *  - **`first: 0`, or negative** — 1, not 0. `pageArgs` throws
 *    `first must be a positive integer` on both, so the document never reaches
 *    the database; costing it at 0 would be the one arrangement under which a
 *    connection could appear in a document for free, and this rule has already
 *    been bitten once by a page size that rounded down to "free".
 *
 * `fieldDef` is undefined for a field the schema does not have. That document
 * is `FieldsOnCorrectTypeRule`'s to reject; treating it as unpaged keeps this
 * rule from inventing a second error about it. It is also how `__typename`,
 * `__schema` and `__type` land here — meta-fields are not in `getFields()` —
 * and they read no rows, so unpaged is the right answer for them too.
 *
 * `last`/`before` need no branch: they are in the schema because Relay puts
 * them there, and `toPageArgs` (`schema/pagination.ts`) throws on either, so
 * backward paging cannot be used to ask for rows this function cannot see.
 */
const pageSizeOf = (
  field: FieldNode,
  fieldDef: GraphQLField<unknown, unknown> | undefined,
): number | undefined => {
  if (fieldDef === undefined) return undefined;
  if (!fieldDef.args.some((arg) => arg.name === "first")) return undefined;
  const first = field.arguments?.find((arg) => arg.name.value === "first");
  if (first === undefined) return DEFAULT_PAGE_SIZE;
  if (first.value.kind !== Kind.INT) return MAX_PAGE_SIZE;
  const value = Number(first.value.value);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, MAX_PAGE_SIZE);
};

/** The fields a type offers, or none — unions offer only inline fragments. */
const fieldsOf = (
  type: GraphQLNamedType | undefined,
): GraphQLFieldMap<unknown, unknown> =>
  type !== undefined && (isObjectType(type) || isInterfaceType(type))
    ? type.getFields()
    : {};

/**
 * Everything one document's walk shares, across all of its operations.
 *
 * A type is `undefined` once the walk leaves the part of the document the
 * schema recognises — a misspelt field, or a fragment on a type that does not
 * exist. Everything below that point costs 1, because guessing would be the
 * one way this rule could reject a document graphql-js would have accepted.
 */
type Walk = {
  readonly schema: GraphQLSchema;
  readonly fragments: ReadonlyMap<string, FragmentDefinitionNode>;
  /** Each fragment's cost, computed on its first spread. */
  readonly costs: Map<string, Cost>;
  /** Fragments whose cost is being computed right now — the cycle guard. */
  readonly open: Set<string>;
};

const typeCondition = (
  walk: Walk,
  parentType: GraphQLNamedType | undefined,
  name: string | undefined,
): GraphQLNamedType | undefined =>
  name === undefined ? parentType : (walk.schema.getType(name) ?? undefined);

/**
 * Measures one selection set, fragment spreads inlined.
 *
 * Inline fragments and fragment spreads are transparent to *depth* (they select
 * no field of their own) but their fields count towards `fieldNodes`, which is
 * the convention `graphql-depth-limit` established and the one the calibration
 * above was measured with.
 */
const measure = (
  selectionSet: SelectionSetNode,
  parentType: GraphQLNamedType | undefined,
  walk: Walk,
): Cost => {
  let depth = 0;
  let fieldNodes = 0;
  let ownFields = 0;
  let modelBackedFields = 0;
  let modelBackedCoordinates = NONE;
  let rows = 0;

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      fieldNodes += 1;
      ownFields += 1;
      depth = Math.max(depth, 1);
      const modelBacked = modelBackedEntry(
        walk.schema,
        parentType,
        selection.name.value,
      );
      if (
        modelBacked !== undefined &&
        (modelBacked[1].onlyWithArgument === undefined ||
          supplies(selection, modelBacked[1].onlyWithArgument))
      ) {
        modelBackedFields += 1;
        modelBackedCoordinates = union(
          modelBackedCoordinates,
          new Set([modelBacked[0]]),
        );
      }
      const fieldDef = fieldsOf(parentType)[selection.name.value];
      // A page nested inside a page is charged for the product and not for
      // the larger of the two — the rows below this field are scaled by its
      // page size. This is the whole of the row limit.
      //
      // **Every page is charged; only pages are charged.** The test used to be
      // `rows > multiplier`, which is `pageSize > 1` — right for the half of
      // the intent it could see (an unpaged field selects one object per
      // parent and must not be charged again for its parent's page) and wrong
      // for the other half, because a connection at `first: 1` also has
      // `pageSize === 1` and so was charged **nothing**. Each *aliased* copy of
      // it independently returns up to one row per parent, and aliases below
      // the root are bounded only by `MAX_FIELD_NODES`, so the cheapest bypass
      // was to write `first: 1` and repeat it. Measured on `cellar-stack`:
      // `myCellars(first: 50) { items(first: 50) { item { k0..k9: checkIns
      // (first: 1) } } }` was accepted at a charge of 0 for all ten aliases,
      // while the byte-identical document at `first: 2` was refused at 52,550.
      // `pageSizeOf` now answers "is this a page?" out of band, so the two
      // cases stop sharing the value 1.
      const pageSize = pageSizeOf(selection, fieldDef);
      if (pageSize !== undefined) rows += pageSize;
      if (selection.selectionSet !== undefined) {
        const below = measure(
          selection.selectionSet,
          fieldDef === undefined ? undefined : getNamedType(fieldDef.type),
          walk,
        );
        depth = Math.max(depth, 1 + below.depth);
        fieldNodes += below.fieldNodes;
        modelBackedFields += below.modelBackedFields;
        modelBackedCoordinates = union(
          modelBackedCoordinates,
          below.modelBackedCoordinates,
        );
        rows += (pageSize ?? 1) * below.rows;
      }
      continue;
    }

    const inner =
      selection.kind === Kind.INLINE_FRAGMENT
        ? measure(
            selection.selectionSet,
            typeCondition(
              walk,
              parentType,
              selection.typeCondition?.name.value,
            ),
            walk,
          )
        : fragmentCost(selection.name.value, walk);
    depth = Math.max(depth, inner.depth);
    fieldNodes += inner.fieldNodes;
    ownFields += inner.ownFields;
    modelBackedFields += inner.modelBackedFields;
    modelBackedCoordinates = union(
      modelBackedCoordinates,
      inner.modelBackedCoordinates,
    );
    rows += inner.rows;
  }

  return {
    depth,
    fieldNodes,
    ownFields,
    modelBackedFields,
    modelBackedCoordinates,
    rows,
  };
};

/**
 * One fragment's cost: computed on its first spread, reused at every other.
 *
 * ## Why it is cached
 *
 * This walk used to re-walk a fragment at every spread site, and only stopped
 * at cycles. A document can spread the same fragment twice from each of a
 * chain of fragments — `fragment F0 on Query { ...F1 ...F1 }`, `F1` spreading
 * `F2` twice, and so on — and then the walk visits the last one 2^n times. It
 * is not a cycle, so nothing stopped it, and it ran on the event loop.
 * Measured before this cache, unauthenticated against `cellar-stack` at
 * `162bbffd`: n = 14 in 0.046s, n = 17 in 0.12s, n = 20 in 0.49s, and a
 * reviewer saw n = 23 take 2–4s while a concurrent `{ __typename }` waited
 * 3.77s behind it. The body was
 * about 1 KB, far under the token and byte caps, and changing one byte of it
 * defeats Yoga's validation cache. graphql-js's own rules validate the same
 * document in under a millisecond.
 *
 * The *charge* is unchanged: each spread site still adds the whole fragment,
 * because a fragment spread twice is executed twice (see "charges one fragment
 * spread once per spread site" in `limits.test.ts`). What changed is that the
 * fragment is walked once and its cost added at each site, so the doubling
 * document is correctly charged 2^n field nodes — and refused — for the work
 * of walking n fragments.
 *
 * ## Cycles
 *
 * `open` is the cycle guard: a spread of a fragment that is still being
 * measured counts nothing. graphql-js has `NoFragmentCyclesRule` in its
 * specified rules, but every rule in a `validate()` call visits the same
 * document in parallel — a cyclic document still reaches this walk, and an
 * unguarded recursion would hang the process rather than report the cycle.
 * A fragment measured inside a cycle is cached without the part the guard cut
 * off, so a cyclic document is under-charged here. That document never
 * executes — `NoFragmentCyclesRule` refuses it — so what matters is that the
 * walk ends, and quickly.
 */
const fragmentCost = (name: string, walk: Walk): Cost => {
  const cached = walk.costs.get(name);
  if (cached !== undefined) return cached;
  const fragment = walk.fragments.get(name);
  // An undefined spread is `KnownFragmentNamesRule`'s error to report, not
  // ours; skipping it keeps one bad document from producing two errors.
  if (fragment === undefined || walk.open.has(name)) return NOTHING;
  walk.open.add(name);
  const cost = measure(
    fragment.selectionSet,
    typeCondition(walk, undefined, fragment.typeCondition.name.value),
    walk,
  );
  walk.open.delete(name);
  walk.costs.set(name, cost);
  return cost;
};

const describe = (operation: OperationDefinitionNode): string =>
  operation.name === undefined
    ? `The ${operation.operation}`
    : `${operation.operation} ${operation.name.value}`;

/**
 * A count as a refusal states it. A document can multiply a fragment past
 * 2^53, where a double stops holding every integer — and the row product can
 * pass `Number.MAX_VALUE` into `Infinity` — so past that point the message
 * says so instead of printing a rounded or infinite number as though it were
 * a measurement.
 */
const count = (value: number): string =>
  Number.isSafeInteger(value)
    ? String(value)
    : `more than ${Number.MAX_SAFE_INTEGER}`;

/**
 * The validation rule. Reports every limit an operation breaks, rather than the
 * first, so one round trip tells a client everything it has to change.
 *
 * Messages follow the house style A7c set for the page-size cap — say the
 * number, say the limit, say what to do — because "Unexpected error" on a limit
 * a client cannot see is exactly the defect that report was about.
 */
export const queryCostRule =
  (limits: CostLimits = DEFAULT_COST_LIMITS) =>
  (context: ValidationContext): ASTVisitor => ({
    Document: {
      enter(document) {
        const fragments = new Map<string, FragmentDefinitionNode>();
        for (const definition of document.definitions) {
          if (definition.kind === Kind.FRAGMENT_DEFINITION) {
            fragments.set(definition.name.value, definition);
          }
        }

        // One cache for the whole document: a fragment costs the same in
        // every operation that spreads it.
        const schema = context.getSchema();
        const walk: Walk = {
          schema,
          fragments,
          costs: new Map<string, Cost>(),
          open: new Set<string>(),
        };

        for (const definition of document.definitions) {
          if (definition.kind !== Kind.OPERATION_DEFINITION) continue;

          const measurement = measure(
            definition.selectionSet,
            definition.operation === "mutation"
              ? (schema.getMutationType() ?? undefined)
              : definition.operation === "subscription"
                ? (schema.getSubscriptionType() ?? undefined)
                : (schema.getQueryType() ?? undefined),
            walk,
          );
          const rootFields = measurement.ownFields;
          const subject = describe(definition);

          if (measurement.depth > limits.maxDepth) {
            context.reportError(
              new GraphQLError(
                `${subject} is ${count(measurement.depth)} levels deep; the limit is ${limits.maxDepth}. ` +
                  "Split the request or stop following the nested relation.",
                { nodes: definition, extensions: { code: "QUERY_TOO_DEEP" } },
              ),
            );
          }

          if (rootFields > limits.maxRootFields) {
            context.reportError(
              new GraphQLError(
                `${subject} selects ${count(rootFields)} root fields; the limit is ${limits.maxRootFields}. ` +
                  "Aliasing one field many times multiplies the work behind it — page instead.",
                { nodes: definition, extensions: { code: "QUERY_TOO_WIDE" } },
              ),
            );
          }

          if (measurement.fieldNodes > limits.maxFieldNodes) {
            context.reportError(
              new GraphQLError(
                `${subject} selects ${count(measurement.fieldNodes)} fields; the limit is ${limits.maxFieldNodes}. ` +
                  "Ask for fewer fields, or split the document.",
                {
                  nodes: definition,
                  extensions: { code: "QUERY_TOO_COMPLEX" },
                },
              ),
            );
          }

          if (measurement.rows > limits.maxQueryRows) {
            context.reportError(
              new GraphQLError(
                `${subject} asks for up to ${count(measurement.rows)} rows; the limit is ` +
                  `${limits.maxQueryRows}. Nesting one page inside another multiplies ` +
                  "them — lower a `first`, or fetch the inner connection in its own " +
                  "request.",
                {
                  nodes: definition,
                  extensions: { code: "QUERY_TOO_LARGE" },
                },
              ),
            );
          }

          if (measurement.modelBackedFields > limits.maxModelBackedFields) {
            context.reportError(
              new GraphQLError(
                `${subject} selects ${count(measurement.modelBackedFields)} fields that each run a model ` +
                  `inference; the limit is ${limits.maxModelBackedFields}. ` +
                  `This operation's are ${[...measurement.modelBackedCoordinates].sort().join(", ")} ` +
                  "(the full list is MODEL_BACKED_FIELDS in services/api/src/limits.ts) — " +
                  "split them across requests.",
                {
                  nodes: definition,
                  extensions: { code: "QUERY_TOO_EXPENSIVE" },
                },
              ),
            );
          }
        }

        // The whole analysis happened here; there is nothing below a Document
        // this visitor wants. `visitInParallel` tracks skipping per-visitor, so
        // this does not stop any other rule from descending.
        return false;
      },
    },
  });

/**
 * The Yoga plugin: the parser bound, then the validation rule.
 *
 * `onParse` comes first on purpose. A validation rule can only run on an AST
 * that has already been built, so without `maxTokens` a multi-megabyte document
 * is fully lexed and parsed before anything is allowed to object to it.
 */
export const useQueryCostLimits = (
  limits: CostLimits = DEFAULT_COST_LIMITS,
): Plugin => ({
  onParse({ setParseFn }) {
    setParseFn((source, options) =>
      parseGraphQL(source, { ...options, maxTokens: limits.maxParseTokens }),
    );
  },
  onValidate({ addValidationRule }) {
    addValidationRule(queryCostRule(limits));
  },
});
