/**
 * The outbox allow-list — what the drainer is permitted to invoke, and from
 * where (§1.4, §1.6, §8.5) — and the typed handles every enqueue names.
 *
 * ## Why this file exists
 *
 * `OutboxActor.deliver` invokes `row.targetActor`.`row.method` with
 * `systemCtx(...)` and the row's stored payload. `bypassesPolicy` returns true
 * for `system`, and every owner gate in this codebase opens on it. So, in
 * `item-onboarding-actor.ts`'s own words:
 *
 * > the outbox is a privilege boundary: whatever the authenticated caller can
 * > persuade an actor to enqueue is executed with policy off.
 *
 * Until this registry there was **no allow-list**. The only validation
 * `#deliverOne` performed was "not myself" (§8.5 reentrancy), which is a
 * deadlock guard, not an authorization one. Every `enqueueOutbox` call site was
 * therefore a privilege boundary and nothing enforced that. E5a found two holes
 * of exactly that shape by hand — `ItemOnboardingActor.confirm` was enqueuing
 * `CellarActor.addItem` on a caller-supplied `cellarId` and `ItemActor.linkBrand`
 * on a caller-supplied `itemId`, neither authorized — and review had missed both
 * for months. A third would be found the same way unless the rule is mechanical.
 *
 * ## Handles: the pair and the payload are types
 *
 * Every entry below is built from the target actor's **descriptor** and one of
 * its method names — `target(ItemActorDescriptor, "setBarcode", …)` — and the
 * entry *is* the handle an enqueue site passes:
 *
 * ```ts
 * await enqueueOutbox(tx, OUTBOX_TARGETS["ItemActor.setBarcode"], {
 *   targetId: itemActorId(ref),
 *   payload: { code },
 * });
 * ```
 *
 * So, as compile errors rather than scan findings:
 *
 * - **an undeclared pair** — `OUTBOX_TARGETS["ItemActor.nope"]` is not a key;
 *   and a handle cannot be written by hand, because {@link OutboxTarget}
 *   carries a brand keyed by a symbol this module does not export;
 * - **a method the actor does not have** — `target()` takes
 *   `keyof (TInterface & TInternal)` of the descriptor it is given, and
 *   `registry.ts` ties each descriptor to its class with strict variance;
 * - **a payload of the wrong shape** — the handle carries the method's own
 *   second parameter type ({@link OutboxPayloadOf}), and `enqueueOutbox` checks
 *   the `payload` it is given against it, excess properties included. A method
 *   that takes no payload takes none here;
 * - **a probe or a compensation enqueued by hand** — those entries are built
 *   by `probe()` / `compensation()`, which return a {@link DeclaredPair}
 *   without the brand, so `enqueueOutbox` does not accept them;
 * - **a bounded dynamic target** — a site that picks one of several handles at
 *   runtime (`MaintenanceActor.armCycle`, `JobActor.scheduleBatch`) annotates
 *   the value as `(typeof OUTBOX_TARGETS)["A.m" | "B.n"]`. Each handle's type
 *   carries its own literal key, so that annotation is a bound the compiler
 *   holds, not a claim a test has to check.
 *
 * `outbox-targets.test.ts` holds a `@ts-expect-error` for each of those.
 *
 * What types cannot say is **who** enqueues and **with which id**, so the
 * registry still declares both and a scan still checks them
 * (`outbox-scan-testing.ts`, `outbox-targets.test.ts`): each enqueue site's
 * module must be listed on the pair it names, and its `targetId` shape must
 * agree with the provenance declared for that module.
 *
 * The wire format is unchanged: a row is still `(target_actor, target_id,
 * method, payload)` with the handle's `actorType` and `method` written out as
 * strings, so rows enqueued before handles existed deliver exactly as before —
 * and the drainer still checks every row it claims against this list at
 * delivery time ({@link isAllowedOutboxTarget}), because a row is data and
 * data is never trusted.
 *
 * ## The second consequence, stated because it is true and not fixed here
 *
 * §1.2's "no actor writes another aggregate's rows" holds for *direct* writes
 * only. `TABLE_WRITERS`' `infrastructure:outbox` exemption — which exists so any
 * actor may insert a follow-up — is simultaneously a universal *indirect* write
 * capability: an `outbox` row reaches any method on any actor with policy off.
 * So `writers.test.ts` proves a closed write graph that is closed modulo one
 * edge reaching everything. This registry is what bounds that edge; it does not
 * remove it. A `TABLE_WRITERS` entry now means "the only actor that writes this
 * table directly, and the only actor any *declared* outbox target can reach it
 * through".
 *
 * ## What the registry declares, and why it declares the enqueuer too
 *
 * Each entry is a `(targetActor, method)` pair plus **the modules allowed to
 * enqueue it**. Pairs alone would have been the smaller, more durable rule, and
 * the argument against declaring enqueuers is real: it pins today's call graph,
 * so a legitimate new caller of an already-declared pair is a red test and a
 * registry edit rather than a free refactor.
 *
 * It is declared anyway, because **that red test is the one E5a needed.**
 * `ItemActor.create`, `ItemActor.linkBrand` and `CellarActor.addItem` were all
 * already legitimate outbox targets when `ItemOnboardingActor` started enqueuing
 * them; the pair-only rule would have passed silently on both holes. What was
 * new was a module enqueuing them with an id it had not authorized. The
 * enqueuer list is what makes "a new module can now reach `CellarActor.addItem`
 * with policy off" a thing somebody has to write down and a reviewer has to
 * read.
 *
 * ## `targetId` provenance, which is the part that actually finds holes
 *
 * The scan classifies each site's `targetId` *expression* — that is all syntax
 * can honestly do — and the registry has to agree with it:
 *
 * - **`self`** — literally `this.key`. The row can only reach the actor that
 *   wrote it, so it confers nothing a caller did not already have by reaching
 *   this actor at all. Needs no justification and carries none.
 * - **`constant`** — a literal or a resolved `const`; a fixed address, not
 *   steerable.
 * - **`derived`** — read from a row rather than chosen at this call site. The
 *   `note` must say *which* row and column, because "derived" is a claim about
 *   one hop: whether the value in that row was authorized when it was *written*
 *   is a question for that write's own site, and writing the provenance down is
 *   how `PlaceActor.addMenuFromScan` below got noticed.
 * - **`caller`** — the id came from the caller's input. These are the ones that
 *   need an authorization check *at the enqueue site*, because the far end runs
 *   with policy off and cannot perform one. `authorization` names the check, or
 *   is `null` with an `accepted` justification — and the test keeps a visible
 *   inventory of every `null`, so "review found two of these" becomes "the test
 *   names all of them".
 *
 * `BarcodeActor.linkItem` is the house pattern: it proves ownership of the
 * caller-supplied item (`isOwner(ctx, createdById)`) and only then enqueues.
 *
 * ## Adding a target
 *
 * Add `"Actor.method": target(ActorDescriptor, "method", { … })`, list the
 * module that enqueues it, and classify the `targetId`. The compiler holds the
 * method to the descriptor and every site's payload to the method; the test
 * holds the descriptor to a registered actor, so neither a typo nor an
 * unregistered actor is a dead letter in production.
 *
 * ## Removing one (the deploy order that does not lose work)
 *
 * `OutboxActor` refuses to deliver a pair that is not here, and refuses it
 * *permanently* (dead-letter on attempt 1, never retried), because a row naming
 * an undeclared pair is either a bug or an attack and retrying it nine more
 * times makes it neither less. During a deploy that removes a target there may
 * be pending rows for it, so removal is two deploys:
 *
 *   1. delete the **enqueue site**, keep the entry, ship, let the queue drain;
 *   2. delete the entry, ship.
 *
 * Doing it in one step dead-letters whatever was in flight. That is recoverable
 * rather than silent — `dead` rows are the only thing the retention sweep never
 * deletes, and `MaintenanceActor.reportDeadLetters` groups them by
 * `(target_actor, method)`, so the rows survive for forensics and the pair shows
 * up by name in the report — but it is still lost work, and the two-step order
 * costs nothing.
 *
 * ## Compensations — what happens when the outbox gives up
 *
 * A dead-lettered row used to tell nobody but telemetry. A target whose
 * owner has a terminal state to reach — a job that should say `failed`, a
 * menu scan that should stop saying `processing` — could only write it from
 * inside its own failing turn, and a host that died mid-delivery on the last
 * attempt never gave it that turn: `#reclaimStale` dead-lettered the row and
 * invoked nothing, so the job stayed `running` forever.
 *
 * So a target may declare **`onDead`**: a method on the *same actor*, at the
 * *same id*, that the drainer enqueues **in the same statement** that sets
 * the row `dead` — `#fail` and `#reclaimStale` alike
 * (`services/actors/src/lib/outbox.ts`, `insertCompensations`). The
 * compensating row carries `{ deadOutboxId, deadMethod, reason, deadPayload }`
 * (`DeadDeliveryNotice` in `@cellar-assistant/contracts`), is idempotent on
 * `deadOutboxId`, and is attributed to whoever the dead row was.
 *
 * The compensation is itself a declared pair — with `compensation` set,
 * saying why a policy-off delivery of it is harmless, and `enqueuedBy: []`, so
 * no module can enqueue it by hand (containment refuses every site) — and it
 * may **not** declare an `onDead` of its own: a compensation that dies is
 * reported, never compensated, so the chain has length one.
 * `outbox-targets.test.ts` holds all of that.
 *
 * This file is plain data on purpose: `OutboxActor` imports it at runtime, so
 * it must not reach for `node:fs` or the TypeScript compiler the way
 * `outbox-scan-testing.ts` does — and it imports descriptors, never actor
 * classes: an actor imports `lib/outbox.ts`, which imports this, so importing
 * one back would be a value cycle (hence `maintenance-actor-descriptor.ts` and
 * `probe-job-actor-descriptor.ts`).
 */

import type {
  ActorDescriptor,
  ActorInterface,
  AnyActorDescriptor,
  Ctx,
  DeadDeliveryNotice,
} from "@cellar-assistant/contracts";
import {
  CellarActorDescriptor,
  FileActorDescriptor,
  ItemActorDescriptor,
  MenuMatchJobActorDescriptor,
  MenuScanActorDescriptor,
  OnboardingReprocessJobActorDescriptor,
  OvertureReloadJobActorDescriptor,
  PingActorDescriptor,
  PlaceActorDescriptor,
  PlaceRefreshJobActorDescriptor,
  RecipeActorDescriptor,
  RecipeGroupActorDescriptor,
  RecipePhotoJobActorDescriptor,
  TierListActorDescriptor,
  UserActorDescriptor,
  VectorReembedJobActorDescriptor,
} from "@cellar-assistant/contracts";
import { MaintenanceActorDescriptor } from "../actors/maintenance-actor-descriptor.ts";
import { ProbeJobActorDescriptor } from "../actors/probe-job-actor-descriptor.ts";

/** `"ItemActor.create"` — how a pair is keyed here and in the drainer. */
export const outboxTargetKey = (actor: string, method: string): string =>
  `${actor}.${method}`;

/** Where a site's `targetId` came from. See the module doc. */
export type TargetIdProvenance = "self" | "constant" | "derived" | "caller";

type EnqueuerBase = {
  /** Path relative to `services/actors/src`; a file, or a directory prefix. */
  readonly module: string;
};

export type Enqueuer =
  | (EnqueuerBase & { readonly targetId: "self" })
  | (EnqueuerBase & { readonly targetId: "constant"; readonly note: string })
  | (EnqueuerBase & { readonly targetId: "derived"; readonly note: string })
  | (EnqueuerBase & {
      readonly targetId: "caller";
      readonly note: string;
      /** The check at the enqueue site that authorizes the id. */
      readonly authorization: string;
    })
  | (EnqueuerBase & {
      readonly targetId: "caller";
      readonly note: string;
      /** No check at the enqueue site. The test inventories every one of these. */
      readonly authorization: null;
      readonly accepted: string;
    });

/**
 * One declared `(targetActor, method)` pair — what the drainer may deliver.
 * Every entry in {@link OUTBOX_TARGETS} is one; only an {@link OutboxTarget}
 * may also be *enqueued*.
 */
export type DeclaredPair<TKey extends string = string> = {
  /** `"Actor.method"`, the entry's own key. */
  readonly key: TKey;
  /** Actor *type* as registered with Dapr — the descriptor's `actorType`. */
  readonly actorType: string;
  /** Method name on that actor, invoked as `method(systemCtx, payload)`. */
  readonly method: string;
  /** The descriptor the pair was built from; the test finds it registered. */
  readonly descriptor: AnyActorDescriptor;
  readonly enqueuedBy: readonly Enqueuer[];
  readonly note?: string;
  /**
   * Set only on an **operational probe**: a pair no production module may
   * enqueue (it is not an {@link OutboxTarget}, so `enqueueOutbox` does not
   * accept it), declared so the runtime acceptance and soak harnesses — which
   * insert rows straight into `outbox` — can prove the drainer delivers. The
   * text says why a policy-off delivery of it is harmless. Inventoried by
   * `probeTargets()`.
   */
  readonly probe?: string;
  /**
   * The method on this same actor the drainer enqueues, at this row's
   * `target_id`, in the statement that dead-letters a row of this pair. It
   * must be a declared {@link DeclaredPair.compensation} pair. See the module
   * doc, "Compensations".
   */
  readonly onDead?: string;
  /**
   * Set only on a **compensation**: a pair enqueued by the drainer alone, as
   * some other pair's `onDead`. Not an {@link OutboxTarget} (so no module can
   * enqueue it), it may not declare an `onDead` itself, and the text says why
   * a policy-off delivery of it is harmless. Inventoried by
   * `compensationTargets()`.
   */
  readonly compensation?: string;
};

/** Brands an enqueueable handle. Not exported, so no handle can be written by hand. */
declare const enqueueable: unique symbol;

/**
 * A declared pair that module code may enqueue, carrying — as a type only —
 * the payload its method takes. The value is the {@link OUTBOX_TARGETS} entry
 * itself; the brand exists in the type and nowhere at runtime.
 */
export type OutboxTarget<
  TKey extends string = string,
  TPayload = unknown,
> = DeclaredPair<TKey> & {
  readonly [enqueueable]: { readonly payload: TPayload };
};

/**
 * The second argument `OutboxActor` invokes `method` with — the row's payload
 * — or `undefined` for a method that takes none.
 */
export type OutboxPayloadOf<TMethod> = TMethod extends (
  ctx: Ctx,
  ...args: infer TArgs
) => Promise<unknown>
  ? TArgs extends []
    ? undefined
    : TArgs[0]
  : never;

/** What one enqueue says besides its target. */
export type OutboxDelivery<TPayload> = {
  /**
   * The target actor's id — `this.key` of whatever should receive the call.
   *
   * **If it is not `this.key`, say where it comes from in the registry, and if
   * it comes from the caller, authorize it here first.** The delivery runs with
   * policy off, so this is the last point at which anyone can.
   */
  readonly targetId: string;
  /**
   * How long to wait before the row is due, in milliseconds **of the
   * database's clock** (`lib/outbox.ts`, `runAfterSql`). Omit for "as soon as
   * the drainer gets to it".
   */
  readonly delayMs?: number;
} & (undefined extends TPayload
  ? {
      /** Second argument of the call; stored as `{}` when omitted. JSON. */
      readonly payload?: Exclude<TPayload, undefined>;
    }
  : {
      /** Second argument of the call. JSON. */
      readonly payload: TPayload;
    });

/* -------------------------------------------------------------------------- */
/* Building the list                                                           */
/* -------------------------------------------------------------------------- */

type Methods<TI, TN> = keyof (TI & TN) & string;

/** Methods of the interface whose payload is a dead-delivery notice. */
type NoticeMethods<T> = {
  [K in keyof T & string]: OutboxPayloadOf<T[K]> extends DeadDeliveryNotice
    ? K
    : never;
}[keyof T & string];

/** An entry before its key is stamped on. */
type Spec<TKind extends SpecKind, TPayload> = Omit<DeclaredPair, "key"> & {
  readonly kind: TKind;
  /** Phantom; never set. Carries the payload type to {@link Stamped}. */
  readonly __payload?: { readonly payload: TPayload };
};

type SpecKind = "target" | "probe" | "compensation";

type TargetPolicy<TMethods extends string> = {
  readonly enqueuedBy: readonly [Enqueuer, ...Enqueuer[]];
  readonly note?: string;
  readonly onDead?: TMethods;
};

/** An enqueueable pair. The method's payload must be an object (it is stored as JSON). */
const target = <
  TI extends ActorInterface,
  TN extends ActorInterface,
  TMethod extends Methods<TI, TN>,
>(
  descriptor: ActorDescriptor<TI, TN>,
  method: TMethod &
    (OutboxPayloadOf<(TI & TN)[TMethod]> extends object | undefined
      ? unknown
      : never),
  policy: TargetPolicy<NoticeMethods<TI & TN>>,
): Spec<"target", OutboxPayloadOf<(TI & TN)[TMethod]>> => ({
  kind: "target",
  actorType: descriptor.actorType,
  method,
  descriptor,
  ...policy,
});

/** An operational probe: deliverable, never enqueueable. */
const probe = <TI extends ActorInterface, TN extends ActorInterface>(
  descriptor: ActorDescriptor<TI, TN>,
  method: Methods<TI, TN>,
  policy: { readonly probe: string },
): Spec<"probe", never> => ({
  kind: "probe",
  actorType: descriptor.actorType,
  method,
  descriptor,
  enqueuedBy: [],
  ...policy,
});

/** A compensation: enqueued by the drainer alone, as another pair's `onDead`. */
const compensation = <TI extends ActorInterface, TN extends ActorInterface>(
  descriptor: ActorDescriptor<TI, TN>,
  method: NoticeMethods<TI & TN>,
  policy: { readonly compensation: string },
): Spec<"compensation", never> => ({
  kind: "compensation",
  actorType: descriptor.actorType,
  method,
  descriptor,
  enqueuedBy: [],
  ...policy,
});

type Stamped<TSpecs> = {
  readonly [K in keyof TSpecs & string]: TSpecs[K] extends Spec<
    "target",
    infer TPayload
  >
    ? OutboxTarget<K, TPayload>
    : DeclaredPair<K>;
};

/**
 * Stamps each entry with its key, and refuses — at module load, so at boot
 * and in every test that imports this — a key that does not say
 * `${descriptor.actorType}.${method}`. The drainer keys its own lookup off
 * the handle, not the key, so a mismatch could never widen what it delivers;
 * this keeps the name a reader greps for honest.
 */
const defineOutboxTargets = <
  const TSpecs extends Record<string, Spec<SpecKind, unknown>>,
>(
  specs: TSpecs,
): Stamped<TSpecs> =>
  Object.fromEntries(
    Object.entries(specs).map(([key, spec]) => {
      if (key !== outboxTargetKey(spec.actorType, spec.method)) {
        throw new Error(
          `OUTBOX_TARGETS: key "${key}" names ${spec.actorType}.${spec.method}`,
        );
      }
      const { kind: _kind, __payload: _payload, ...pair } = spec;
      return [key, { key, ...pair }];
    }),
  ) as Stamped<TSpecs>;

/** Why `JobActor.markFailed` is harmless to deliver with policy off. */
const JOB_MARK_FAILED =
  "Every `runBatch`'s `onDead` (`JobActor.markFailed`). Writes `status = " +
  "'failed'` and `finished_at` on this job's own `jobs` row and nothing " +
  "else, and only while the job is not terminal and still waiting on the " +
  "batch the dead row carried — so a stale or repeated delivery is a no-op.";

/**
 * Every `(targetActor, method)` the outbox may deliver, and who may enqueue it.
 *
 * Keep it sorted by key. The compiler holds each entry to its descriptor and
 * each enqueue site to its entry's payload; `outbox-targets.test.ts` enforces,
 * against a scan of `services/actors/src`:
 *
 *   1. **containment** — every enqueue site names a pair from a module this
 *      entry lists, with a `targetId` shape this entry declares;
 *   2. **no staleness** — every target, and every listed module, has a live
 *      site (a `probe` or `compensation` has none by definition, and is
 *      inventoried instead);
 *   3. **registration** — every entry's descriptor is registered with Dapr
 *      (`services/actors/src/actors/registry.ts`);
 *   4. **completeness** — `lib/outbox.ts` is the only module in the tree that
 *      inserts into the `outbox` table at all (`packages/db`'s
 *      `outbox-inserts.test.ts`), and every reference to its two enqueue
 *      functions is a call the scan can read.
 */
export const OUTBOX_TARGETS = defineOutboxTargets({
  /* ---------------------------------------------------------------- Cellar */

  "CellarActor.addItem": target(CellarActorDescriptor, "addItem", {
    enqueuedBy: [
      {
        module: "actors/item-onboarding-actor.ts",
        targetId: "caller",
        note: "`input.cellarId` on `confirm`, straight off the mutation.",
        authorization:
          "`#requireCellarWriteAccess(cellarId, aggregate.row.userId)` — E5a. " +
          "It cannot live at the far end: `CellarActor.addItem` is delivered " +
          "as `systemCtx`, so its own owner gate opens on `bypassesPolicy`.",
      },
    ],
  }),

  /* ------------------------------------------------------------------ File */

  "FileActor.delete": target(FileActorDescriptor, "delete", {
    enqueuedBy: [
      {
        module: "actors/maintenance-actor.ts",
        targetId: "derived",
        note:
          "`orphan.id` — `files` rows the reaper's own sweep selected " +
          "(uploaded, unreferenced, older than the grace window). No caller " +
          "input reaches this id.",
      },
    ],
  }),

  /* ------------------------------------------------------------------ Item */

  "ItemActor.create": target(ItemActorDescriptor, "create", {
    enqueuedBy: [
      {
        module: "actors/item-onboarding-actor.ts",
        targetId: "caller",
        note:
          "`itemActorId(item)`, where `item.id` is `input.itemId` when the " +
          'caller supplies one and `derivedUuid(this.key, "item")` otherwise.',
        authorization:
          "`#requireItemNotAnotherUsers(item, aggregate.row.userId)`, run " +
          "only when `input.itemId` was supplied — the derived id is minted " +
          "from `this.key` and can name nothing but this onboarding's item.",
      },
    ],
  }),

  "ItemActor.linkBrand": target(ItemActorDescriptor, "linkBrand", {
    enqueuedBy: [
      {
        module: "actors/item-onboarding-actor.ts",
        targetId: "caller",
        note: "Same `itemActorId(item)` as `ItemActor.create` above.",
        authorization:
          "`#requireItemNotAnotherUsers(item, aggregate.row.userId)` — E5a " +
          "found this one unchecked; it is the reason the check exists.",
      },
    ],
  }),

  "ItemActor.regenerateVector": target(
    ItemActorDescriptor,
    "regenerateVector",
    {
      enqueuedBy: [{ module: "actors/item-actor.ts", targetId: "self" }],
    },
  ),

  "ItemActor.embedImage": target(ItemActorDescriptor, "embedImage", {
    enqueuedBy: [{ module: "actors/item-actor.ts", targetId: "self" }],
  }),

  "ItemActor.setBarcode": target(ItemActorDescriptor, "setBarcode", {
    enqueuedBy: [
      {
        module: "actors/barcode-actor.ts",
        targetId: "caller",
        note: "`itemActorId(ref)` from `input.itemType` / `input.itemId`.",
        authorization:
          "`isOwner(ctx, createdById)` against the item's freshly read " +
          "creator. **This is the house pattern** — the one pre-existing site " +
          "that proved ownership of a caller-supplied `targetId` before " +
          "enqueuing, and the shape both E5a checks were modelled on.",
      },
    ],
  }),

  /* ----------------------------------------------------------- Maintenance */

  "MaintenanceActor.reapOrphanFiles": target(
    MaintenanceActorDescriptor,
    "reapOrphanFiles",
    {
      note: "Self-arming chain; enqueued through `armCycle`, whose `target` parameter is typed as exactly this pair or the next.",
      enqueuedBy: [{ module: "actors/maintenance-actor.ts", targetId: "self" }],
    },
  ),

  "MaintenanceActor.reportDeadLetters": target(
    MaintenanceActorDescriptor,
    "reportDeadLetters",
    {
      note: "The other half of the same self-arming pair.",
      enqueuedBy: [{ module: "actors/maintenance-actor.ts", targetId: "self" }],
    },
  ),

  /* ------------------------------------------------------------- Menu scan */

  "MenuMatchJobActor.start": target(MenuMatchJobActorDescriptor, "start", {
    enqueuedBy: [
      {
        module: "actors/menu-scan-actor.ts",
        targetId: "derived",
        note: "`menuMatchJobId(this.key)` — a deterministic id minted from this scan's own key.",
      },
    ],
  }),

  "MenuScanActor.match": target(MenuScanActorDescriptor, "match", {
    enqueuedBy: [{ module: "actors/menu-scan-actor.ts", targetId: "self" }],
  }),

  "MenuScanActor.markFailed": compensation(
    MenuScanActorDescriptor,
    "markFailed",
    {
      compensation:
        "`MenuScanActor.process`'s `onDead`. Writes `processing_status = " +
        "'failed'` on this scan and nothing else, and only while it is not " +
        "already `completed` or `failed` — so a late or repeated delivery is a " +
        "no-op, and the one row it can touch is the scan whose extraction died.",
    },
  ),

  "MenuScanActor.process": target(MenuScanActorDescriptor, "process", {
    enqueuedBy: [{ module: "actors/menu-scan-actor.ts", targetId: "self" }],
    onDead: "markFailed",
  }),

  /* ------------------------------------------------------------------ Ping */

  "PingActor.ping": probe(PingActorDescriptor, "ping", {
    probe:
      "The acceptance and soak harnesses' drain probe " +
      "(services/actors/scripts/runtime-acceptance.sh proof 5, " +
      "a7b-acceptance.sh `ordering`, scripts/soak/soak.ts). `PingActor` holds " +
      "no database handle and no actor state; `ping` increments an in-memory " +
      "counter and returns a `PingResult`, so a delivery with policy off " +
      "reads and writes nothing — no table, no state store, no other actor. " +
      "No module enqueues it, and containment keeps it that way: only " +
      "something already holding the Postgres credential can write the row.",
  }),

  /* ----------------------------------------------------------------- Place */

  "PlaceActor.addMenuFromScan": target(
    PlaceActorDescriptor,
    "addMenuFromScan",
    {
      enqueuedBy: [
        {
          module: "actors/menu-scan-actor.ts",
          targetId: "caller",
          note:
            "`effectivePlaceId(aggregate.row)` = `manual_place_override ?? " +
            "place_id ?? estimated_place_id` on this actor's own `menu_scans` " +
            "row. It reads as `derived`, and one hop back it is not: " +
            "`MenuScanActor.create` takes `input.placeHint.placeId` and stores " +
            "it after `requireUuid` and nothing else, so the caller chooses " +
            "which place this delivery writes menus into.",
          authorization: null,
          accepted:
            "Places are shared reference entities, not user-owned aggregates — " +
            "`PlaceActor` has no owner column to check against, and attaching a " +
            "menu to a place is the product's intended behaviour for any signed-" +
            "in user. Recorded rather than fixed, and deliberately classified " +
            "`caller` rather than `derived`: the inventory test below is the " +
            "standing reminder that the id is caller-chosen and lands with " +
            "policy off.",
        },
      ],
    },
  ),

  "PlaceActor.enrichFromGoogle": target(
    PlaceActorDescriptor,
    "enrichFromGoogle",
    {
      note: "The request-driven half re-enqueues itself so eight external round trips happen outside the user's turn (§8.5).",
      enqueuedBy: [{ module: "actors/place-actor.ts", targetId: "self" }],
    },
  ),

  "PlaceActor.linkMenuItemRecipe": target(
    PlaceActorDescriptor,
    "linkMenuItemRecipe",
    {
      enqueuedBy: [
        {
          module: "actors/menu-scan-actor.ts",
          targetId: "derived",
          note:
            "`row.place_id`, joined from `item_match_suggestions` → " +
            "`place_menu_items` — rows `PlaceActor` itself wrote. Their place is " +
            "whatever `PlaceActor.addMenuFromScan` was given, so the caller " +
            "influence noted on that entry is upstream of this one too.",
        },
      ],
    },
  ),

  "PlaceActor.verifyMenuItemMatch": target(
    PlaceActorDescriptor,
    "verifyMenuItemMatch",
    {
      enqueuedBy: [
        {
          module: "actors/menu-scan-actor.ts",
          targetId: "derived",
          note: "Same join, same rows, same upstream note as `PlaceActor.linkMenuItemRecipe`.",
        },
      ],
    },
  ),

  /* ---------------------------------------------------------------- Recipe */

  "RecipeActor.regenerateVector": target(
    RecipeActorDescriptor,
    "regenerateVector",
    {
      enqueuedBy: [
        { module: "actors/recipe-actor.ts", targetId: "self" },
        {
          module: "actors/recipe-group-actor.ts",
          targetId: "derived",
          note:
            "`recipe.id` for every row of `recipes where recipe_group_id = " +
            "this.key` — a canonical change restates every member's vector. " +
            "**The member list is caller-influenced**: membership is " +
            "`recipes.recipe_group_id`, which each recipe's creator sets to any " +
            "group at all (see `RecipeGroupActor.recomputeCanonical`). What " +
            "keeps this `derived` rather than `caller` is the direction of that " +
            "choice: a caller can put only their *own* recipe into a group, so " +
            "the ids this site reaches are recipes whose creators each chose to " +
            "be here, and the delivery recomputes a vector from that recipe's " +
            "own content (and skips when it is fresh).",
        },
      ],
    },
  ),

  "RecipeGroupActor.recomputeCanonical": target(
    RecipeGroupActorDescriptor,
    "recomputeCanonical",
    {
      enqueuedBy: [
        {
          module: "actors/recipe-actor.ts",
          targetId: "caller",
          note:
            "`aggregate.recipe.recipeGroupId` on `delete`. It reads as a column " +
            "on this actor's own row, and one hop back it is the caller's " +
            "choice: `RecipeActor.create` and `update` take " +
            "`input.recipeGroupId` and store it after `requireUuid` and the FK, " +
            "nothing else — so any signed-in user can file a recipe under any " +
            "group, then delete it and make this delivery land on that group.",
          authorization: null,
          accepted:
            "Recipe groups are community groupings — the versions of one drink " +
            "— not owned aggregates for membership: the legacy Hasura " +
            "permission on `recipes.recipe_group_id` was `check: {}` for insert " +
            "and update, and the actor keeps that on purpose. The delivery " +
            "recomputes the group's canonical version from its current members " +
            "and votes, deterministically and idempotently; it can rename the " +
            "group to the winning recipe's name, which is also what any vote " +
            "does. Recorded rather than fixed, and classified `caller` rather " +
            "than `derived` in the spirit of `PlaceActor.addMenuFromScan`: the " +
            "inventory test is the standing reminder that the id is " +
            "caller-chosen and lands with policy off.",
        },
      ],
    },
  ),

  /* ------------------------------------------------------------- Tier list */

  "TierListActor.generateInsights": target(
    TierListActorDescriptor,
    "generateInsights",
    {
      note: "`enqueueOutboxOnce`, so one authenticated request cannot put thirty of these ahead of everyone else's work.",
      enqueuedBy: [{ module: "actors/tier-list-actor.ts", targetId: "self" }],
    },
  ),

  /* ------------------------------------------------------------------ User */

  "UserActor.confirmFriendship": target(
    UserActorDescriptor,
    "confirmFriendship",
    {
      enqueuedBy: [
        {
          module: "actors/user-actor.ts",
          targetId: "derived",
          note:
            "`request.userId` from a `friend_requests` row read fresh and " +
            "checked to be addressed to `this.key` (§1.7 step 2).",
        },
      ],
    },
  ),

  "UserActor.removeFriendOtherSide": target(
    UserActorDescriptor,
    "removeFriendOtherSide",
    {
      enqueuedBy: [
        {
          module: "actors/user-actor.ts",
          targetId: "caller",
          note: "`friendId`, the argument to `removeFriend`.",
          authorization:
            "`#areFriends(await this.#friendRows(), friendId)` — an existing " +
            "friendship, read fresh, is required before the row is written, so " +
            "the delivery can only reach a user who was already a friend.",
        },
      ],
    },
  ),

  "UserActor.withdrawFriendRequest": target(
    UserActorDescriptor,
    "withdrawFriendRequest",
    {
      enqueuedBy: [
        {
          module: "actors/user-actor.ts",
          targetId: "derived",
          note: "`request.userId` from a `friend_requests` row this user is party to.",
        },
      ],
    },
  ),

  /* ------------------------------------------------- Job actors (§2.6) ---- */
  /* `JobActor.scheduleBatch` enqueues `jobRunBatchTarget(this.getActorType())`
     (below), typed as one of exactly these seven. The test holds them to the
     `JobActor` subclasses the registry registers, so an eighth job actor is a
     red test here rather than a throw at its first batch. `targetId` is
     `this.key`.

     Each `runBatch` declares `onDead: "markFailed"`: a batch the outbox gives
     up on ends the job, and `markFailed` is how the job hears it — including
     when the host died mid-batch on the last attempt and `runBatch` never got
     the turn to say so itself. */

  "MenuMatchJobActor.runBatch": target(
    MenuMatchJobActorDescriptor,
    "runBatch",
    {
      enqueuedBy: [{ module: "actors/job-actor", targetId: "self" }],
      onDead: "markFailed",
    },
  ),
  "OnboardingReprocessJobActor.runBatch": target(
    OnboardingReprocessJobActorDescriptor,
    "runBatch",
    {
      enqueuedBy: [{ module: "actors/job-actor", targetId: "self" }],
      onDead: "markFailed",
    },
  ),
  "OvertureReloadJobActor.runBatch": target(
    OvertureReloadJobActorDescriptor,
    "runBatch",
    {
      enqueuedBy: [{ module: "actors/job-actor", targetId: "self" }],
      onDead: "markFailed",
    },
  ),
  "PlaceRefreshJobActor.runBatch": target(
    PlaceRefreshJobActorDescriptor,
    "runBatch",
    {
      enqueuedBy: [{ module: "actors/job-actor", targetId: "self" }],
      onDead: "markFailed",
    },
  ),
  "ProbeJobActor.runBatch": target(ProbeJobActorDescriptor, "runBatch", {
    enqueuedBy: [{ module: "actors/job-actor", targetId: "self" }],
    onDead: "markFailed",
  }),
  "RecipePhotoJobActor.runBatch": target(
    RecipePhotoJobActorDescriptor,
    "runBatch",
    {
      enqueuedBy: [{ module: "actors/job-actor", targetId: "self" }],
      onDead: "markFailed",
    },
  ),
  "VectorReembedJobActor.runBatch": target(
    VectorReembedJobActorDescriptor,
    "runBatch",
    {
      enqueuedBy: [{ module: "actors/job-actor", targetId: "self" }],
      onDead: "markFailed",
    },
  ),

  /* `JobActor.markFailed`, the compensation every `runBatch` above names. */

  "MenuMatchJobActor.markFailed": compensation(
    MenuMatchJobActorDescriptor,
    "markFailed",
    {
      compensation: JOB_MARK_FAILED,
    },
  ),
  "OnboardingReprocessJobActor.markFailed": compensation(
    OnboardingReprocessJobActorDescriptor,
    "markFailed",
    {
      compensation: JOB_MARK_FAILED,
    },
  ),
  "OvertureReloadJobActor.markFailed": compensation(
    OvertureReloadJobActorDescriptor,
    "markFailed",
    {
      compensation: JOB_MARK_FAILED,
    },
  ),
  "PlaceRefreshJobActor.markFailed": compensation(
    PlaceRefreshJobActorDescriptor,
    "markFailed",
    {
      compensation: JOB_MARK_FAILED,
    },
  ),
  "ProbeJobActor.markFailed": compensation(
    ProbeJobActorDescriptor,
    "markFailed",
    {
      compensation: JOB_MARK_FAILED,
    },
  ),
  "RecipePhotoJobActor.markFailed": compensation(
    RecipePhotoJobActorDescriptor,
    "markFailed",
    {
      compensation: JOB_MARK_FAILED,
    },
  ),
  "VectorReembedJobActor.markFailed": compensation(
    VectorReembedJobActorDescriptor,
    "markFailed",
    {
      compensation: JOB_MARK_FAILED,
    },
  ),
});

export type OutboxTargetKey = keyof typeof OUTBOX_TARGETS;

/* -------------------------------------------------------------------------- */
/* Job actors: the one target whose actor is chosen at runtime                  */
/* -------------------------------------------------------------------------- */

/** The seven `runBatch` pairs `JobActor.scheduleBatch` can enqueue. */
export type JobRunBatchKey =
  | "MenuMatchJobActor.runBatch"
  | "OnboardingReprocessJobActor.runBatch"
  | "OvertureReloadJobActor.runBatch"
  | "PlaceRefreshJobActor.runBatch"
  | "ProbeJobActor.runBatch"
  | "RecipePhotoJobActor.runBatch"
  | "VectorReembedJobActor.runBatch";

const JOB_RUN_BATCH: ReadonlyMap<
  string,
  (typeof OUTBOX_TARGETS)[JobRunBatchKey]
> = new Map(
  (
    [
      "MenuMatchJobActor.runBatch",
      "OnboardingReprocessJobActor.runBatch",
      "OvertureReloadJobActor.runBatch",
      "PlaceRefreshJobActor.runBatch",
      "ProbeJobActor.runBatch",
      "RecipePhotoJobActor.runBatch",
      "VectorReembedJobActor.runBatch",
    ] as const satisfies readonly JobRunBatchKey[]
  ).map((key) => [OUTBOX_TARGETS[key].actorType, OUTBOX_TARGETS[key]]),
);

/**
 * The `runBatch` handle for the job actor type `actorType` — which
 * `JobActor.scheduleBatch` passes as `this.getActorType()`, so a job only ever
 * schedules its own next batch.
 *
 * The base class cannot name its subclass in a type, so this is the one
 * lookup by runtime value left on the enqueue path. What bounds it is this
 * table: the result is one of the seven declared `runBatch` handles or a throw,
 * never an undeclared pair (before handles, an unknown job type was written to
 * the outbox and dead-lettered by the drainer instead). `outbox-targets.test.ts`
 * holds the table to exactly the `JobActor` subclasses `registry.ts` registers.
 */
export const jobRunBatchTarget = (
  actorType: string,
): (typeof OUTBOX_TARGETS)[JobRunBatchKey] => {
  const handle = JOB_RUN_BATCH.get(actorType);
  if (handle === undefined) {
    throw new Error(
      `${actorType}.runBatch is not a declared outbox target (lib/outbox-targets.ts)`,
    );
  }
  return handle;
};

/** Every job actor type {@link jobRunBatchTarget} answers for. */
export const jobRunBatchActorTypes = (): readonly string[] =>
  [...JOB_RUN_BATCH.keys()].sort();

/* -------------------------------------------------------------------------- */

const TARGETS: ReadonlyMap<string, DeclaredPair> = new Map(
  Object.values(OUTBOX_TARGETS as Record<string, DeclaredPair>).map((pair) => [
    outboxTargetKey(pair.actorType, pair.method),
    pair,
  ]),
);

/** The declaration for a pair, or `undefined` if the outbox may not deliver it. */
export const outboxTarget = (
  actor: string,
  method: string,
): DeclaredPair | undefined => TARGETS.get(outboxTargetKey(actor, method));

/**
 * May the drainer invoke this pair?
 *
 * Called once per delivery by `OutboxActor.#deliverOne` — a `Map` lookup against
 * the sidecar hop it guards, which is not a cost worth discussing. Keyed off
 * each handle's own `actorType` and `method`, the same two strings a row
 * carries.
 */
export const isAllowedOutboxTarget = (actor: string, method: string): boolean =>
  TARGETS.has(outboxTargetKey(actor, method));

/** Is `file` inside `module` (a file path, or a directory prefix)? */
export const isEnqueuerModule = (file: string, module: string): boolean =>
  file === module || file === `${module}.ts` || file.startsWith(`${module}/`);

/**
 * Every declared enqueue site whose `targetId` is caller-chosen and carries no
 * authorization check. The test asserts this list exactly, so a new one is a
 * red test rather than a discovery six months later.
 */
export const unauthorizedCallerTargets = (): readonly string[] =>
  [...TARGETS.entries()]
    .flatMap(([key, pair]) =>
      pair.enqueuedBy
        .filter(
          (enqueuer) =>
            enqueuer.targetId === "caller" && enqueuer.authorization === null,
        )
        .map((enqueuer) => `${key} <- ${enqueuer.module}`),
    )
    .sort();

/**
 * Every declared pair that is an operational probe — no production enqueuer,
 * declared so the acceptance harnesses can prove the drainer delivers. The
 * test asserts this list exactly, like `unauthorizedCallerTargets()`, so a
 * second probe is an argument in review rather than a quiet addition.
 */
export const probeTargets = (): readonly string[] =>
  [...TARGETS.entries()]
    .filter(([, pair]) => pair.probe !== undefined)
    .map(([key]) => key)
    .sort();

/** One `onDead` declaration: dead-lettering `targetActor.method` enqueues `targetActor.onDead`. */
export type OutboxCompensation = {
  readonly targetActor: string;
  readonly method: string;
  readonly onDead: string;
};

/**
 * Every declared `onDead`, for the drainer's dead-letter statement. Only pairs
 * whose `onDead` names a declared compensation are returned — the test holds
 * the registry to that, and this holds the runtime to it even if the test
 * were skipped.
 */
export const outboxCompensations = (): readonly OutboxCompensation[] =>
  [...TARGETS.values()].flatMap((pair) => {
    if (pair.onDead === undefined || pair.compensation !== undefined) {
      return [];
    }
    const compensating = TARGETS.get(
      outboxTargetKey(pair.actorType, pair.onDead),
    );
    return compensating?.compensation === undefined
      ? []
      : [
          {
            targetActor: pair.actorType,
            method: pair.method,
            onDead: pair.onDead,
          },
        ];
  });

/**
 * Every declared compensation pair. The test asserts this list exactly, like
 * `probeTargets()`.
 */
export const compensationTargets = (): readonly string[] =>
  [...TARGETS.entries()]
    .filter(([, pair]) => pair.compensation !== undefined)
    .map(([key]) => key)
    .sort();
