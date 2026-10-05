/**
 * The guard: an unconfigured provider fails loudly, and no error path anywhere
 * in `src/lib/ai/` produces a plausible answer instead.
 *
 * ## The bug this file exists to prevent
 *
 * It already shipped once, on the Nhost side, and it is still there:
 *
 * ```ts
 * // functions/refreshPlaces/_services/factory.ts
 * if (!hasCredentials) {
 *   console.warn("… falling back to mock service");
 *   return new MockPlaceDataService();      // reads wisconsin-places.json
 * }
 * ```
 *
 * In production, with no GCP credentials, every caller got a fixed list of
 * Wisconsin restaurants and a warning in a log nobody read. Nothing threw.
 *
 * So this suite asserts the property from four directions, because any one of
 * them alone is bypassable:
 *
 *  1. **Behavioural, config** — every incomplete configuration throws, and the
 *     error names the missing variable.
 *  2. **Behavioural, transport** — a provider whose network call fails
 *     *propagates*. It does not return a zero vector, an empty extraction, or
 *     anything else a caller could mistake for an answer.
 *  3. **Behavioural, boot** — `installAI()` with no `AI_PROVIDER` leaves all
 *     six seams at their authors' `unconfigured*` defaults, each still
 *     throwing its own message.
 *  4. **Structural** — every `catch` in this directory rethrows, no module
 *     here imports a `.json` fixture or a mock, and nothing branches on
 *     `NODE_ENV`. A behavioural test only covers the paths it drives; these
 *     three rules are properties of the source, and they are exactly the three
 *     things the Wisconsin factory did.
 *
 * No database and no network: everything here runs against an injected
 * transport.
 */
import { fileURLToPath } from "node:url";
import {
  lineOf,
  literalValue,
  moduleSpecifiers,
  PROGRAM_TIMEOUT_MS,
  type Project,
  relativePath,
  sourceFiles,
} from "@cellar-assistant/analysis";
import { ConflictError, ValidationError } from "@cellar-assistant/contracts";
import ts from "typescript";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  placeReviewer,
  setPlaceReviewer,
  unconfiguredPlaceReviewer,
} from "../../actors/place-creation-actor.ts";
import {
  insightsGenerator,
  noInsightsGenerator,
  setInsightsGenerator,
} from "../../actors/tier-list-actor.ts";
import { actorsFixture, actorsProject } from "../analysis-testing.ts";
import { embedder, setEmbedder, unconfiguredEmbedder } from "../embeddings.ts";
import {
  itemDefaultsProvider,
  setItemDefaultsProvider,
  unconfiguredItemDefaults,
} from "../item-defaults.ts";
import {
  menuExtractionProvider,
  menuMatchVerifier,
  setMenuExtractionProvider,
  setMenuMatchVerifier,
  unconfiguredMenuExtraction,
  unconfiguredMenuMatchVerifier,
} from "../menu-ai.ts";
import {
  recipePhotoExtractor,
  setRecipePhotoExtractor,
  unconfiguredRecipePhotoExtractor,
} from "../recipe-photo-ai.ts";
import { readAIProviderConfig, selectProvider } from "./config.ts";
import {
  createAIProvider,
  providerFor,
  resetAIProviderCache,
} from "./factory.ts";
import { installAI } from "./install.ts";
import type { FetchLike } from "./types.ts";

const AI_DIR = fileURLToPath(new URL(".", import.meta.url));

/** Restore every seam to the default its author wrote. */
const restoreSeams = (): void => {
  setEmbedder(unconfiguredEmbedder);
  setInsightsGenerator(noInsightsGenerator);
  setItemDefaultsProvider(unconfiguredItemDefaults);
  setMenuExtractionProvider(unconfiguredMenuExtraction);
  setMenuMatchVerifier(unconfiguredMenuMatchVerifier);
  setPlaceReviewer(unconfiguredPlaceReviewer);
  setRecipePhotoExtractor(unconfiguredRecipePhotoExtractor);
};

afterEach(() => {
  restoreSeams();
  resetAIProviderCache();
});

/* -------------------------------------------------------------------------- */
/* 1 · configuration                                                           */
/* -------------------------------------------------------------------------- */

describe("an unconfigured provider throws rather than falling back", () => {
  it("refuses to build a provider when AI_PROVIDER is unset", () => {
    expect(() => createAIProvider({ env: {} })).toThrow(ConflictError);
    expect(() => createAIProvider({ env: {} })).toThrow(/AI_PROVIDER is unset/);
  });

  it("refuses an AI_PROVIDER value that is not one of the three", () => {
    // A typo is a misconfiguration, not a request to run without a model —
    // resolving it to "no provider" is the silent-degradation shape.
    expect(() => selectProvider({ AI_PROVIDER: "vertex" })).toThrow(
      ValidationError,
    );
    expect(() => selectProvider({ AI_PROVIDER: "openai" })).toThrow(
      /not a known provider/,
    );
  });

  it("treats an empty AI_PROVIDER as unset, not as a provider named ''", () => {
    expect(selectProvider({ AI_PROVIDER: "   " })).toBe(null);
  });

  /**
   * The table that matters: for each provider, drop each required value in
   * turn and assert a throw naming it. This is the case the Wisconsin factory
   * answered with a mock.
   */
  const INCOMPLETE: readonly {
    readonly name: string;
    readonly env: Record<string, string>;
    readonly names: RegExp;
  }[] = [
    {
      name: "google-ai with no API key",
      env: { AI_PROVIDER: "google-ai" },
      names: /GOOGLE_AI_API_KEY/,
    },
    {
      name: "google-ai with an empty API key",
      env: { AI_PROVIDER: "google-ai", GOOGLE_AI_API_KEY: "  " },
      names: /GOOGLE_AI_API_KEY/,
    },
    {
      name: "vertex-ai with no project",
      env: { AI_PROVIDER: "vertex-ai" },
      names: /GOOGLE_GCP_PROJECT_ID/,
    },
    {
      name: "vertex-ai with a project but no key",
      env: { AI_PROVIDER: "vertex-ai", GOOGLE_GCP_PROJECT_ID: "p" },
      names: /GOOGLE_APPLICATION_CREDENTIALS/,
    },
    {
      name: "vertex-ai with a key that is not JSON",
      env: {
        AI_PROVIDER: "vertex-ai",
        GOOGLE_GCP_PROJECT_ID: "p",
        GOOGLE_APPLICATION_CREDENTIALS_JSON: "not json",
      },
      names: /not valid JSON/,
    },
    {
      name: "vertex-ai with a key missing private_key",
      env: {
        AI_PROVIDER: "vertex-ai",
        GOOGLE_GCP_PROJECT_ID: "p",
        GOOGLE_APPLICATION_CREDENTIALS_JSON: JSON.stringify({
          project_id: "p",
          client_email: "a@b.iam.gserviceaccount.com",
        }),
      },
      names: /private_key/,
    },
  ];

  for (const testCase of INCOMPLETE) {
    it(`throws for ${testCase.name}, naming what is missing`, () => {
      expect(() => readAIProviderConfig(testCase.env)).toThrow(testCase.names);
      // …and never silently becomes a different provider.
      expect(() => createAIProvider({ env: testCase.env })).toThrow();
    });
  }

  it("does not consult NODE_ENV: a missing key fails in development too", () => {
    for (const nodeEnv of ["development", "test", "production", undefined]) {
      expect(() =>
        readAIProviderConfig({
          AI_PROVIDER: "google-ai",
          ...(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }),
        }),
      ).toThrow(/GOOGLE_AI_API_KEY/);
    }
  });

  it("builds ollama with no credentials at all — the point of the local default", () => {
    const provider = createAIProvider({ env: { AI_PROVIDER: "ollama" } });
    expect(provider.name).toBe("ollama");
  });
});

/* -------------------------------------------------------------------------- */
/* 2 · transport                                                               */
/* -------------------------------------------------------------------------- */

describe("a failing transport propagates, and never becomes an answer", () => {
  const failing: FetchLike = async () => {
    throw new Error("ECONNREFUSED 127.0.0.1:11434");
  };
  const notOk: FetchLike = async () => ({
    ok: false,
    status: 503,
    text: async () => "model runner unavailable",
  });
  const garbage: FetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => "<html>proxy error</html>",
  });
  const emptyVector: FetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ embedding: [] }),
  });

  const config = readAIProviderConfig({ AI_PROVIDER: "ollama" });

  for (const [name, fetchImpl] of [
    ["a refused connection", failing],
    ["a 503", notOk],
    ["a non-JSON body", garbage],
    ["an empty embedding array", emptyVector],
  ] as const) {
    it(`rejects on ${name} rather than returning a vector`, async () => {
      const provider = providerFor(config, fetchImpl);
      const result = provider.generateEmbeddings({
        content: "pinot noir",
        type: "text",
      });
      await expect(result).rejects.toThrow(ConflictError);
      // The specific thing that must never happen: a resolved promise.
      await expect(result).rejects.toBeDefined();
    });
  }

  it("never coerces a failure into a zero vector", async () => {
    const provider = providerFor(config, failing);
    let resolved: unknown = "did not resolve";
    try {
      resolved = await provider.generateEmbeddings({
        content: "pinot noir",
        type: "text",
      });
    } catch {
      resolved = "threw";
    }
    expect(resolved).toBe("threw");
  });

  it("rejects a completion that is not JSON rather than inventing a result", async () => {
    const provider = providerFor(config, garbage);
    await expect(provider.generateContent({ prompt: "hello" })).rejects.toThrow(
      ConflictError,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 3 · boot                                                                    */
/* -------------------------------------------------------------------------- */

describe("installAI leaves the seams loud when nothing is configured", () => {
  const ctx = { viewerId: null, kind: "system", requestId: "r" } as const;

  it("installs nothing, and says so, when AI_PROVIDER is unset", () => {
    const result = installAI({ env: {} });
    expect(result.installed).toBe(false);
  });

  it("leaves all seven seams at their unconfigured defaults", async () => {
    installAI({ env: {} });

    await expect(embedder()({ text: "pinot noir" }, ctx)).rejects.toThrow(
      /no embedding provider wired/,
    );
    await expect(
      insightsGenerator()(ctx, {
        tierListId: "t",
        name: "n",
        description: null,
        listType: "PLACE",
        entries: [],
      }),
    ).rejects.toThrow(/has no AI provider wired/);
    await expect(
      itemDefaultsProvider()(ctx, {
        itemType: "WINE",
        frontLabelImageId: null,
        backLabelImageId: null,
        barcode: null,
        barcodeType: null,
      }),
    ).rejects.toThrow(/no AI provider is configured for item onboarding/);
    await expect(
      menuExtractionProvider()(ctx, {
        menuScanId: "s",
        originalImageId: "f",
        processedImageId: null,
        placeId: null,
      }),
    ).rejects.toThrow(/no AI provider is configured for menu scanning/);
    await expect(
      menuMatchVerifier()(ctx, {
        placeMenuItemId: "m",
        menuItemName: "n",
        menuItemDescription: null,
        itemType: "wine",
        candidates: [],
      }),
    ).rejects.toThrow(/no AI provider is configured to verify/);
    await expect(
      placeReviewer()(ctx, {
        name: "Bar Part Time",
        categories: ["wine_bar"],
        location: { lng: -122.4194, lat: 37.7749 },
        streetAddress: null,
        locality: null,
        region: null,
        countryCode: null,
        phone: null,
        website: null,
        description: null,
      }),
    ).rejects.toThrow(/no AI provider is configured to review/);
    await expect(
      recipePhotoExtractor()(ctx, {
        jobId: "j",
        fileId: "f",
        additionalFileIds: [],
        notes: null,
      }),
    ).rejects.toThrow(/no AI provider is configured to read a recipe photo/);
  });

  it("throws — refusing to boot — when AI_PROVIDER is set but incomplete", () => {
    expect(() => installAI({ env: { AI_PROVIDER: "google-ai" } })).toThrow(
      /GOOGLE_AI_API_KEY/,
    );
    // …and the failed attempt installed nothing.
    expect(embedder()).toBe(unconfiguredEmbedder);
  });

  it("installs all seven when the configuration is complete", () => {
    const result = installAI({ env: { AI_PROVIDER: "ollama" } });
    expect(result.installed).toBe(true);
    expect(embedder()).not.toBe(unconfiguredEmbedder);
    expect(insightsGenerator()).not.toBe(noInsightsGenerator);
    expect(itemDefaultsProvider()).not.toBe(unconfiguredItemDefaults);
    expect(menuExtractionProvider()).not.toBe(unconfiguredMenuExtraction);
    expect(menuMatchVerifier()).not.toBe(unconfiguredMenuMatchVerifier);
    // B5b. The seam, its registry and the constructor default all existed and
    // `installSeams` filled six of seven, so `placeReviewer()` stayed the
    // throwing stub and AI place review was dark in production. A seam that is
    // declared but never installed fails exactly like one that was never
    // written, and this line is the difference.
    expect(placeReviewer()).not.toBe(unconfiguredPlaceReviewer);
    expect(recipePhotoExtractor()).not.toBe(unconfiguredRecipePhotoExtractor);
  });
});

/* -------------------------------------------------------------------------- */
/* 4 · structural                                                              */
/* -------------------------------------------------------------------------- */

type Scanned = { readonly file: string; readonly source: ts.SourceFile };

/** `src/lib/ai/`'s modules in `project`, harness included, as the old walk had it. */
const scanned = (
  project: Project = actorsProject(),
  dir: string = AI_DIR,
): readonly Scanned[] =>
  sourceFiles(project, { under: dir, includeHarness: true }).map((source) => ({
    file: relativePath(dir, source.fileName),
    source,
  }));

const walk = (node: ts.Node, visit: (node: ts.Node) => void): void => {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
};

/**
 * `void`, or `Promise<void>` — a signature that cannot carry an answer. Read
 * through the checker, so an alias of either (`type Effect = Promise<void>`)
 * is one; still only a *declared* type counts.
 */
const isVoidLike = (
  checker: ts.TypeChecker,
  node: ts.TypeNode | undefined,
): boolean => {
  if (node === undefined) return false;
  const type = checker.getTypeFromTypeNode(node);
  if (type.flags & ts.TypeFlags.Void) return true;
  if (type.getSymbol()?.name !== "Promise") return false;
  const [arg] = checker.getTypeArguments(type as ts.TypeReference);
  return arg !== undefined && (arg.flags & ts.TypeFlags.Void) !== 0;
};

/**
 * The nearest enclosing function, and whether it is declared to return
 * nothing. An *undeclared* return type is not void-like here: inference is
 * exactly what would let a fabricated answer slip in unannounced.
 */
const inVoidFunction = (checker: ts.TypeChecker, node: ts.Node): boolean => {
  for (let current = node.parent; current !== undefined; ) {
    if (ts.isFunctionLike(current)) return isVoidLike(checker, current.type);
    current = current.parent;
  }
  return false;
};

type CatchShape = {
  readonly at: string;
  readonly throws: boolean;
  readonly returns: boolean;
  readonly inVoid: boolean;
};

const catches = (
  checker: ts.TypeChecker,
  files: readonly Scanned[],
): CatchShape[] => {
  const out: CatchShape[] = [];
  for (const { file, source } of files) {
    walk(source, (node) => {
      if (!ts.isCatchClause(node)) return;
      let throws = false;
      let returns = false;
      walk(node.block, (inner) => {
        if (ts.isThrowStatement(inner)) throws = true;
        if (ts.isReturnStatement(inner)) returns = true;
      });
      out.push({
        at: `${file}:${lineOf(node)}`,
        throws,
        returns,
        inVoid: inVoidFunction(checker, node),
      });
    });
  }
  return out;
};

const catchOffenders = (
  checker: ts.TypeChecker,
  files: readonly Scanned[],
): string[] =>
  catches(checker, files).flatMap((c) => [
    ...(!c.throws && !c.inVoid ? [`${c.at} catch does not throw`] : []),
    ...(c.returns ? [`${c.at} catch returns`] : []),
  ]);

const dataImports = (files: readonly Scanned[]): string[] =>
  files.flatMap(({ file, source }) =>
    moduleSpecifiers(source)
      .filter(
        (specifier) =>
          /\.json$/i.test(specifier) ||
          /mock|fixture|sample|stub/i.test(specifier),
      )
      .map((specifier) => `${file} imports ${specifier}`),
  );

const ENV_SWITCHES = ["NODE_ENV", "NHOST_LOCAL", "VERCEL_ENV"];

/** `x.NODE_ENV`, and — through the checker — `x["NODE_ENV"]` or `x[k]`. */
const envReads = (
  checker: ts.TypeChecker,
  files: readonly Scanned[],
): string[] => {
  const offenders: string[] = [];
  for (const { file, source } of files) {
    walk(source, (node) => {
      const name =
        ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)
          ? node.name.text
          : ts.isElementAccessExpression(node)
            ? literalValue(checker, node.argumentExpression)
            : undefined;
      if (typeof name === "string" && ENV_SWITCHES.includes(name)) {
        offenders.push(`${file}:${lineOf(node)} reads ${name}`);
      }
    });
  }
  return offenders;
};

describe("the source itself cannot express a silent fallback", () => {
  // The host's program and the checker's pass over `lib/ai/`, once, under a
  // timeout sized for CPU (PROGRAM_TIMEOUT_MS says why).
  let offenders: ReturnType<typeof catchOffenders> = [];
  let allCatches: ReturnType<typeof catches> = [];
  let envSwitches: ReturnType<typeof envReads> = [];
  beforeAll(() => {
    const { checker } = actorsProject();
    offenders = catchOffenders(checker, scanned());
    allCatches = catches(checker, scanned());
    envSwitches = envReads(checker, scanned());
  }, PROGRAM_TIMEOUT_MS);

  /**
   * The Wisconsin factory's shape, exactly: an error or a missing value
   * handled by *returning* something. Every `catch` here must end in a
   * `throw`, and none may `return`.
   *
   * ## One refinement, added by X1c, which makes the rule stronger and not
   * weaker
   *
   * A catch inside a function declared `void` / `Promise<void>` may swallow.
   * That is not a loophole, it is the rule stated in terms of what it is for:
   * the defect is **a fabricated answer**, and a function that cannot return
   * a value cannot fabricate one. Everything that produces a
   * `GenerateContentResponse`, an `EmbeddingResponse`, a provider, a config or
   * a domain type is caught exactly as before, and `catch` + `return` stays
   * banned outright at any signature.
   *
   * What it admits is `budget.ts`'s `settleQuietly`, and the argument there is
   * the same argument as the rule's, arriving at the opposite conclusion. A
   * settlement runs *after* a model call has been paid for. Propagating a
   * failed bookkeeping write would fail the seam, the outbox would redeliver,
   * and the model would be called and billed a second time — so on this one
   * path "let it through" costs money and "swallow and log" saves it. The
   * ledger keeps the pre-call estimate, which is the conservative direction,
   * and the warning names the row.
   *
   * If a second one of these ever appears, read it as hard as this one was:
   * `Promise<void>` is a claim that the function's only product is an effect,
   * and a swallowed error is only acceptable where abandoning that effect is
   * genuinely safer than raising it.
   */
  it("every catch clause rethrows, and none returns", () => {
    expect(
      offenders,
      [
        "",
        "A catch block in src/lib/ai/ swallows an error.",
        "",
        "This is the shape of functions/refreshPlaces/_services/factory.ts,",
        "which answered missing credentials with a mock service and a",
        "console.warn — in production. Every failure here must propagate:",
        "a caller can retry a thrown error, but cannot tell a fabricated",
        "answer from a real one.",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  /**
   * The inventory, so the refinement above cannot quietly grow a second
   * member. Adding one means editing this list, which means writing down why —
   * which is the whole of what the allowance costs.
   */
  it("exactly one catch in this directory swallows, and it is the settlement", () => {
    const swallowing = allCatches.filter((c) => !c.throws).map((c) => c.at);
    expect(swallowing.map((entry) => entry.split(":")[0])).toEqual([
      "budget.ts",
    ]);
  });

  it("imports no fixture, mock or JSON data module", () => {
    expect(scanned().length).toBeGreaterThan(5);
    expect(dataImports(scanned())).toEqual([]);
  });

  it("branches on no NODE_ENV-shaped switch", () => {
    // `isLocalDevelopment` was how the old factory reached its mock lane.
    expect(envSwitches).toEqual([]);
  });

  it("each structural rule fires on its shape (negative control)", () => {
    const project = actorsFixture({
      "ai/bad.ts": `
        import data from "./fixtures.json";
        type Effect = Promise<void>;
        const k = "NODE_ENV" as const;
        export const answer = (): string => { try { return "x"; } catch { return "fallback"; } };
        export const quiet = (): number => { try { return 1; } catch { console.warn("x"); } return 0; };
        export const settle = async (): Effect => { try { await 0; } catch { console.warn("ok"); } };
        export const env = [process.env.NODE_ENV, process.env["VERCEL_ENV"], process.env[k], data];
      `,
    });
    const files = scanned(project, `${project.root}/ai`);
    expect(catchOffenders(project.checker, files)).toEqual([
      "bad.ts:5 catch does not throw",
      "bad.ts:5 catch returns",
      "bad.ts:6 catch does not throw",
    ]);
    expect(dataImports(files)).toEqual(["bad.ts imports ./fixtures.json"]);
    expect(envReads(project.checker, files)).toEqual([
      "bad.ts:8 reads NODE_ENV",
      "bad.ts:8 reads VERCEL_ENV",
      "bad.ts:8 reads NODE_ENV",
    ]);
  });
});
