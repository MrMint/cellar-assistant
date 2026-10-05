/**
 * The concealment primitives on `EntityActorBase` (`./actor-base.ts`), and a
 * scan that keeps them the only spelling of "there is no such row".
 *
 * Each privacy-bearing actor's own suite holds the end-to-end half: a
 * parametrised "an absent id and a stranger's private id answer alike" block
 * in `cellar-actor.test.ts`, `tier-list-actor.test.ts`, `file-actor.test.ts`,
 * `menu-scan-actor.test.ts`, `item-onboarding-actor.test.ts`,
 * `job-actor/job-actor.test.ts` and `cellar-item-search-actor.test.ts`.
 */
import {
  findingAt,
  PROGRAM_TIMEOUT_MS,
  sourceFiles,
} from "@cellar-assistant/analysis";
import type { Ctx } from "@cellar-assistant/contracts";
import {
  ActorError,
  adminCtx,
  systemCtx,
  userCtx,
} from "@cellar-assistant/contracts";
import { ActorId, DaprClient } from "@dapr/dapr";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { absentRow, EntityActorBase } from "./actor-base.ts";
import { actorsFixture, actorsProject } from "./analysis-testing.ts";
import type { DbOrTx } from "./db.ts";

/* -------------------------------------------------------------------------- */
/* The primitives, without a database                                          */
/* -------------------------------------------------------------------------- */

const OWNER = "00000000-0000-4000-8000-000000000001";
const STRANGER = "00000000-0000-4000-8000-000000000002";
const REAL = "00000000-0000-4000-8000-0000000000aa";
const ABSENT = "00000000-0000-4000-8000-0000000000bb";

type Row = { readonly ownerId: string; readonly public: boolean };

/** Owner-or-public rows, in memory. Exposes the protected helpers to test. */
class HiddenRowActor extends EntityActorBase<Row> {
  static readonly rows = new Map<string, Row>([
    [REAL, { ownerId: OWNER, public: false }],
  ]);

  protected async loadAggregate(id: string): Promise<Row | null> {
    return HiddenRowActor.rows.get(id) ?? null;
  }

  protected override canSee(ctx: Ctx, row: Row): boolean {
    return row.public || ctx.viewerId === row.ownerId || ctx.kind !== "user";
  }

  async read(ctx: Ctx): Promise<Row> {
    return this.requireVisible(ctx);
  }

  async change(ctx: Ctx): Promise<void> {
    const row = this.requireAggregate();
    await this.requireAllowed(ctx, ctx.viewerId === row.ownerId, "not yours");
  }

  async deliver(ctx: Ctx): Promise<Row> {
    return this.requirePrivilegedAggregate(ctx, "outbox only");
  }
}

/** Uses the helpers without saying who may see its rows. */
class ForgetfulActor extends EntityActorBase<Row> {
  protected async loadAggregate(): Promise<Row | null> {
    return { ownerId: OWNER, public: true };
  }
  async read(ctx: Ctx): Promise<Row> {
    return this.requireVisible(ctx);
  }
}

const actorFor = async <T extends EntityActorBase<Row>>(
  Actor: new (client: DaprClient, id: ActorId, db: DbOrTx) => T,
  id: string,
): Promise<T> => {
  const actor = new Actor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(id),
    {} as DbOrTx,
  );
  await actor.onActivate();
  return actor;
};

/** `{ code, message }` with the id elided, or `"ok"`. */
const answer = async (
  call: (actor: HiddenRowActor) => Promise<unknown>,
  id: string,
): Promise<string> => {
  try {
    await call(await actorFor(HiddenRowActor, id));
    return "ok";
  } catch (error) {
    if (!(error instanceof ActorError)) throw error;
    return `${error.code}: ${error.message.replaceAll(id, "<id>")}`;
  }
};

describe("EntityActorBase concealment primitives", () => {
  const stranger = userCtx(STRANGER, "r");
  const owner = userCtx(OWNER, "r");

  it("absentRow is requireAggregate's own wording", async () => {
    expect(await answer((a) => a.read(owner), ABSENT)).toBe(
      `NOT_FOUND: ${absentRow("HiddenRowActor", "<id>").message}`,
    );
  });

  it("requireVisible: hidden and absent are one answer", async () => {
    expect(await answer((a) => a.read(stranger), REAL)).toBe(
      await answer((a) => a.read(stranger), ABSENT),
    );
    expect(await answer((a) => a.read(owner), REAL)).toBe("ok");
  });

  it("requireAllowed: absent to whoever cannot see it, Forbidden to whoever can", async () => {
    expect(await answer((a) => a.change(stranger), REAL)).toBe(
      await answer((a) => a.change(stranger), ABSENT),
    );
    // An admin can see every row, so "not yours" discloses nothing to them.
    expect(await answer((a) => a.change(adminCtx(STRANGER, "r")), REAL)).toBe(
      "FORBIDDEN: not yours",
    );
    expect(await answer((a) => a.change(owner), REAL)).toBe("ok");
  });

  it("requirePrivilegedAggregate: the caller before the row", async () => {
    // The defect this exists for: row-first answered NotFound for ABSENT and
    // Forbidden for REAL, which told an ordinary caller which ids are real.
    const real = await answer((a) => a.deliver(owner), REAL);
    expect(real).toBe(await answer((a) => a.deliver(owner), ABSENT));
    expect(real).toBe("FORBIDDEN: outbox only");
    // A privileged caller may know any row exists, and is told when it doesn't.
    expect(await answer((a) => a.deliver(systemCtx("r")), ABSENT)).toMatch(
      /^NOT_FOUND: /,
    );
    expect(await answer((a) => a.deliver(systemCtx("r")), REAL)).toBe("ok");
  });

  it("canSee must be declared before the helpers are used", async () => {
    const actor = await actorFor(ForgetfulActor, REAL);
    await expect(actor.read(owner)).rejects.toThrow(/does not override canSee/);
  });
});

/* -------------------------------------------------------------------------- */
/* The only spelling                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A string or template literal that *ends* with the absence wording — the
 * shape of every hand copy (`` `CellarActor(${id}) has no row` ``,
 * `` `cellar ${id} has no row` ``). Parsed, so a comment quoting the wording
 * does not trip it, and anchored at the end, so a different sentence that
 * happens to contain the words (`` `barcode … has no row yet; …` ``) does not
 * either.
 *
 * Deliberately a reading of literal *text*: the rule is about wording, and
 * wording has no symbol for a checker to resolve. The program supplies the
 * files and the positions.
 */
const scanAbsenceWording = (
  project = actorsProject(),
  files: readonly ts.SourceFile[] = sourceFiles(project, {
    includeHarness: true,
    exclude: (file) => file === "lib/actor-base.ts",
  }),
): string[] => {
  const hits: string[] = [];
  for (const source of files) {
    const visit = (node: ts.Node): void => {
      const literal = ts.isStringLiteral(node)
        ? node.text
        : ts.isNoSubstitutionTemplateLiteral(node)
          ? node.text
          : ts.isTemplateExpression(node)
            ? (node.templateSpans.at(-1)?.literal.text ?? node.head.text)
            : undefined;
      if (literal !== undefined && /has no row\s*$/.test(literal)) {
        const { file, line } = findingAt(project, node, "concealment", "");
        hits.push(`${file}:${line}: ${node.getText()}`);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return hits;
};

/** Scans `text` as one fixture module. */
const probe = (text: string): string[] => {
  const project = actorsFixture({ "probe.ts": text });
  return scanAbsenceWording(project, sourceFiles(project));
};

describe("absence is spelled once", () => {
  // Building the host's program is this file's cost: once, under a timeout
  // sized for CPU (PROGRAM_TIMEOUT_MS says why).
  let tree: string[] = [];
  beforeAll(() => {
    tree = scanAbsenceWording();
  }, PROGRAM_TIMEOUT_MS);

  it("nothing under src/ but actor-base.ts words a refusal as 'has no row'", () => {
    expect(tree).toEqual([]);
  });

  it.each([
    ["a template copy", `throw new E(\`CellarActor(\${id}) has no row\`);`],
    ["a reworded copy", `throw new E(\`cellar \${id} has no row\`);`],
    ["a plain string", 'throw new E("MenuScanActor has no row");'],
  ])("flags %s", (_what, text) => {
    expect(probe(text)).toHaveLength(1);
  });

  it.each([
    ["a comment", "// `X(<id>) has no row` is the wording\nconst a = 1;"],
    [
      "a longer sentence",
      `throw new E(\`barcode \${c} has no row yet; run it\`);`,
    ],
  ])("leaves %s alone", (_what, text) => {
    expect(probe(text)).toEqual([]);
  });
});
