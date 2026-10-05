/**
 * §8.5 — no external or AI call inside an `ItemActor` or `UserActor` turn.
 *
 * The rule, from §2.1's `UserActor` note and §8.5's call graph:
 *
 * > **No AI or external call runs inside a `UserActor` turn** — a multi-second
 * > call would block every other operation for that user. Onboarding therefore
 * > has its own actor.
 *
 * The same reasoning binds `ItemActor`: Dapr runs one turn at a time per actor
 * id, so a 30-second model call inside `ItemActor("wine:…")` would stall every
 * reader of that wine. `ItemOnboardingActor` and `PlaceCreationActor` are
 * §8.5's only two request-driven long operations, and they are keyed so that
 * the blast radius is one onboarding or one creation.
 *
 * ## Why this is a static test and not a runtime one
 *
 * The same reason `no-actor-state.test.ts` is (A4): a runtime assertion can
 * only catch the paths a test happens to drive, and "nothing here ever calls
 * out" is a property of the *module*, not of one execution. So this parses the
 * source and asserts two things per guarded file:
 *
 *  1. **no outbound identifier** — `fetch`, `XMLHttpRequest`, `node:http(s)`,
 *     an AI SDK's entry points;
 *  2. **an import allow-list** — the durable half, because a `fetch` can
 *     arrive through any dependency. `ItemActor` may import the database,
 *     contracts, policy, `@dapr/dapr` and its own `lib/`; it may not import
 *     `lib/item-defaults.ts` (the AI seam), and `UserActor` may not even
 *     import `lib/sidecar.ts`.
 *
 * ## What is *allowed*, and why that is not a loophole
 *
 * `ItemActor` reaches `FileActor` and `EmbeddingActor` through the typed
 * actor client (`internal(ctx)(…)`, in the two seam modules below) — §8.5
 * lists both as sanctioned synchronous edges for an entity actor. Those are Dapr sidecar hops to actors on the same host, not
 * calls out of the system, and the third assertion below pins the target list
 * so a new edge cannot be added silently. The genuinely slow one,
 * `regenerateVector`'s embedding, is outbox-driven (`system`) and therefore
 * never in the turn of a user-facing read.
 *
 * `B4` wrote the `UserActor` half of this inside `user-actor.test.ts`. It stays
 * there — it is that actor's own acceptance — and this file is the shared,
 * extensible version C1/C2/B5 should add their actors to.
 */
import { moduleSpecifiers, sourceFileAt } from "@cellar-assistant/analysis";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
} from "./analysis-testing.ts";
import { sidecarTargetsOf } from "./sidecar-targets.ts";

const ACTORS_DIR = `${ACTORS_SRC}/actors`;

/**
 * Identifiers that mean "this module talks to something outside the process
 * on its own account". The actor client is deliberately absent — see the
 * module doc, and the per-file rules below.
 */
const FORBIDDEN_IDENTIFIERS = [
  "fetch",
  "XMLHttpRequest",
  "generateContent",
  "generateEmbeddings",
  "createAIProvider",
  "GoogleGenerativeAI",
  "VertexAI",
  "OpenAI",
] as const;

const FORBIDDEN_MODULES = [
  "node:http",
  "node:https",
  "node:net",
  "undici",
  "axios",
  "got",
  "@google-cloud/vertexai",
  "@google/generative-ai",
  "openai",
  "ollama",
] as const;

type Guarded = {
  readonly file: string;
  /** Modules this file may import. Anything else fails. */
  readonly imports: readonly string[];
  /**
   * Actor types this file may reach through the sidecar (`internal(ctx)(…)`,
   * or a literal `invokeActorMethod`). An empty list means it may not call
   * another actor at all.
   */
  readonly sidecarTargets: readonly string[];
};

const SHARED_IMPORTS = [
  "node:crypto",
  "@cellar-assistant/contracts",
  "@cellar-assistant/db",
  "@cellar-assistant/db/orm",
  "@cellar-assistant/policy",
  "@dapr/dapr",
  "../lib/actor-base.ts",
  // Pure: a `never`-typed switch default that throws. No imports, no I/O.
  "../lib/assert-never.ts",
  "../lib/db.ts",
  // Pure: reads `ctx.delivery` and derives uuids (`node:crypto`). No I/O.
  "../lib/delivery.ts",
  "../lib/guards.ts",
  // Pure: `ITEM_TYPE_SPECS` joined to the Drizzle tables, and the item arcs
  // derived from the tables' own columns. Both guarded below.
  "../lib/item-arcs.ts",
  "../lib/item-bindings.ts",
  "../lib/outbox.ts",
  // Pure data: the outbox allow-list and its typed handles. Guarded below.
  "../lib/outbox-targets.ts",
  // Pure SQL: the `halfvec` literal and the distance query. Guarded below.
  "../lib/vectors.ts",
  // Pure: validates a uuid and returns its lowercase spelling. Guarded below.
  "../lib/uuid.ts",
];

const GUARDED: readonly Guarded[] = [
  {
    file: "item-actor.ts",
    imports: [
      ...SHARED_IMPORTS,
      "../lib/embedding-client.ts",
      "../lib/file-verification.ts",
    ],
    // §8.5's "entity → FileActor, BudgetActor, EmbeddingActor,
    // BrandRegistryActor, BarcodeActor". `ItemActor` uses two of the five,
    // and reaches both through a seam module guarded in its own right below —
    // so each edge is still pinned, one module further out, and this file
    // itself names no actor.
    sidecarTargets: [],
  },
  {
    // Not an actor module: the shared `FileActor.verify` seam E2d extracted so
    // `ItemActor` and `MenuScanActor` could hold one implementation between
    // them instead of the two-then-three copies `derivedUuid` ended up with.
    // Guarded here because moving the call out of `item-actor.ts` would
    // otherwise have moved it out of this test's sight, and "a new edge cannot
    // be added silently" is the whole point.
    file: "../lib/file-verification.ts",
    imports: ["@cellar-assistant/contracts", "./internal-client.ts"],
    sidecarTargets: ["FileActor"],
  },
  {
    // The one `EmbeddingActor` adapter every caller defaults to. Deliberately
    // not `lib/embeddings.ts`, which holds the `Embedder` model seam: asking
    // the actor for a vector must not also hand `ItemActor` the model.
    file: "../lib/embedding-client.ts",
    imports: ["@cellar-assistant/contracts", "./internal-client.ts"],
    sidecarTargets: ["EmbeddingActor"],
  },
  {
    // The caller gates every actor shares. Pure: contracts and policy, no
    // handle, no client — guarded so it stays that way.
    file: "../lib/guards.ts",
    imports: ["@cellar-assistant/contracts", "@cellar-assistant/policy"],
    sidecarTargets: [],
  },
  {
    // Pure: the spec and the six tables, no handle, no client — guarded so a
    // helper that every item-shaped actor imports cannot grow an edge.
    file: "../lib/item-bindings.ts",
    imports: [
      "@cellar-assistant/contracts",
      "@cellar-assistant/db",
      // `requireUuid` for `itemOnboardingId` — pure, and guarded itself.
      "./uuid.ts",
    ],
    sidecarTargets: [],
  },
  {
    file: "../lib/item-arcs.ts",
    imports: [
      "@cellar-assistant/contracts",
      "@cellar-assistant/db",
      "@cellar-assistant/db/orm",
    ],
    sidecarTargets: [],
  },
  {
    // The outbox allow-list: descriptors and literals, no handle, no client.
    // It imports descriptors and never an actor, so it cannot grow an edge.
    file: "../lib/outbox-targets.ts",
    imports: [
      "@cellar-assistant/contracts",
      "../actors/maintenance-actor-descriptor.ts",
      "../actors/probe-job-actor-descriptor.ts",
    ],
    sidecarTargets: [],
  },
  {
    // The SQL side of a stored vector — the literal, the distance query.
    // Deliberately apart from `lib/embeddings.ts` (the model seam), so an
    // actor that stores or compares vectors never also holds the model.
    file: "../lib/vectors.ts",
    imports: [
      "@cellar-assistant/contracts",
      "@cellar-assistant/db",
      "@cellar-assistant/db/orm",
      "./db.ts",
      "./item-arcs.ts",
    ],
    sidecarTargets: [],
  },
  {
    // The shared uuid check: contracts' `ValidationError`, nothing else.
    file: "../lib/uuid.ts",
    imports: ["@cellar-assistant/contracts"],
    sidecarTargets: [],
  },
  {
    // The display-name rule (W4 security F2): a regex and a random handle.
    // Shared with better-auth's hooks, which is why it lives in `auth/` — and
    // guarded so importing it never pulls better-auth into a UserActor turn.
    file: "../auth/display-name.ts",
    imports: ["node:crypto"],
    sidecarTargets: [],
  },
  {
    file: "user-actor.ts",
    // No `sidecar.ts` or actor client at all: §2.1 is absolute for this one,
    // and B4's own test says the same thing from the other direction.
    imports: [
      ...SHARED_IMPORTS,
      "../lib/profile-store.ts",
      // `isEmailShaped` — pure, and guarded above.
      "../auth/display-name.ts",
    ],
    sidecarTargets: [],
  },
];

const sourceOf = (file: string): ts.SourceFile =>
  sourceFileAt(actorsProject(), `${ACTORS_DIR}/${file}`);

type Hit = { line: number; text: string };

/**
 * Parsed, not grepped — the same reason `no-actor-state.test.ts` gives: this
 * file's own prose names every forbidden identifier, and so do the guarded
 * modules' doc comments explaining the rule. The AST sees identifiers only.
 */
const identifierHits = (source: ts.SourceFile): Hit[] => {
  const hits: Hit[] = [];
  const forbidden = new Set<string>(FORBIDDEN_IDENTIFIERS);
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && forbidden.has(node.text)) {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      hits.push({ line: line + 1, text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
};

/** `await import("…")` counts too — it is the obvious way around a static
 * allow-list, and `ItemActor` briefly had one before this test existed. */
const importSpecifiers = moduleSpecifiers;

describe("no external or AI call in an ItemActor or UserActor turn (§8.5)", () => {
  for (const guarded of GUARDED) {
    describe(guarded.file, () => {
      const source = sourceOf(guarded.file);

      it("calls no HTTP client and no AI SDK", () => {
        const hits = identifierHits(source);
        expect(
          hits.map((hit) => `${guarded.file}:${hit.line} ${hit.text}`),
          [
            "",
            `${guarded.file} references an HTTP client or an AI SDK.`,
            "",
            "Migration plan §8.5: Dapr runs one turn at a time per actor id, so",
            "a multi-second call here stalls every other operation for that id.",
            "Move the work to `ItemOnboardingActor` (which exists for exactly",
            "this) or make it outbox-driven, and reach it through an injected",
            "seam so the no-sidecar harness can drive it.",
            "",
          ].join("\n"),
        ).toEqual([]);
      });

      it("imports only what it is allowed to", () => {
        const allowed = new Set(guarded.imports);
        const specifiers = importSpecifiers(source);
        expect(specifiers.filter((s) => !allowed.has(s))).toEqual([]);
        // …and never one of the known transport/AI packages, even if someone
        // widens the allow-list above without reading this.
        const banned = new Set<string>(FORBIDDEN_MODULES);
        expect(specifiers.filter((s) => banned.has(s))).toEqual([]);
      });

      it("reaches only the actor types §8.5 sanctions", () => {
        const allowed = new Set(guarded.sidecarTargets);
        expect(sidecarTargetsOf(source).filter((t) => !allowed.has(t))).toEqual(
          [],
        );
      });
    });
  }

  /**
   * The target reader itself (`./sidecar-targets.ts`), against modules that
   * reach actors in every spelling it must read — and the ones it must
   * refuse rather than drop.
   */
  it("reads every spelling of a sidecar hop, and refuses what it cannot (negative control)", () => {
    const header = [
      'import type { Ctx } from "@cellar-assistant/contracts";',
      'import { internal, internal as hop } from "../lib/internal-client.ts";',
      'import { invokeActorMethod } from "../lib/sidecar.ts";',
      'import * as c from "@cellar-assistant/contracts";',
      'import { FileActorDescriptor as Files } from "@cellar-assistant/contracts";',
      "declare const ctx: Ctx;",
      "declare const someType: string;",
    ].join("\n");
    const project = actorsFixture({
      "renamed.ts": `${header}\nexport const a = hop(ctx)(Files, "f");`,
      "namespace.ts": `${header}\nexport const a = internal(ctx)(c.ItemActorDescriptor, "i");`,
      "literal.ts": `${header}\nexport const a = invokeActorMethod("CellarActor", "x", "m", []);`,
      "stored.ts": `${header}\nconst client = internal(ctx);\nexport const a = client(Files, "f");`,
      "dynamic.ts": `${header}\nexport const a = invokeActorMethod(someType, "x", "m", []);`,
      "value.ts": `${header}\nexport const a = [internal].map((f) => f(ctx));`,
    });
    const targets = (file: string) =>
      sidecarTargetsOf(
        sourceFileAt(project, `${project.root}/${file}`),
        project,
      );
    expect(targets("renamed.ts")).toEqual(["FileActor"]);
    expect(targets("namespace.ts")).toEqual(["ItemActor"]);
    expect(targets("literal.ts")).toEqual(["CellarActor"]);
    expect(targets("stored.ts")).toEqual([
      expect.stringContaining("<not called directly"),
    ]);
    expect(targets("dynamic.ts")).toEqual([
      expect.stringContaining("<not a literal"),
    ]);
    expect(targets("value.ts")).toEqual([
      expect.stringContaining("<unreadable"),
    ]);
  });

  /**
   * The counterpart assertion: the actor that *is* allowed to call a model
   * does so through the seam, and nothing else imports that seam.
   */
  it("only ItemOnboardingActor imports the AI seam", () => {
    const importers = ["item-actor.ts", "user-actor.ts", "cellar-actor.ts"]
      .map((file) => ({ file, specifiers: importSpecifiers(sourceOf(file)) }))
      .filter(({ specifiers }) =>
        specifiers.some((s) => s.includes("item-defaults")),
      );
    expect(importers.map((entry) => entry.file)).toEqual([]);

    expect(
      importSpecifiers(sourceOf("item-onboarding-actor.ts")).filter((s) =>
        s.includes("item-defaults"),
      ),
    ).toEqual(["../lib/item-defaults.ts", "../lib/item-defaults.ts"]);
  });
});
