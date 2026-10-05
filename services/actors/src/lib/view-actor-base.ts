/**
 * The base both C2 view actors extend (§1.1 "view", §1.5, §2.4).
 *
 * A view actor is the sixth category and the odd one out: it is shaped by a
 * screen rather than by the domain. §1.1 gives it three properties —
 *
 * > | **view** | writes nothing | reads any table, directly via Drizzle |
 * > | keyed by viewer id | caches a screen-shaped projection |
 *
 * — and two rules added *after* most of the actor layer was written change what
 * the last two of those can mean. This class is where they are reconciled.
 *
 * ## 1. Keyed by the viewer is not the same as authorized (§1.5, C1)
 *
 * `SearchActorBase` learned this the hard way: with the visibility check inside
 * the query, the first call authorised *and cached* and every later call on
 * that activation skipped the check, so an anonymous request got a full result
 * set back. A view actor is less exposed — its id is a user id, so two viewers
 * never share an activation *if they address it correctly* — but "if they
 * address it correctly" is an assumption about the caller, and the caller is
 * the thing being checked. Nothing in Dapr stops a request from viewer B being
 * routed to `MapActor(A)`; the id is an address, not a credential.
 *
 * So `#requireViewerKey` runs **first, on every turn, before the cache**, and
 * refuses any call whose `ctx.viewerId` is not this actor's own id. It is the
 * exact analogue of `SearchActorBase#requireKeyMatches`, which recomputes the
 * input hash for the same reason. Note that an `admin` ctx does not get to
 * address another viewer's key: §1.6's bypass is about seeing rows the policy
 * would hide, not about becoming somebody else, and a per-viewer projection
 * addressed under someone else's id would be cached under it too.
 *
 * `authorize` then runs, still before the cache, for whatever the concrete
 * actor needs on top — signed-in, input validity, and the per-turn re-resolution
 * of any visibility-bearing filter.
 *
 * ## 2. A view actor may not cache rows it does not own (§1.3, B6)
 *
 * > **An actor may cache only the tables it writes.** … Rows an actor does not
 * > own must be read fresh per call — the single-writer rule is what makes
 * > owned rows safe to cache, because no one else can change them.
 *
 * A view actor writes nothing, so it owns nothing, so on the face of it it may
 * cache nothing — which contradicts §1.1's "screen-shaped projection". The two
 * agree under exactly one reading, and it is the one implemented here: **the
 * projection is a paging buffer, not a read cache.**
 *
 *   - a *fresh* request (`after === null`, or `all()`) always re-queries;
 *   - the held projection is reused **only** to continue a page-walk over the
 *     same input that this activation itself started.
 *
 * That is not a weaker version of what a search actor does — it is the only
 * thing that makes an offset cursor meaningful (`page.ts`: "the set must be
 * stable for the life of the activation"). A search actor gets the same
 * property for free because its *key is its input*; a view actor is keyed by
 * the viewer and serves a different viewport or a different scope on every
 * turn, so it has to be said out loud. B6's failure — a cached membership list
 * with nothing to invalidate it, answering a live question wrongly — cannot
 * happen through a buffer that no fresh read consults.
 *
 * `projectionRuns` is how the tests prove both halves: it stays at 1 across
 * two pages of one browse, and it increments when the same input is asked for
 * again from the top. It is deliberately absent from every `ActorInterface`;
 * `services/api` has no business reading it.
 *
 * ## View actors write nothing
 *
 * `ActorBase.tx()` already refuses a `view` category (§1.1's `CATEGORY_RULES`),
 * and `packages/db`'s single-writer test would catch a write anyway. Nothing
 * here needs a second fence; this class simply never opens one.
 */
import type { Ctx, Page, PageArgs } from "@cellar-assistant/contracts";
import {
  type ActorCategory,
  ForbiddenError,
  offsetPage,
} from "@cellar-assistant/contracts";
import { ActorBase } from "./actor-base.ts";
import { requireSignedIn } from "./guards.ts";

export abstract class ViewActorBase<TInput, TEntry> extends ActorBase {
  static readonly category: ActorCategory = "view";

  #held: { readonly key: string; readonly entries: readonly TEntry[] } | null =
    null;
  #runs = 0;

  /**
   * A stable identity for `input`, used only to decide whether a follow-up page
   * is continuing the same walk. It is **not** an actor id and never addresses
   * anything — two different inputs on one activation are normal here, unlike
   * in a search actor.
   */
  protected abstract projectionKey(input: TInput): string;

  /**
   * Every visibility rule this view enforces, run on **every** turn, before the
   * held projection is consulted.
   *
   * Return `"empty"` for a request that is well-formed and authorised but whose
   * filter resolves to nothing the viewer may see: the caller gets an empty
   * page, nothing is held, and the next turn re-decides. Throw for a request
   * that should not have been made at all.
   *
   * The default is the catalog rule (§1.6, B3): any signed-in viewer.
   * `#requireViewerKey` has already run by this point.
   */
  protected async authorize(
    ctx: Ctx,
    _input: TInput,
  ): Promise<"allow" | "empty"> {
    requireSignedIn(ctx, "read this view");
    return "allow";
  }

  /** Build the screen-shaped projection. Never called before `authorize`. */
  protected abstract project(
    ctx: Ctx,
    input: TInput,
  ): Promise<readonly TEntry[]>;

  /**
   * How many times this activation has actually queried. Diagnostics for tests
   * and (later) telemetry; deliberately absent from every actor interface.
   *
   * A getter, not a method: Dapr's host dispatches any function-valued
   * property by name, so a method here would be callable through a sidecar
   * (`../lib/actor-method-allowlist.ts` refuses it too).
   */
  get projectionRuns(): number {
    return this.#runs;
  }

  /** A fresh read: authorized, then always re-queried (§1.3, module doc). */
  protected async allOf(ctx: Ctx, input: TInput): Promise<readonly TEntry[]> {
    return this.#entries(ctx, input, false);
  }

  /**
   * One page. A first page (`after === null`) re-queries; a continuation page
   * reuses the buffer this activation built for the same input, because the
   * cursor it carries is an offset into exactly that set.
   */
  protected async pageOf(
    ctx: Ctx,
    input: TInput,
    page: PageArgs,
  ): Promise<Page<TEntry>> {
    return offsetPage(
      await this.#entries(ctx, input, page.after !== null),
      page,
    );
  }

  async #entries(
    ctx: Ctx,
    input: TInput,
    continuing: boolean,
  ): Promise<readonly TEntry[]> {
    // Before everything, every turn. See the module doc: an actor id is an
    // address, not a credential.
    this.#requireViewerKey(ctx);
    if ((await this.authorize(ctx, input)) === "empty") {
      this.#held = null;
      return [];
    }

    const key = this.projectionKey(input);
    if (continuing && this.#held !== null && this.#held.key === key) {
      return this.#held.entries;
    }
    this.#runs += 1;
    const entries = await this.project(ctx, input);
    this.#held = { key, entries };
    return entries;
  }

  /**
   * `this.key === ctx.viewerId`, or nothing happens.
   *
   * `Forbidden`, not `NotFound`: an actor id is not a row, so the distinction
   * leaks nothing — and the caller genuinely is asking for someone else's
   * screen. `requireSignedIn` runs inside `authorize` for the nicer anonymous
   * message, but an anonymous ctx fails here too (`null !== this.key`), which
   * is the belt to that braces.
   */
  #requireViewerKey(ctx: Ctx): void {
    if (ctx.viewerId !== null && ctx.viewerId === this.key) return;
    throw new ForbiddenError(
      `${this.constructor.name}(${this.key}) may only be called by that ` +
        "viewer. A view actor is keyed by viewer id (§1.1), but an actor id " +
        "is an address, not a credential: the check has to happen on every " +
        "turn, before the projection is consulted (§1.5).",
    );
  }
}
