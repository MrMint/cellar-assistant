/**
 * A turn's delivery identity (`./delivery.ts`): who may carry one, what a key
 * derived from it covers, that it never crosses an actor-to-actor call, and two
 * scans that keep it the only way to ask.
 */
import { randomUUID } from "node:crypto";
import {
  findCalls,
  lineOf,
  literalValue,
  PROGRAM_TIMEOUT_MS,
  type Project,
  relativePath,
  sourceFileAt,
  sourceFiles,
} from "@cellar-assistant/analysis";
import type { Ctx } from "@cellar-assistant/contracts";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  PingActorDescriptor,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { outbox } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import ts from "typescript";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { deliveryArgs, MAX_ATTEMPTS } from "../actors/outbox-actor.ts";
import { isWellFormedCtx } from "./actor-method-allowlist.ts";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
  CONTRACTS_SRC,
} from "./analysis-testing.ts";
import type { DbOrTx } from "./db.ts";
import {
  causedByOf,
  deliveryOf,
  forwardCtx,
  idempotencyKey,
} from "./delivery.ts";
import { finalDeliveryFailure } from "./delivery-attempt.ts";
import { internal } from "./internal-client.ts";
import { outboxTarget } from "./outbox-targets.ts";
import {
  claimingDelivery,
  closeTestDb,
  deliveryCtx,
  insertOutboxRowForTest,
  resolveTestDatabase,
  withTestDb,
} from "./testing.ts";

const invoked = vi.hoisted(() => [] as unknown[][]);
vi.mock("./sidecar.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sidecar.ts")>()),
  invokeActorMethod: vi.fn(async (...args: unknown[]) => {
    invoked.push(args);
    return { pong: true };
  }),
}));

const VIEWER = "00000000-0000-4000-8000-000000000001";
const ROW = "0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

/* -------------------------------------------------------------------------- */
/* Who carries one                                                             */
/* -------------------------------------------------------------------------- */

describe("deliveryOf / causedByOf", () => {
  it("read the delivery OutboxActor minted", () => {
    const ctx = deliveryCtx(ROW, 2);
    expect(deliveryOf(ctx)).toEqual({
      outboxId: ROW,
      attempt: 3,
      final: false,
    });
    expect(causedByOf(ctx)).toBe(ROW);
  });

  it("believe no request that claims to be one", () => {
    for (const ctx of [
      userCtx(VIEWER, "r"),
      adminCtx(VIEWER, "r"),
      anonymousCtx("r"),
    ]) {
      const claiming = claimingDelivery(ctx, ROW);
      expect(deliveryOf(claiming)).toBeNull();
      expect(causedByOf(claiming)).toBeNull();
      expect(idempotencyKey(claiming, "anything")).toBeNull();
    }
  });

  it("find none on a system ctx that is not a delivery", () => {
    expect(deliveryOf(systemCtx(`outbox:${ROW}`))).toBeNull();
    expect(causedByOf(systemCtx(`outbox:${ROW}`))).toBeNull();
  });

  it("refuse a malformed delivery even on a system ctx", () => {
    const system = systemCtx("r");
    for (const delivery of [
      { outboxId: "not-a-uuid", attempt: 1, final: false },
      { outboxId: ROW.toUpperCase(), attempt: 1, final: false },
      { outboxId: ROW, attempt: 0, final: false },
      { outboxId: ROW, attempt: 1.5, final: false },
      { outboxId: ROW, attempt: 1, final: "yes" },
    ]) {
      const ctx = { ...system, delivery } as unknown as Ctx;
      expect(deliveryOf(ctx)).toBeNull();
      expect(isWellFormedCtx(ctx)).toBe(false);
    }
  });
});

describe("isWellFormedCtx — the wire boundary", () => {
  it("accepts the ctx a delivery is made with, and a forwarded one", () => {
    expect(isWellFormedCtx(deliveryCtx(ROW))).toBe(true);
    expect(isWellFormedCtx(forwardCtx(deliveryCtx(ROW)))).toBe(true);
  });

  it("refuses delivery or causedBy on any ctx but system", () => {
    for (const ctx of [
      userCtx(VIEWER, "r"),
      adminCtx(VIEWER, "r"),
      anonymousCtx("r"),
    ]) {
      expect(isWellFormedCtx(ctx)).toBe(true);
      expect(isWellFormedCtx(claimingDelivery(ctx, ROW))).toBe(false);
      expect(isWellFormedCtx({ ...ctx, causedBy: ROW })).toBe(false);
    }
  });

  it("refuses a system ctx whose causedBy is not a row id", () => {
    expect(isWellFormedCtx({ ...systemCtx("r"), causedBy: "row-1" })).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* What a key covers                                                           */
/* -------------------------------------------------------------------------- */

describe("idempotencyKey", () => {
  const key = (ctx: Ctx, purpose: string, ...scope: string[]) =>
    idempotencyKey(ctx, purpose, ...scope);

  it("is null outside a delivery", () => {
    expect(key(systemCtx("r"), "x")).toBeNull();
    expect(key(userCtx(VIEWER, "r"), "x")).toBeNull();
  });

  it("is stable across the outbox's redeliveries of one row", () => {
    expect(key(deliveryCtx(ROW, 0), "cellar-item")).toBe(
      key(deliveryCtx(ROW, MAX_ATTEMPTS - 1), "cellar-item"),
    );
  });

  it("differs by row, by purpose and by scope — and is never the row id", () => {
    const other = randomUUID();
    const keys = [
      key(deliveryCtx(ROW), "cellar-item"),
      key(deliveryCtx(other), "cellar-item"),
      key(deliveryCtx(ROW), "check-in"),
      key(deliveryCtx(ROW), "check-in", "a"),
      key(deliveryCtx(ROW), "check-in", "b"),
      // A scope list cannot collide with another by concatenation.
      key(deliveryCtx(ROW), "check-in", "a", "b"),
      key(deliveryCtx(ROW), "check-in", "a\u0000b"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(ROW);
    expect(keys.every((k) => k !== null && /^[0-9a-f-]{36}$/.test(k))).toBe(
      true,
    );
  });

  it("cannot collide a purpose and a scope across the boundary between them", () => {
    // The doc's claim, which a `[purpose, ...scope].join(":")` derivation
    // would break and every test above would still pass: "p" + "a:b" and
    // "p:a" + "b" are two different lists, and must be two keys.
    expect(key(deliveryCtx(ROW), "p", "a:b")).not.toBe(
      key(deliveryCtx(ROW), "p:a", "b"),
    );
    expect(key(deliveryCtx(ROW), "p", "a", "b")).not.toBe(
      key(deliveryCtx(ROW), "p", "a,b"),
    );
  });

  it("refuses to be derived without saying what it covers", () => {
    expect(() => key(deliveryCtx(ROW), "")).toThrow(/purpose/);
  });
});

/* -------------------------------------------------------------------------- */
/* It does not cross a call                                                    */
/* -------------------------------------------------------------------------- */

describe("forwardCtx / internal(ctx)", () => {
  beforeEach(() => {
    invoked.length = 0;
  });

  it("strips delivery and keeps attribution", () => {
    const forwarded = forwardCtx(deliveryCtx(ROW));
    expect(forwarded.delivery).toBeUndefined();
    expect(forwarded.causedBy).toBe(ROW);
    expect(forwarded.kind).toBe("system");
    expect(deliveryOf(forwarded)).toBeNull();
    expect(idempotencyKey(forwarded, "anything")).toBeNull();
    expect(causedByOf(forwarded)).toBe(ROW);
    // A second hop keeps the same attribution.
    expect(forwardCtx(forwarded)).toEqual(forwarded);
  });

  it("leaves a request's ctx as it was", () => {
    const user = userCtx(VIEWER, "r");
    expect(forwardCtx(user)).toEqual(user);
  });

  it("is what the typed client puts on the wire, on every call", async () => {
    // The job → entity hop: a delivery calling another actor must not lend it
    // its identity — the recipe-photo and reprocess jobs both did.
    await internal(deliveryCtx(ROW))(PingActorDescriptor, "p").ping("hi");
    expect(invoked).toHaveLength(1);
    const args = invoked[0]?.[3] as readonly unknown[];
    const sent = args[0] as Ctx;
    expect(sent.delivery).toBeUndefined();
    expect(sent.causedBy).toBe(ROW);
    expect(sent.kind).toBe("system");
    expect(args[1]).toBe("hi");
  });
});

/* -------------------------------------------------------------------------- */
/* finalDeliveryFailure, on ctx.delivery                                       */
/* -------------------------------------------------------------------------- */

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("finalDeliveryFailure", () => {
  afterAll(closeTestDb);

  const transient = new ConflictError("try again");

  /** A `delivering` row after `attempts` failures, and the ctx delivering it. */
  const delivering = async (db: DbOrTx, attempts: number) => {
    const id = await insertOutboxRowForTest(db, {
      targetActor: "PingActor",
      targetId: "p",
      method: "ping",
    });
    await db
      .update(outbox)
      .set({ status: "delivering", attempts, claimToken: randomUUID() })
      .where(eq(outbox.id, id));
    return { id, ctx: deliveryCtx(id, attempts) };
  };

  it("answers without a query for anything but a final delivery", async () => {
    const noDb = new Proxy({} as DbOrTx, {
      get: () => {
        throw new Error("finalDeliveryFailure read the database");
      },
    });
    expect(
      await finalDeliveryFailure(noDb, deliveryCtx(ROW), transient),
    ).toBeNull();
    expect(
      await finalDeliveryFailure(
        noDb,
        deliveryCtx(ROW),
        new ValidationError("x"),
      ),
    ).toBe("permanent");
    expect(
      await finalDeliveryFailure(noDb, systemCtx("maintenance"), transient),
    ).toBe("not-a-delivery");
    // A request claiming a final delivery is not one: it is `not-a-delivery`,
    // which is final by definition, and never reads the queue.
    expect(
      await finalDeliveryFailure(
        noDb,
        claimingDelivery(adminCtx(VIEWER, "r"), ROW),
        transient,
      ),
    ).toBe("not-a-delivery");
  });

  it("is 'attempts' on the last attempt while the row is still this delivery's", async () => {
    await withTestDb(async (db) => {
      const { ctx } = await delivering(db, MAX_ATTEMPTS - 1);
      expect(deliveryOf(ctx)?.final).toBe(true);
      expect(await finalDeliveryFailure(db, ctx, transient)).toBe("attempts");
    });
  });

  it("defers to the outbox once the reclaim sweep has taken the row back", async () => {
    await withTestDb(async (db) => {
      // Reclaimed: pending again, attempt charged.
      const reclaimed = await delivering(db, MAX_ATTEMPTS - 1);
      await db
        .update(outbox)
        .set({ status: "pending", attempts: MAX_ATTEMPTS })
        .where(eq(outbox.id, reclaimed.id));
      expect(
        await finalDeliveryFailure(db, reclaimed.ctx, transient),
      ).toBeNull();

      // Reclaimed and claimed again by another drainer: `delivering` once
      // more, but not under the attempt this ctx was minted with.
      const reclaimedAgain = await delivering(db, MAX_ATTEMPTS - 2);
      const staleCtx = deliveryCtx(reclaimedAgain.id, MAX_ATTEMPTS - 1);
      expect(await finalDeliveryFailure(db, staleCtx, transient)).toBeNull();
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Scans                                                                       */
/* -------------------------------------------------------------------------- */

type Hit = { readonly file: string; readonly line: number; text: string };

const hitAt = (project: Project, node: ts.Node): Hit => ({
  file: relativePath(project.root, node.getSourceFile().fileName),
  line: lineOf(node),
  text: node.getText().slice(0, 100),
});

/**
 * Every read of a `requestId` property: `x.requestId`, `x["requestId"]`,
 * `{ requestId } = x` — and, through the checker, `x[k]` where `k` can only
 * be `"requestId"`.
 */
const requestIdReads = (project: Project, file: ts.SourceFile): Hit[] => {
  const hits: Hit[] = [];
  const record = (node: ts.Node) => hits.push(hitAt(project, node));
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === "requestId") {
      record(node);
    }
    if (
      ts.isElementAccessExpression(node) &&
      literalValue(project.checker, node.argumentExpression) === "requestId"
    ) {
      record(node);
    }
    if (
      ts.isBindingElement(node) &&
      ts.isObjectBindingPattern(node.parent) &&
      ((node.propertyName !== undefined &&
        ts.isIdentifier(node.propertyName) &&
        node.propertyName.text === "requestId") ||
        (node.propertyName === undefined &&
          ts.isIdentifier(node.name) &&
          node.name.text === "requestId"))
    ) {
      record(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return hits;
};

/** Is `type` (or a member of it) contracts' `Delivery`? */
const isDeliveryType = (type: ts.Type | undefined): boolean =>
  type !== undefined &&
  (type.isUnion() ? type.types : [type]).some((member) =>
    (member.aliasSymbol?.declarations ?? []).some(
      (declaration) =>
        member.aliasSymbol?.name === "Delivery" &&
        declaration.getSourceFile().fileName === `${CONTRACTS_SRC}/ctx.ts`,
    ),
  );

/**
 * Every place a delivery is built: a `delivery: { outboxId, … }` property
 * (by shape, as before), and — through the checker — any object literal
 * written where contracts' `Delivery` is expected, however it is named
 * (`const d: Delivery = { … }`).
 */
const deliveryConstructions = (
  project: Project,
  file: ts.SourceFile,
): Hit[] => {
  const hits: Hit[] = [];
  const lines = new Set<number>();
  const record = (node: ts.Node) => {
    const hit = hitAt(project, node);
    if (lines.has(hit.line)) return;
    lines.add(hit.line);
    hits.push(hit);
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "delivery" &&
      ts.isObjectLiteralExpression(node.initializer) &&
      node.initializer.properties.some(
        (p) =>
          (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
          ts.isIdentifier(p.name) &&
          p.name.text === "outboxId",
      )
    ) {
      record(node);
    } else if (
      ts.isObjectLiteralExpression(node) &&
      isDeliveryType(project.checker.getContextualType(node))
    ) {
      record(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return hits;
};

const scanTree = (
  scan: (project: Project, file: ts.SourceFile) => Hit[],
): Hit[] => {
  const project = actorsProject();
  return sourceFiles(project, { includeHarness: true }).flatMap((file) =>
    scan(project, file),
  );
};

/** One fixture module, scanned. */
const scanText = (
  scan: (project: Project, file: ts.SourceFile) => Hit[],
  text: string,
): Hit[] => {
  const project = actorsFixture({ "synthetic.ts": text });
  return scan(project, sourceFileAt(project, `${project.root}/synthetic.ts`));
};

/**
 * Every `idempotencyKey` call, as `Class.method` of the method it sits in —
 * and whether any outbox row can ever deliver that method. `idempotencyKey`
 * answers `null` outside a delivery, and `forwardCtx` strips the delivery
 * from every onward call, so a call in a method the drainer never invokes is
 * a key that is always `null`: dead code whose comment describes a retry
 * path that does not exist (LOW-4). A job's `processBatch` is delivered as
 * its `runBatch`.
 */
const IDEMPOTENCY_KEY = {
  module: `${ACTORS_SRC}/lib/delivery.ts`,
  name: "idempotencyKey",
};
const keySites = (
  project: Project,
  under: string,
): { site: string; delivered: boolean }[] => {
  const files = sourceFiles(project, { under });
  const { calls, refusals } = findCalls(project, [IDEMPOTENCY_KEY], {
    rule: "delivery/idempotency-key",
    files,
  });
  expect(refusals).toEqual([]);
  return calls.map(({ call }) => {
    let method: string | null = null;
    let owner: string | null = null;
    for (let node: ts.Node = call; node.parent !== undefined; ) {
      node = node.parent;
      if (
        method === null &&
        (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) &&
        (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name))
      ) {
        method = node.name.text;
      }
      if (ts.isClassDeclaration(node) && node.name !== undefined) {
        owner = node.name.text;
        break;
      }
    }
    const site = `${owner ?? "?"}.${method ?? "?"}`;
    if (owner === null || method === null) return { site, delivered: false };
    const delivered =
      outboxTarget(owner, method) !== undefined ||
      (method === "processBatch" &&
        outboxTarget(owner, "runBatch") !== undefined);
    return { site, delivered };
  });
};

describe("idempotencyKey call sites", () => {
  // The host's program and the checker's pass over it, once, under a timeout
  // sized for CPU (PROGRAM_TIMEOUT_MS says why).
  let sites: { site: string; delivered: boolean }[] = [];
  beforeAll(() => {
    sites = keySites(actorsProject(), `${ACTORS_SRC}/actors`);
  }, PROGRAM_TIMEOUT_MS);

  /**
   * A method that calls `idempotencyKey` but that no outbox row can deliver
   * gets `null` every time, so the `?? randomUUID()` beside it always runs
   * and the "idempotent on redelivery" it reads as is fiction. There are
   * none: `CellarActor.checkIn` and `TierListActor.addItem` were the last two,
   * and dropped the call rather than being inventoried here.
   */
  it("sit only in methods the outbox delivers", () => {
    // The scan sees the delivered ones too, so it is looking at the right tree.
    expect(sites.filter((s) => s.delivered).length).toBeGreaterThan(0);
    expect(
      [...new Set(sites.filter((s) => !s.delivered).map((s) => s.site))].sort(),
      [
        "",
        "idempotencyKey() is called in a method no outbox row delivers. It is",
        "null outside a delivery and forwardCtx strips `delivery` from every",
        "onward call, so this key is always null. Derive the key in the",
        "delivered method and pass it in, or drop the call.",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("finds a key in an undelivered method, and not in a delivered one (negative control)", () => {
    const project = actorsFixture({
      "fake.ts": [
        'import type { Ctx } from "@cellar-assistant/contracts";',
        'import { idempotencyKey as key } from "../lib/delivery.ts";',
        "export class ItemActor {",
        '  async regenerateVector(ctx: Ctx) { return key(ctx, "a"); }',
        '  async rename(ctx: Ctx) { return key(ctx, "b"); }',
        "}",
        "export class PlaceRefreshJobActor {",
        '  async processBatch(ctx: Ctx) { return key(ctx, "c"); }',
        "}",
      ].join("\n"),
    });
    expect(keySites(project, project.root)).toEqual([
      { site: "ItemActor.regenerateVector", delivered: true },
      { site: "ItemActor.rename", delivered: false },
      { site: "PlaceRefreshJobActor.processBatch", delivered: true },
    ]);
  });
});

describe("scans", () => {
  // Both tree scans, once, under a timeout sized for CPU (PROGRAM_TIMEOUT_MS
  // says why); the tests below only read them.
  let requestIdHits: Hit[] = [];
  let deliveryHits: Hit[] = [];
  beforeAll(() => {
    requestIdHits = scanTree(requestIdReads);
    deliveryHits = scanTree(deliveryConstructions);
  }, PROGRAM_TIMEOUT_MS);

  it("find sources to scan", () => {
    expect(
      sourceFiles(actorsProject(), { under: `${ACTORS_SRC}/actors` }).length,
    ).toBeGreaterThan(40);
  });

  it("no actor module reads ctx.requestId — it is correlation, not identity", () => {
    // `lib/telemetry.ts`' `correlationId` is the one sanctioned read, for a
    // log line or for carrying one correlation id across a hop. Everything
    // under `src/actors` goes through it, so "is this a delivery, and which
    // one" can only be asked of `ctx.delivery`.
    const hits = requestIdHits.filter((hit) => hit.file.startsWith("actors/"));
    expect(
      hits.map((h) => `${h.file}:${h.line}  ${h.text}`),
      [
        "",
        "An actor module reads `requestId`. It is a correlation id: a client",
        "chose it once, and it travels to every actor a turn calls. Ask",
        "`deliveryOf(ctx)` / `idempotencyKey(ctx, purpose)` (lib/delivery.ts)",
        "for a delivery's identity, and `correlationId(ctx)`",
        "(lib/telemetry.ts) for a log line.",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("only OutboxActor mints a delivery", () => {
    const hits = deliveryHits.filter(
      (hit) => hit.file !== "actors/outbox-actor.ts",
    );
    expect(hits.map((h) => `${h.file}:${h.line}  ${h.text}`)).toEqual([]);
    // …and it does mint one, so the scan is looking at the right shape.
    expect(deliveryHits.map((h) => h.file)).toContain("actors/outbox-actor.ts");
  });

  it("catch every spelling of a read, and not a key being written", () => {
    const reads = scanText(
      requestIdReads,
      [
        "declare const ctx: { requestId: string };",
        "const a = ctx.requestId;",
        'const b = ctx["requestId"];',
        "const { requestId } = ctx;",
        "const { requestId: rid } = ctx;",
        "const c = ctx?.requestId;",
        // Not reads: an object key, a parameter, a string.
        'const d = { requestId: "r" };',
        "function f(requestId: string) { return requestId; }",
        'const e = "ctx.requestId";',
        // Through the checker: a key that can only be "requestId".
        'const k = "requestId" as const;',
        "const g = ctx[k];",
      ].join("\n"),
    );
    expect(reads.map((r) => r.line)).toEqual([2, 3, 4, 5, 6, 11]);
    expect(
      scanText(
        deliveryConstructions,
        [
          'import type { Ctx, Delivery } from "@cellar-assistant/contracts";',
          "declare const ctx: Ctx;",
          "declare const outboxId: string;",
          "const x = { ...ctx, delivery: { outboxId, attempt: 1, final: false } };",
          "const y = { delivery: { batch: 1 } };",
          // Through the checker: a Delivery built under another name.
          "const d: Delivery = { outboxId, attempt: 1, final: false } as Delivery;",
          "export const z = [x, y, d];",
        ].join("\n"),
      ).map((h) => h.line),
    ).toEqual([4, 6]);
  });

  it("the drainer's arguments are what deliveryCtx hands a test", () => {
    // `lib/testing.ts` builds its delivery ctxs with the drainer's own
    // function, so a test standing in for the outbox cannot drift from it.
    expect(deliveryCtx(ROW, 4)).toEqual(
      deliveryArgs({ id: ROW, attempts: 4, payload: undefined })[0],
    );
  });
});
