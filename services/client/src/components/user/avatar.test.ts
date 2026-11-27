/**
 * The profile picture (MC-avatar, L17): stored as a file id and presigned at
 * read. Nothing on this path names whose picture it is — `setAvatar` takes a
 * file id and the API writes the viewer's own row — so the one way to set
 * someone else's picture would be a user id somewhere in what the client
 * sends. These pin that there is none, against the checked-in SDL, and that
 * the upload goes in as the `avatar` kind the server checks the file against.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildSchema,
  type DocumentNode,
  type GraphQLObjectType,
  Kind,
  print,
  validate,
  visit,
} from "graphql";
import { queryCostRule } from "../../../../api/src/limits.ts";
import { saveAvatar } from "./avatar";
import * as userFragments from "./fragments";
import * as meHubData from "./me-hub-data";

const schema = buildSchema(
  readFileSync(
    fileURLToPath(
      new URL("../../../../../packages/schema/schema.graphql", import.meta.url),
    ),
    "utf8",
  ),
);

const mutationArgs = (field: string): string[] =>
  (schema.getMutationType() as GraphQLObjectType)
    .getFields()
    [field]?.args.map((arg) => arg.name) ?? ["<missing>"];

const namesIn = (document: DocumentNode): string[] => {
  const names: string[] = [];
  visit(document, {
    Variable: (node) => {
      names.push(node.name.value);
    },
    Argument: (node) => {
      names.push(node.name.value);
    },
  });
  return names;
};

describe("setAvatar names no person", () => {
  test("the API takes a file id and nothing else", () => {
    assert.deepEqual(mutationArgs("setAvatar"), ["fileId"]);
    assert.deepEqual(mutationArgs("removeAvatar"), []);
  });

  test("the documents send no user id", () => {
    for (const document of [
      userFragments.SetAvatarMutation,
      userFragments.RemoveAvatarMutation,
    ]) {
      const names = namesIn(document);
      assert.ok(
        !names.some((name) => /user|owner|person/i.test(name)),
        print(document),
      );
    }
  });

  test("saveAvatar uploads as `avatar`, verified, then sets that file", async () => {
    const calls: string[] = [];
    const id = await saveAvatar(new Blob(["x"], { type: "image/png" }), {
      upload: async (_file, kind, options) => {
        calls.push(`upload ${kind} verify=${options.verify}`);
        return "file-1";
      },
      setAvatar: async (fileId) => {
        calls.push(`setAvatar ${fileId}`);
        return { ok: true };
      },
    });
    assert.equal(id, "file-1");
    assert.deepEqual(calls, ["upload avatar verify=true", "setAvatar file-1"]);
  });

  test("a refused setAvatar is an error, never a silent success", async () => {
    await assert.rejects(
      saveAvatar(new Blob(["x"]), {
        upload: async () => "someone-elses-file",
        setAvatar: async () => ({
          ok: false,
          message: "That file isn't yours",
        }),
      }),
      /isn't yours/,
    );
  });
});

const operations = (module: Record<string, unknown>) =>
  Object.entries(module).filter(
    (entry): entry is [string, DocumentNode] =>
      typeof entry[1] === "object" &&
      entry[1] !== null &&
      (entry[1] as { kind?: unknown }).kind === Kind.DOCUMENT &&
      (entry[1] as DocumentNode).definitions.some(
        (definition) => definition.kind === Kind.OPERATION_DEFINITION,
      ),
  );

describe("Me and profile documents stay valid and under the row limit", () => {
  for (const [name, document] of [
    ...operations(userFragments),
    ...operations(meHubData),
  ]) {
    test(name, () => {
      assert.deepEqual(
        validate(schema, document, [queryCostRule()]).map(
          (error) => error.message,
        ),
        [],
      );
    });
  }
});
