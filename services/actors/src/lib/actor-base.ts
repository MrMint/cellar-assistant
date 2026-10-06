/**
 * The base every actor in this app extends.
 *
 * Three things, and deliberately no more:
 *
 *   1. **a Drizzle handle** (`this.db`), injected — Dapr's default under the
 *      sidecar, an explicit transaction in tests;
 *   2. **an `onActivate` loading hook** (`load()`), because §1.1 says an actor
 *      loads its aggregate on activate and caches it in memory;
 *   3. **a transaction helper** (`this.tx()`), because §1.4 requires a domain
 *      write and its `outbox` row to commit together.
 *
 * ## What this base class does *not* do
 *
 * It does not touch Dapr's actor state manager, and neither may you. A2 was
 * forced to declare an `actorStateStore` component because Dapr refuses to host
 * actors without one, so the component's absence no longer guarantees §1.3
 * ("Postgres is the only truth"). `src/lib/no-actor-state.test.ts` is now the
 * only thing that does. `getStateManager()` is deliberately *not* overridden to
 * throw: Dapr's own `ActorManager` calls it after every method invocation, so a
 * throwing override would break every actor call. The static test is the fence.
 *
 * ## Writing an actor (the whole pattern)
 *
 * ```ts
 * export class CellarActor extends EntityActorBase<CellarAggregate> {
 *   protected async loadAggregate(id: string) {
 *     const [row] = await this.db.select().from(cellars).where(eq(cellars.id, id));
 *     return row === undefined ? null : { cellar: row, owners: [], items: [] };
 *   }
 *
 *   async get(ctx: Ctx) {
 *     const agg = this.requireAggregate();
 *     if (!canSeeCellar(ctx, visibilityOf(agg, ctx))) throw new NotFoundError(...);
 *     return agg.cellar;
 *   }
 *
 *   async rename(ctx: Ctx, name: string) {
 *     const agg = this.requireAggregate();
 *     if (!isOwner(ctx, agg.cellar.createdById)) throw new ForbiddenError(...);
 *     await this.tx(async (tx) => {
 *       await tx.update(cellars).set({ name }).where(eq(cellars.id, this.key));
 *       // the outbox row for any follow-up goes in this same transaction (§1.4)
 *     });
 *     await this.reload();
 *   }
 * }
 * ```
 *
 * Register it in `src/actors/registry.ts` (`entry(Class, Descriptor)`), add its
 * tables to `TABLE_WRITERS` in `packages/db/src/writers.ts`, and test it with
 * `src/lib/testing.ts`.
 *
 * ## `await this.tx(...)` then `await this.reload()`
 *
 * That pair is the universal write shape here — ~83 occurrences across
 * `src/actors`, and not one of them in a `try`. So the interesting case is not
 * the write failing, it is the **reload** failing after the write committed: a
 * failover, pool exhaustion, a placement restart landing between the two lines.
 *
 * §1.3 says an eviction loses nothing, and it is right — everything is loaded
 * on activate and nowhere else. What it does not cover is the activation that
 * *survives* holding a copy it knows is wrong. `load()` assigns its result, so
 * a throw leaves the previous value in place: the pre-write aggregate, served
 * for up to `ACTOR_IDLE_TIMEOUT` (10m) of further turns, with the write that
 * invalidated it already durable in Postgres. A failover produces that in bulk.
 *
 * `reload()` therefore marks the cache unusable and rethrows, and
 * `onActorMethodPre` — which Dapr's `ActorManager.callActorMethod` runs before
 * every method, reminder and timer — rebuilds it before the next turn's body
 * runs. If that rebuild fails too, the turn fails with the load's own error and
 * the next one tries again.
 *
 * This is deliberately the same rule Dapr already applies one moment earlier:
 * `ActorManager.activateActor` does `await actor.onActivateInternal()` and only
 * then `this.actors.set(...)`, so a `load()` that throws on activation means
 * the actor never becomes active and the next call re-activates. A failed
 * reload is that event at a later moment and now gets the same answer.
 *
 * **Why not `setAggregate(null)`**, which is what the five delete paths do
 * (`cellar-actor.ts`, `tier-list-actor.ts`, `recipe-actor.ts`, `file-actor.ts`,
 * `recipe-group-actor.ts`): there it is a statement of fact — the row is gone.
 * After a failed reload the row is *there*, and nothing inside an activation
 * ever calls `load()` again on its own, so a nulled aggregate would make
 * `requireAggregate()` raise `NotFoundError` for every later turn until the
 * idle timeout evicted it. `NotFoundError` is a typed domain answer that
 * crosses to GraphQL as one (`./actor-error-envelope.ts`); a client may act on
 * it by forgetting the row. That trades a stale copy for a confident lie. The
 * flag keeps the copy but makes it unreachable, which is the honest version of
 * the same intent.
 */
import {
  type ActorCategory,
  CATEGORY_RULES,
  type Ctx,
  ForbiddenError,
  NotFoundError,
} from "@cellar-assistant/contracts";
import { AbstractActor, type ActorId, type DaprClient } from "@dapr/dapr";
import { actorDb, type DbOrTx } from "./db.ts";
import { requirePrivileged } from "./guards.ts";

/**
 * The static shape §8.3 requires of every actor class: `<Thing>Actor`, with its
 * category as a static field. `ActorBase` reads it back off `this.constructor`
 * so `tx()` can refuse a category that may not write.
 */
export type ActorStatics = { readonly category: ActorCategory };

export abstract class ActorBase extends AbstractActor {
  /**
   * Every subclass declares its own:
   *
   *   static readonly category: ActorCategory = "collection";
   *
   * `EntityActorBase` sets `"entity"` for you.
   */

  /**
   * The database, or — in tests — a transaction standing in for it.
   *
   * `protected`, not `public`: nothing outside the actor gets a write handle,
   * and `services/api` cannot reach one at all.
   */
  protected readonly db: DbOrTx;

  /**
   * Dapr constructs actors itself as `new Cls(daprClient, actorId)`, so the
   * database cannot arrive through registration — hence a defaulted third
   * parameter rather than a required one. Under the sidecar it defaults to the
   * process-wide pool; the harness passes a transaction.
   */
  constructor(daprClient: DaprClient, id: ActorId, db: DbOrTx = actorDb()) {
    super(daprClient, id);
    this.db = db;
  }

  /** This actor's key: the row id, natural key, input hash or viewer id (§1.1). */
  protected get key(): string {
    return this.getActorId().getId();
  }

  /** The category declared on the concrete class. */
  protected get category(): ActorCategory {
    const declared = (this.constructor as Partial<ActorStatics>).category;
    if (declared === undefined) {
      throw new Error(
        `${this.constructor.name} declares no static \`category\`. ` +
          "Every actor is tagged with exactly one of the six categories in " +
          "migration-plan §1.1; the tag determines what it may do.",
      );
    }
    return declared;
  }

  /**
   * Set by a `reload()` that threw: the write is durable, the cached copy is
   * the one from before it, and nothing may be served out of it. Cleared by
   * the next successful `load()`. See the class doc.
   */
  #cacheUnusable = false;

  /**
   * Dapr calls this once per activation. Everything an actor caches is loaded
   * here and nowhere else, so an eviction can never lose anything (§1.3).
   *
   * Override `load()`, not this.
   */
  override async onActivate(): Promise<void> {
    await this.load();
    this.#cacheUnusable = false;
  }

  /** Read the aggregate into memory. Default: nothing to load. */
  protected async load(): Promise<void> {}

  /**
   * Re-read after a write, so the cached copy matches Postgres.
   *
   * On failure the copy is marked unusable and the error is rethrown — the
   * caller still learns its operation did not complete cleanly, and the next
   * turn rebuilds before it runs. Retrying that call is safe: §8.4 makes the
   * row id the idempotency key.
   */
  protected async reload(): Promise<void> {
    try {
      await this.load();
      this.#cacheUnusable = false;
    } catch (error) {
      this.#cacheUnusable = true;
      throw error;
    }
  }

  /**
   * Dapr runs this before every method, reminder and timer
   * (`ActorManager.callActorMethod`, `@dapr/dapr` 3.18.0), and it is a no-op on
   * `AbstractActor`. It is the one place inside a live activation where an
   * async repair can happen before a method body sees the cache.
   *
   * Costs one boolean per turn in the ordinary case. A rebuild that throws
   * fails the turn instead of the method — nothing partial happens — and
   * leaves the flag set for the next attempt.
   */
  override async onActorMethodPre(): Promise<void> {
    if (!this.#cacheUnusable) return;
    await this.reload();
  }

  /**
   * Whether the cached copy is currently unreachable. For tests and for a
   * subclass that wants to say so in a log line; not a decision point in
   * domain code, which never reaches a method body while this is true.
   */
  protected get cacheUnusable(): boolean {
    return this.#cacheUnusable;
  }

  /**
   * Run `fn` inside one transaction. The domain write and the `outbox` row that
   * schedules its follow-up go in here together — that is the whole of §1.4.
   *
   * When `this.db` is already a transaction (the test harness, or a nested
   * call) Drizzle opens a savepoint, so the semantics are the same either way.
   *
   * Read-only categories are refused: §1.1 says a collection, search, view or
   * reference actor never writes, and a write handle is the only way it could.
   */
  protected async tx<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
    const category = this.category;
    if (!CATEGORY_RULES[category].mayWrite) {
      throw new Error(
        `${this.constructor.name} is a ${category} actor and may not write ` +
          `(migration-plan §1.1: "${CATEGORY_RULES[category].writes}"). ` +
          "A cross-aggregate operation is a sequence of idempotent calls to " +
          "the owning actors, with the outbox as the retry mechanism (§1.2).",
      );
    }
    return this.db.transaction(async (tx) => fn(tx));
  }
}

/* -------------------------------------------------------------------------- */
/* Absence                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The one spelling of "there is no such row", for every refusal that must not
 * be an existence oracle.
 *
 * A row that does not exist and a row the caller may not see have to answer
 * with the same bytes, or the difference is the leak — `services/api` hands
 * the actor's message to the client verbatim. The absent arm is fixed (it is
 * what `requireAggregate()` raises, and a missing row never reaches anything
 * else), so every concealed arm reuses it rather than approximating it. Eight
 * hand copies of this string used to exist, one of them naming the wrong
 * class, and two actors worded the same hidden cellar two ways.
 *
 * `EntityActorBase.refuseAsAbsent()` is this for the actor's own row. A
 * reference to *another* actor's row that the caller may not see — the
 * `cellarId` a cellar-scoped search or an onboarding names — passes that
 * actor's type, so the answer matches what `CellarActor` itself would say.
 * `src/lib/concealment.test.ts` refuses the wording anywhere but here.
 */
export const absentRow = (actorType: string, key: string): NotFoundError =>
  new NotFoundError(`${actorType}(${key}) has no row`);

/* -------------------------------------------------------------------------- */
/* Key shapes                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether a string can be an entity actor's key at all — can name a row —
 * before anything sends it to Postgres. See `EntityActorBase.keyShape`.
 */
export type KeyShape = (key: string) => boolean;

/**
 * A uuid in Postgres's own output form: lowercase, hyphenated, no braces.
 *
 * **Lowercase only, on purpose.** Postgres accepts `ABC…`, `{abc…}` and
 * `abc…` for the same row, but Dapr routes on the raw id string, so each
 * spelling is a separate activation with a separate cache — two writers for
 * one aggregate, which is the one thing §1.1's one-actor-per-row exists to
 * rule out. Every id this system mints is already in this form
 * (`gen_random_uuid()`, `randomUUID()`, `derived-uuid.ts`), and
 * `services/api` lowercases a uuid-shaped actor id before the hop
 * (`src/context.ts`), so the only key refused here for its case is one that
 * was built by hand.
 */
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isCanonicalUuid = (value: string): boolean =>
  CANONICAL_UUID.test(value);

/** A key that is a row's uuid primary key, canonically spelled. The default. */
export const uuidKey: KeyShape = isCanonicalUuid;

/** A key that is one fixed string — a singleton's `"singleton"`. */
export const exactKey =
  (...allowed: readonly string[]): KeyShape =>
  (key) =>
    allowed.includes(key);

/**
 * A key that is free text compared as text (a normalised name): anything
 * non-empty, **except** a NUL. Postgres refuses `\u0000` in a text parameter
 * outright ("invalid byte sequence for encoding UTF8: 0x00"), so it fails a
 * query the same way a malformed uuid does, and `encodeURIComponent` carries
 * it through an actor URL as `%00` without complaint.
 */
export const textKey: KeyShape = (key) =>
  key.length > 0 && !key.includes("\u0000");

/**
 * An entity actor: keyed by a row id, caching its aggregate from activate.
 *
 * `TAggregate` is whatever the actor holds — usually the root row plus its
 * children, exactly the "Loads" list in §2.1.
 *
 * ## A key that cannot name a row never reaches SQL
 *
 * Dapr activates an actor for any id a caller sends, and a GraphQL `ID` is any
 * string a client likes. Before `keyShape`, `ItemActor("sake:not-a-uuid")`
 * activated by running `where id = 'not-a-uuid'` against a `uuid` column,
 * Postgres refused the cast, and the activation threw. That was not merely a
 * 500: daprd had already recorded the activation and the SDK had not, and
 * ten minutes later the idle-timeout `DELETE` for it took the whole host down
 * (`./actor-route-guard.ts` has the mechanism).
 *
 * Eight actors had grown their own `UUID_PATTERN` guard in `loadAggregate`;
 * six had not (`ItemActor`, `CellarActor`, `TierListActor`, `FileActor`,
 * `BrandActor`, and every `JobActor`). So the check lives here, on by
 * default, and an actor keyed by anything but a uuid says what instead:
 *
 * ```ts
 * static override readonly keyShape: KeyShape = exactKey(BUDGET_ACTOR_ID);
 * ```
 *
 * A key that fails its shape is simply absent: `load()` does not call
 * `loadAggregate` (so the activation succeeds, with no row), and every turn is
 * refused with the same `NotFoundError` `requireAggregate()` raises for a
 * missing row — before the method body runs, so a `create` cannot send it to
 * an `INSERT` either.
 */
export abstract class EntityActorBase<TAggregate> extends ActorBase {
  static readonly category: ActorCategory = "entity";

  /**
   * What a key must look like before it may reach SQL. Default: a uuid. Read
   * off the concrete class, like `category`.
   */
  static readonly keyShape: KeyShape = uuidKey;

  #aggregate: TAggregate | null = null;

  /** Whether this actor's key passes its class's `keyShape`. */
  protected get keyIsWellFormed(): boolean {
    const shape =
      (this.constructor as { keyShape?: KeyShape }).keyShape ?? uuidKey;
    return shape(this.key);
  }

  /**
   * Refuse this turn exactly as if the row did not exist. See
   * {@link absentRow}: this is the only wording, and `requireAggregate()`
   * uses it too.
   */
  protected refuseAsAbsent(): never {
    throw absentRow(this.constructor.name, this.key);
  }

  /**
   * Read the aggregate for `id`. Return `null` when the row does not exist —
   * Dapr will happily activate an actor for an id that was never created, and
   * the actor has to be able to say so.
   */
  protected abstract loadAggregate(id: string): Promise<TAggregate | null>;

  /**
   * A key that fails `keyShape` loads as "no row" without a query. See the
   * class doc.
   */
  protected override async load(): Promise<void> {
    this.#aggregate = this.keyIsWellFormed
      ? await this.loadAggregate(this.key)
      : null;
  }

  /**
   * Refuse every turn on a malformed key, then do `ActorBase`'s cache repair.
   *
   * Dapr runs this before every method, reminder and timer, so this is the one
   * place that covers the write paths too: a `create` addressed by a key that
   * could never be a row id would otherwise carry it into an `INSERT`.
   */
  override async onActorMethodPre(): Promise<void> {
    if (!this.keyIsWellFormed) this.refuseAsAbsent();
    await super.onActorMethodPre();
  }

  /** The cached aggregate, or `null` if the row does not exist. */
  protected get aggregate(): TAggregate | null {
    return this.#aggregate;
  }

  /**
   * The cached aggregate, or `NotFoundError`.
   *
   * Note the ordering every method should follow: existence first, then the
   * policy check, then the work. A viewer who may not see the row gets
   * `NotFound` too (`requireVisible`), so absence and denial are
   * indistinguishable. The one exception is a method no ordinary caller may
   * use at all, where the caller goes first — `requirePrivilegedAggregate`.
   */
  protected requireAggregate(): TAggregate {
    if (this.#aggregate === null) this.refuseAsAbsent();
    return this.#aggregate;
  }

  /* ---------------------------------------------------------------------- */
  /* Concealment                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Whether `ctx` may know this row exists. An actor whose rows are private —
   * owner-only, or carrying a `permission_type` — overrides it; that override
   * is the actor's whole visibility rule, and the three helpers below are the
   * only things that should call it.
   *
   * The default refuses to answer rather than guessing: a catalog actor never
   * calls these helpers, and a privacy-bearing one that forgot to say who may
   * see its rows must fail loudly, not show them to everyone.
   */
  protected canSee(
    _ctx: Ctx,
    _aggregate: TAggregate,
  ): boolean | Promise<boolean> {
    throw new Error(
      `${this.constructor.name} uses the concealment helpers but does not ` +
        "override canSee(ctx, aggregate)",
    );
  }

  /**
   * The aggregate, if `ctx` may see it; otherwise {@link refuseAsAbsent}.
   * Absent and hidden are one answer.
   */
  protected async requireVisible(
    ctx: Ctx,
    aggregate: TAggregate = this.requireAggregate(),
  ): Promise<TAggregate> {
    if (!(await this.canSee(ctx, aggregate))) this.refuseAsAbsent();
    return aggregate;
  }

  /**
   * The two-step every "you may see it but not change it" check needs: when
   * `ok` is false, a caller who cannot see the row is told it is absent, and
   * only one who can is told `Forbidden(refusal)`. Existence is not a secret
   * from somebody who can already see the row, and "not yours" is the useful
   * answer there; from anybody else, `Forbidden` would be the oracle.
   */
  protected async requireAllowed(
    ctx: Ctx,
    ok: boolean,
    refusal: string,
    aggregate: TAggregate = this.requireAggregate(),
  ): Promise<void> {
    if (ok) return;
    await this.requireVisible(ctx, aggregate);
    throw new ForbiddenError(refusal);
  }

  /**
   * A `system`/admin-only method on an actor whose rows are private: the
   * **caller** is checked before the row.
   *
   * The other order — `requireAggregate()` then `requirePrivileged` — answers
   * an unprivileged caller `NotFound` for an id that names nothing and
   * `Forbidden` for one that names somebody's private row, which is exactly
   * the oracle the concealment above exists to close. Checking the caller
   * first answers them `Forbidden` either way; a privileged caller, who may
   * know any row exists, still gets `NotFound` for a missing one.
   */
  protected requirePrivilegedAggregate(ctx: Ctx, refusal: string): TAggregate {
    requirePrivileged(ctx, refusal);
    return this.requireAggregate();
  }

  /** Replace the cached aggregate after a write without re-reading. */
  protected setAggregate(aggregate: TAggregate | null): void {
    this.#aggregate = aggregate;
  }
}
