import { readFileSync } from "node:fs";
import type { PageArgs } from "@cellar-assistant/contracts";
import {
  ACTOR_ERROR_REASONS,
  ForbiddenError,
  itemActorId,
  offsetPage,
  RECIPE_VOTE_TYPES,
} from "@cellar-assistant/contracts";
import type { GraphQLOutputType } from "graphql";
import {
  assertValidSchema,
  execute,
  getNamedType,
  isCompositeType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isUnionType,
  parse,
  validate,
} from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";
import { printApiSchema, SCHEMA_FILE } from "./print.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};

const wine = (id: string, name: string) => ({
  id,
  type: "WINE" as const,
  name,
  description: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
  createdById: viewer.id,
  barcodeCode: null,
  country: "France",
  vintage: "2019-01-01",
  variety: "Pinot Noir",
  region: "Burgundy",
  style: "RED",
  alcoholContentPercentage: 13.5,
});

describe("schema validity", () => {
  it("is a valid GraphQL schema", () => {
    expect(() => assertValidSchema(schema)).not.toThrow();
  });
});

/**
 * §1.5: "All list reads are paged. There is no unbounded read." §8.3: "Every
 * list field is a Relay connection."
 *
 * This is the guard that keeps that true across twenty later workstreams: any
 * field returning a list of objects fails unless it is a connection's own
 * `edges`. A scalar list (`[String!]!` on a row) is not a list *read* and is
 * left alone.
 */
describe("no unbounded list field (§1.5)", () => {
  const isCompositeList = (type: GraphQLOutputType): boolean => {
    const unwrapped = isNonNullType(type) ? type.ofType : type;
    if (!isListType(unwrapped)) return false;
    return isCompositeType(getNamedType(unwrapped));
  };

  it("exposes composite lists only as connection edges", () => {
    const offenders: string[] = [];
    for (const type of Object.values(schema.getTypeMap())) {
      if (type.name.startsWith("__")) continue;
      if (!isObjectType(type) && !isInterfaceType(type)) continue;
      for (const [fieldName, field] of Object.entries(type.getFields())) {
        if (!isCompositeList(field.type)) continue;
        const isConnectionEdges =
          fieldName === "edges" && type.name.endsWith("Connection");
        if (!isConnectionEdges) offenders.push(`${type.name}.${fieldName}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * A7e — **every paging root field answers with a result union.**
 *
 * A connection field is non-null, so an error raised under it nulls the field,
 * and that null propagates to the root: one bad alias returns `data: null` for
 * the whole document. A7c fixed `referenceData` that way and left eight; A7e
 * finished them. This is the guard that keeps a *ninth* from being added bare
 * — the same reasoning as the two A7c guards above, and the same reason they
 * are guards rather than eight more point fixes.
 *
 * Scoped to `Query`: a paging field on an object type nulls its parent, which
 * a client already has a branch for, and giving every one of them a union
 * would be a much larger surface change than this workstream's.
 */
describe("every paging root field degrades per field (A7e)", () => {
  const CONNECTION_ARGS = ["first", "after", "last", "before"];

  it("returns a result union, never a bare connection", () => {
    const queryType = schema.getQueryType();
    const bare: string[] = [];
    for (const [name, field] of Object.entries(queryType?.getFields() ?? {})) {
      const args = new Set(field.args.map((argument) => argument.name));
      if (!CONNECTION_ARGS.every((argument) => args.has(argument))) continue;
      if (!isUnionType(getNamedType(field.type))) bare.push(name);
    }
    expect(
      bare,
      [
        "These Query fields page but return the connection directly, so any",
        "error under them nulls the whole response instead of one field.",
        "Add `errors: {}` to the field — see `pagination.ts` (A7e).",
      ].join(" "),
    ).toEqual([]);
  });

  /**
   * The count is asserted, not just the emptiness: a regex over the SDL was
   * how the plan first counted these, and it was wrong twice. Nineteen is what
   * the schema actually has today, and a twentieth should be a deliberate edit
   * here rather than something that slips in under a green suite.
   */
  it("has nineteen of them", () => {
    const queryType = schema.getQueryType();
    const paging = Object.values(queryType?.getFields() ?? {}).filter(
      (field) => {
        const args = new Set(field.args.map((argument) => argument.name));
        return CONNECTION_ARGS.every((argument) => args.has(argument));
      },
    );
    expect(paging).toHaveLength(19);
  });
});

/**
 * A7c (3)(4) — **the writable-but-not-readable class, caught generally.**
 *
 * D3 lost time to six instances of one shape: a field that can be written and
 * cannot be read back, or whose type differs between two object types a client
 * queries in one selection set. Both fail the same way — a hard
 * `GRAPHQL_VALIDATION_FAILED` at runtime, while **gql.tada types the field
 * `unknown` and `tsc` stays silent**, so nothing catches it before the browser
 * does. Fixing six instances leaves the seventh to be found the same way, so
 * these two guards are the fix.
 */
describe("input and output agree (A7c)", () => {
  /**
   * Every `<T>AttributesInput` field must be readable on `<T>`.
   *
   * The attribute bags exist because GraphQL has no input unions — they mirror
   * the columns of one table, so "you may write it" and "you may read it" are
   * the same list by construction. The pairing is the naming convention, so a
   * seventh item type is covered the day it is added.
   */
  it("exposes every attribute a caller may write", () => {
    const offenders: string[] = [];
    for (const type of Object.values(schema.getTypeMap())) {
      if (!isInputObjectType(type)) continue;
      const match = /^(.+)AttributesInput$/.exec(type.name);
      if (match === null) continue;
      const objectName = match[1] ?? "";
      const objectType = schema.getType(objectName);
      if (!isObjectType(objectType)) {
        offenders.push(
          `${type.name} has no matching object type ${objectName}`,
        );
        continue;
      }
      const readable = new Set(Object.keys(objectType.getFields()));
      for (const fieldName of Object.keys(type.getFields())) {
        if (!readable.has(fieldName)) {
          offenders.push(
            `${objectName}.${fieldName} is writable, not readable`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * A field name shared by two object types implementing one interface must
   * have **one** type across them, nullability included.
   *
   * This is not a style rule: graphql-js's `OverlappingFieldsCanBeMerged`
   * applies `SameResponseShape` even to *mutually exclusive* fragments, so
   * `Wine.style: String!` beside `Beer.style: String` rejects the whole
   * document — a client cannot work around it by narrowing the fragments, only
   * by aliasing every occurrence. Same for two different named types
   * (`Date` on one sibling, `Int` on another).
   */
  it("gives a shared field one type across sibling implementations", () => {
    const offenders: string[] = [];
    for (const parent of Object.values(schema.getTypeMap())) {
      if (!isInterfaceType(parent)) continue;
      const seen = new Map<string, { type: string; on: string }>();
      for (const implementation of schema.getPossibleTypes(parent)) {
        for (const [fieldName, field] of Object.entries(
          implementation.getFields(),
        )) {
          const printed = String(field.type);
          const first = seen.get(fieldName);
          if (first === undefined) {
            seen.set(fieldName, { type: printed, on: implementation.name });
            continue;
          }
          if (first.type !== printed) {
            offenders.push(
              `${parent.name}: ${first.on}.${fieldName}: ${first.type} vs ` +
                `${implementation.name}.${fieldName}: ${printed}`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The end-to-end version of both guards: one document that selects every
   * per-type attribute on every `Item` implementation at once, unaliased.
   * This is the shape a detail page actually sends, and it is the thing that
   * was failing for D3.
   */
  it("validates a document selecting every item attribute unaliased", () => {
    const itemType = schema.getType("Item");
    if (!isInterfaceType(itemType)) throw new Error("no Item interface");
    const fragments = schema
      .getPossibleTypes(itemType)
      .map((implementation) => {
        const own = Object.entries(implementation.getFields())
          .filter(([, field]) => !isCompositeType(getNamedType(field.type)))
          .map(([fieldName]) => fieldName)
          .join(" ");
        return `... on ${implementation.name} { __typename ${own} }`;
      })
      .join("\n");
    const document = parse(
      `query Everything($id: ID!, $type: ItemType!) {
         item(type: $type, id: $id) {
           ... on QueryItemSuccess { data { id name ${fragments} } }
           ... on ActorError { code message }
         }
       }`,
    );
    expect(validate(schema, document).map((error) => error.message)).toEqual(
      [],
    );
  });
});

describe("schema snapshot (plan §7)", () => {
  it("matches the checked-in packages/schema/schema.graphql", () => {
    const checkedIn = readFileSync(SCHEMA_FILE, "utf8");
    expect(printApiSchema()).toBe(checkedIn);
  });
});

describe("ping (actor round trip)", () => {
  const pingViewer = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "test@test.com",
    emailVerified: true,
    role: "user" as const,
  };
  const pingAdmin = { ...pingViewer, role: "admin" as const };

  const pongStub = () =>
    stubSidecar({
      "PingActor.ping": (_actorId, _ctx, message) => ({
        pong: true,
        message: `${String(message)} ok`,
        actorId: "smoke",
        at: "2026-09-08T00:00:00.000Z",
        turns: 1,
      }),
    });

  it("passes ctx first and the arguments after it", async () => {
    const { invoke, calls } = pongStub();
    const result = await run(
      `{ ping(actorId: "smoke", message: "hi") { pong message turns } }`,
      testContext(invoke, pingViewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.ping).toMatchObject({ pong: true, message: "hi ok" });
    expect(calls[0]).toMatchObject({
      actorType: "PingActor",
      actorId: "smoke",
      method: "ping",
    });
    expect(calls[0]?.args[0]).toEqual({
      viewerId: pingViewer.id,
      kind: "user",
      requestId: "req-test",
    });
    expect(calls[0]?.args[1]).toBe("hi");
  });

  /**
   * The field used to take an arbitrary activation key from an anonymous
   * caller, and each key costs a real activation held for Dapr's ten-minute
   * idle timeout. These four cover the bound that replaced it — see
   * `activationFor` in `ping.ts`.
   */
  it("refuses an anonymous caller before reaching the sidecar", async () => {
    const { invoke, calls } = pongStub();
    const result = await run(`{ ping { pong } }`, testContext(invoke, null));
    expect(result.data?.ping).toBeUndefined();
    expect(result.errors?.[0]?.message).toBe("sign in to reach PingActor");
    // `execute()` is the raw graphql-js path, so the error is still the thrown
    // class; `extensions.code` is attached later, by `maskError` in index.ts.
    expect(result.errors?.[0]?.originalError).toBeInstanceOf(ForbiddenError);
    // The point of the check is that no activation happens at all.
    expect(calls).toEqual([]);
  });

  it("pins a signed-in non-admin to the one shared activation", async () => {
    const { invoke, calls } = pongStub();
    const result = await run(
      `{ ping(message: "hi") { pong } }`,
      testContext(invoke, pingViewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.actorId).toBe("smoke");
  });

  it("refuses a non-admin that names a different activation", async () => {
    const { invoke, calls } = pongStub();
    const result = await run(
      `{ ping(actorId: "anything-else") { pong } }`,
      testContext(invoke, pingViewer),
    );
    expect(result.errors?.[0]?.originalError).toBeInstanceOf(ForbiddenError);
    expect(result.errors?.[0]?.message).toContain("admin only");
    expect(calls).toEqual([]);
  });

  it("lets an admin ctx name one, which is what the argument is for", async () => {
    const { invoke, calls } = pongStub();
    const result = await run(
      `{ ping(actorId: "diagnostic-7") { pong } }`,
      testContext(invoke, pingAdmin),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.actorId).toBe("diagnostic-7");
  });

  it("maps a typed actor error onto the <Command>Result union", async () => {
    const { invoke } = stubSidecar({
      "PingActor.ping": () => {
        throw new ForbiddenError("not your actor");
      },
    });
    const result = await run(
      `mutation { ping { __typename ... on Pong { pong } ... on ActorError { code message } } }`,
      testContext(invoke, pingViewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.ping).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
      message: "not your actor",
    });
  });
});

describe("me", () => {
  it("is null for an anonymous request", async () => {
    const { invoke } = stubSidecar({});
    const result = await run(`{ me { id } }`, testContext(invoke));
    expect(result.errors).toBeUndefined();
    expect(result.data?.me).toBeNull();
  });

  it("answers from the token's claims with no actor call", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(
      `{ me { id email emailVerified role } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.me).toEqual({
      id: viewer.id,
      email: "test@test.com",
      emailVerified: true,
      role: "USER",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("Item interface + connection (§1.5)", () => {
  const items = [wine("a", "Wine A"), wine("b", "Wine B")];
  const byActorId = new Map(items.map((item) => [itemActorId(item), item]));

  const favorites = () =>
    stubSidecar({
      "FavoritesCollectionActor.list": (_actorId, _ctx, page) =>
        offsetPage(
          items.map(({ type, id }) => ({ type, id })),
          page as PageArgs,
        ),
      // The actor id is `wine:<uuid>` — the loader's batch key.
      "ItemActor.get": (actorId) => byActorId.get(actorId),
    });

  it("resolves a page of ids into typed items through the DataLoader", async () => {
    const { invoke, calls } = favorites();
    const result = await run(
      `{
        me {
          favorites(first: 2) {
            totalCount
            pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
            edges { cursor node { __typename id name ... on Wine { variety vintage } } }
          }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const me = result.data?.me as { favorites: unknown } | undefined;
    const connection = me?.favorites;
    expect(connection).toMatchObject({
      totalCount: 2,
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: "offset:0",
        endCursor: "offset:1",
      },
      edges: [
        {
          cursor: "offset:0",
          node: {
            __typename: "Wine",
            id: "a",
            name: "Wine A",
            variety: "Pinot Noir",
            vintage: "2019-01-01",
          },
        },
        { cursor: "offset:1", node: { __typename: "Wine", id: "b" } },
      ],
    });

    // §1.5: one collection call, then the items batched into parallel entity
    // calls — not a call per edge as they are resolved.
    expect(calls.filter((call) => call.method === "list")).toHaveLength(1);
    expect(
      calls.filter((call) => call.method === "get").map((c) => c.actorId),
    ).toEqual(["wine:a", "wine:b"]);
  });

  it("caps the page and refuses backward paging", async () => {
    const { invoke } = favorites();
    const tooLarge = await run(
      `{ me { favorites(first: 5000) { edges { cursor } } } }`,
      testContext(invoke, viewer),
    );
    expect(tooLarge.errors?.[0]?.message).toMatch(/first must be at most 100/);

    const backward = await run(
      `{ me { favorites(last: 5) { edges { cursor } } } }`,
      testContext(invoke, viewer),
    );
    expect(backward.errors?.[0]?.message).toMatch(/backward pagination/);
  });
});

/* -------------------------------------------------------------------------- */
/* A7d item 2: the page cap is typed AND documented                            */
/* -------------------------------------------------------------------------- */

/**
 * Two halves of one D3/D6 report, and only one of them was A7c's.
 *
 * A7c fixed how the cap *reads*: `maskError` never matched a resolver-raised
 * error, so every one of them — including `pageArgs`' cap, thrown in this very
 * process — arrived as `INTERNAL_SERVER_ERROR` / "Unexpected error". The guard
 * below pins that on a **plain, non-root** connection field, which is the case
 * A7e's result unions do *not* cover: `Recipe.ingredients` is not a root field,
 * so it has no union to degrade into, and the typed `code` is the only thing a
 * client gets.
 *
 * The other half is that nothing in the schema *said* there was a cap. That is
 * now an arg description on every connection field, written once in
 * `builder.ts`'s relay options — there is no per-field option to forget, and a
 * connection added tomorrow inherits it.
 */
describe("the page cap is typed and documented (A7d item 2)", () => {
  const RECIPE_ID = "22222222-2222-4222-8222-222222222222";

  const recipeStub = () =>
    stubSidecar({
      "RecipeActor.get": (actorId: string) => ({
        id: actorId,
        name: "Negroni",
        description: null,
        type: "cocktail",
        createdById: viewer.id,
        recipeGroupId: null,
        canonicalRecipeId: null,
        difficultyLevel: null,
        prepTimeMinutes: null,
        servingSize: null,
        imageUrl: null,
        version: 1,
        ingredientCount: 0,
        instructionCount: 0,
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
      }),
    });

  it("raises a typed VALIDATION on a plain connection field, not Unexpected error", async () => {
    const { invoke } = recipeStub();
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { __typename ... on Recipe {
         ingredients(first: 5000) { edges { cursor } } } } }`,
      testContext(invoke, viewer),
    );
    const error = result.errors?.[0];
    expect(error?.message).toMatch(/first must be at most 100, got 5000/);
    // The regression that mattered: before A7c's unwrap this read
    // `{"message":"Unexpected error."}` with no code and no path, so a client
    // could not tell a bad argument from a broken sidecar.
    expect(error?.message).not.toMatch(/Unexpected error/);
    expect(error?.path).toEqual(["recipe", "ingredients"]);
  });

  it("documents the cap on `first`, and the refusal on `last`/`before`", () => {
    const argOf = (typeName: string, fieldName: string, argName: string) => {
      const type = schema.getType(typeName);
      if (!isObjectType(type)) throw new Error(`${typeName} is not an object`);
      const field = type.getFields()[fieldName];
      if (field === undefined) {
        throw new Error(`${typeName}.${fieldName} does not exist`);
      }
      return field.args.find((argument) => argument.name === argName);
    };

    // One representative field; the sweep below is what makes it general.
    expect(argOf("Recipe", "ingredients", "first")?.description).toMatch(
      /1 to 100 inclusive/,
    );
    expect(argOf("Recipe", "ingredients", "last")?.description).toMatch(
      /Not supported/,
    );
    expect(argOf("Recipe", "ingredients", "before")?.description).toMatch(
      /Not supported/,
    );
  });

  /**
   * The general form. `first` is added by the relay plugin to *every*
   * connection field, so an undocumented one means somebody bypassed the
   * plugin — which is exactly the thing that would quietly reintroduce an
   * undiscoverable cap on one field.
   */
  it("leaves no connection field's `first` undocumented", () => {
    const undocumented: string[] = [];
    for (const type of Object.values(schema.getTypeMap())) {
      if (!isObjectType(type) && !isInterfaceType(type)) continue;
      if (type.name.startsWith("__")) continue;
      for (const field of Object.values(type.getFields())) {
        const args = new Set(field.args.map((argument) => argument.name));
        if (!args.has("first") || !args.has("after")) continue;
        const first = field.args.find((argument) => argument.name === "first");
        if ((first?.description ?? "") === "") {
          undocumented.push(`${type.name}.${field.name}`);
        }
      }
    }
    expect(
      undocumented,
      [
        "These connection fields take `first` with no description, so the",
        "100-row cap is undiscoverable on them. `first` is described once in",
        "builder.ts's relay options — a field missing it was built without",
        "the plugin.",
      ].join(" "),
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Enum domains match their source of truth                                    */
/* -------------------------------------------------------------------------- */

/**
 * X1b's follow-on cost a day: the sake serving-temperature picker offered 7 of
 * the column's 9 labels, and the gap only became *reachable* once the model
 * was correctly constrained. The lesson generalises — when an enum is backed
 * by a list somewhere else, assert the GraphQL enum is that list, rather than
 * eyeballing it.
 *
 * Both enums touched by A7d are checked here. `ActorErrorReason` gained three
 * values (item 8) and is generated from `ACTOR_ERROR_REASONS`; a reason in the
 * array but missing from the enum would be a value an actor can throw and no
 * client can name. `RecipeVoteType` is `Recipe.myVote`'s type (item 4) and its
 * domain is `recipe_votes_vote_type_check`.
 */
describe("enum domains (A7d items 4, 8)", () => {
  const valuesOf = (name: string): string[] => {
    const type = schema.getType(name);
    if (!isEnumType(type)) {
      throw new Error(`${name} is not an enum in the schema`);
    }
    return type
      .getValues()
      .map((value) => value.name)
      .sort();
  };

  it("exposes every ACTOR_ERROR_REASONS value, including the three recipe ones", () => {
    expect(valuesOf("ActorErrorReason")).toEqual(
      [...ACTOR_ERROR_REASONS].sort(),
    );
    for (const reason of [
      "REVIEW_ALREADY_EXISTS",
      "NOT_REVIEW_AUTHOR",
      "RECIPE_NOT_IN_GROUP",
    ]) {
      expect(valuesOf("ActorErrorReason")).toContain(reason);
    }
  });

  it("exposes the whole recipe_votes vote_type domain", () => {
    // The check constraint is `('upvote','downvote')`; `RECIPE_VOTE_TYPES` is
    // that domain, and `Recipe.myVote` must be able to say either.
    expect(valuesOf("RecipeVoteType")).toEqual([...RECIPE_VOTE_TYPES].sort());
    expect(valuesOf("RecipeVoteType")).toEqual(["downvote", "upvote"]);
  });
});

/* -------------------------------------------------------------------------- */
/* A7d item 5: a search hit reaches its recipe                                 */
/* -------------------------------------------------------------------------- */

describe("RecipeSearchResult.recipe (A7d item 5)", () => {
  it("is a non-null Recipe, batched through the loader", () => {
    const type = schema.getType("RecipeSearchResult");
    if (!isObjectType(type)) throw new Error("RecipeSearchResult missing");
    const field = type.getFields().recipe;
    expect(field).toBeDefined();
    expect(isNonNullType(field?.type)).toBe(true);
    expect(getNamedType(field?.type as GraphQLOutputType).name).toBe("Recipe");
    // Without this field a hit carried no score, ingredient count or image —
    // C1 left it out because B6 owned `Recipe` and both were in flight.
    expect(type.getFields().recipeId).toBeDefined();
  });
});
