/**
 * The base every C3 collection actor extends (§1.1 "collection", §1.5, §2.2).
 *
 * §1.1 gives the category four properties —
 *
 * > | **collection** | writes nothing | reads any table, directly via Drizzle |
 * > | keyed by viewer id (or a scope id) | cache: none, or short-lived |
 *
 * — and the two rules added *after* most of the actor layer was written decide
 * what the last two of those may mean. This class is where they are settled,
 * and it settles them differently from `ViewActorBase` on purpose.
 *
 * ## 1. There is no cache here at all, and that is the stronger answer
 *
 * `ViewActorBase` reconciled §1.1's "screen-shaped projection" with §1.3's
 * "an actor may cache only the tables it writes" by holding a **paging
 * buffer**: a fresh request re-queries, and the buffer only continues a
 * page-walk the same activation started. A collection actor could do the same
 * — but it does not need to, and for two of the nine it must not:
 *
 *   - An offset cursor into a materialised list requires the list to be
 *     materialised. A view or search actor gets that for free because its SQL
 *     caps at 50–500 rows (§1.5). `/brands` and `/recipes` are open-ended
 *     catalogs with no such cap, so the same trick would either read the whole
 *     catalog into memory or silently truncate it at the cap. §1.5's "there is
 *     no unbounded read" forbids the first and nobody wants the second.
 *   - `page.ts` already says which tool this category uses: *"`keysetPage` —
 *     rows fetched from Postgres with `limit(first + 1)` and an ordering key.
 *     This is what entity and collection actors do."* C3 is the first caller.
 *
 * So `paged()` issues **one query per turn**, every turn, with `limit(first +
 * 1)` and a `(sortKey, id)` cursor, and holds nothing between turns. B6's
 * failure mode — a cached list of rows the actor does not own, going stale with
 * nothing to invalidate it — is not merely guarded against here, it is
 * unrepresentable. `queryCount` is how the tests show it: it increments on
 * every call, including a second page.
 *
 * ## 2. Authorization runs first, on every turn (§1.5, C1)
 *
 * C1 shipped an actor whose visibility check lived inside the cached query, so
 * the first call authorised *and cached* and every later call on that
 * activation was served without a check — an anonymous request got a full
 * result set back. Having no cache removes the mechanism, but not the rule: a
 * warm activation still has to re-check a *different* caller, because Dapr will
 * route one. `paged()` therefore runs `requireKey` and then `authorize` before
 * it reaches the database, and `collection-actor-base.test.ts` drives a warm
 * activation with a second, unauthorised ctx to prove it.
 *
 * ## 3. Keyed by the viewer is not the same as authorized as that viewer (C2)
 *
 * `ViewerCollectionActorBase` enforces `ctx.viewerId === this.key` on every
 * turn, for the reason C2 gives: an actor id is an *address*, not a credential,
 * and nothing in Dapr stops viewer B's request landing on
 * `FavoritesCollectionActor(A)`. The same deliberate narrowing applies — an
 * `admin` ctx cannot address another viewer's collection, because §1.6's
 * `bypassesPolicy` is about seeing rows a policy hides, not about becoming
 * somebody else.
 *
 * `ScopedCollectionActorBase` is the catalog half: its key is a hash of the
 * filter, so it recomputes that hash from the input it was handed and refuses a
 * mismatch, exactly as `SearchActorBase#requireKeyMatches` does. Without it a
 * caller could address the activation for one filter and hand it another.
 *
 * ## Collection actors write nothing
 *
 * `ActorBase.tx()` already refuses a `collection` category (§1.1's
 * `CATEGORY_RULES`) and `packages/db`'s single-writer test would catch a write
 * anyway. Nothing here needs a second fence; this class simply never opens one.
 *
 * ## 4. `totalCount` is not optional here (A7d item 1)
 *
 * `keysetPage`'s fourth parameter defaults to `null`, and this class used to
 * omit it — so **every** §2.2 collection returned `totalCount: null` and every
 * index page in the frontend rendered "N shown" instead of "N of M". D8 found
 * it on `FriendRequestConnection`, D5 on `MenuScanConnection` and
 * `MatchSuggestionConnection`, D7 on `TierListConnection`, D4 on
 * `BrandConnection`, `me.favorites`' `ItemConnection` and `CellarConnection` —
 * eight separate reports of one missing argument, which is what makes this a
 * base-class fix rather than eight.
 *
 * `paged()` therefore takes `scope` — the `FROM` and `WHERE` an actor's page
 * query already builds — **as a required argument**, and counts with it. Two
 * properties follow, and both are the point:
 *
 *   - **A tenth collection actor cannot forget.** The parameter is required, so
 *     omitting it is a type error rather than a `null` nobody notices until a
 *     D workstream reports it.
 *   - **The count cannot drift from the page.** The actor hands over the same
 *     `SQL` fragments its own `select` splices in, so there is no second copy
 *     of the predicate to fall out of step. A count that quietly disagrees with
 *     its page is worse than no count at all.
 *
 * The count is a **second statement in the same turn**, issued sequentially
 * after the page read rather than concurrently: under the sidecar `this.db` is
 * the process-wide pool, but the test harness passes a *transaction*, and two
 * concurrent statements on one connection are only safe by virtue of the
 * driver's queue. Sequential costs a round trip and owes nothing to that.
 * `queryCount` still counts *turns that reached the database*, so it is
 * unchanged — the count is part of the same turn.
 *
 * It is unconditional: the actor cannot see the GraphQL selection set, so it
 * cannot know whether the client asked for `totalCount`. That is the cost §8.3
 * accepted when it wrote "`totalCount` where cheap" — every §2.2 collection is
 * one indexed predicate over one table (or one join), so counting it is cheap.
 * An actor for which that stops being true should return `null` deliberately,
 * by its own reasoning, not by forgetting an argument.
 */
import type { Ctx, Page, PageArgs } from "@cellar-assistant/contracts";
import {
  type ActorCategory,
  emptyPage,
  ForbiddenError,
  keysetPage,
  ValidationError,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { ActorBase } from "./actor-base.ts";
import { requireSignedIn } from "./guards.ts";

/* -------------------------------------------------------------------------- */
/* Cursors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A keyset cursor: the row's ordering value and its id, which together are
 * unique for every collection in §2.2.
 *
 * Both halves travel as strings and the actor casts them back in SQL
 * (`::timestamptz`, `::numeric`, `::text`), because the cast depends on the
 * column and the cursor format must not. A `sort` is never null: an actor
 * whose ordering column is nullable orders by a `coalesce(...)` expression and
 * puts that same expression in the cursor.
 */
export type KeysetCursor = { readonly sort: string; readonly id: string };

/**
 * The two clauses a page query and its `count(*)` must agree on: everything
 * after `FROM` and everything the `WHERE` narrows by, *excluding* the keyset
 * comparison (which is the cursor, not the query) and the `ORDER BY`/`LIMIT`.
 *
 * An actor builds this once and splices it into its own `select`; `paged()`
 * splices the same two fragments into `select count(*)`. One source, so the
 * total can never describe a different set of rows than the page it annotates.
 */
export type PageScope = {
  /** Tables and joins — `public.check_ins ci join public.cellar_items …`. */
  readonly from: SQL;
  /** The filter and visibility clauses, `and`ed together by the actor. */
  readonly where: SQL;
};

const CURSOR_PREFIX = "k:";

/**
 * Opaque to the client (§`page.ts`: "a cursor is an opaque string owned by the
 * actor that produced it"). base64url of a two-element JSON array — not a
 * delimiter-joined string, because a `sort` may be any text a user typed.
 */
export const encodeKeysetCursor = (cursor: KeysetCursor): string =>
  `${CURSOR_PREFIX}${Buffer.from(
    JSON.stringify([cursor.sort, cursor.id]),
    "utf8",
  ).toString("base64url")}`;

/** Throws rather than starting from the top for a cursor from another actor. */
export const decodeKeysetCursor = (cursor: string): KeysetCursor => {
  if (!cursor.startsWith(CURSOR_PREFIX)) {
    throw new ValidationError(`not a collection cursor: ${cursor}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(cursor.slice(CURSOR_PREFIX.length), "base64url").toString(
        "utf8",
      ),
    );
  } catch {
    throw new ValidationError(`not a collection cursor: ${cursor}`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new ValidationError(`not a collection cursor: ${cursor}`);
  }
  return { sort: parsed[0], id: parsed[1] };
};

/* -------------------------------------------------------------------------- */
/* The base                                                                    */
/* -------------------------------------------------------------------------- */

export abstract class CollectionActorBase<TInput> extends ActorBase {
  static readonly category: ActorCategory = "collection";

  #queries = 0;

  /**
   * The first thing that happens on every turn: is this caller entitled to
   * address *this activation* with *this input*? Throw if not.
   *
   * Distinct from `authorize`, which asks what the caller may see. This one
   * asks whether the actor id itself was addressed honestly, and it has no
   * "empty" answer — a mismatch is always a mistake or an attack.
   */
  protected abstract requireKey(ctx: Ctx, input: TInput): void;

  /**
   * Every visibility rule this collection enforces, run on **every** turn,
   * before the query.
   *
   * Return `"empty"` for a request that is well-formed and authorised but whose
   * filter resolves to nothing the viewer may see: the caller gets an empty
   * page and the next turn re-decides. Throw for a request that should not have
   * been made at all.
   *
   * The default is the catalog rule (§1.6, B3): any signed-in viewer.
   * `requireKey` has already run by this point.
   */
  protected async authorize(
    ctx: Ctx,
    _input: TInput,
  ): Promise<"allow" | "empty"> {
    requireSignedIn(ctx, "read this list");
    return "allow";
  }

  /**
   * How many turns have actually reached the database.
   *
   * Diagnostics for tests and (later) telemetry, deliberately absent from every
   * `ActorInterface` — `services/api` has no business reading it. Unlike
   * `SearchActorBase#searchRuns` and `ViewActorBase#projectionRuns`, this is
   * expected to equal the number of authorised calls: a collection actor holds
   * nothing, so every turn queries (module doc).
   *
   * A getter, not a method: Dapr's host dispatches any function-valued
   * property by name, so a method here would be callable through a sidecar
   * (`../lib/actor-method-allowlist.ts` refuses it too).
   */
  get queryCount(): number {
    return this.#queries;
  }

  /**
   * One keyset page: check the key, check the policy, then read `first + 1`
   * rows and let `keysetPage` drop the extra one.
   *
   * `read` receives the decoded cursor (or `null` for a first page) and the
   * limit to apply; it is the only part that knows the table. `cursorOf` must
   * return the same `(sort, id)` pair the `where` clause compares against, or
   * paging will skip or repeat rows.
   *
   * `scope` returns the `FROM`/`WHERE` that `read` itself used, and is what
   * makes `totalCount` non-null (module doc §4). It is a thunk rather than a
   * value because most scopes are async — a visibility clause reads the
   * viewer's friendships first — and because a request `authorize` answered
   * `"empty"` must not pay for either query.
   */
  protected async paged<TRow>(
    ctx: Ctx,
    input: TInput,
    args: PageArgs,
    read: (
      after: KeysetCursor | null,
      limit: number,
    ) => Promise<readonly TRow[]>,
    cursorOf: (row: TRow) => KeysetCursor,
    scope: () => Promise<PageScope> | PageScope,
  ): Promise<Page<TRow>> {
    this.requireKey(ctx, input);
    if ((await this.authorize(ctx, input)) === "empty") return emptyPage();
    this.#queries += 1;
    const after = args.after === null ? null : decodeKeysetCursor(args.after);
    const rows = await read(after, args.first + 1);
    const totalCount = await this.#count(await scope());
    return keysetPage(
      rows,
      args,
      (row) => encodeKeysetCursor(cursorOf(row)),
      totalCount,
    );
  }

  /**
   * One batched reverse-edge turn (UI parity wave B): the same two checks as
   * `paged` — the key, then the policy — before anything is read, and one
   * `queryCount` per authorised turn. `empty` is what a request `authorize`
   * answered `"empty"` gets, without touching the database.
   *
   * For a method addressed by this actor's own key builder. A method whose
   * activation is keyed differently (a batch of brand ids, say) uses
   * {@link keyedBatch} instead.
   */
  protected async batch<T>(
    ctx: Ctx,
    input: TInput,
    empty: T,
    run: () => Promise<T>,
  ): Promise<T> {
    this.requireKey(ctx, input);
    if ((await this.authorize(ctx, input)) === "empty") return empty;
    this.#queries += 1;
    return await run();
  }

  /**
   * {@link batch} for a method whose activation is addressed by a key builder
   * of its own — `expectedKey` is that builder applied to the method's input,
   * and a mismatch is refused exactly as `ScopedCollectionActorBase` refuses
   * one. The catalog rule (any signed-in viewer) applies.
   */
  protected async keyedBatch<T>(
    ctx: Ctx,
    expectedKey: string,
    run: () => Promise<T>,
  ): Promise<T> {
    if (expectedKey !== this.key) {
      throw new ValidationError(
        `${this.constructor.name}(${this.key}) was called with input that ` +
          `hashes to ${expectedKey}; address the actor with the id its own ` +
          "key builder produces.",
      );
    }
    requireSignedIn(ctx, "read this list");
    this.#queries += 1;
    return await run();
  }

  /**
   * `select count(*)` over the same rows the page came from.
   *
   * `count(*)` is `bigint`, which node-postgres hands back as a **string** to
   * avoid losing precision past 2^53 — so this parses rather than trusting the
   * driver to have given a number. A collection with no rows still returns one
   * row here, but `rows[0]` is typed as possibly undefined under
   * `noUncheckedIndexedAccess` and `?? 0` is the honest reading of "no row came
   * back" anyway.
   */
  async #count(scope: PageScope): Promise<number> {
    const { rows } = await this.db.execute<{ readonly n: string | number }>(
      sql`select count(*) as n from ${scope.from} where ${scope.where}`,
    );
    return Number(rows[0]?.n ?? 0);
  }
}

/* -------------------------------------------------------------------------- */
/* The two flavours of key                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Seven of §2.2's nine: keyed by the viewer, serving that viewer's own page.
 *
 * `Forbidden`, not `NotFound`: an actor id is not a row, so the distinction
 * leaks nothing, and the caller genuinely is asking for someone else's list.
 * An anonymous ctx fails here too (`null !== this.key`), which is the belt to
 * `authorize`'s `requireSignedIn` braces.
 */
export abstract class ViewerCollectionActorBase<
  TInput,
> extends CollectionActorBase<TInput> {
  protected requireKey(ctx: Ctx): void {
    if (ctx.viewerId !== null && ctx.viewerId === this.key) return;
    throw new ForbiddenError(
      `${this.constructor.name}(${this.key}) may only be called by that ` +
        "viewer. A collection actor keyed by viewer id (§1.1) is addressed by " +
        "that id, but an actor id is an address, not a credential: the check " +
        "runs on every turn, before anything is read (§1.5).",
    );
  }
}

/**
 * The two catalog collections: keyed by a hash of their filter, shared across
 * viewers, so the key has to be checked against the input the same way
 * `SearchActorBase` checks its own.
 *
 * §2.2 writes these as `SomeCollectionActor()` — a true singleton — which §1.5
 * warns against: "Dapr runs one turn at a time per actor id. Key read-only
 * actors by something with cardinality." A hash of the filter is that.
 */
export abstract class ScopedCollectionActorBase<
  TInput,
> extends CollectionActorBase<TInput> {
  /** Recompute this actor's id from `input`, via the builder in `contracts`. */
  protected abstract keyFor(input: TInput): string;

  protected requireKey(_ctx: Ctx, input: TInput): void {
    const expected = this.keyFor(input);
    if (expected === this.key) return;
    throw new ValidationError(
      `${this.constructor.name}(${this.key}) was called with a filter that ` +
        `hashes to ${expected}. A scoped collection actor's id *is* its ` +
        "filter, so the two cannot disagree: address the actor with the id " +
        "its own key builder produces. This is refused rather than re-run " +
        "because an activation shared across viewers must never be handed a " +
        "different scope than the one it is addressed as.",
    );
  }
}
