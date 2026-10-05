import type { ActorCategory } from "./categories.ts";
import type { Ctx } from "./ctx.ts";

/**
 * Every actor method takes `Ctx` first and returns a promise (§8.2).
 */
// biome-ignore lint/suspicious/noExplicitAny: variance hole required for a generic method constraint
export type ActorMethod = (ctx: Ctx, ...args: any[]) => Promise<unknown>;

export type ActorInterface = Record<string, ActorMethod>;

/** An actor with no internal-only methods: the default second parameter below. */
export type NoInternalMethods = Record<never, never>;

/**
 * Static description of an actor type. Naming per §8.3: `<Thing>Actor`,
 * category as a static field.
 *
 * ## Two interfaces, one descriptor
 *
 * `TInterface` is what a request may reach: `services/api`'s
 * `context.actor(descriptor, id)` is typed over it and nothing else.
 * `TInternal` is the methods only another actor calls — a sidecar hop from
 * inside the actor host, never a resolver — such as
 * `BudgetActor.reserveForModel`. The actors' own typed client
 * (`services/actors/src/lib/internal-client.ts`) sees both; the API's cannot
 * name the second, so a resolver that tries is a compile error rather than a
 * policy check that has to hold at runtime.
 *
 * The actor class is tied to *both* by its registry entry
 * (`services/actors/src/actors/registry.ts`), which refuses a class whose
 * methods do not match `TInterface & TInternal` — with strict parameter
 * variance, which `implements` alone does not give.
 *
 * ## The method tables are exhaustive, and they are the wire allow-list
 *
 * Dapr's JS host dispatches `PUT /actors/<type>/<id>/method/<name>` to **any
 * function-valued property** called `<name>` — TypeScript's `protected` and
 * `private` do not exist at runtime, so `tx`, `setAggregate` or a test
 * counter were all callable through a sidecar. The actor host refuses any
 * name that is not a key of `methods` or `internalMethods` before the request
 * reaches the SDK (`services/actors/src/lib/actor-method-allowlist.ts`). So
 * both tables list **every** method of their interface — the mapped type
 * makes a missing key and an extra key both compile errors — and a method
 * with nothing to say takes `{}`.
 */
export type ActorDescriptor<
  TInterface extends ActorInterface,
  TInternal extends ActorInterface = NoInternalMethods,
> = {
  readonly actorType: string;
  readonly category: ActorCategory;
  /**
   * Every method of `TInterface`, with its metadata — keyed by the
   * interface's own method names, so a renamed or deleted method leaves a key
   * the type no longer allows, which is a compile error at the descriptor
   * rather than a string that silently stops matching (the
   * `"PlaceCreationActor.create"` timeout that should have said `createPlace`
   * is the precedent).
   */
  readonly methods: ActorMethodTable<TInterface>;
  /** Phantom field; carries the interface type, erased at runtime. */
  readonly __interface?: TInterface;
  /** Phantom field; carries the internal interface type, erased at runtime. */
  readonly __internal?: TInternal;
} & ([keyof TInternal] extends [never]
  ? {
      /** No internal methods: may be omitted. */
      readonly internalMethods?: ActorMethodTable<TInternal>;
    }
  : {
      /** Every method of `TInternal`, the same way `methods` lists `TInterface`. */
      readonly internalMethods: ActorMethodTable<TInternal>;
    });

/**
 * What a descriptor may say about one method.
 */
export type ActorMethodMeta = {
  /**
   * How long **any** caller waits for this method before giving up — the API's
   * transport and the actors' own typed client both read it through
   * {@link actorMethodTimeout}. Absent means {@link DEFAULT_ACTOR_TIMEOUT_MS}.
   *
   * §8.5: "Anything over a few seconds is outbox-driven, not request-driven",
   * with two request-driven exceptions at 120s. Everything above the default
   * says why beside its value.
   */
  readonly timeoutMs?: number;
  /**
   * This method can start a model inference — inline, or through work it
   * enqueues. Declared only on methods a resolver calls (the ones
   * `MODEL_BACKED_FIELDS` in `services/api/src/limits.ts` names as `via`);
   * `services/api/src/model-backed-fields.test.ts` derives the set from source
   * and fails when a flag and the code disagree, in either direction.
   */
  readonly modelBacked?: true;
};

/** One entry per method — required, so the table is the whole interface. */
export type ActorMethodTable<TInterface> = {
  readonly [TMethod in keyof TInterface & string]-?: ActorMethodMeta;
};

/**
 * Every actor method's invocation timeout unless its descriptor says otherwise.
 * The value the API used for everything outside its two long-running calls.
 */
export const DEFAULT_ACTOR_TIMEOUT_MS = 15_000;

/**
 * Any descriptor, for code that only reads its runtime fields (the transports).
 * `methods` is widened to a string-keyed table because a caller holding a
 * method name as a string cannot index the precise mapped type.
 */
export type AnyActorDescriptor = {
  readonly actorType: string;
  readonly category: ActorCategory;
  readonly methods: Readonly<Partial<Record<string, ActorMethodMeta>>>;
  readonly internalMethods?: Readonly<Partial<Record<string, ActorMethodMeta>>>;
};

/** A method's entry in either table, or `undefined` if it declares none. */
export const actorMethodMeta = (
  descriptor: AnyActorDescriptor,
  method: string,
): ActorMethodMeta | undefined => {
  // Own keys only: a method called `constructor` or `toString` must not find
  // `Object.prototype`'s.
  for (const table of [descriptor.methods, descriptor.internalMethods]) {
    if (table !== undefined && Object.hasOwn(table, method)) {
      return table[method];
    }
  }
  return undefined;
};

/**
 * Every method name the descriptor declares, public and internal — what the
 * actor host lets through to Dapr's dispatcher for this actor type.
 */
export const declaredMethods = (
  descriptor: AnyActorDescriptor,
): readonly string[] => [
  ...Object.keys(descriptor.methods),
  ...Object.keys(descriptor.internalMethods ?? {}),
];

/** The method's `timeoutMs`, from whichever table declares it, or the default. */
export const actorMethodTimeout = (
  descriptor: AnyActorDescriptor,
  method: string,
): number =>
  actorMethodMeta(descriptor, method)?.timeoutMs ?? DEFAULT_ACTOR_TIMEOUT_MS;

/**
 * What `services/api` is handed instead of a database: invoke a method on an actor
 * through the Dapr sidecar. Implemented in `services/api`; A7 replaces this with
 * generated typed proxies over the same shape.
 */
export type ActorInvoker = <
  TInterface extends ActorInterface,
  TMethod extends keyof TInterface & string,
>(
  descriptor: ActorDescriptor<TInterface>,
  actorId: string,
  method: TMethod,
  ...args: Parameters<TInterface[TMethod]>
) => Promise<Awaited<ReturnType<TInterface[TMethod]>>>;

/* -------------------------------------------------------------------------- */
/* PingActor — the A2 smoke actor. Delete once a real actor exists.            */
/* -------------------------------------------------------------------------- */

export type PingResult = {
  pong: true;
  message: string;
  actorId: string;
  /** ISO-8601 timestamp produced inside the actor turn. */
  at: string;
  /** Incremented per turn; proves the activation is reused across calls. */
  turns: number;
};

export type PingActorInterface = {
  ping(ctx: Ctx, message: string): Promise<PingResult>;
};

export const PingActorDescriptor: ActorDescriptor<PingActorInterface> = {
  actorType: "PingActor",
  category: "reference",
  methods: { ping: {} },
};

/* TODO(A4): entity/collection/search/view/job actor descriptors land here as
   each workstream defines its aggregate. TODO(A7): the Pothos resolvers import
   descriptors from this module only — never from `services/actors`. */
