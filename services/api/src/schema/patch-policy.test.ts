/**
 * Pins, per field, what every update/patch mutation sends its actor for the
 * three shapes an optional GraphQL input field can take: absent, explicit
 * `null`, and a value.
 *
 *   - `keep`      — absent and `null` both mean "leave it": the key is omitted.
 *   - `clearable` — absent omits the key; `null` is forwarded as `null`.
 *   - `reject`    — absent omits the key; `null` is a `ValidationError` and the
 *                   actor is never called.
 *
 * Each case runs through the real schema against a stub sidecar, so it pins the
 * marshalling end to end rather than a helper in isolation. A field whose
 * policy changes — deliberately or not — fails here by name.
 *
 * **Which mutations count is discovered, not listed.** Every mutation that
 * takes an input object with a nullable field is found in the built schema,
 * and each must be either pinned in {@link MUTATIONS} or classified in
 * {@link NOT_PATCHES} with the reason `null` needs no policy there. A new
 * update mutation is therefore a failure here until someone decides what its
 * `null`s mean. (Until 2026-09-28 the list was hand-kept, and `updateBrand`,
 * `updateProfile` and `recordPlaceInteraction` were missing from it —
 * `updateBrand` turned every `null` into "leave it", so a brand's description
 * could be set but never cleared.)
 */
import {
  execute,
  extendSchema,
  type GraphQLInputObjectType,
  type GraphQLSchema,
  getNamedType,
  isInputObjectType,
  isNonNullType,
  parse,
} from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};
const ID = "22222222-2222-4222-8222-222222222222";
const ID2 = "33333333-3333-4333-8333-333333333333";

type Mutation = {
  /** The actor method the mutation lands on. */
  method: string;
  /** The mutation document, given the `input` literal (or `null` for none). */
  doc: (input: string | null) => string;
  /** Keys the actor always receives, whatever the patch fields are. */
  fixed?: Readonly<Record<string, unknown>>;
};

/** `{ a: 1 }` → `{ placeId: "…", a: 1 }`, for inputs with a required key. */
const withPlace = (input: string): string =>
  input.replace(/^\{\s*/, `{ placeId: "${ID}", `).replace(", }", " }");

const MUTATIONS = {
  updateItem: {
    method: "update",
    doc: (i) =>
      `mutation { updateItem(type: WINE, itemId: "${ID}", input: ${i}) { __typename } }`,
  },
  updateItemReview: {
    method: "updateReview",
    doc: (i) =>
      `mutation { updateItemReview(type: WINE, itemId: "${ID}", reviewId: "${ID2}", input: ${i}) { __typename } }`,
  },
  updateGenericItem: {
    method: "updateGeneric",
    doc: (i) =>
      `mutation { updateGenericItem(genericItemId: "${ID}", input: ${i}) { __typename } }`,
  },
  updateCellar: {
    method: "update",
    doc: (i) =>
      `mutation { updateCellar(cellarId: "${ID}", input: ${i}) { __typename } }`,
  },
  updateCellarItem: {
    method: "updateItem",
    doc: (i) =>
      `mutation { updateCellarItem(cellarId: "${ID}", cellarItemId: "${ID2}", input: ${i}) { __typename } }`,
  },
  updateTierList: {
    method: "update",
    doc: (i) =>
      `mutation { updateTierList(tierListId: "${ID}", input: ${i}) { __typename } }`,
  },
  updateRecipe: {
    method: "update",
    doc: (i) =>
      `mutation { updateRecipe(recipeId: "${ID}", input: ${i}) { __typename } }`,
  },
  updateRecipeReview: {
    method: "updateReview",
    doc: (i) =>
      `mutation { updateRecipeReview(recipeId: "${ID}", reviewId: "${ID2}", input: ${i}) { __typename } }`,
  },
  updateRecipeGroup: {
    method: "update",
    doc: (i) =>
      `mutation { updateRecipeGroup(recipeGroupId: "${ID}", input: ${i}) { __typename } }`,
  },
  updateBrand: {
    method: "update",
    doc: (i) =>
      `mutation { updateBrand(id: "${ID}", input: ${i}) { __typename } }`,
  },
  updateProfile: {
    method: "updateProfile",
    doc: (i) => `mutation { updateProfile(input: ${i}) { __typename } }`,
  },
  recordPlaceInteraction: {
    method: "recordPlaceInteraction",
    doc: (i) =>
      `mutation { recordPlaceInteraction(input: ${withPlace(i ?? "{}")}) { __typename } }`,
    fixed: { placeId: ID },
  },
  enrichPlaceFromGoogle: {
    method: "enrichFromGoogle",
    doc: (i) =>
      i === null
        ? `mutation { enrichPlaceFromGoogle(placeId: "${ID}") { __typename } }`
        : `mutation { enrichPlaceFromGoogle(placeId: "${ID}", input: ${i}) { __typename } }`,
  },
} satisfies Record<string, Mutation>;

type Policy = "keep" | "clearable" | "reject";

/** [mutation, field, policy, GraphQL value literal, what the actor receives]. */
const FIELDS: ReadonlyArray<
  readonly [keyof typeof MUTATIONS, string, Policy, string, unknown]
> = [
  ["updateItem", "name", "keep", `"N"`, "N"],
  ["updateItem", "description", "clearable", `"D"`, "D"],
  ["updateItem", "country", "clearable", `"FR"`, "FR"],
  ["updateItem", "wine", "keep", `{ region: "R" }`, { region: "R" }],
  ["updateItem", "beer", "keep", `{ style: "S" }`, { style: "S" }],
  ["updateItem", "spirit", "keep", `{ style: "S" }`, { style: "S" }],
  ["updateItem", "coffee", "keep", `{ process: "P" }`, { process: "P" }],
  // UI parity G12/G13: the new attributes ride the same bags, and inside a
  // bag a `null` is forwarded — the actor reads it as "clear the column".
  [
    "updateItem",
    "sake",
    "keep",
    `{ category: "C", sakeMeterValue: 3.5, yeastStrain: null }`,
    { category: "C", sakeMeterValue: 3.5, yeastStrain: null },
  ],
  [
    "updateItem",
    "tea",
    "keep",
    `{ region: "R", isOrganic: false, isFairTrade: null, steepingTime: "3 min" }`,
    { region: "R", isOrganic: false, isFairTrade: null, steepingTime: "3 min" },
  ],

  ["updateItemReview", "score", "reject", "4.5", 4.5],
  ["updateItemReview", "text", "clearable", `{ a: 1 }`, '{"a":1}'],

  ["updateGenericItem", "name", "keep", `"N"`, "N"],
  ["updateGenericItem", "category", "keep", `"C"`, "C"],
  ["updateGenericItem", "subcategory", "clearable", `"S"`, "S"],
  ["updateGenericItem", "kind", "keep", "beer", "beer"],
  ["updateGenericItem", "description", "clearable", `"D"`, "D"],
  ["updateGenericItem", "isSubstitutable", "clearable", "true", true],

  ["updateCellar", "name", "keep", `"N"`, "N"],
  ["updateCellar", "privacy", "keep", "FRIENDS", "FRIENDS"],
  ["updateCellar", "coOwnerIds", "reject", `["${ID2}"]`, [ID2]],

  ["updateCellarItem", "percentageRemaining", "keep", "50", 50],
  ["updateCellarItem", "displayImageId", "clearable", `"${ID2}"`, ID2],
  [
    "updateCellarItem",
    "openAt",
    "clearable",
    `"2026-09-01T00:00:00.000Z"`,
    "2026-09-01T00:00:00.000Z",
  ],
  [
    "updateCellarItem",
    "emptyAt",
    "clearable",
    `"2026-09-01T00:00:00.000Z"`,
    "2026-09-01T00:00:00.000Z",
  ],

  ["updateTierList", "name", "keep", `"N"`, "N"],
  ["updateTierList", "description", "clearable", `"D"`, "D"],
  ["updateTierList", "privacy", "keep", "PRIVATE", "PRIVATE"],
  ["updateTierList", "isEditingLocked", "keep", "true", true],

  ["updateRecipe", "name", "keep", `"N"`, "N"],
  ["updateRecipe", "description", "clearable", `"D"`, "D"],
  ["updateRecipe", "type", "keep", "food", "food"],
  ["updateRecipe", "recipeGroupId", "clearable", `"${ID2}"`, ID2],
  ["updateRecipe", "difficultyLevel", "clearable", "3", 3],
  ["updateRecipe", "prepTimeMinutes", "clearable", "10", 10],
  ["updateRecipe", "servingSize", "clearable", "2", 2],
  ["updateRecipe", "imageUrl", "clearable", `"u"`, "u"],

  ["updateRecipeReview", "score", "clearable", "4.5", 4.5],
  ["updateRecipeReview", "text", "clearable", `"T"`, "T"],

  ["updateRecipeGroup", "name", "keep", `"N"`, "N"],
  ["updateRecipeGroup", "category", "keep", "mocktail", "mocktail"],
  ["updateRecipeGroup", "description", "clearable", `"D"`, "D"],
  ["updateRecipeGroup", "baseSpirit", "clearable", `"B"`, "B"],
  ["updateRecipeGroup", "tags", "clearable", `["a"]`, ["a"]],
  ["updateRecipeGroup", "imageUrl", "clearable", `"u"`, "u"],

  ["updateBrand", "name", "keep", `"N"`, "N"],
  ["updateBrand", "description", "clearable", `"D"`, "D"],
  ["updateBrand", "logoUrl", "clearable", `"u"`, "u"],
  ["updateBrand", "brandType", "clearable", "brewery", "brewery"],

  ["updateProfile", "displayName", "reject", `"N"`, "N"],
  ["updateProfile", "avatarUrl", "clearable", `"u"`, "u"],
  ["updateProfile", "locale", "clearable", `"fr"`, "fr"],

  ["recordPlaceInteraction", "isFavorite", "keep", "true", true],
  ["recordPlaceInteraction", "isVisited", "keep", "true", true],
  ["recordPlaceInteraction", "wantToVisit", "keep", "true", true],
  ["recordPlaceInteraction", "rating", "clearable", "4", 4],
  ["recordPlaceInteraction", "notes", "clearable", `"n"`, "n"],
  ["recordPlaceInteraction", "tags", "clearable", `["t"]`, ["t"]],

  ["enrichPlaceFromGoogle", "googlePlaceId", "keep", `"g"`, "g"],
  [
    "enrichPlaceFromGoogle",
    "resolvedVia",
    "keep",
    "autocomplete",
    "autocomplete",
  ],
  ["enrichPlaceFromGoogle", "maxPhotos", "keep", "2", 2],
];

type Outcome = {
  /** The patch the actor method received, less the mutation's fixed keys; `undefined` if it was never called. */
  readonly sent: unknown;
  /** The mutation field's `__typename` — an error union member when refused. */
  readonly typename: unknown;
};

/** Runs `name` with `input` and reports what its actor method received. */
const run = async (
  name: keyof typeof MUTATIONS,
  input: string | null,
): Promise<Outcome> => {
  const mutation: Mutation = MUTATIONS[name];
  // Every actor call throws: only the recorded arguments matter here.
  const { invoke, calls } = stubSidecar(
    new Proxy(
      {},
      {
        get: () => () => {
          throw new Error("stub");
        },
      },
    ),
  );
  const result = await execute({
    schema,
    document: parse(mutation.doc(input)),
    contextValue: testContext(invoke, viewer),
  });
  const call = calls.find((c) => c.method === mutation.method);
  const received = call?.args.at(-1);
  let sentPatch: unknown = received;
  if (mutation.fixed !== undefined && received !== undefined) {
    const rest: Record<string, unknown> = { ...(received as object) };
    for (const [key, value] of Object.entries(mutation.fixed)) {
      expect(rest[key], `${name}.${key}`).toEqual(value);
      delete rest[key];
    }
    sentPatch = rest;
  }
  const data = result.data as Record<string, { __typename?: unknown } | null>;
  return { sent: sentPatch, typename: data?.[name]?.__typename };
};

/** Runs `name` with `input` and returns the patch its actor method received. */
const sent = async (
  name: keyof typeof MUTATIONS,
  input: string | null,
): Promise<unknown> => {
  const outcome = await run(name, input);
  expect(
    outcome.sent,
    `${name} never reached ${MUTATIONS[name].method}`,
  ).toBeDefined();
  return outcome.sent;
};

/* -------------------------------------------------------------------------- */
/* Discovery                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mutations whose input objects have nullable fields but are not patches, and
 * why `null` needs no per-field policy there.
 */
const CREATES =
  "creates a row: nothing exists to clear, so null and absent both mean " +
  "'not given'";
const REPLACES =
  "replaces a whole list; each entry is a new row, so its nulls are 'not given'";
const STARTS =
  "starts a job or an upload; there is no stored value for null to clear";

const NOT_PATCHES: Readonly<Record<string, string>> = {
  addItemReview: CREATES,
  addItemToCellar: CREATES,
  addRecipeReview: CREATES,
  addTierListItem: CREATES,
  attachItemImage: CREATES,
  confirmItemOnboarding: CREATES,
  createCellar: CREATES,
  createGenericItem: CREATES,
  createItem: CREATES,
  createMenuScan: CREATES,
  createPlace: CREATES,
  createRecipe: CREATES,
  createRecipeGroup: CREATES,
  createTierList: CREATES,
  createUploadTarget: STARTS,
  setRecipeIngredients: REPLACES,
  setRecipeInstructions: REPLACES,
  startItemOnboarding: STARTS,
  startRecipePhotoJob: STARTS,
};

/** A name that says "change what is there" cannot be classified away. */
const LOOKS_LIKE_A_PATCH = /^(update|patch|edit|enrich|record|modify)/i;
const PATCH_INPUT = /^(Update|Patch|Edit|Enrich|Record|Modify)\w*Input$/;

/** The input-object arguments of `mutation` that have a nullable field. */
const nullableInputs = (
  target: GraphQLSchema,
  mutation: string,
): GraphQLInputObjectType[] => {
  const field = target.getMutationType()?.getFields()[mutation];
  return (field?.args ?? []).flatMap((arg) => {
    const type = getNamedType(arg.type);
    return isInputObjectType(type) &&
      Object.values(type.getFields()).some((f) => !isNonNullType(f.type))
      ? [type]
      : [];
  });
};

/** Every mutation taking an input object with at least one nullable field. */
const discoverPatchCandidates = (target: GraphQLSchema): string[] =>
  Object.keys(target.getMutationType()?.getFields() ?? {})
    .filter((name) => nullableInputs(target, name).length > 0)
    .sort();

/** Candidates neither pinned nor classified. */
const unclassified = (target: GraphQLSchema): string[] =>
  discoverPatchCandidates(target).filter(
    (name) => !(name in MUTATIONS) && !(name in NOT_PATCHES),
  );

describe("update mutations: per-field patch policy", () => {
  it.each(FIELDS)(
    "%s.%s is %s",
    async (name, field, policy, literal, value) => {
      expect(await sent(name, "{}")).toEqual({});
      const onNull = await run(name, `{ ${field}: null }`);
      if (policy === "reject") {
        expect(onNull.typename).toBe("ValidationError");
        expect(onNull.sent, "a refused null must not reach the actor").toBe(
          undefined,
        );
      } else {
        expect(onNull.sent).toEqual(
          policy === "clearable" ? { [field]: null } : {},
        );
      }
      expect(await sent(name, `{ ${field}: ${literal} }`)).toEqual({
        [field]: value,
      });
    },
  );

  it("covers every nullable field of every pinned mutation's input", () => {
    for (const name of Object.keys(MUTATIONS)) {
      const inputs = nullableInputs(schema, name);
      expect(inputs, `${name} has no nullable input object`).toHaveLength(1);
      const declared = Object.entries(inputs[0]?.getFields() ?? {})
        .filter(([, f]) => !isNonNullType(f.type))
        .map(([f]) => f)
        .sort();
      const pinned = FIELDS.filter(([m]) => m === name)
        .map(([, f]) => f)
        .sort();
      expect(pinned, `${name}(${inputs[0]?.name})`).toEqual(declared);
    }
  });

  it("every mutation taking a nullable-field input is pinned or classified", () => {
    const candidates = discoverPatchCandidates(schema);
    // Not vacuous: the discovery finds the pinned mutations themselves.
    expect(candidates).toEqual(expect.arrayContaining(Object.keys(MUTATIONS)));
    expect(unclassified(schema)).toEqual([]);
    // No stale classification, and nothing update-shaped classified away.
    for (const name of Object.keys(NOT_PATCHES)) {
      expect(candidates, `NOT_PATCHES.${name} is stale`).toContain(name);
      expect(name).not.toMatch(LOOKS_LIKE_A_PATCH);
      for (const input of nullableInputs(schema, name)) {
        expect(input.name, name).not.toMatch(PATCH_INPUT);
      }
      expect(name in MUTATIONS, `${name} is both pinned and classified`).toBe(
        false,
      );
    }
  });

  it("negative control: a new update mutation with no policy is reported", () => {
    const extended = extendSchema(
      schema,
      parse(`
        input UpdateWidgetInput { label: String, colour: String }
        extend type Mutation {
          updateWidget(id: ID!, input: UpdateWidgetInput!): Boolean
        }
      `),
    );
    expect(unclassified(extended)).toEqual(["updateWidget"]);
  });

  it("enrichPlaceFromGoogle with no input, or a null one, sends an empty patch", async () => {
    expect(await sent("enrichPlaceFromGoogle", null)).toEqual({});
    expect(await sent("enrichPlaceFromGoogle", "null")).toEqual({});
  });
});
