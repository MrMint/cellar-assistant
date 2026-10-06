/**
 * The base every C1 search actor extends (§1.1 "search", §1.5, §2.3).
 *
 * §1.5 in one class:
 *
 * > Search actors are keyed by a hash of every input **except pagination**. The
 * > actor runs the search once, holds the capped result set (the SQL functions
 * > already cap at 50–500), and pages it in memory.
 *
 * ## The input travels with every call, and the key is checked against it
 *
 * An actor id is a *hash*. It cannot be reversed, so the actor cannot recover
 * its own inputs from `this.key` — which means the input has to arrive as a
 * method argument on every call, including the second page.
 *
 * That is not merely a plumbing detail: without a check, `results(ctx, input,
 * page)` would let a caller address **any** activation with **any** input. A
 * client could compute the shared, viewer-insensitive key for
 * `placeSearchActorId({query}, null)` and then hand that activation a
 * tier-list-filtered input — putting a viewer-scoped answer into an activation
 * every other viewer reads from. So `#requireKeyMatches` recomputes the key
 * from the input it was given and refuses anything that does not hash to
 * `this.key`. It is the cache-integrity half of the same rule
 * `tier-list-visibility.ts` enforces on the data half.
 *
 * ## Authorization runs on every call; the query runs once
 *
 * These are two different lifetimes and conflating them is a real
 * vulnerability, found by driving `BrandSearchActor` on the compose stack: with
 * the visibility check inside `runSearch`, the *first* call authorises and
 * caches, and every later call on that activation is served from the cache
 * without any check at all. An anonymous request landed on a warm activation
 * and got a full result set back.
 *
 * So `authorize` is a separate hook that runs **before** the cache is consulted,
 * on every turn, and `runSearch` is only ever reached by a call that has already
 * passed it. `authorize` may also answer `"empty"` rather than throwing, which
 * is what a place search does when the viewer may not see any of the tier lists
 * they asked to filter by: an empty page, re-decided every turn, and never
 * cached as if it were a result.
 *
 * ## One run per activation, and how that is proved
 *
 * `#results` is populated by the first call and reused by every later one, so
 * two pages of one search are two turns over one result set. `searchRuns`
 * exposes the counter; `item-search-actor.test.ts` asserts it is `1` after two
 * differently-paged calls, which is C1's acceptance criterion. The counter is
 * **not** on any `ActorInterface` — `services/api` has no business reading it.
 *
 * Eviction is the reset: Dapr drops the activation after the idle window (5
 * minutes, §8.5) and the next call re-runs the query. Nothing is persisted,
 * which is why a search actor can hold a result set at all (§1.3).
 *
 * ## Search actors write nothing
 *
 * `ActorBase.tx()` already refuses a `search` category (§1.1), and
 * `packages/db`'s single-writer test would catch a write anyway. Nothing here
 * needs to add a second fence; this class simply never opens one.
 */
import type { Ctx, Page, PageArgs } from "@cellar-assistant/contracts";
import {
  type ActorCategory,
  offsetPage,
  ValidationError,
} from "@cellar-assistant/contracts";
import { ActorBase } from "./actor-base.ts";
import { requireSignedIn } from "./guards.ts";

export abstract class SearchActorBase<TInput, THit> extends ActorBase {
  static readonly category: ActorCategory = "search";

  #results: readonly THit[] | null = null;
  #runs = 0;

  /**
   * Recompute this actor's id from `input`. Every C1 actor delegates to its
   * builder in `@cellar-assistant/contracts` — never to a local copy, so
   * `services/api`'s addressing and the actor's own check cannot drift.
   */
  protected abstract keyFor(input: TInput, viewerId: string | null): string;

  /**
   * Every visibility rule this search enforces, run on **every** call, before
   * the cached result set is consulted.
   *
   * Return `"empty"` for a request that is well-formed and authorised but whose
   * filter resolves to nothing the viewer may see — the caller gets an empty
   * page and nothing is cached, so a later turn re-decides. Throw for a request
   * that should not have been made at all.
   *
   * The default is the catalog rule every C1 actor needs at minimum: any
   * signed-in viewer, anonymous refused (B3's rule, §1.6's catalog case).
   */
  protected async authorize(
    ctx: Ctx,
    _input: TInput,
  ): Promise<"allow" | "empty"> {
    requireSignedIn(ctx, "search");
    return "allow";
  }

  /** Run the query. Called at most once per activation per distinct input. */
  protected abstract runSearch(
    ctx: Ctx,
    input: TInput,
  ): Promise<readonly THit[]>;

  /**
   * How many times this activation has actually queried. Diagnostics for tests
   * and (later) telemetry; deliberately absent from every actor interface.
   *
   * A getter, not a method: Dapr's host dispatches any function-valued
   * property by name, so a method here would be callable through a sidecar
   * (`../lib/actor-method-allowlist.ts` refuses it too).
   */
  get searchRuns(): number {
    return this.#runs;
  }

  /** The capped result set, run once and held for the life of the activation. */
  protected async resultSet(ctx: Ctx, input: TInput): Promise<readonly THit[]> {
    this.#requireKeyMatches(ctx, input);
    // Before the cache, every turn. See the module doc: putting this inside
    // `runSearch` means the second caller of a warm activation is never
    // checked, which is how an anonymous request got a full result set.
    if ((await this.authorize(ctx, input)) === "empty") return [];
    if (this.#results !== null) return this.#results;
    this.#runs += 1;
    const results = await this.runSearch(ctx, input);
    this.#results = results;
    return results;
  }

  /** §1.5's "pages it in memory". The cursor is an offset into a stable set. */
  protected async pageOf(
    ctx: Ctx,
    input: TInput,
    page: PageArgs,
  ): Promise<Page<THit>> {
    return offsetPage(await this.resultSet(ctx, input), page);
  }

  #requireKeyMatches(ctx: Ctx, input: TInput): void {
    const expected = this.keyFor(input, ctx.viewerId);
    if (expected === this.key) return;
    throw new ValidationError(
      `${this.constructor.name}(${this.key}) was called with an input that ` +
        `hashes to ${expected}. A search actor's id *is* its input (§1.5), so ` +
        "the two cannot disagree: address the actor with the id its own key " +
        "builder produces. This is refused rather than re-run because an " +
        "activation shared across viewers must never be handed a " +
        "viewer-scoped input.",
    );
  }
}
