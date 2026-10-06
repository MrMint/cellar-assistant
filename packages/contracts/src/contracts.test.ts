import { describe, expect, it } from "vitest";
import {
  type ActorDescriptor,
  type AnyActorDescriptor,
  actorMethodTimeout,
  DEFAULT_ACTOR_TIMEOUT_MS,
  declaredMethods,
  PingActorDescriptor,
  type PingActorInterface,
} from "./actors.ts";
import {
  ACTOR_CATEGORIES,
  CATEGORY_RULES,
  isActorCategory,
  mayWrite,
} from "./categories.ts";
import type { Ctx } from "./ctx.ts";
import { anonymousCtx, isAdmin, isSystem, systemCtx, userCtx } from "./ctx.ts";
import {
  ACTOR_ERROR_CODES,
  ACTOR_ERROR_REASONS,
  BudgetExceededError,
  ConflictError,
  ForbiddenError,
  isActorError,
  isActorErrorReason,
  NotFoundError,
  ValidationError,
} from "./errors.ts";
import * as contracts from "./index.ts";

describe("ctx", () => {
  it("builds an anonymous ctx with no viewer", () => {
    const ctx = anonymousCtx("req-1");
    expect(ctx).toEqual({ viewerId: null, kind: "user", requestId: "req-1" });
    expect(isSystem(ctx)).toBe(false);
    expect(isAdmin(ctx)).toBe(false);
  });

  it("builds a user ctx that carries the viewer id", () => {
    expect(userCtx("user-7", "req-2").viewerId).toBe("user-7");
  });

  it("marks a system ctx as system and viewer-less", () => {
    const ctx = systemCtx("req-3");
    expect(isSystem(ctx)).toBe(true);
    expect(ctx.viewerId).toBeNull();
  });
});

describe("actor categories", () => {
  it("has exactly the six categories from plan §1.1", () => {
    expect([...ACTOR_CATEGORIES]).toEqual([
      "entity",
      "collection",
      "search",
      "view",
      "reference",
      "job",
    ]);
  });

  it("narrows known categories and rejects unknown ones", () => {
    expect(isActorCategory("entity")).toBe(true);
    expect(isActorCategory("aggregate")).toBe(false);
  });
});

const descriptors = Object.entries(contracts).filter(([name]) =>
  name.endsWith("ActorDescriptor"),
) as [string, AnyActorDescriptor][];

describe("actor descriptors", () => {
  it("finds the descriptors at all", () => {
    expect(descriptors.length).toBeGreaterThan(40);
  });

  it("names actors <Thing>Actor per §8.3 and carries a valid category", () => {
    expect(PingActorDescriptor.actorType).toMatch(/Actor$/);
    expect(isActorCategory(PingActorDescriptor.category)).toBe(true);
    for (const [name, descriptor] of descriptors) {
      expect(`${descriptor.actorType}Descriptor`, name).toBe(name);
      expect(isActorCategory(descriptor.category), name).toBe(true);
    }
  });

  it("declares one descriptor per actor type", () => {
    const types = descriptors.map(([, descriptor]) => descriptor.actorType);
    expect(new Set(types).size).toBe(types.length);
  });

  it("gives every declared timeout a positive whole number of ms", () => {
    for (const [name, descriptor] of descriptors) {
      for (const [method, meta] of Object.entries(descriptor.methods ?? {})) {
        const timeout = meta?.timeoutMs;
        if (timeout === undefined) continue;
        expect(
          Number.isInteger(timeout) && timeout > 0,
          `${name}.${method}`,
        ).toBe(true);
      }
    }
  });
});

describe("descriptor method tables", () => {
  it("refuses, at compile time, metadata for a method the contract lacks", () => {
    // The permanent negative control for `ActorMethodTable`: a renamed or
    // misspelled method is a type error at the descriptor, not a key that
    // silently never matches. If the table stops being keyed by the
    // interface, this directive is unused and typecheck fails.
    const descriptor: ActorDescriptor<PingActorInterface> = {
      actorType: "PingActor",
      category: "reference",
      methods: {
        // @ts-expect-error — `PingActorInterface` has no `pong`.
        pong: { timeoutMs: 1 },
      },
    };
    expect(descriptor.methods).toBeDefined();
  });

  it("refuses, at compile time, a table that leaves a method out", () => {
    // The tables are the actor host's wire allow-list, so a method missing
    // from one would be refused at runtime. It is refused here first.
    type Two = PingActorInterface & {
      pang(ctx: Ctx): Promise<void>;
    };
    const descriptor: ActorDescriptor<Two> = {
      actorType: "TwoActor",
      category: "reference",
      // @ts-expect-error — `pang` is missing.
      methods: { ping: {} },
    };
    expect(declaredMethods(descriptor)).toEqual(["ping"]);
  });

  it("requires the internal table when there is an internal interface", () => {
    type Internal = { poke(ctx: Ctx): Promise<void> };
    // @ts-expect-error — `internalMethods` is missing.
    const missing: ActorDescriptor<PingActorInterface, Internal> = {
      actorType: "PokeActor",
      category: "reference",
      methods: { ping: {} },
    };
    const complete: ActorDescriptor<PingActorInterface, Internal> = {
      ...missing,
      internalMethods: { poke: { timeoutMs: 5 } },
    };
    expect(declaredMethods(complete)).toEqual(["ping", "poke"]);
    expect(actorMethodTimeout(complete, "poke")).toBe(5);
  });

  it("lists every method of every descriptor, public and internal", () => {
    for (const [name, descriptor] of descriptors) {
      const declared = declaredMethods(descriptor);
      expect(declared.length, name).toBeGreaterThan(0);
      expect(new Set(declared).size, `${name} declares a method twice`).toBe(
        declared.length,
      );
    }
  });
});

describe("actorMethodTimeout", () => {
  const descriptor = {
    actorType: "ExampleActor",
    category: "entity",
    methods: { slow: { timeoutMs: 120_000 }, flagged: { modelBacked: true } },
  } as const satisfies AnyActorDescriptor;

  it("reads a method's declared timeout", () => {
    expect(actorMethodTimeout(descriptor, "slow")).toBe(120_000);
  });

  it("defaults a method with no entry, or an entry with no timeout", () => {
    expect(actorMethodTimeout(descriptor, "fast")).toBe(
      DEFAULT_ACTOR_TIMEOUT_MS,
    );
    expect(actorMethodTimeout(descriptor, "flagged")).toBe(
      DEFAULT_ACTOR_TIMEOUT_MS,
    );
    expect(actorMethodTimeout(descriptor, "toString")).toBe(
      DEFAULT_ACTOR_TIMEOUT_MS,
    );
  });
});

describe("category rules (§1.1)", () => {
  it("has a rule for every category", () => {
    for (const category of ACTOR_CATEGORIES) {
      expect(CATEGORY_RULES[category]).toBeDefined();
    }
  });

  it("lets only entity and job actors write", () => {
    const writers = ACTOR_CATEGORIES.filter(mayWrite);
    expect([...writers]).toEqual(["entity", "job"]);
  });

  it("makes collection, search, view and reference read-only (§1.2)", () => {
    for (const category of [
      "collection",
      "search",
      "view",
      "reference",
    ] as const) {
      expect(CATEGORY_RULES[category].writes).toBe(
        category === "reference"
          ? "nothing (data changes by migration)"
          : "nothing",
      );
      expect(mayWrite(category)).toBe(false);
    }
  });
});

describe("actor errors (§8.3)", () => {
  it("carries a code that survives the Dapr wire", () => {
    const error = new ForbiddenError("nope");
    expect(error.code).toBe("FORBIDDEN");
    expect(error.name).toBe("ForbiddenError");
    expect(error.message).toBe("nope");
    expect(JSON.parse(JSON.stringify({ code: error.code })).code).toBe(
      "FORBIDDEN",
    );
  });

  it("has exactly the five codes plugin-errors maps in A7", () => {
    expect([...ACTOR_ERROR_CODES]).toEqual([
      "NOT_FOUND",
      "FORBIDDEN",
      "CONFLICT",
      "VALIDATION",
      "BUDGET_EXCEEDED",
    ]);
    const errors = [
      new NotFoundError("a"),
      new ForbiddenError("b"),
      new ConflictError("c"),
      new ValidationError("d"),
      new BudgetExceededError("e"),
    ];
    expect(errors.map((e) => e.code)).toEqual([...ACTOR_ERROR_CODES]);
    expect(errors.every(isActorError)).toBe(true);
    expect(isActorError(new Error("plain"))).toBe(false);
    // `reason` is optional and defaults to null, so the five stay
    // constructible from a message alone.
    expect(errors.map((e) => e.reason)).toEqual([null, null, null, null, null]);
  });

  /**
   * D8's discriminator: one `code` can cover several outcomes a client must
   * branch on, and the alternative was substring-matching English prose.
   */
  it("carries an optional machine-readable `reason` beside the code", () => {
    const conflict = new ConflictError("already friends", "ALREADY_FRIENDS");
    expect(conflict.code).toBe("CONFLICT");
    expect(conflict.reason).toBe("ALREADY_FRIENDS");
    expect(isActorErrorReason("ALREADY_FRIENDS")).toBe(true);
    expect(isActorErrorReason("NOT_A_REASON")).toBe(false);
    expect(isActorErrorReason(null)).toBe(false);

    // Every value is distinct, and the set is the whole vocabulary a client
    // may switch on. Adding to this list is compatible; renaming is not.
    expect(new Set(ACTOR_ERROR_REASONS).size).toBe(ACTOR_ERROR_REASONS.length);
    expect([...ACTOR_ERROR_REASONS]).toEqual([
      "CANNOT_FRIEND_SELF",
      "ALREADY_FRIENDS",
      "FRIEND_REQUEST_ALREADY_SENT",
      "FRIEND_REQUEST_ALREADY_RECEIVED",
      "REVIEW_ALREADY_EXISTS",
      "NOT_REVIEW_AUTHOR",
      "RECIPE_NOT_IN_GROUP",
      "IMAGE_SEARCH_UNAVAILABLE",
    ]);
  });

  /**
   * A7d item 8. The three recipe reasons were the plan's whole ask, and each
   * one has to be *reachable* — a reason nothing throws is a vocabulary entry
   * a client can never observe.
   *
   * `errors.ts`'s wire round-trip drops an unrecognised reason rather than
   * failing (`parseActorErrorPayload`), which is the right behaviour for a
   * rolling deploy and exactly why a typo here would be silent: the error
   * would still arrive, just with `reason: null`, and no test that only
   * checked the message would notice.
   */
  it("carries each recipe reason through its own error class", () => {
    const review = new ConflictError(
      "you already reviewed this",
      "REVIEW_ALREADY_EXISTS",
    );
    expect(review.code).toBe("CONFLICT");
    expect(review.reason).toBe("REVIEW_ALREADY_EXISTS");

    const author = new ForbiddenError("not yours", "NOT_REVIEW_AUTHOR");
    expect(author.code).toBe("FORBIDDEN");
    expect(author.reason).toBe("NOT_REVIEW_AUTHOR");

    const member = new NotFoundError(
      "not in this group",
      "RECIPE_NOT_IN_GROUP",
    );
    expect(member.code).toBe("NOT_FOUND");
    expect(member.reason).toBe("RECIPE_NOT_IN_GROUP");

    for (const reason of [
      "REVIEW_ALREADY_EXISTS",
      "NOT_REVIEW_AUTHOR",
      "RECIPE_NOT_IN_GROUP",
    ]) {
      expect(isActorErrorReason(reason)).toBe(true);
    }
  });
});
