/**
 * D10 · the guard that exists because this exact bug already happened.
 *
 * `src/lib/api/files.ts` used to export a hardcoded list of two "blockers",
 * rendered by `ItemImages` instead of an upload control:
 *
 *   1. "services/api exposes no createUploadTarget mutation — FileActor has no
 *      GraphQL surface…"
 *   2. "Presigned URLs point at http://minio:9000, which resolves only inside
 *      the compose network…"
 *
 * A7c added the mutation. E3a made the signed endpoint configurable. Neither
 * workstream had any reason to read a helper in `src/lib/api/`, so both
 * strings stayed, image upload stayed switched off, and **nothing failed** —
 * not `tsc`, not `biome`, not a single test. A false claim about the schema is
 * invisible to every tool that only reads one side of it.
 *
 * So this file reads both sides. It asserts against
 * `packages/schema/schema.graphql` — the SDL `services/api` prints and checks in —
 * rather than against a copy of any sentence, and it asserts that the blockers
 * the module can actually produce are computed from the environment rather
 * than asserted about the API.
 *
 * Two invariants, three failure modes it would have caught:
 *
 *   - a claim that a schema field is missing, while the schema has it;
 *   - a document that no longer matches the schema it is sent to;
 *   - the client's file-origin allowlist drifting from the CSP's, which is the
 *     one thing that decides whether a presigned PUT is allowed to leave the
 *     browser at all.
 *
 *   bun run test:unit
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildSchema,
  type GraphQLObjectType,
  isObjectType,
  print,
  validate,
} from "graphql";
import nextConfig from "../../../next.config.mjs";
import {
  CreateUploadTargetMutation,
  describeUploadBlockers,
  VerifyUploadMutation,
} from "../api/files.ts";
import { ItemDetailQuery, ItemImageFragment } from "../api/items.ts";

const schema = buildSchema(
  readFileSync(
    fileURLToPath(
      new URL("../../../../../packages/schema/schema.graphql", import.meta.url),
    ),
    "utf8",
  ),
);

const objectType = (name: string): GraphQLObjectType => {
  const type = schema.getType(name);
  assert.ok(isObjectType(type), `schema.graphql has no object type ${name}`);
  return type;
};

/* --------------------------------------------------------------------------
 * 1 · The surface the upload flow depends on is really there
 * ----------------------------------------------------------------------- */

describe("the upload protocol has a GraphQL surface", () => {
  /**
   * Every field D10 wires up, and the sentence that used to deny it. Losing
   * any of these is a real regression, and it should fail here — loudly, in
   * CI — rather than turn into another string nobody re-checks.
   */
  const REQUIRED = [
    ["Mutation", "createUploadTarget", "step 1: mint the row and the PUT URL"],
    ["Mutation", "verifyUpload", "step 3: confirm the object landed"],
    ["Mutation", "attachItemImage", "step 3 for item images, verify included"],
    ["Query", "file", "read one file's metadata by id"],
    ["File", "url", "the presigned GET that renders an image"],
    ["ItemImage", "file", "the row's link to the bytes"],
  ] as const;

  for (const [typeName, fieldName, why] of REQUIRED) {
    test(`${typeName}.${fieldName} exists (${why})`, () => {
      assert.ok(
        fieldName in objectType(typeName).getFields(),
        `packages/schema/schema.graphql has no ${typeName}.${fieldName}.
The upload/display flow in src/lib/api/files.ts is built on it. If services/api
really did drop it, that is the change to reconsider — do not paper over it
with a hardcoded "unavailable" message in the UI.`,
      );
    });
  }

  test("File.url is non-null, so a throw nulls its way up the connection", () => {
    // Not a nicety: it is why `favorites.ts`, `search.ts` and `tier-lists.ts`
    // select `placeholder` alone, and why `ItemImageRow` may only select
    // `file { url }` where every row is verified by construction. If this ever
    // becomes nullable, those three comments are wrong and this is cheap to
    // relax.
    assert.equal(String(objectType("File").getFields().url?.type), "String!");
  });
});

/* --------------------------------------------------------------------------
 * 2 · The documents match the schema they are sent to
 * ----------------------------------------------------------------------- */

const DOCUMENTS = [
  ["CreateUploadTargetMutation", CreateUploadTargetMutation],
  ["VerifyUploadMutation", VerifyUploadMutation],
  // Carries `ItemImageRow`, and so the `file { url }` the tiles render.
  ["ItemDetailQuery", ItemDetailQuery],
] as const;

describe("the upload documents validate", () => {
  for (const [name, document] of DOCUMENTS) {
    test(`${name} is valid against packages/schema/schema.graphql`, () => {
      assert.deepEqual(
        validate(schema, document as never).map((error) => error.message),
        [],
      );
    });
  }

  test("ItemImageRow selects the signed URL the tile renders", () => {
    const sdl = print(ItemImageFragment as never);
    assert.match(
      sdl,
      /file\s*{[^}]*\burl\b/,
      `ItemImageRow no longer selects file { url }, so ItemImages has nothing to
put in an <img src>. gql.tada will not catch this: an unselected field is
simply absent from the result type until something reads it.`,
    );
  });
});

/* --------------------------------------------------------------------------
 * 3 · The blockers are computed, not asserted
 * ----------------------------------------------------------------------- */

describe("describeUploadBlockers reports only what is wrong here", () => {
  test("a correctly configured production build is not blocked", () => {
    assert.deepEqual(describeUploadBlockers(["https://files.example.com"]), []);
  });

  test("a development build with MinIO published is not blocked", () => {
    assert.deepEqual(describeUploadBlockers(["http://localhost:9100"]), []);
  });

  test("a build that recorded no origins is blocked, and says which to set", () => {
    assert.equal(describeUploadBlockers([]).length, 1);
  });

  /**
   * The staleness trap itself.
   *
   * Any multi-word schema field name inside a blocker string is a claim about
   * the API, and a claim about the API is exactly what went stale. If the
   * field exists, the claim is either false or unfalsifiable — both are bugs.
   */
  test("no blocker names a schema field that the schema has", () => {
    const fieldNames = ["Query", "Mutation"].flatMap((root) =>
      Object.keys(objectType(root).getFields()),
    );
    // Multi-word names only: `file`, `me` and `item` are ordinary English and
    // would match prose that makes no claim at all.
    const distinctive = fieldNames.filter(
      (name) => name.length >= 8 && /[A-Z]/.test(name),
    );

    const everyBlocker = [
      ...describeUploadBlockers([]),
      ...describeUploadBlockers(["https://files.example.com"]),
      ...describeUploadBlockers(null),
    ];

    for (const blocker of everyBlocker) {
      for (const name of distinctive) {
        assert.ok(
          !blocker.includes(name),
          `A blocker names ${name}, which packages/schema/schema.graphql does have:
  ${blocker}
That is the shape of the bug this file exists to prevent. Blockers must be
derived from the environment, not asserted about the API.`,
        );
      }
    }
  });
});

/* --------------------------------------------------------------------------
 * 4 · One allowlist, two consumers
 * ----------------------------------------------------------------------- */

describe("the client's file origins are the CSP's file origins", () => {
  const connectSrc = async (): Promise<string[]> => {
    const groups = await nextConfig.headers();
    const header = groups
      .flatMap(
        (group: { headers: { key: string; value: string }[] }) => group.headers,
      )
      .find(({ key }: { key: string }) => key === "Content-Security-Policy");
    assert.ok(header, "next.config.mjs sends no Content-Security-Policy");
    const directive = header.value
      .split(";")
      .map((part: string) => part.trim())
      .find((part: string) => part.startsWith("connect-src "));
    assert.ok(directive, "CSP has no connect-src");
    return directive.split(/\s+/).slice(1);
  };

  test("NEXT_PUBLIC_FILE_ORIGINS is inlined for the browser bundle", () => {
    assert.equal(
      typeof nextConfig.env?.NEXT_PUBLIC_FILE_ORIGINS,
      "string",
      `next.config.mjs no longer hands the file-origin allowlist to the client.
src/lib/api/files.ts reads it to refuse a presigned URL the browser is not
permitted to contact — without it, such an upload fails as an opaque
"TypeError: Failed to fetch" with no request in the network panel.`,
    );
  });

  test("every origin the client trusts is one the CSP permits", async () => {
    const allowed = new Set(await connectSrc());
    const published = String(nextConfig.env?.NEXT_PUBLIC_FILE_ORIGINS ?? "")
      .split(" ")
      .filter((origin) => origin !== "");
    for (const origin of published) {
      assert.ok(
        allowed.has(origin),
        `${origin} is published to the client but is not in connect-src, so the
browser would block a PUT to it. Both come from fileOrigins() in
next.config.mjs — they cannot disagree unless one of them stopped using it.`,
      );
    }
  });
});
