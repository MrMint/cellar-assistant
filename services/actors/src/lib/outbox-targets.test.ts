/**
 * The outbox allow-list test (§1.4, §1.6, §8.5) — what the compiler cannot
 * hold about "every `enqueueOutbox` call site is a privilege boundary".
 *
 * The handles in `./outbox-targets.ts` make an undeclared pair, a method the
 * actor does not have, a payload of the wrong shape and a hand-enqueued probe
 * or compensation into **type errors**; "the types" below pins each of those
 * with a `@ts-expect-error`, so a change that loosened one fails `tsc`.
 *
 * What is left is what no type can say, and it is checked here against a scan
 * of `services/actors/src` (`./outbox-scan-testing.ts`):
 *
 *   1. **containment** — every enqueue site's handle is readable, and each
 *      pair it can name lists the site's module as an enqueuer, with a
 *      `targetId` shape that entry declares;
 *   2. **no staleness** — every target, and every listed module, has a live
 *      site;
 *   3. **registration** — every entry's descriptor is one `registry.ts`
 *      registers with Dapr, and `jobRunBatchTarget` answers for exactly the
 *      registered `JobActor` subclasses;
 *   4. **the scan misses nothing** — every reference to the two enqueue
 *      functions is a call it can read. (That nothing *else* inserts into
 *      `outbox` is `packages/db`'s `outbox-inserts.test.ts`, beside the
 *      writers scan it uses.)
 *
 * Plus three visible inventories: every caller-chosen `targetId` that has no
 * authorization check at its enqueue site — the list E5a had to find by hand —
 * every operational probe, and every compensation (`onDead`) pair.
 */
import { assertNoFindings, fixtureProject } from "@cellar-assistant/analysis";
import { declaredMethods } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { JobActor } from "../actors/job-actor/index.ts";
import { ACTOR_REGISTRY } from "../actors/registry.ts";
import type { DbOrTx } from "./db.ts";
import { enqueueOutbox, enqueueOutboxOnce } from "./outbox.ts";
import {
  ACTORS_SRC,
  type EnqueueSite,
  scanOutbox,
} from "./outbox-scan-testing.ts";
import {
  compensationTargets,
  type DeclaredPair,
  isAllowedOutboxTarget,
  isEnqueuerModule,
  jobRunBatchActorTypes,
  jobRunBatchTarget,
  OUTBOX_TARGETS,
  outboxCompensations,
  outboxTarget,
  outboxTargetKey,
  probeTargets,
  unauthorizedCallerTargets,
} from "./outbox-targets.ts";

const SCAN = scanOutbox();
const SITES = SCAN.sites;

const ENTRIES = Object.entries(OUTBOX_TARGETS as Record<string, DeclaredPair>);

const declared = (key: string): DeclaredPair | undefined =>
  Object.hasOwn(OUTBOX_TARGETS, key)
    ? (OUTBOX_TARGETS as Record<string, DeclaredPair>)[key]
    : undefined;

const describeSite = (site: EnqueueSite): string =>
  `${site.file}:${site.line}  ${site.fn}(${site.handleText}) ` +
  `targetId=${site.targetIdText}  [in ${site.enclosing}]`;

/** Every JobActor subclass the host registers with Dapr. */
const REGISTERED_JOB_ACTORS = ACTOR_REGISTRY.filter(
  (entry) => entry.actorClass.prototype instanceof JobActor,
)
  .map((entry) => entry.descriptor.actorType)
  .sort();

/* -------------------------------------------------------------------------- */
/* The rule, as a pure function over sites — so the mechanism test can feed it  */
/* synthetic ones and cannot rot into a no-op.                                  */
/* -------------------------------------------------------------------------- */

type Violation = { readonly site: EnqueueSite; readonly reason: string };

/** Which registry provenances a scanned `targetId` shape may legitimately be. */
const ALLOWED_PROVENANCE = {
  self: ["self"],
  constant: ["constant"],
  expression: ["derived", "caller"],
} as const;

/** Containment for one pair `site` can enqueue. */
const pairViolations = (site: EnqueueSite, key: string): Violation[] => {
  const as = site.pairs !== null && site.pairs.length > 1 ? ` (as ${key})` : "";
  const target = declared(key);
  if (target === undefined) {
    // Unreachable from real source — `OUTBOX_TARGETS[key]` would not compile —
    // and kept so a synthetic tree can prove the rule is still wired.
    return [{ site, reason: `\`${key}\`${as} is not in OUTBOX_TARGETS.` }];
  }

  const enqueuer = target.enqueuedBy.find((candidate) =>
    isEnqueuerModule(site.file, candidate.module),
  );
  if (enqueuer === undefined) {
    return [
      {
        site,
        reason:
          `\`${key}\`${as} is declared, but not as enqueued from this module. ` +
          `It lists ${target.enqueuedBy.map((e) => e.module).join(", ") || "no module"}. ` +
          "A new module reaching an existing target with policy off is " +
          "exactly the change E5a's two holes were: add the module to the " +
          "entry, and classify this site's `targetId` while you do.",
      },
    ];
  }

  const allowed: readonly string[] = ALLOWED_PROVENANCE[site.targetId];
  if (!allowed.includes(enqueuer.targetId)) {
    return [
      {
        site,
        reason:
          `the registry declares this site's \`targetId\`${as} as ` +
          `\`${enqueuer.targetId}\`, but the scan sees \`${site.targetId}\` ` +
          `(${site.targetIdText}). ` +
          (site.targetId === "expression"
            ? "An id that is no longer `this.key` can be steered, and the " +
              "far end runs with policy off — say whether it is `derived` " +
              "or `caller`, and if `caller`, name the check."
            : "The declaration is over-broad, which hides the next real " +
              "one: narrow it to `self`/`constant`."),
      },
    ];
  }
  return [];
};

export const violationsIn = (sites: readonly EnqueueSite[]): Violation[] =>
  sites.flatMap((site) =>
    site.pairs === null
      ? [
          {
            site,
            reason:
              `the scan cannot read this handle (\`${site.handleText}\`), so ` +
              "it cannot say which module is reaching which pair. Pass " +
              '`OUTBOX_TARGETS["Actor.method"]`, or a parameter or `const` ' +
              'annotated `(typeof OUTBOX_TARGETS)["A.m" | …]`.',
          },
        ]
      : site.pairs.flatMap((key) => pairViolations(site, key)),
  );

/* -------------------------------------------------------------------------- */
/* Synthetic trees, for the scan's own mechanism                                */
/* -------------------------------------------------------------------------- */

/** The two real signatures, minus the database and the types. */
const OUTBOX_STUB = `
export const enqueueOutbox = async (_tx: unknown, _target: unknown, _delivery: unknown): Promise<string> => "id";
export const enqueueOutboxOnce = async (_tx: unknown, _target: unknown, _delivery: unknown): Promise<string | null> => null;
`;

/** Every key a synthetic tree below names. */
const STUB_KEYS = [
  "CellarActor.addItem",
  "ItemActor.create",
  "A.m",
  "B.n",
  "C.o",
  "A.self",
  "A.input",
  "A.other",
  "A.fixed",
  "A.literal",
  "A.opaque",
  "A.short",
  "A.shortMoving",
];

/**
 * The registry's shape where the scan reads it: each handle's type carries
 * its own literal `key`. `ELSEWHERE` is a look-alike whose keys are not
 * literal types; `pick()` returns an unparameterised handle.
 */
const TARGETS_STUB = `
declare const enqueueable: unique symbol;
export type OutboxTarget<K extends string = string> = { readonly key: K; readonly [enqueueable]: true };
declare function handle<K extends string>(key: K): OutboxTarget<K>;
export const OUTBOX_TARGETS = {
${STUB_KEYS.map((key) => `  ${JSON.stringify(key)}: handle(${JSON.stringify(key)}),`).join("\n")}
};
export const ELSEWHERE: Record<"A.m", { readonly key: string }> = { "A.m": { key: "A.m" } };
export declare function pick(): OutboxTarget;
`;

/** What every synthetic module can use without importing it itself. */
const PRELUDE =
  'import { ELSEWHERE, OUTBOX_TARGETS, type OutboxTarget, pick } from "../lib/outbox-targets.ts";\n';

/**
 * A `services/actors/src`-shaped tree in memory: `lib/outbox.ts`,
 * `lib/outbox-targets.ts`, and the given files, each given the registry
 * import unless it has its own.
 */
const scanTree = (files: Record<string, string>) => {
  const project = fixtureProject({
    files: {
      "lib/outbox.ts": OUTBOX_STUB,
      "lib/outbox-targets.ts": TARGETS_STUB,
      ...Object.fromEntries(
        Object.entries(files).map(([path, text]) => [
          path,
          text.includes("outbox-targets.ts") ? text : PRELUDE + text,
        ]),
      ),
    },
  });
  return scanOutbox(project, project.root);
};

/* -------------------------------------------------------------------------- */

describe("outbox allow-list — the types", () => {
  /**
   * Never called: it exists for `tsc`. Each `@ts-expect-error` is a
   * negative control — if the line ever compiles, `tsc` reports the unused
   * directive and `bun run typecheck` goes red.
   */
  const typeErrors = async (tx: DbOrTx) => {
    // (1) An undeclared pair is not a key.
    // @ts-expect-error — `ItemActor.delete` is not declared.
    await enqueueOutbox(tx, OUTBOX_TARGETS["ItemActor.delete"], {
      targetId: "x",
    });

    // (2) A payload field of the wrong type.
    await enqueueOutbox(tx, OUTBOX_TARGETS["ItemActor.setBarcode"], {
      targetId: "x",
      // @ts-expect-error — `SetItemBarcodeInput.code` is `string | null`.
      payload: { code: 123 },
    });

    // (3) A payload field the method does not take.
    await enqueueOutbox(tx, OUTBOX_TARGETS["UserActor.withdrawFriendRequest"], {
      targetId: "x",
      // @ts-expect-error — `OtherSidePayload` has no `userId`.
      payload: { friendId: "f", userId: "u" },
    });

    // (4) A required payload left out.
    // @ts-expect-error — `ItemActor.setBarcode` takes a `SetItemBarcodeInput`.
    await enqueueOutbox(tx, OUTBOX_TARGETS["ItemActor.setBarcode"], {
      targetId: "x",
    });

    // (5) A payload for a method that takes none.
    await enqueueOutbox(tx, OUTBOX_TARGETS["FileActor.delete"], {
      targetId: "x",
      // @ts-expect-error — `FileActor.delete(ctx)` has no second parameter.
      payload: { reason: "orphan" },
    });

    // (6) A compensation, which only the drainer enqueues.
    // @ts-expect-error — `markFailed` is a `DeclaredPair`, not an `OutboxTarget`.
    await enqueueOutbox(tx, OUTBOX_TARGETS["MenuScanActor.markFailed"], {
      targetId: "x",
    });

    // (7) An operational probe, which no module enqueues.
    // @ts-expect-error — `PingActor.ping` is a probe.
    await enqueueOutboxOnce(tx, OUTBOX_TARGETS["PingActor.ping"], {
      targetId: "x",
    });

    // (8) A handle written by hand, however complete it looks.
    await enqueueOutbox(
      tx,
      // @ts-expect-error — the brand's symbol is not exported, so no literal has it.
      {
        key: "CellarActor.addItem",
        actorType: "CellarActor",
        method: "addItem",
        descriptor: OUTBOX_TARGETS["CellarActor.addItem"].descriptor,
        enqueuedBy: [],
      },
      { targetId: "x" },
    );

    // (9) An annotated bound is a bound: another pair does not fit it.
    const arm = (
      target: (typeof OUTBOX_TARGETS)[
        | "MaintenanceActor.reapOrphanFiles"
        | "MaintenanceActor.reportDeadLetters"],
    ) => target;
    // @ts-expect-error — `FileActor.delete` is outside the annotation.
    arm(OUTBOX_TARGETS["FileActor.delete"]);
  };

  it("is a set of compile-time assertions (see `typeErrors`)", () => {
    expect(typeof typeErrors).toBe("function");
  });

  it("stamps every entry with its own key", () => {
    for (const [key, pair] of ENTRIES) {
      expect(pair.key).toBe(key);
      expect(outboxTargetKey(pair.actorType, pair.method)).toBe(key);
    }
  });
});

describe("outbox allow-list — the scan itself", () => {
  it("can see the actor sources and read both forms of handle", () => {
    expect(ACTORS_SRC).toMatch(/services\/actors\/src$/);
    expect(SITES.length).toBeGreaterThan(0);

    // A literal key, and the two annotated bounds — one assertion each, so a
    // regression in the reader is visible as a reader failure rather than as a
    // mysteriously passing containment test. Matched on source text, never on
    // a line number: several agents edit these files.
    expect(
      SITES.find(
        (site) => site.handleText === 'OUTBOX_TARGETS["ItemActor.setBarcode"]',
      )?.pairs,
    ).toEqual(["ItemActor.setBarcode"]);

    const armCycle = SITES.find(
      (site) => site.enclosing === "MaintenanceActor.armCycle",
    );
    expect(armCycle?.pairs).toEqual([
      "MaintenanceActor.reapOrphanFiles",
      "MaintenanceActor.reportDeadLetters",
    ]);
    expect(armCycle?.targetId).toBe("self");

    const scheduleBatch = SITES.find(
      (site) => site.enclosing === "JobActor.scheduleBatch",
    );
    expect(scheduleBatch?.pairs).toEqual(
      REGISTERED_JOB_ACTORS.map((actor) => `${actor}.runBatch`),
    );
    expect(scheduleBatch?.targetId).toBe("self");
  });

  it("can classify every reference to the enqueue functions in the tree", () => {
    // The scan reads a call it can see and refuses everything else. A
    // non-empty list is a way to write an outbox row from a module the scan
    // does not attribute it to — `.call`, a callback, a re-export — and
    // therefore a module nothing in this file is checking.
    assertNoFindings(
      SCAN.unclassified,
      "Call the function directly, by its import, with a handle from " +
        "OUTBOX_TARGETS — that is the one shape the allow-list can check.",
    );
  });
});

describe("outbox allow-list — containment (§1.4, §8.5)", () => {
  it("lets an actor enqueue a target only from a declared module", () => {
    const violations = violationsIn(SITES);
    const detail = violations
      .map((v) => `  ${describeSite(v.site)}\n      ${v.reason}`)
      .join("\n\n");

    expect(
      violations.map((v) => `${v.site.file}:${v.site.line}`),
      violations.length === 0
        ? ""
        : [
            "",
            `${violations.length} enqueue site(s) outside the allow-list:`,
            "",
            detail,
            "",
            "`OutboxActor.deliver` invokes `targetActor.method` with",
            "`systemCtx(...)`, and `bypassesPolicy` returns true for `system`,",
            "so every owner gate in the codebase opens on it. Whatever an",
            "authenticated caller can persuade an actor to enqueue therefore",
            "runs with policy off — which is why the enqueuing module and the",
            "provenance of `targetId` have to be written down in",
            "services/actors/src/lib/outbox-targets.ts.",
            "",
          ].join("\n"),
    ).toEqual([]);
  });
});

describe("outbox allow-list — no stale declarations", () => {
  /** Keys a live site can enqueue. */
  const liveKeys = new Set(SITES.flatMap((site) => site.pairs ?? []));

  it("names no target nothing enqueues", () => {
    // Probes and compensations are the exceptions, by construction — nothing
    // in the source enqueues either (a compensation's enqueuer is the
    // drainer's dead-letter statement) — and both are inventoried below.
    const stale = ENTRIES.filter(
      ([key, pair]) =>
        !liveKeys.has(key) &&
        pair.probe === undefined &&
        pair.compensation === undefined,
    ).map(([key]) => key);
    expect(
      stale,
      stale.length === 0
        ? ""
        : [
            "",
            "Declared outbox targets with no enqueue site:",
            "",
            ...stale.map((key) => `  ${key}`),
            "",
            "A capability nobody uses is a capability nobody is reviewing.",
            "If the enqueue site was just deleted, this is the *second* of the",
            "two deploys described in outbox-targets.ts — drop the entry.",
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  it("lists no enqueuing module that no longer enqueues", () => {
    const stale: string[] = [];
    for (const [key, pair] of ENTRIES) {
      for (const enqueuer of pair.enqueuedBy) {
        const live = SITES.some(
          (site) =>
            isEnqueuerModule(site.file, enqueuer.module) &&
            site.pairs?.includes(key) === true,
        );
        if (!live) stale.push(`${key} <- ${enqueuer.module}`);
      }
    }
    expect(stale).toEqual([]);
  });
});

describe("outbox allow-list — the far end is registered", () => {
  it("builds every entry from a descriptor the host registers", () => {
    // The compiler already holds `method` to the descriptor's interface, and
    // `registry.ts` holds the class to the descriptor. What is left is whether
    // the descriptor is registered at all — an unregistered one would be a
    // pair Dapr answers with "no such actor type", ten times, then a dead
    // letter.
    const unregistered = ENTRIES.filter(
      ([, pair]) =>
        !ACTOR_REGISTRY.some((entry) => entry.descriptor === pair.descriptor) ||
        !declaredMethods(pair.descriptor).includes(pair.method),
    ).map(([key]) => key);
    expect(unregistered).toEqual([]);
  });

  it("answers jobRunBatchTarget for exactly the registered job actors", () => {
    expect(jobRunBatchActorTypes()).toEqual(REGISTERED_JOB_ACTORS);
    for (const actor of REGISTERED_JOB_ACTORS) {
      expect(jobRunBatchTarget(actor).key).toBe(`${actor}.runBatch`);
    }
    expect(() => jobRunBatchTarget("ItemActor")).toThrow(
      "not a declared outbox target",
    );
  });

  it("never declares the drainer itself as a target (§8.5)", () => {
    // Reentrancy is off; `#deliverOne` refuses these before the allow-list is
    // consulted, but a declaration would still be a lie.
    expect(
      ENTRIES.filter(([, pair]) => pair.actorType === "OutboxActor"),
    ).toEqual([]);
  });
});

describe("outbox allow-list — caller-influenced target ids", () => {
  it("names every one of them, so none is found by review again", () => {
    // These are the sites where an authenticated caller chooses which actor
    // instance a policy-off delivery lands on. Each has an authorization check
    // at the enqueue site, except the ones in the next test.
    const callerSites = ENTRIES.flatMap(([key, pair]) =>
      pair.enqueuedBy
        .filter((enqueuer) => enqueuer.targetId === "caller")
        .map((enqueuer) => `${key} <- ${enqueuer.module}`),
    ).sort();

    expect(callerSites).toEqual([
      "CellarActor.addItem <- actors/item-onboarding-actor.ts",
      "ItemActor.create <- actors/item-onboarding-actor.ts",
      "ItemActor.linkBrand <- actors/item-onboarding-actor.ts",
      "ItemActor.setBarcode <- actors/barcode-actor.ts",
      "PlaceActor.addMenuFromScan <- actors/menu-scan-actor.ts",
      "RecipeGroupActor.recomputeCanonical <- actors/recipe-actor.ts",
      "UserActor.removeFriendOtherSide <- actors/user-actor.ts",
    ]);
  });

  it("inventories the ones with no check at the enqueue site", () => {
    // Not zero, and not silently widened to make the test pass: this is the
    // standing list of caller-chosen ids that reach a policy-off delivery
    // unchecked, each with a written justification in the registry. A new one
    // fails here and has to be argued for in review.
    expect(unauthorizedCallerTargets()).toEqual([
      "PlaceActor.addMenuFromScan <- actors/menu-scan-actor.ts",
      "RecipeGroupActor.recomputeCanonical <- actors/recipe-actor.ts",
    ]);
  });
});

describe("outbox allow-list — operational probes", () => {
  it("inventories every probe target", () => {
    // A probe is a pair declared for the acceptance harnesses and enqueued by
    // nothing in production (the types refuse it). A second one has to be
    // argued for in review.
    expect(probeTargets()).toEqual(["PingActor.ping"]);
  });
});

describe("outbox allow-list — compensations (onDead)", () => {
  it("inventories every compensation pair", () => {
    // A second kind of compensation — or a new owner of one — is an argument
    // in review, like a probe.
    expect(compensationTargets()).toEqual([
      "MenuMatchJobActor.markFailed",
      "MenuScanActor.markFailed",
      "OnboardingReprocessJobActor.markFailed",
      "OvertureReloadJobActor.markFailed",
      "PlaceRefreshJobActor.markFailed",
      "ProbeJobActor.markFailed",
      "RecipePhotoJobActor.markFailed",
      "VectorReembedJobActor.markFailed",
    ]);
  });

  it("names, in every onDead, a declared compensation on the same actor", () => {
    const wrong = ENTRIES.flatMap(([key, pair]) => {
      if (pair.onDead === undefined) return [];
      const compensation = outboxTarget(pair.actorType, pair.onDead);
      if (compensation === undefined) {
        return [
          `${key}: onDead ${pair.actorType}.${pair.onDead} is not declared`,
        ];
      }
      return compensation.compensation === undefined
        ? [
            `${key}: onDead ${pair.actorType}.${pair.onDead} is not a compensation`,
          ]
        : [];
    });
    expect(wrong).toEqual([]);
  });

  it("lets no compensation declare an onDead of its own", () => {
    // A compensation that dies is reported, never compensated: the chain has
    // length one.
    expect(
      ENTRIES.filter(
        ([, pair]) =>
          pair.compensation !== undefined && pair.onDead !== undefined,
      ).map(([key]) => key),
    ).toEqual([]);
  });

  it("gives a compensation no enqueuer, and some pair that names it", () => {
    const named = new Set(
      ENTRIES.flatMap(([, pair]) =>
        pair.onDead === undefined
          ? []
          : [outboxTargetKey(pair.actorType, pair.onDead)],
      ),
    );
    for (const key of compensationTargets()) {
      expect(declared(key)?.enqueuedBy).toEqual([]);
      expect(named.has(key), `${key} is named by no onDead`).toBe(true);
    }
  });

  it("hands the drainer exactly the declared onDeads", () => {
    expect(
      outboxCompensations()
        .map((c) => `${c.targetActor}.${c.method} -> ${c.onDead}`)
        .sort(),
    ).toEqual(
      ENTRIES.filter(([, pair]) => pair.onDead !== undefined)
        .map(([key, pair]) => `${key} -> ${pair.onDead}`)
        .sort(),
    );
    // Every registered job actor's runBatch is covered.
    for (const actor of REGISTERED_JOB_ACTORS) {
      expect(
        outboxCompensations().some(
          (c) => c.targetActor === actor && c.method === "runBatch",
        ),
        `${actor}.runBatch declares no onDead`,
      ).toBe(true);
    }
  });
});

describe("outbox allow-list — the mechanism", () => {
  // Synthetic sites, so these assertions do not depend on a real violation
  // existing and cannot decay into a no-op as the tree changes.
  const base: EnqueueSite = {
    file: "actors/item-actor.ts",
    line: 42,
    fn: "enqueueOutbox",
    enclosing: "ItemActor.update",
    pairs: ["ItemActor.regenerateVector"],
    targetId: "self",
    handleText: 'OUTBOX_TARGETS["ItemActor.regenerateVector"]',
    targetIdText: "this.key",
  };

  /** `JobActor.scheduleBatch`, as the scan sees it. */
  const scheduleBatch: EnqueueSite = {
    file: "actors/job-actor/index.ts",
    line: 456,
    fn: "enqueueOutbox",
    enclosing: "JobActor.scheduleBatch",
    pairs: REGISTERED_JOB_ACTORS.map((actor) => `${actor}.runBatch`),
    targetId: "self",
    handleText: "target",
    targetIdText: "this.key",
  };

  it("accepts a declared pair from its declared module", () => {
    expect(violationsIn([base])).toEqual([]);
    expect(violationsIn([scheduleBatch])).toEqual([]);
  });

  it("rejects a pair the registry does not have", () => {
    const rogue = { ...base, pairs: ["ItemActor.delete"] };
    expect(violationsIn([rogue])[0]?.reason).toContain("not in OUTBOX_TARGETS");
  });

  it("rejects a declared pair enqueued from a module that may not", () => {
    const foreign = { ...base, file: "actors/user-actor.ts" };
    expect(violationsIn([foreign])[0]?.reason).toContain(
      "not as enqueued from this module",
    );
  });

  it("rejects a self-keyed target that has grown a steerable id", () => {
    const steered: EnqueueSite = {
      ...base,
      targetId: "expression",
      targetIdText: "input.itemId",
    };
    expect(violationsIn([steered])[0]?.reason).toContain("can be steered");
  });

  it("rejects an over-broad provenance declaration", () => {
    // `CellarActor.addItem` is declared `caller`; a site that is actually
    // `this.key` means the declaration is stale and hides the next real one.
    const narrowed: EnqueueSite = {
      ...base,
      file: "actors/item-onboarding-actor.ts",
      pairs: ["CellarActor.addItem"],
      targetId: "self",
    };
    expect(violationsIn([narrowed])[0]?.reason).toContain("over-broad");
  });

  it("rejects a handle the scan cannot read", () => {
    const blind = { ...base, pairs: null, handleText: "pick()" };
    expect(violationsIn([blind])[0]?.reason).toContain(
      "cannot read this handle",
    );
  });

  it("holds a bounded site to every pair its annotation admits", () => {
    // The job actors' entries are `self`; a `scheduleBatch` that addressed a
    // caller-chosen job would reach any job with policy off — six times over.
    const steered = {
      ...scheduleBatch,
      targetId: "expression" as const,
      targetIdText: "input.jobId",
    };
    const violations = violationsIn([steered]);
    expect(violations).toHaveLength(REGISTERED_JOB_ACTORS.length);
    expect(violations[0]?.reason).toContain("can be steered");

    // …and from a module none of them lists, every one of them is refused.
    const moved = { ...scheduleBatch, file: "actors/cellar-actor.ts" };
    expect(violationsIn([moved])).toHaveLength(REGISTERED_JOB_ACTORS.length);
  });

  it("answers the runtime question the drainer asks", () => {
    expect(isAllowedOutboxTarget("ItemActor", "regenerateVector")).toBe(true);
    expect(isAllowedOutboxTarget("ItemActor", "delete")).toBe(false);
    expect(isAllowedOutboxTarget("CellarActor", "addItem")).toBe(true);
    expect(isAllowedOutboxTarget("UserActor", "updateProfile")).toBe(false);
    expect(isAllowedOutboxTarget("OutboxActor", "drain")).toBe(false);
    expect(isAllowedOutboxTarget("PingActor", "ping")).toBe(true);
    expect(isAllowedOutboxTarget("PingActor", "noSuchMethod")).toBe(false);
    expect(isAllowedOutboxTarget("MenuScanActor", "markFailed")).toBe(true);
  });

  it("matches an enqueuing module as a file or as a directory", () => {
    expect(
      isEnqueuerModule("actors/item-actor.ts", "actors/item-actor.ts"),
    ).toBe(true);
    expect(
      isEnqueuerModule("actors/job-actor/index.ts", "actors/job-actor"),
    ).toBe(true);
    expect(
      isEnqueuerModule("actors/job-actor-other.ts", "actors/job-actor"),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The scan, against synthetic source trees                                    */
/* -------------------------------------------------------------------------- */

describe("outbox allow-list — the scan cannot be walked around", () => {
  /**
   * The review's bypass, in shape: a renamed import of `enqueueOutbox`, in a
   * new module nobody declared, enqueueing `CellarActor.addItem` on an id
   * straight off the caller. Against a name-matching scan it produced no site
   * at all.
   */
  it("follows a renamed import to the call, and refuses it", () => {
    const scan = scanTree({
      "actors/rogue-actor.ts": `
        import { enqueueOutbox as queue } from "../lib/outbox.ts";
        import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
        export class RogueActor {
          async go(tx: unknown, cellarId: string) {
            await queue(tx, OUTBOX_TARGETS["CellarActor.addItem"], {
              targetId: cellarId,
            });
          }
        }
      `,
    });
    expect(scan.unclassified).toEqual([]);
    expect(scan.sites).toEqual([
      expect.objectContaining({
        file: "actors/rogue-actor.ts",
        fn: "enqueueOutbox",
        enclosing: "RogueActor.go",
        pairs: ["CellarActor.addItem"],
        targetId: "expression",
      }),
    ]);
    expect(violationsIn(scan.sites)[0]?.reason).toContain(
      "not as enqueued from this module",
    );
  });

  it("reads a call through a namespace import of lib/outbox.ts", () => {
    const scan = scanTree({
      "actors/ns-actor.ts": `
        import * as ob from "../lib/outbox.ts";
        export const go = (tx: unknown, id: string) =>
          ob.enqueueOutboxOnce(tx, OUTBOX_TARGETS["CellarActor.addItem"], { targetId: id });
      `,
    });
    expect(scan.unclassified).toEqual([]);
    expect(scan.sites).toEqual([
      expect.objectContaining({
        fn: "enqueueOutboxOnce",
        enclosing: "go",
        pairs: ["CellarActor.addItem"],
      }),
    ]);
  });

  /** Each of these writes a row from a module the scan does not attribute. */
  it.each([
    [
      ".call",
      `import { enqueueOutbox } from "../lib/outbox.ts";
       export const go = (tx: unknown) =>
         enqueueOutbox.call(null, tx, OUTBOX_TARGETS["CellarActor.addItem"], { targetId: "x" });`,
      "referenced without being called",
    ],
    [
      "an aliased .apply",
      `import { enqueueOutbox as q } from "../lib/outbox.ts";
       export const go = (args: [unknown, unknown, unknown]) => q.apply(null, args);`,
      "referenced without being called",
    ],
    [
      "a callback",
      `import { enqueueOutboxOnce } from "../lib/outbox.ts";
       export const go = (run: (f: unknown) => void) => run(enqueueOutboxOnce);`,
      "referenced without being called",
    ],
    [
      "a stored reference",
      `import { enqueueOutbox } from "../lib/outbox.ts";
       const send = enqueueOutbox;
       export const go = (tx: unknown, t: unknown, d: unknown) => send(tx, t, d);`,
      "referenced without being called",
    ],
    [
      "the namespace as a value",
      `import * as ob from "../lib/outbox.ts";
       export const go = (name: "enqueueOutbox") => ob[name];`,
      "namespace, used as a value",
    ],
    [
      "a computed member",
      `import * as ob from "../lib/outbox.ts";
       export const go = () => ob["enqueueOutbox"];`,
      "by computed name",
    ],
    [
      "a named re-export",
      `export { enqueueOutbox as send } from "../lib/outbox.ts";`,
      "re-exports",
    ],
    [
      "a wholesale re-export",
      `export * from "../lib/outbox.ts";`,
      "re-exports lib/outbox.ts wholesale",
    ],
    [
      "a dynamic import",
      `export const go = async () => (await import("../lib/outbox.ts")).enqueueOutbox;`,
      "dynamic import",
    ],
  ])("refuses %s", (_label, source, reason) => {
    const scan = scanTree({ "actors/sneaky.ts": source });
    expect(scan.unclassified.length).toBeGreaterThan(0);
    expect(scan.unclassified.map((ref) => ref.message).join("\n")).toContain(
      reason,
    );
  });

  it("does not refuse what is not a reference", () => {
    // Type positions, object keys, members named alike, and an unrelated
    // `x.queue` where `queue` is some file's alias — none can write a row.
    // Nor can a record's `["enqueueOutbox"]` member or a local function that
    // shares the name: the checker knows neither is the real one.
    const scan = scanTree({
      "actors/lookalike.ts": `
        const enqueueOutbox = (_a: unknown, _b: unknown, _c: unknown) => 0;
        export const go = (m: Record<string, unknown>) => [
          m["enqueueOutbox"],
          enqueueOutbox(1, OUTBOX_TARGETS["A.m"], { targetId: "x" }),
        ];
      `,
      "actors/fine.ts": `
        import { enqueueOutbox, enqueueOutbox as queue } from "../lib/outbox.ts";
        type Enqueue = typeof enqueueOutbox;
        const keys = { enqueueOutbox: 1 };
        const other = { queue: [] as number[] };
        export class Fine {
          enqueueOutboxOnce = 0;
          go(tx: unknown, f: Enqueue) {
            other.queue.push(Object.keys(keys).length);
            return enqueueOutbox(tx, OUTBOX_TARGETS["ItemActor.create"], { targetId: "x" });
          }
        }
      `,
    });
    expect(scan.unclassified).toEqual([]);
    expect(scan.sites).toHaveLength(1);
  });

  /**
   * The handle is read by its type, so a shadowing inner binding is read as
   * itself (the syntactic reader saw two bindings of `t` and gave up), and
   * a handle whose key is not a literal type is read as nothing.
   */
  it("reads a handle by its type, and nothing wider", () => {
    const scan = scanTree({
      "actors/bounds.ts": `
        import { enqueueOutbox } from "../lib/outbox.ts";
        export class Bounds {
          key = "k";
          param(tx: unknown, t: (typeof OUTBOX_TARGETS)["B.n" | "A.m"]) {
            return enqueueOutbox(tx, t, { targetId: this.key });
          }
          local(tx: unknown) {
            const t: typeof OUTBOX_TARGETS["C.o"] = pick();
            return enqueueOutbox(tx, t, { targetId: this.key });
          }
          unannotated(tx: unknown) {
            const t = pick();
            return enqueueOutbox(tx, t, { targetId: this.key });
          }
          wideAnnotation(tx: unknown, t: OutboxTarget) {
            return enqueueOutbox(tx, t, { targetId: this.key });
          }
          otherRegistry(tx: unknown, t: (typeof ELSEWHERE)["A.m"]) {
            return enqueueOutbox(tx, t, { targetId: this.key });
          }
          shadowed(tx: unknown, t: (typeof OUTBOX_TARGETS)["A.m"]) {
            {
              const t: (typeof OUTBOX_TARGETS)["B.n"] = pick();
              return enqueueOutbox(tx, t, { targetId: this.key });
            }
          }
          called(tx: unknown) {
            return enqueueOutbox(tx, pick(), { targetId: this.key });
          }
        }
      `,
    });
    const pairs = Object.fromEntries(
      scan.sites.map((site) => [site.enclosing, site.pairs]),
    );
    expect(pairs).toEqual({
      "Bounds.param": ["A.m", "B.n"],
      "Bounds.local": ["C.o"],
      "Bounds.unannotated": null,
      "Bounds.wideAnnotation": null,
      "Bounds.otherRegistry": null,
      "Bounds.shadowed": ["B.n"],
      "Bounds.called": null,
    });
  });

  /** OB-7: `input.key` is not `this.key`, however alike they read. */
  it("classifies only `this.key` as self", () => {
    const scan = scanTree({
      "actors/shapes.ts": `
        import { enqueueOutbox } from "../lib/outbox.ts";
        const FIXED = "singleton";
        export class Shapes {
          key = "k";
          other = "o";
          go(tx: unknown, input: { key: string }) {
            enqueueOutbox(tx, OUTBOX_TARGETS["A.self"], { targetId: this.key });
            enqueueOutbox(tx, OUTBOX_TARGETS["A.input"], { targetId: input.key });
            enqueueOutbox(tx, OUTBOX_TARGETS["A.other"], { targetId: this.other });
            enqueueOutbox(tx, OUTBOX_TARGETS["A.fixed"], { targetId: FIXED });
            enqueueOutbox(tx, OUTBOX_TARGETS["A.literal"], { targetId: "singleton" });
            enqueueOutbox(tx, OUTBOX_TARGETS["A.opaque"], delivery);
            const targetId = FIXED;
            enqueueOutbox(tx, OUTBOX_TARGETS["A.short"], { targetId });
            let moving = FIXED;
            moving = input.key;
            {
              const targetId = moving;
              enqueueOutbox(tx, OUTBOX_TARGETS["A.shortMoving"], { targetId });
            }
          }
        }
      `,
    });
    const shape = Object.fromEntries(
      scan.sites.map((site) => [site.pairs?.[0], site.targetId]),
    );
    expect(shape).toEqual({
      "A.self": "self",
      "A.input": "expression",
      "A.other": "expression",
      "A.fixed": "constant",
      "A.literal": "constant",
      "A.opaque": "expression",
      // Shorthand `{ targetId }` reads the binding, like the long form: a
      // scan that skipped it called this site an expression, which hid an
      // over-broad provenance declaration behind it.
      "A.short": "constant",
      "A.shortMoving": "expression",
    });
  });

  /**
   * OB-8, and what the checker changed about it. Two modules exporting the
   * same name used to make both ambiguous (the syntactic scan kept a table by
   * *name*); resolved through its binding, the imported one is exactly one
   * string. A `let` can be reassigned, so it is an expression either way.
   */
  it("resolves a constant through its binding, not its name", () => {
    const scan = scanTree({
      "actors/a.ts": `export const TARGET = "cellar-1"; export let MOVING = "m";`,
      "actors/b.ts": `export const TARGET = "cellar-2";`,
      "actors/c.ts": `
        import { enqueueOutbox } from "../lib/outbox.ts";
        import { MOVING, TARGET } from "./a.ts";
        export const go = (tx: unknown) =>
          enqueueOutbox(tx, OUTBOX_TARGETS["CellarActor.addItem"], { targetId: TARGET });
        export const moving = (tx: unknown) =>
          enqueueOutbox(tx, OUTBOX_TARGETS["CellarActor.addItem"], { targetId: MOVING });
      `,
    });
    expect(
      Object.fromEntries(
        scan.sites.map((site) => [site.enclosing, site.targetId]),
      ),
    ).toEqual({ go: "constant", moving: "expression" });
  });
});
