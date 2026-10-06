/**
 * `referenceData` — GraphQL execution against a stub sidecar (A9).
 *
 * Complements `services/actors/src/actors/reference-data-actor.test.ts` (which
 * proves the actor against real Postgres for all ten kinds): this proves the
 * GraphQL-facing half — the `ReferenceKind` enum maps onto the actor id
 * `ReferenceDataActor` expects, and the result comes back as a connection.
 */
import { execute, parse, validate } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

/**
 * Validates before executing, deliberately.
 *
 * `execute` on its own is **lenient about abstract types**: it resolves the
 * runtime type first and then collects fields against *that*, so a selection
 * written directly on a union still returns data here while Yoga — which
 * validates — rejects it outright. Without this call, giving `referenceData`
 * an errors union (A7c (6)) would have left both tests below green against a
 * document no client can send.
 */
const run = (document: string, context: ReturnType<typeof testContext>) => {
  const parsed = parse(document);
  const errors = validate(schema, parsed);
  if (errors.length > 0) {
    throw new Error(`invalid document: ${errors.map(String).join("; ")}`);
  }
  return execute({ schema, document: parsed, contextValue: context });
};

describe("referenceData (A9)", () => {
  it("maps the GraphQL enum onto the actor id ReferenceDataActor is keyed by", async () => {
    const { invoke, calls } = stubSidecar({
      "ReferenceDataActor.all": () => [
        { value: "FRANCE", comment: null },
        { value: "ITALY", comment: "boot-shaped" },
      ],
    });
    const result = await run(
      `{
        referenceData(kind: COUNTRY, first: 10) {
          ... on ReferenceRowConnection {
            totalCount
            edges { node { value comment } }
          }
        }
      }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.referenceData).toEqual({
      totalCount: 2,
      edges: [
        { node: { value: "FRANCE", comment: null } },
        { node: { value: "ITALY", comment: "boot-shaped" } },
      ],
    });
    expect(calls[0]).toMatchObject({
      actorType: "ReferenceDataActor",
      actorId: "country",
      method: "all",
    });
  });

  it("pages the actor's in-memory list rather than returning it unbounded", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      value: `V${i}`,
      comment: null,
    }));
    const { invoke } = stubSidecar({
      "ReferenceDataActor.all": () => rows,
    });
    const result = await run(
      `{ referenceData(kind: WINE_VARIETY, first: 2) {
           ... on ReferenceRowConnection {
             pageInfo { hasNextPage }
             edges { cursor node { value } }
           }
         } }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.referenceData).toMatchObject({
      pageInfo: { hasNextPage: true },
      edges: [{ node: { value: "V0" } }, { node: { value: "V1" } }],
    });
  });
});

/* -------------------------------------------------------------------------- */
/* A7c (6) — the ten-alias form                                                */
/* -------------------------------------------------------------------------- */

describe("the page cap does not take the rest of the document down (A7c)", () => {
  it("returns a typed error on the bad alias and data on the other nine", async () => {
    const { invoke } = stubSidecar({
      "ReferenceDataActor.all": (actorId) => [
        { value: actorId.toUpperCase(), comment: null },
      ],
    });
    // `country` has 197 rows; asking for all of them in one page is exactly
    // what a form filling ten dropdowns does, and it used to answer
    // `data: null` for the whole document.
    const result = await run(
      `{
        country: referenceData(kind: COUNTRY, first: 197) {
          __typename ... on ActorError { code message }
        }
        wineStyle: referenceData(kind: WINE_STYLE, first: 10) {
          __typename ... on ReferenceRowConnection { edges { node { value } } }
        }
        beerStyle: referenceData(kind: BEER_STYLE, first: 10) {
          __typename ... on ReferenceRowConnection { totalCount }
        }
      }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.country).toEqual({
      __typename: "ValidationError",
      code: "VALIDATION",
      message: "first must be at most 100, got 197",
    });
    expect(result.data?.wineStyle).toEqual({
      __typename: "ReferenceRowConnection",
      edges: [{ node: { value: "WINE_STYLE" } }],
    });
    expect(result.data?.beerStyle).toEqual({
      __typename: "ReferenceRowConnection",
      totalCount: 1,
    });
  });
});
