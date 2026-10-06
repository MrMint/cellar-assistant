/**
 * X11 · the guard for claims the UI makes *about the backend*.
 *
 * ## The bug, twice
 *
 * D10 found `src/lib/api/files.ts` asserting "services/api exposes no
 * createUploadTarget mutation" months after A7c added it, with `ItemImages`
 * rendering that sentence **instead of** the upload control. Image upload was
 * dead the entire time and nothing failed: `tsc` does not read English, biome
 * does not read the SDL, and no test covers a comment.
 *
 * X11 swept for the rest of the class and found the same shape in four more
 * places. `/map` had no viewport-browse layer because three files agreed that
 * `Query.mapBrowse` did not exist — it does, it is served by
 * `services/api/src/schema/map.ts`, and it answers live. Three more files said X1
 * had not wired an AI provider; `services/actors/src/lib/ai/` has been a complete
 * provider layer with `installAI()` running at boot for two workstreams, and
 * the running host logs `[ai] provider ollama; …` five times over.
 *
 * ## Why a guard rather than a fix
 *
 * Fixing the five sentences costs nothing and buys nothing: the sixth will be
 * written next week by a workstream that has no reason to read a helper in
 * `src/lib/api/`. What makes this class invisible is that **the claim and the
 * thing it claims about are never read by the same tool.** So this file reads
 * both, and does it the way D10's `upload-surface.test.ts` does — against
 * `packages/schema/schema.graphql` and against the filesystem, never against a
 * copy of any sentence.
 *
 * Three checks, and each one is two-sided:
 *
 *   1. {@link SCHEMA_ABSENCE_PATTERNS} — prose that names a *schema coordinate*
 *      and says it is missing, checked against the SDL. Naming a field that
 *      exists is the D10 bug exactly.
 *   2. {@link BACKEND_ABSENCE_CLAIMS} — prose that says a backend *module* is
 *      unbuilt, checked against that module's presence on disk. This is what
 *      catches "X1 has not wired an AI provider", which no SDL can adjudicate.
 *   3. The map documents validate, so the feature un-gated by X11 cannot rot
 *      the way the upload flow did.
 *
 * It used to end with a fourth, sending the six documents X11 un-gated to a
 * running API — and skipping, whenever the stack was down. Every client
 * document is now validated offline against the SDL by
 * `src/lib/api/documents.test.ts`, which `services/api`'s snapshot test keeps
 * identical to what the API serves, so that block was a skip, not a check.
 *
 * ## What this deliberately does not do
 *
 * It does not ban saying a capability is missing. Several such claims in this
 * repo are **true and must stay**: `Query` really has no field that lists items
 * of one type (`src/app/(authenticated)/wines/page.tsx`), `UpdateTierListInput`
 * really has no `listType` (the list type is create-only in
 * `src/components/tier-list/TierListForm.tsx`),
 * and `services/api/src/schema/user.ts` deliberately withholds an internal
 * `outboxRowId`. A guard that failed on those would be deleted within a week.
 * It fires only when a claim is *checkably false*.
 *
 *   bun run test:unit
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildSchema,
  type GraphQLObjectType,
  isObjectType,
  validate,
} from "graphql";
import { mapItemsFromBrowse } from "@/components/map/adapter";
import { MapBrowseQuery } from "@/components/map/queries";

/**
 * Two anchors, because this guard reads two different trees.
 *
 * `clientRoot` is this package (`services/client`), which is what
 * {@link SOURCE_ROOTS} is resolved against. `repoRoot` is the workspace root,
 * which is where the SDL and the backend modules named in
 * {@link BACKEND_ABSENCE_CLAIMS} live. Before the services/* restructure these
 * were the same directory and one constant did both jobs; they are not the
 * same directory any more, and collapsing them again would silently point the
 * corpus scan at the repo root (finding no `src`) or the SDL read at this
 * package (finding no `packages/`).
 */
const clientRoot = fileURLToPath(new URL("../../../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

const schema = buildSchema(
  readFileSync(join(repoRoot, "packages/schema/schema.graphql"), "utf8"),
);

const objectType = (name: string): GraphQLObjectType => {
  const type = schema.getType(name);
  assert.ok(isObjectType(type), `schema.graphql has no object type ${name}`);
  return type;
};

/** Every root field name, for the "does this coordinate exist" question. */
const rootFields = new Set(
  ["Query", "Mutation"].flatMap((root) =>
    Object.keys(objectType(root).getFields()),
  ),
);

/* --------------------------------------------------------------------------
 * The corpus: every file that can render or gate a claim
 * ----------------------------------------------------------------------- */

/**
 * Resolved against {@link clientRoot}, not the workspace root: this guard
 * scans the frontend's own source and deliberately does **not** scan
 * `services/api` or `services/actors`. A backend that says a capability is
 * missing is describing its own code, which `tsc` there already checks; the
 * failure this file exists for is the *frontend* asserting something about the
 * backend and gating a control on it.
 */
const SOURCE_ROOTS = ["src"] as const;

/** This file quotes the claims it hunts, so scanning it would be circular. */
const SELF = "src/lib/dev-checks/capability-claims.test.ts";

/**
 * D10's guard, which likewise quotes the strings it forbids in order to
 * document them. Both files are evidence, not claims.
 */
const EXEMPT = new Set([SELF, "src/lib/dev-checks/upload-surface.test.ts"]);

const sourceFiles = (): { path: string; text: string }[] => {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(clientRoot, dir))) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const rel = `${dir}/${entry}`;
      if (statSync(join(clientRoot, rel)).isDirectory()) {
        walk(rel);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (EXEMPT.has(rel)) continue;
      out.push({
        path: rel,
        text: readFileSync(join(clientRoot, rel), "utf8"),
      });
    }
  };
  for (const root of SOURCE_ROOTS) walk(root);
  return out;
};

const CORPUS = sourceFiles();

/* --------------------------------------------------------------------------
 * 1 · A claim that names a schema coordinate, against the schema
 * ----------------------------------------------------------------------- */

/**
 * Prose shapes that assert a *named* schema element is absent.
 *
 * Each must capture the element's name in group 1. They are deliberately
 * narrow: a claim only counts when it names something the SDL can be asked
 * about. "There is no root field that lists items of one type" names nothing
 * and is not matched — which is correct, because it is true.
 *
 * The backtick-optional forms exist because these sentences live in TSDoc,
 * where a schema coordinate is conventionally quoted, and in JSX text, where
 * it is not.
 */
const SCHEMA_ABSENCE_PATTERNS: readonly {
  readonly what: string;
  readonly pattern: RegExp;
}[] = [
  {
    what: "no Query.x / no Mutation.x",
    pattern: /\bno\s+`?(?:Query|Mutation)\.(\w+)`?/g,
  },
  {
    what: "has no Query.x / has no Mutation.x",
    pattern: /\bhas\s+no\s+`?(?:Query|Mutation)\.(\w+)`?/g,
  },
  {
    what: "exposes no <field> mutation/query",
    pattern: /\bexposes?\s+no\s+`?(\w+)`?\s+(?:mutation|query|field)/g,
  },
  {
    what: "no <field> mutation/query",
    pattern: /\bno\s+`?(\w+)`?\s+(?:mutation|query)\b/g,
  },
  {
    what: "schema.graphql has no <name>",
    pattern: /schema\.graphql\s+has\s+no\s+`?(\w+)`?/g,
  },
  {
    what: "nothing exposes <field>",
    pattern: /\bnothing\s+exposes\s+`?(\w+)`?/g,
  },
];

/**
 * Stale claims that belong to a workstream other than the one fixing them.
 *
 * X11 found this one in a file A7h holds open (it is adding `PlacePhoto.file`),
 * so editing it would have meant a conflict rather than a fix. Handing it over
 * is the correct move; **silently exempting it is not**, which is why each
 * entry is asserted to still be stale below. The day the owner fixes the
 * sentence, the entry becomes wrong and this file fails asking for its
 * deletion. An exemption that cannot outlive its subject is the only kind
 * worth having in a guard whose whole subject is claims that outlived theirs.
 */
const HANDOFF: readonly {
  readonly path: string;
  readonly names: readonly string[];
  readonly owner: string;
  readonly note: string;
}[] = [
  // Empty, and that is the point. The one entry this list ever held covered
  // src/lib/api/places.ts's denial of `mapBrowse` / `MapPlace` / `MapCluster`,
  // parked because A7h had the file open when X11 found it. That paragraph was
  // rewritten on 2026-09-10 and the exemption retired with it — exactly the
  // sequence this design forces, since leaving the entry here would now fail
  // the suite. Add an entry only to hand a live claim to a named owner, never
  // to quiet a claim you have decided not to fix.
];

const handoffFor = (path: string): readonly string[] =>
  HANDOFF.filter((entry) => entry.path === path).flatMap(
    (entry) => entry.names,
  );

/**
 * Words that match a pattern but are ordinary English rather than a schema
 * coordinate — "no such mutation", "no recipe-photo mutation".
 */
const NOT_A_FIELD_NAME = new Set([
  "such",
  "single",
  "second",
  "other",
  "matching",
  "corresponding",
  "equivalent",
  "batched",
  "bulk",
  "one",
  "any",
]);

describe("no UI claim denies a schema element the schema has", () => {
  for (const { what, pattern } of SCHEMA_ABSENCE_PATTERNS) {
    test(`pattern: ${what}`, () => {
      const offences: string[] = [];
      for (const file of CORPUS) {
        for (const match of file.text.matchAll(pattern)) {
          const name = match[1];
          if (name === undefined) continue;
          if (NOT_A_FIELD_NAME.has(name)) continue;
          if (handoffFor(file.path).includes(name)) continue;
          // Only judge names the SDL can actually adjudicate: a root field, or
          // a type. Anything else is prose about an actor or a service and
          // belongs to check 2.
          const existsAsField = rootFields.has(name);
          const existsAsType = schema.getType(name) != null;
          if (!existsAsField && !existsAsType) continue;
          const line = file.text.slice(0, match.index).split("\n").length;
          offences.push(
            `${file.path}:${line} says «${match[0].trim()}» but ` +
              `packages/schema/schema.graphql HAS ${
                existsAsField ? `${name} as a root field` : `type ${name}`
              }.`,
          );
        }
      }
      assert.deepEqual(
        offences,
        [],
        `A source file denies a schema element that exists:

${offences.join("\n")}

This is the bug D10 found in describeUploadBlockers() and X11 found in four
more places: the sentence stayed put while the backend landed, and the feature
it gated stayed dark. Delete the claim and un-gate the feature, or — if the
element really was removed — fix the schema, not the sentence.`,
      );
    });
  }
});

describe("handed-off claims are still stale, or the entry should go", () => {
  for (const entry of HANDOFF) {
    test(`${entry.path} (owner: ${entry.owner})`, () => {
      const text = readFileSync(join(clientRoot, entry.path), "utf8");
      const remaining = entry.names.filter((name) =>
        new RegExp(`\\bno\\s+\`?(?:Query\\.)?${name}\`?`).test(text),
      );
      assert.notDeepEqual(
        remaining,
        [],
        `${entry.path} no longer denies ${entry.names.join(", ")} — ${entry.owner}
appears to have fixed it. Delete this HANDOFF entry so the file is checked
normally again. Leaving it here would exempt a file that no longer needs it,
which is how an exemption becomes the next stale claim.`,
      );
    });
  }
});

/* --------------------------------------------------------------------------
 * 2 · A claim that a backend module is unbuilt, against the filesystem
 * ----------------------------------------------------------------------- */

/**
 * Claims no SDL can settle, each paired with the file whose existence refutes
 * it.
 *
 * `startItemOnboarding` and `recipeSearch(semanticQuery:)` are in the schema
 * whether or not a model is reachable, so "is the AI wired?" cannot be asked of
 * the SDL — but it *can* be asked of `services/actors`, and that is a fact about
 * the repository rather than about a deployment.
 *
 * The distinction that matters, and the reason this check is not simply a
 * banned-words list: whether a provider is *configured* is a property of the
 * deployment (`AI_PROVIDER`, per `infra/.env.example`, where unset is a
 * supported state). The UI may say a call failed, and should quote the server's
 * reason. What it may not do is hardcode *why*, or gate a control on a guess.
 */
const BACKEND_ABSENCE_CLAIMS: readonly {
  readonly phrase: RegExp;
  readonly refutedBy: string;
  readonly because: string;
}[] = [
  {
    phrase: /\b(?:is|are)\s+not\s+wired\b/gi,
    refutedBy: "services/actors/src/lib/ai/factory.ts",
    because:
      "X1's provider layer exists (factory, ollama, google-ai, vertex-ai, seams) " +
      "and installAI() runs at boot in services/actors/src/index.ts.",
  },
  {
    phrase: /\bnot\s+wired\s+(?:into|up)\b/gi,
    refutedBy: "services/actors/src/lib/ai/install.ts",
    because:
      "installAI() installs all six seams whenever AI_PROVIDER is set; with it " +
      "unset each seam throws its own named error. Neither state is 'unwired'.",
  },
  {
    phrase: /\bhas\s+not\s+wired\s+an?\s+AI\s+provider\b/gi,
    refutedBy: "services/actors/src/lib/ai/factory.ts",
    because: "createAIProvider() has existed since X1.",
  },
  {
    phrase: /\bfile\s+service\s+has\s+no\s+API\s+surface\b/gi,
    refutedBy: "services/client/src/lib/api/files.ts",
    because:
      "A7c exposed createUploadTarget/verifyUpload and D10 wired the client flow.",
  },
];

const exists = (rel: string): boolean => {
  try {
    statSync(join(repoRoot, rel));
    return true;
  } catch {
    return false;
  }
};

describe("no UI claim denies a backend module that is in this repo", () => {
  for (const claim of BACKEND_ABSENCE_CLAIMS) {
    test(`«${claim.phrase.source}» is refuted by ${claim.refutedBy}`, () => {
      // If the module really is gone the claim becomes true and this check
      // stands down — the assertion is against reality, not against a list.
      if (!exists(claim.refutedBy)) return;

      const offences: string[] = [];
      for (const file of CORPUS) {
        for (const match of file.text.matchAll(claim.phrase)) {
          const line = file.text.slice(0, match.index).split("\n").length;
          offences.push(`${file.path}:${line} — «${match[0]}»`);
        }
      }
      assert.deepEqual(
        offences,
        [],
        `A source file says a backend capability is unbuilt, but ${claim.refutedBy} exists:

${offences.join("\n")}

${claim.because}

Whether a provider is *configured* is a property of the deployment and this
bundle cannot observe it — so report the error the server returned, and do not
gate a control on a guess. See src/lib/api/files.ts for the pattern.`,
      );
    });
  }
});

/* --------------------------------------------------------------------------
 * 2b · A claim in plain English, refuted by a schema coordinate
 * ----------------------------------------------------------------------- */

/**
 * The hardest variety: a claim that names no coordinate at all.
 *
 * `MenuScanDetail` rendered "the API exposes no way to turn a file id into a
 * viewable URL" beside a placeholder icon, and showed no scanned menu for two
 * workstreams. `Query.file(id:)` returning `File.url` is precisely that way,
 * and had been all along — but no pattern over schema names could catch the
 * sentence, because it mentions none.
 *
 * So these are matched as prose and refuted by a coordinate. The list only
 * grows when a real one is found; it is not an attempt to enumerate English.
 */
const SCHEMA_REFUTED_PHRASES: readonly {
  readonly phrase: RegExp;
  readonly type: string;
  readonly field: string;
  readonly because: string;
}[] = [
  {
    phrase:
      /\bno\s+way\s+to\s+turn\s+a\s+file\s+id\s+into\s+a\s+viewable\s+URL\b/gi,
    type: "Query",
    field: "file",
    because:
      "Query.file(id:) returns File.url, a 30-minute presigned GET. That is the way.",
  },
  {
    phrase: /\bno\s+way\s+to\s+upload\s+an?\s+image\b/gi,
    type: "Mutation",
    field: "createUploadTarget",
    because:
      "createUploadTarget → browser PUT → verifyUpload is the flow; src/lib/api/files.ts wraps it.",
  },
];

describe("no UI claim is refuted by a field the schema has", () => {
  for (const claim of SCHEMA_REFUTED_PHRASES) {
    test(`«${claim.phrase.source}» vs ${claim.type}.${claim.field}`, () => {
      if (!(claim.field in objectType(claim.type).getFields())) return;
      const offences: string[] = [];
      for (const file of CORPUS) {
        for (const match of file.text.matchAll(claim.phrase)) {
          const line = file.text.slice(0, match.index).split("\n").length;
          offences.push(`${file.path}:${line} — «${match[0]}»`);
        }
      }
      assert.deepEqual(
        offences,
        [],
        `A source file says a capability does not exist, but ${claim.type}.${claim.field} provides it:

${offences.join("\n")}

${claim.because}`,
      );
    });
  }
});

/* --------------------------------------------------------------------------
 * 3 · The feature X11 un-gated cannot rot the way the upload flow did
 * ----------------------------------------------------------------------- */

describe("the map browse surface is really there", () => {
  const REQUIRED = [
    ["Query", "mapBrowse", "the viewport browse three files denied"],
    ["MapPlace", "location", "where a marker is drawn"],
    ["MapCluster", "count", "what a bubble says"],
    ["MapEntryConnection", "edges", "the page of features"],
  ] as const;

  for (const [typeName, fieldName, why] of REQUIRED) {
    test(`${typeName}.${fieldName} exists (${why})`, () => {
      assert.ok(
        fieldName in objectType(typeName).getFields(),
        `packages/schema/schema.graphql has no ${typeName}.${fieldName}.
The restored map's browse layer (components/map/actions.ts) is built on it. If services/api really dropped it,
that is the change to reconsider — do not re-add a hardcoded "not available
yet" chip to /map.`,
      );
    });
  }

  test("MapBrowseQuery is valid against packages/schema/schema.graphql", () => {
    assert.deepEqual(
      validate(schema, MapBrowseQuery as never).map((error) => error.message),
      [],
    );
  });

  test("MapEntry is a union, so both branches must stay selected", () => {
    // If this ever stops being a union the canvas is selecting fields that no
    // longer exist, and `mapItemsFromBrowse` silently returns nothing.
    const entry = schema.getType("MapEntry");
    assert.ok(entry != null, "schema.graphql has no MapEntry");
    assert.match(String(entry?.astNode?.kind ?? ""), /UnionTypeDefinition/);
  });
});

describe("mapItemsFromBrowse keeps the two branches apart", () => {
  const bounds = { north: 1, south: 0, east: 1, west: 0 };

  test("markers and bubbles are separated by __typename", () => {
    const items = mapItemsFromBrowse(
      [
        {
          __typename: "MapPlace",
          id: "p1",
          name: "One",
          categories: ["wine_bar"],
          location: { lng: 1, lat: 2 },
        },
        {
          __typename: "MapCluster",
          clusterId: 7,
          count: 42,
          center: { lng: 3, lat: 4 },
        },
      ],
      { bounds },
    );
    const places = items.filter((item) => !("is_cluster" in item));
    const clusters = items.filter((item) => "is_cluster" in item);
    assert.equal(places.length, 1);
    assert.equal("id" in (places[0] ?? {}) ? places[0]?.id : null, "p1");
    assert.equal(clusters.length, 1);
    assert.equal(
      "cluster_count" in (clusters[0] ?? {}) ? clusters[0]?.cluster_count : 0,
      42,
    );
  });

  test("a cluster with no centre is dropped, not drawn at 0/0", () => {
    const items = mapItemsFromBrowse(
      [{ __typename: "MapCluster", clusterId: 1, count: 5 }],
      { bounds },
    );
    assert.deepEqual(items, []);
  });
});
