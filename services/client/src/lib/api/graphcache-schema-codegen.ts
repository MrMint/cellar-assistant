/**
 * Generates the two artifacts `cacheExchange` needs, both derived from
 * `packages/schema/schema.graphql`:
 *
 *   node src/lib/api/graphcache-schema-codegen.ts
 *
 * - `graphcache-schema.generated.ts` — the minified introspection (below).
 * - `graphcache-keys.generated.ts` — the `keys` map (see "Keyless types",
 *   below). This used to be `graphcache-keys.ts`, hand-maintained, and it went
 *   quietly stale four times because nothing regenerated it when the schema
 *   changed (plan X6).
 *
 * Node-only. Nothing in the browser bundle imports this module — both
 * *outputs* are plain data with no imports at all.
 *
 * ## Why the artifact exists
 *
 * `@urql/exchange-graphcache` normalises by `__typename` + key, and to decide
 * whether `... on ActorError` matches a `ConflictError` it needs to know that
 * `ConflictError` implements `ActorError`. Configured with `keys` and no
 * `schema`, it cannot know, so it falls back to *heuristic fragment matching*
 * and drops the selection: `{ code, message }` arrives from the API and is
 * thrown away before the UI reads it. Every result union in this schema is one
 * success type plus five `ActorError` implementors, so that is every typed
 * error on every page. The measurement was made with the client's own exchange
 * list and a canned `ConflictError` body. It was recorded in `typed-errors.ts`,
 * which `a544aea7` deleted once this schema made that file unnecessary:
 *
 * ```
 *   no cache     {"__typename":"ConflictError","code":"CONFLICT","message":"…"}
 *   graphcache   {"__typename":"ConflictError"}
 * ```
 *
 * The UI then showed `unwrapResult`'s "Something went wrong." in place of the
 * server's own message. Two unit tests guard it now, one per half:
 * `graphcache-schema.test.ts` fails when this artifact drifts from the SDL,
 * and `urql-client.test.ts` fails when `urql-client.ts` stops passing it —
 * re-running exactly that measurement through `makeApiClient`. (It has to be a
 * mutation: a query result is read back heuristically after being written and
 * keeps its fields, so a query-shaped test passes either way.)
 * `packages/e2e/specs/10-graphcache.spec.ts` is not a guard for this: it
 * watches for graphcache's console warnings, which are compiled out of the
 * production build the default e2e lane serves.
 *
 * Passing `schema` replaces the heuristic with `isSubType`, which reads the
 * `interfaces` and `possibleTypes` this artifact carries.
 *
 * ## Why it is generated here and not by `@urql/introspection`
 *
 * That package is not installed, and it is not needed: `graphql` (already a
 * dependency) exports `buildSchema` and `introspectionFromSchema`, and the SDL
 * is checked in at `packages/schema/schema.graphql`. {@link minifyIntrospection}
 * reproduces `minifyIntrospectionQuery`'s default output from those two.
 *
 * ## What "minified" drops, and why that is safe
 *
 * Graphcache reads exactly four things per type — `kind`, `name`,
 * `interfaces[].name` / `possibleTypes[].name`, and `fields[].name` +
 * `fields[].type` (for nullability). It never reads descriptions, enums, input
 * objects, scalars, directives, or field arguments. So those are dropped.
 * `graphcache-schema.test.ts` does not take that on trust: it asserts against
 * the installed `@urql/exchange-graphcache` bundle that `.args()` is never
 * called and that `possibleTypes` and `fields()` are.
 *
 * The cost of the choice, measured on this schema (raw / gzip):
 *
 * ```
 *   full introspection, with descriptions      492 KB / 43.2 KB
 *   full introspection, no descriptions        352 KB / 16.7 KB
 *   minified, with field args                  173 KB /  9.9 KB
 *   minified, no field args  (this artifact)   130 KB /  8.2 KB
 * ```
 *
 * ## Keyless types
 *
 * `@urql/exchange-graphcache` normalises on `__typename` + `id`. Relay `Node`
 * and global ids were deliberately not adopted (plan §8.3), so ids stay raw
 * uuids and the default keying is right for every object type that has an
 * `id` field. Every other object type — connections, edges, `PageInfo`, the
 * typed error members of every result union, and command payloads — has none,
 * and graphcache has to be told so explicitly with `() => null` ("embed this
 * in its parent"), or it warns and treats the type as unkeyable anyway.
 *
 * {@link deriveKeylessTypeNames} *is* that rule, executable: every object
 * type in the SDL that is not a root (`Query` / `Mutation` / `Subscription`),
 * not an introspection type, and has no `id` field. That is exactly the rule
 * the hand-maintained `graphcache-keys.ts` followed — verified by diffing this
 * generator's output against it before it was deleted (plan X6) — so nothing
 * here keys on any field other than `id`, and nothing here is exempted from
 * the rule by name.
 *
 * ## Paths
 *
 * All these paths live in this file and nowhere else, so the queued move of
 * the Next app to `services/client` costs one edit here. The repo root is
 * *found* by walking up rather than counting `../`, so the move does not even
 * need that edit.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, introspectionFromSchema, isObjectType } from "graphql";
import type {
  MinifiedIntrospection,
  MinifiedTypeRef,
} from "./graphcache-schema.generated.ts";

/**
 * Walks up to the workspace root, so no path here counts `../` segments.
 *
 * The marker is "the nearest package.json that declares `workspaces`", not a
 * named config file. It used to be `pnpm-workspace.yaml`, and the Bun install
 * migration deleted that: the walk then ran off the top of a git worktree and
 * found the MAIN checkout's copy several directories up, so the codegen read
 * a *different clone's* schema.graphql and failed with ENOENT on a path that
 * looked almost right. Keying off the workspace declaration itself cannot go
 * stale the next time the package manager changes — under Bun those globs are
 * the definition of the root (bunfig.toml explains why they had to move
 * there).
 */
const findRepoRoot = (): string => {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, "utf8")).workspaces !== undefined)
          return directory;
      } catch {
        // A malformed package.json is not the workspace root we are after.
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(
        'no package.json with a "workspaces" field above graphcache-schema-codegen',
      );
    }
    directory = parent;
  }
};

export const REPO_ROOT = findRepoRoot();

/** Read-only input. E2d2 owns regenerating it from `services/api`. */
export const SCHEMA_SDL_PATH = join(
  REPO_ROOT,
  "packages/schema/schema.graphql",
);

/** Output, resolved beside this module so a directory move carries both. */
export const GRAPHCACHE_SCHEMA_PATH = fileURLToPath(
  new URL("./graphcache-schema.generated.ts", import.meta.url),
);

/** The other output — the `keys` map. See "Keyless types" above. */
export const GRAPHCACHE_KEYS_PATH = fileURLToPath(
  new URL("./graphcache-keys.generated.ts", import.meta.url),
);

/**
 * Biome formats the generated artifact so it matches what `biome check` would
 * demand of a hand-written file. Resolved from the workspace root because
 * `@biomejs/biome` is a root devDependency — it lints every package, so it is
 * installed once at the top rather than per package.
 */
const BIOME_BIN = join(REPO_ROOT, "node_modules/.bin/biome");

/** The kinds graphcache can do anything with; the rest are dead weight. */
const KEPT_KINDS = new Set(["OBJECT", "INTERFACE", "UNION"]);

type RawTypeRef = {
  kind: string;
  name?: string | null;
  ofType?: RawTypeRef | null;
};

const minifyTypeRef = (ref: RawTypeRef): MinifiedTypeRef => ({
  kind: ref.kind,
  ...(ref.name == null ? {} : { name: ref.name }),
  ...(ref.ofType == null ? {} : { ofType: minifyTypeRef(ref.ofType) }),
});

const namedRef = (kind: string, name: string): MinifiedTypeRef => ({
  kind,
  name,
});

/**
 * The same shape `@urql/introspection`'s `minifyIntrospectionQuery` emits with
 * its default options: object, interface and union types only; no descriptions,
 * no deprecations, no field arguments, no introspection types.
 */
export const minifyIntrospection = (sdl: string): MinifiedIntrospection => {
  const schema = buildSchema(sdl, { assumeValidSDL: true });
  const { __schema: introspected } = introspectionFromSchema(schema, {
    descriptions: false,
    specifiedByUrl: false,
    directiveIsRepeatable: false,
    schemaDescription: false,
    inputValueDeprecation: false,
  });

  // The generated type is a readonly tuple-ish array, so build a mutable one
  // of the same element type and let the return position re-apply readonly.
  type MinifiedType = MinifiedIntrospection["__schema"]["types"][number];
  const types: MinifiedType[] = [];
  for (const type of introspected.types) {
    if (type.name.startsWith("__") || !KEPT_KINDS.has(type.kind)) continue;

    if (type.kind === "UNION") {
      types.push({
        kind: "UNION",
        name: type.name,
        possibleTypes: (type.possibleTypes ?? []).map((member) =>
          namedRef("OBJECT", member.name),
        ),
      });
      continue;
    }

    if (type.kind !== "OBJECT" && type.kind !== "INTERFACE") continue;
    types.push({
      kind: type.kind,
      name: type.name,
      fields: type.fields.map((field) => ({
        name: field.name,
        type: minifyTypeRef(field.type as RawTypeRef),
      })),
      interfaces: (type.interfaces ?? []).map((implemented) =>
        namedRef("INTERFACE", implemented.name),
      ),
    });
  }

  const queryTypeName = introspected.queryType?.name;
  if (queryTypeName === undefined) {
    throw new Error(`${SCHEMA_SDL_PATH} has no query root`);
  }

  return {
    __schema: {
      queryType: { name: queryTypeName },
      mutationType:
        introspected.mutationType == null
          ? null
          : { name: introspected.mutationType.name },
      subscriptionType:
        introspected.subscriptionType == null
          ? null
          : { name: introspected.subscriptionType.name },
      types,
    },
  };
};

/**
 * The type declaration the artifact carries with it.
 *
 * It is emitted rather than imported so the generated module has **no imports
 * at all** and cannot drag `graphql`, `node:fs` or this generator into the
 * browser bundle. This generator imports the type back out of the artifact
 * (type-only, so it is erased), which keeps one definition rather than two that
 * can drift.
 */
const TYPE_DECLARATION = `
/** A GraphQL type reference, wrappers included: \`NON_NULL(LIST(Item))\`. */
export type MinifiedTypeRef = {
  readonly kind: string;
  readonly name?: string;
  readonly ofType?: MinifiedTypeRef;
};

/** A field, reduced to what graphcache reads: its name and its nullability. */
export type MinifiedField = {
  readonly name: string;
  readonly type: MinifiedTypeRef;
};

export type MinifiedCompositeType =
  | {
      readonly kind: "OBJECT" | "INTERFACE";
      readonly name: string;
      readonly fields: readonly MinifiedField[];
      readonly interfaces: readonly MinifiedTypeRef[];
    }
  | {
      readonly kind: "UNION";
      readonly name: string;
      readonly possibleTypes: readonly MinifiedTypeRef[];
    };

/**
 * Structurally a \`PartialIntrospectionSchema\`, which is what
 * \`cacheExchange({ schema })\` accepts.
 */
export type MinifiedIntrospection = {
  readonly __schema: {
    readonly queryType: { readonly name: string };
    readonly mutationType: { readonly name: string } | null;
    readonly subscriptionType: { readonly name: string } | null;
    readonly types: readonly MinifiedCompositeType[];
  };
};
`.trim();

const HEADER = `
/**
 * GENERATED — do not edit. Regenerate with:
 *
 *   node src/lib/api/graphcache-schema-codegen.ts
 *
 * The minified introspection of \`packages/schema/schema.graphql\`, passed to
 * \`cacheExchange({ schema })\` in \`urql-client.ts\` so graphcache resolves
 * interfaces and unions by \`isSubType\` instead of guessing. Without it the
 * \`...ActorErrorFields\` spread (a fragment on the abstract \`ActorError\`)
 * on a mutation result comes back as a bare \`__typename\` and the UI renders
 * "Something went wrong." instead of the actor's own explanation.
 *
 * \`graphcache-schema.test.ts\` fails when this file drifts from the SDL;
 * \`urql-client.test.ts\` fails when the fields stop surviving the cache. Why
 * this form and not the full introspection, with the size numbers:
 * \`graphcache-schema-codegen.ts\`.
 */
`.trim();

/** The artifact's exact text, biome-formatted so `biome check .` stays green. */
export const renderArtifact = (sdl: string): string => {
  const source = [
    HEADER,
    "",
    TYPE_DECLARATION,
    "",
    `export const graphcacheSchema: MinifiedIntrospection = ${JSON.stringify(
      minifyIntrospection(sdl),
    )};`,
    "",
  ].join("\n");

  return execFileSync(
    BIOME_BIN,
    ["format", "--stdin-file-path=graphcache-schema.generated.ts"],
    { input: source, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
};

/** What the checked-in artifact should contain right now. */
export const expectedArtifact = (): string =>
  renderArtifact(readFileSync(SCHEMA_SDL_PATH, "utf8"));

/**
 * The rule the hand-maintained `graphcache-keys.ts` followed, made
 * executable: every object type that is not a root, not an introspection
 * type, and has no `id` field. See "Keyless types" above.
 */
export const deriveKeylessTypeNames = (sdl: string): string[] => {
  const schema = buildSchema(sdl, { assumeValidSDL: true });
  const roots = new Set(
    [
      schema.getQueryType(),
      schema.getMutationType(),
      schema.getSubscriptionType(),
    ]
      .filter((type) => type != null)
      .map((type) => type.name),
  );
  return Object.values(schema.getTypeMap())
    .filter(
      (type) =>
        isObjectType(type) &&
        !type.name.startsWith("__") &&
        !roots.has(type.name) &&
        !("id" in type.getFields()),
    )
    .map((type) => type.name)
    .sort();
};

const KEYS_HEADER = `
/**
 * GENERATED — do not edit. Regenerate with:
 *
 *   node src/lib/api/graphcache-schema-codegen.ts
 *
 * \`@urql/exchange-graphcache\` normalises on \`__typename\` + \`id\`. Relay
 * \`Node\` and global ids were deliberately not adopted (plan §8.3), so ids
 * stay raw uuids and the default keying is right for every object type that
 * has an \`id\` field. The types below have none — connections, edges,
 * \`PageInfo\`, the typed error members of every result union, and command
 * payloads — and must be told so explicitly, or graphcache warns on each one
 * and treats it as unkeyable anyway.
 *
 * Derived from \`packages/schema/schema.graphql\`: every object type that is
 * not a root (\`Query\` / \`Mutation\` / \`Subscription\`), not an introspection
 * type, and has no \`id\` field. \`graphcache-keys.test.ts\` fails, with the
 * corrected list, the moment this drifts from the SDL. Rationale and the exact
 * rule: \`graphcache-schema-codegen.ts\`.
 */
`.trim();

/** The keys artifact's exact text, biome-formatted so `biome check .` stays green. */
export const renderKeysArtifact = (sdl: string): string => {
  const keylessTypes = deriveKeylessTypeNames(sdl);
  const source = [
    KEYS_HEADER,
    "",
    `export const KEYLESS_TYPES = ${JSON.stringify(keylessTypes)} as const;`,
    "",
    "/**",
    ' * graphcache\'s `keys` map. `() => null` means "embed this in its parent",',
    " * which is what an id-less value is.",
    " */",
    "export const graphcacheKeys: Record<string, () => null> = Object.fromEntries(",
    "  KEYLESS_TYPES.map((name) => [name, () => null]),",
    ");",
    "",
  ].join("\n");

  return execFileSync(
    BIOME_BIN,
    ["format", "--stdin-file-path=graphcache-keys.generated.ts"],
    { input: source, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
};

/** What the checked-in keys artifact should contain right now. */
export const expectedKeysArtifact = (): string =>
  renderKeysArtifact(readFileSync(SCHEMA_SDL_PATH, "utf8"));

/** True when this module is what `node` was pointed at, not an import of it. */
const runAsScript =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (runAsScript) {
  const sdl = readFileSync(SCHEMA_SDL_PATH, "utf8");

  const schemaArtifact = renderArtifact(sdl);
  writeFileSync(GRAPHCACHE_SCHEMA_PATH, schemaArtifact);
  console.log(
    `wrote ${GRAPHCACHE_SCHEMA_PATH}\n` +
      `  ${minifyIntrospection(sdl).__schema.types.length} composite types, ` +
      `${(Buffer.byteLength(schemaArtifact) / 1024).toFixed(1)} KB of source`,
  );

  const keysArtifact = renderKeysArtifact(sdl);
  writeFileSync(GRAPHCACHE_KEYS_PATH, keysArtifact);
  console.log(
    `wrote ${GRAPHCACHE_KEYS_PATH}\n` +
      `  ${deriveKeylessTypeNames(sdl).length} keyless types`,
  );
}
