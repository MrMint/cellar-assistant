/**
 * The registry is the whole truth about what this host serves.
 *
 * `registry.ts` makes the class ↔ contract link a compile error; this file is
 * the runtime half, and the three things a type cannot see:
 *
 *  1. **the name Dapr registers.** `registerActor(Cls)` registers `Cls.name`,
 *     not the descriptor's `actorType`. A descriptor naming anything else is a
 *     proxy to an actor type nobody hosts — every call 404s at the sidecar.
 *  2. **the category, stated once.** The descriptor holds it (what
 *     `services/api` and the single-writer tests read); each class's
 *     `static category` (what `ActorBase.tx()` enforces) is *derived* from it
 *     — `static readonly category = CellarActorDescriptor.category` — so the
 *     two cannot disagree, and a class that restates a literal instead fails
 *     the scan below.
 *  3. **completeness.** Every concrete actor class under `src/actors` is in
 *     the registry exactly once. An actor class that is built, tested and never
 *     registered is callable by nobody, and is exactly the failure the A7f
 *     surface test found four times from the other side.
 */
import {
  PROGRAM_TIMEOUT_MS,
  type Project,
  referencedSymbol,
  sourceFiles,
  unwrapExpression,
} from "@cellar-assistant/analysis";
import {
  type ActorCategory,
  type ActorDescriptor,
  CellarActorDescriptor,
  type Ctx,
  ItemActorDescriptor,
} from "@cellar-assistant/contracts";
import { AbstractActor } from "@dapr/dapr";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
} from "../lib/analysis-testing.ts";
import { CellarActor } from "./cellar-actor.ts";
import { ItemActor } from "./item-actor.ts";
import { ACTOR_REGISTRY, entry } from "./registry.ts";

const ACTORS_DIR = `${ACTORS_SRC}/actors`;

/**
 * The host's program, built once, under a timeout sized for CPU rather than
 * inside whichever test reaches it first (PROGRAM_TIMEOUT_MS says why).
 */
let project: Project;
beforeAll(() => {
  project = actorsProject();
}, PROGRAM_TIMEOUT_MS);

/** `src/actors`' modules in the host's program (harnesses too, as before). */
const actorModules = (): ts.SourceFile[] =>
  sourceFiles(project, { under: ACTORS_DIR, includeHarness: true });

/** Every exported, non-abstract class declared under `src/actors`, by name. */
const concreteActorClasses = (): string[] => {
  const names: string[] = [];
  for (const source of actorModules()) {
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement) || statement.name === undefined) {
        continue;
      }
      const modifiers = statement.modifiers ?? [];
      const exported = modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      );
      const abstract = modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword,
      );
      if (exported && !abstract) names.push(statement.name.text);
    }
  }
  return names;
};

/**
 * Is `init` `<descriptor>.category`, where `<descriptor>` resolves to an
 * exported descriptor of that name — in contracts, or one of the host-private
 * ones beside their actors (`maintenance-actor-descriptor.ts`)?
 */
const isDescriptorCategory = (
  checker: ts.TypeChecker,
  init: ts.Expression | undefined,
  descriptor: string,
): boolean => {
  if (init === undefined) return false;
  const expression = unwrapExpression(init);
  if (
    !ts.isPropertyAccessExpression(expression) ||
    expression.name.text !== "category"
  ) {
    return false;
  }
  const target = unwrapExpression(expression.expression);
  const name = ts.isPropertyAccessExpression(target) ? target.name : target;
  const symbol = referencedSymbol(checker, name);
  return (
    symbol?.name === descriptor &&
    (symbol.declarations ?? []).some(
      (declaration) =>
        ts.isVariableDeclaration(declaration) &&
        (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !==
          0,
    )
  );
};

describe("ACTOR_REGISTRY", () => {
  it("finds the registry at all", () => {
    // If this drops, every assertion below is vacuously green.
    expect(ACTOR_REGISTRY.length).toBeGreaterThan(40);
  });

  it("registers each class under the actor type its descriptor names", () => {
    const mismatched = ACTOR_REGISTRY.filter(
      ({ actorClass, descriptor }) => actorClass.name !== descriptor.actorType,
    ).map(
      ({ actorClass, descriptor }) =>
        `${actorClass.name} registered for ${descriptor.actorType}`,
    );
    expect(
      mismatched,
      "Dapr registers a class under its constructor name. A descriptor whose " +
        "actorType differs addresses an actor type this host does not serve.",
    ).toEqual([]);
  });

  it("agrees with each descriptor about the category", () => {
    const disagreeing = ACTOR_REGISTRY.filter(
      ({ actorClass, descriptor }) =>
        actorClass.category !== descriptor.category,
    ).map(
      ({ actorClass, descriptor }) =>
        `${actorClass.name}: class says ${actorClass.category}, ` +
        `descriptor says ${descriptor.category}`,
    );
    expect(disagreeing).toEqual([]);
  });

  it("derives each class's category from its descriptor rather than restating it", () => {
    // Parsed and resolved: the one `static … category` property on each
    // registered class must be initialised as `.category` of the contracts
    // descriptor named `<Class>Descriptor` — by symbol, so an alias or a
    // namespace member is that descriptor and a look-alike local is not. A
    // class that inherits it (none do now) would have no declaration and
    // fail too.
    const { checker } = project;
    const restated: string[] = [];
    const registered = new Set(
      ACTOR_REGISTRY.map(({ actorClass }) => actorClass.name),
    );
    const found = new Set<string>();
    for (const source of actorModules()) {
      for (const statement of source.statements) {
        if (!ts.isClassDeclaration(statement) || statement.name === undefined) {
          continue;
        }
        const name = statement.name.text;
        if (!registered.has(name)) continue;
        for (const member of statement.members) {
          if (
            ts.isPropertyDeclaration(member) &&
            member.name.getText() === "category" &&
            member.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.StaticKeyword,
            )
          ) {
            found.add(name);
            const init = member.initializer;
            if (!isDescriptorCategory(checker, init, `${name}Descriptor`)) {
              restated.push(
                `${name}: category = ${init?.getText() ?? "(none)"}`,
              );
            }
          }
        }
      }
    }
    expect(restated).toEqual([]);
    expect([...registered].filter((name) => !found.has(name))).toEqual([]);
  });

  it("reads the category by the descriptor's symbol (negative control)", () => {
    const project = actorsFixture({
      "classes.ts": `
        import { CellarActorDescriptor as D } from "@cellar-assistant/contracts";
        import * as c from "@cellar-assistant/contracts";
        const CellarActorDescriptor = { category: "entity" as const };
        export class ViaAlias { static category = D.category; }
        export class ViaNamespace { static category = c.CellarActorDescriptor.category; }
        export class LookAlike { static category = CellarActorDescriptor.category; }
        export class Restated { static category = "entity"; }
      `,
    });
    const categories = Object.fromEntries(
      sourceFiles(project)[0]?.statements.flatMap((statement) =>
        ts.isClassDeclaration(statement) && statement.name !== undefined
          ? statement.members
              .filter(ts.isPropertyDeclaration)
              .map((member) => [
                statement.name?.text,
                isDescriptorCategory(
                  project.checker,
                  member.initializer,
                  "CellarActorDescriptor",
                ),
              ])
          : [],
      ) ?? [],
    );
    expect(categories).toEqual({
      ViaAlias: true,
      ViaNamespace: true,
      LookAlike: false,
      Restated: false,
    });
  });

  it("registers every class exactly once", () => {
    const classes = ACTOR_REGISTRY.map(({ actorClass }) => actorClass);
    expect(new Set(classes).size).toBe(classes.length);
    const types = ACTOR_REGISTRY.map(({ descriptor }) => descriptor.actorType);
    expect(new Set(types).size).toBe(types.length);
  });

  it("registers every concrete actor class under src/actors, and nothing else", () => {
    const declared = concreteActorClasses().sort();
    // The scan's own canary: a parse that found nothing would pass the
    // comparison below only if the registry were empty too, which the first
    // case rules out — but say it directly.
    expect(declared.length).toBeGreaterThan(40);
    const registered = ACTOR_REGISTRY.map(
      ({ actorClass }) => actorClass.name,
    ).sort();
    expect(
      registered,
      "An actor class declared under src/actors and missing from " +
        "ACTOR_REGISTRY is served by nobody; add an entry(Class, Descriptor).",
    ).toEqual(declared);
  });

  it("refuses, at compile time, a class paired with another actor's contract", () => {
    // The permanent negative control for `entry`'s strict check. If `entry`
    // stops comparing the class against the descriptor, these directives are
    // unused and `bun run typecheck` fails.
    // At runtime `entry` refuses the pairing too, when it wraps the declared
    // methods (`guardDeclaredMethods`) and finds one missing.
    expect(() =>
      // @ts-expect-error — CellarActor has none of ItemActorInterface's methods.
      entry(CellarActor, ItemActorDescriptor),
    ).toThrow(/has no such method/);
    expect(() =>
      // @ts-expect-error — nor does ItemActor have CellarActorInterface's.
      entry(ItemActor, CellarActorDescriptor),
    ).toThrow(/has no such method/);
    expect(entry(CellarActor, CellarActorDescriptor).descriptor).toBe(
      CellarActorDescriptor,
    );
  });

  it("refuses, at compile time, a method narrower than its contract", () => {
    // The case `implements` lets through: method-syntax parameters are
    // compared bivariantly, so a class accepting only `string` "implements" a
    // contract promising callers `string | number`. `entry` compares them
    // strictly.
    type Wide = { take(ctx: Ctx, value: string | number): Promise<void> };
    const WideActorDescriptor: ActorDescriptor<Wide> = {
      actorType: "NarrowActor",
      category: "entity",
      methods: { take: {} },
    };
    class NarrowActor extends AbstractActor implements Wide {
      static readonly category: ActorCategory = "entity";
      async take(_ctx: Ctx, _value: string): Promise<void> {}
    }
    // @ts-expect-error — `take(ctx, string)` cannot serve `string | number`.
    entry(NarrowActor, WideActorDescriptor);
    expect(NarrowActor.name).toBe(WideActorDescriptor.actorType);
  });
});
