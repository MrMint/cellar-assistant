/**
 * The brand schema, executed against a stub sidecar (B3).
 *
 * `services/actors/src/actors/brand-actor.test.ts` and
 * `brand-registry-actor.test.ts` prove the behaviour against real Postgres —
 * viewer gating, the create/update tripwire, the 50-concurrent-resolve
 * convergence. This file proves the half that lives here: that `brand` reads
 * through `BrandActor.get`, that `resolveBrand`/`updateBrand`/`setBrandParent`
 * are one actor call each with `ctx` bound and the arguments after it, that a
 * typed actor error lands on the `<Command>Result` union (§8.3), and — the
 * one thing worth a dedicated assertion — that there is no `createBrand`
 * field, because §2.1 makes `BrandRegistryActor.resolve` the only creation
 * path a client has.
 */
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@cellar-assistant/contracts";
import { execute, isNonNullType, isUnionType, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};
const adminViewer = { ...viewer, role: "admin" as const };

const BRAND_ID = "22222222-2222-4222-8222-222222222222";
const PARENT_ID = "33333333-3333-4333-8333-333333333333";

const brand = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: BRAND_ID,
  name: "Château Test",
  description: null,
  logoUrl: null,
  brandType: null,
  parentBrandId: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  ...overrides,
});

describe("brand query", () => {
  it("resolves through BrandActor.get, ctx first", async () => {
    const { invoke, calls } = stubSidecar({
      "BrandActor.get": () => brand(),
    });
    const result = await run(
      `{ brand(id: "${BRAND_ID}") {
           __typename
           ... on Brand { id name description parentBrandId }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.brand).toEqual({
      __typename: "Brand",
      id: BRAND_ID,
      name: "Château Test",
      description: null,
      parentBrandId: null,
    });
    expect(calls[0]).toMatchObject({
      actorType: "BrandActor",
      actorId: BRAND_ID,
      method: "get",
    });
    expect(calls[0]?.args[0]).toMatchObject({
      viewerId: viewer.id,
      kind: "user",
    });
  });

  /**
   * **A7g, and the assertion `brand.ts`'s doc comment says is here.**
   *
   * The union is only useful if a typed actor error actually lands in it, and
   * for this one field that is a chain of three assumptions rather than the
   * usual one: `Brand` is a `loadableObject`, so the resolver returns an *id*
   * and the `BrandActor.get` happens inside the DataLoader; `loadBrands`
   * *returns* the `Error` rather than throwing it; and only the plugin order
   * in `builder.ts` (`ErrorsPlugin` before `DataloaderPlugin`) puts the
   * resulting rejection in the field's error union rather than at the top
   * level. Any one of the three changing turns a `NotFoundError` back into
   * `data: null`, which is the shape D4 complained about — so this drives the
   * failing path instead of trusting it.
   */
  it("puts a NotFoundError from the loader on QueryBrandResult, not at the top level", async () => {
    const { invoke } = stubSidecar({
      "BrandActor.get": () => {
        throw new NotFoundError(`BrandActor(${BRAND_ID}) has no row`);
      },
    });
    const result = await run(
      `{ brand(id: "${BRAND_ID}") {
           __typename
           ... on Brand { id }
           ... on ActorError { code message }
         } }`,
      testContext(invoke, viewer),
    );
    // The whole point: no top-level error and no `data: null`.
    expect(result.errors).toBeUndefined();
    expect(result.data?.brand).toEqual({
      __typename: "NotFoundError",
      code: "NOT_FOUND",
      message: `BrandActor(${BRAND_ID}) has no row`,
    });
  });

  it("puts an anonymous caller's ForbiddenError on the same union", async () => {
    const { invoke } = stubSidecar({
      "BrandActor.get": () => {
        throw new ForbiddenError("sign in to view brand catalog data");
      },
    });
    const result = await run(
      `{ brand(id: "${BRAND_ID}") {
           __typename
           ... on ActorError { code }
         } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.brand).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
    });
  });

  it("is a result union like every other Query.x(id:) (A7g)", () => {
    // D4's finding was a schema-shape one — "the only `Query.x(id:)` that is
    // not a result union" — so it is checked as one, independently of any
    // resolver behaviour above.
    const field = schema.getQueryType()?.getFields().brand;
    const type = field?.type;
    const named = isNonNullType(type) ? type.ofType : type;
    expect(isUnionType(named)).toBe(true);
    expect(
      isUnionType(named)
        ? named
            .getTypes()
            .map((member) => member.name)
            .sort()
        : [],
    ).toEqual([
      "Brand",
      "BudgetExceededError",
      "ConflictError",
      "ForbiddenError",
      "NotFoundError",
      "ValidationError",
    ]);
  });
});

describe("resolveBrand mutation", () => {
  it("keys BrandRegistryActor by the normalized name and passes the raw name through", async () => {
    const { invoke, calls } = stubSidecar({
      "BrandRegistryActor.resolve": () => brand({ name: "Château Test" }),
    });
    const result = await run(
      `mutation { resolveBrand(name: "  Château Test  ") {
         __typename ... on Brand { id name }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.resolveBrand).toEqual({
      __typename: "Brand",
      id: BRAND_ID,
      name: "Château Test",
    });
    expect(calls[0]).toMatchObject({
      actorType: "BrandRegistryActor",
      // normalizeBrandName("  Château Test  ") — lower + trim.
      actorId: "château test",
      method: "resolve",
    });
    // The un-normalized name is still what BrandRegistryActor.resolve sees —
    // it does its own trimming (§2.1).
    expect(calls[0]?.args[1]).toBe("  Château Test  ");
  });

  it("maps a ConflictError from the tripwire onto the ResolveBrandResult union", async () => {
    const { invoke } = stubSidecar({
      "BrandRegistryActor.resolve": () => {
        throw new ConflictError('a brand named "x" already exists');
      },
    });
    const result = await run(
      `mutation { resolveBrand(name: "x") {
         __typename ... on Brand { id } ... on ConflictError { message }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.resolveBrand).toEqual({
      __typename: "ConflictError",
      message: 'a brand named "x" already exists',
    });
  });

  it("maps a ForbiddenError (anonymous caller) onto the result union", async () => {
    const { invoke } = stubSidecar({
      "BrandRegistryActor.resolve": () => {
        throw new ForbiddenError("sign in to resolve a brand");
      },
    });
    const result = await run(
      `mutation { resolveBrand(name: "x") {
         __typename ... on ForbiddenError { code message }
       } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.resolveBrand).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
      message: "sign in to resolve a brand",
    });
  });
});

describe("updateBrand mutation", () => {
  it("passes the input through to BrandActor.update as an admin call", async () => {
    const { invoke, calls } = stubSidecar({
      "BrandActor.update": () => brand({ description: "updated" }),
    });
    const result = await run(
      `mutation {
         updateBrand(id: "${BRAND_ID}", input: { description: "updated" }) {
           __typename ... on Brand { id description }
         }
       }`,
      testContext(invoke, adminViewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBrand).toEqual({
      __typename: "Brand",
      id: BRAND_ID,
      description: "updated",
    });
    expect(calls[0]).toMatchObject({
      actorType: "BrandActor",
      actorId: BRAND_ID,
      method: "update",
    });
    expect(calls[0]?.args[0]).toMatchObject({ kind: "admin" });
    expect(calls[0]?.args[1]).toEqual({
      name: undefined,
      description: "updated",
      logoUrl: undefined,
      brandType: undefined,
    });
  });

  it("maps a non-admin's ForbiddenError onto UpdateBrandResult", async () => {
    const { invoke } = stubSidecar({
      "BrandActor.update": () => {
        throw new ForbiddenError(`only an admin may update brand ${BRAND_ID}`);
      },
    });
    const result = await run(
      `mutation {
         updateBrand(id: "${BRAND_ID}", input: { description: "nope" }) {
           __typename ... on ForbiddenError { code }
         }
       }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBrand).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
    });
  });
});

describe("setBrandParent mutation", () => {
  it("passes a provided parent id through", async () => {
    const { invoke, calls } = stubSidecar({
      "BrandActor.setParent": () => brand({ parentBrandId: PARENT_ID }),
    });
    const result = await run(
      `mutation {
         setBrandParent(id: "${BRAND_ID}", parentBrandId: "${PARENT_ID}") {
           __typename ... on Brand { parentBrandId }
         }
       }`,
      testContext(invoke, adminViewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.setBrandParent).toEqual({
      __typename: "Brand",
      parentBrandId: PARENT_ID,
    });
    expect(calls[0]?.args[1]).toBe(PARENT_ID);
  });

  it("passes null through when no parent id is given, to clear it", async () => {
    const { invoke, calls } = stubSidecar({
      "BrandActor.setParent": () => brand({ parentBrandId: null }),
    });
    const result = await run(
      `mutation {
         setBrandParent(id: "${BRAND_ID}") {
           __typename ... on Brand { parentBrandId }
         }
       }`,
      testContext(invoke, adminViewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.setBrandParent).toEqual({
      __typename: "Brand",
      parentBrandId: null,
    });
    expect(calls[0]?.args[1]).toBeNull();
  });
});

describe("no direct create path (§2.1)", () => {
  it("declares no createBrand field — resolveBrand is the only way to create one", () => {
    const mutationFields = schema.getMutationType()?.getFields() ?? {};
    expect(Object.keys(mutationFields)).toContain("resolveBrand");
    expect(Object.keys(mutationFields)).not.toContain("createBrand");
  });
});
