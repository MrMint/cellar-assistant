/**
 * `ActorError.code` is the `ActorErrorCode` enum, built from the contracts'
 * `ACTOR_ERROR_CODES`, and that is safe to serialise.
 *
 * It was a `String!` documented as "NOT_FOUND | FORBIDDEN | …" — a comment,
 * which gql.tada cannot read, so every client comparison against a code was
 * an untyped string compare. As an enum the client gets the five literals.
 *
 * Two things are pinned here because they are what make the change safe, and
 * one because it is what makes it *not* purely additive:
 *
 * 1. The enum's values are exactly the contracts' constant, so the SDL cannot
 *    grow or lose a code the actors do not throw.
 * 2. Every code serialises. An enum field throws on a value it does not know,
 *    so this would turn a typed error into a masked one if any path could
 *    hand it a stray string. None can — `parseActorErrorPayload` refuses an
 *    envelope whose code is not in the list — but that is a claim about
 *    another package, so it is exercised end to end here.
 * 3. **Not additive for one shape of document.** Two fields with one response
 *    name in one selection set must have the same type even on disjoint
 *    object types (OverlappingFieldsCanBeMerged), and `Barcode.code` and
 *    `LinkedBarcodeItem.code` are `String!`. A document selecting `code` on
 *    both a barcode branch and an error branch was valid and is now refused.
 *    The client aliases its barcode side (`barcodeCode: code`, in
 *    `services/client/src/lib/api/items.ts`); this test keeps the rule visible
 *    to the next person who wonders why.
 */
import {
  ACTOR_ERROR_CODES,
  type ActorErrorCode,
  actorErrorForCode,
} from "@cellar-assistant/contracts";
import {
  execute,
  getNamedType,
  isEnumType,
  isNonNullType,
  isObjectType,
  parse,
  validate,
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

describe("ActorErrorCode", () => {
  it("is exactly the contracts' ACTOR_ERROR_CODES", () => {
    const type = schema.getType("ActorErrorCode");
    if (!isEnumType(type)) throw new Error("ActorErrorCode is not an enum");
    expect(
      type
        .getValues()
        .map((value) => value.value)
        .sort(),
    ).toEqual([...ACTOR_ERROR_CODES].sort());
  });

  it("types `code` on the interface and on every implementation", () => {
    const actorError = schema.getType("ActorError");
    if (actorError === undefined) throw new Error("no ActorError");
    const holders = [
      actorError,
      ...schema.getPossibleTypes(
        actorError as Parameters<typeof schema.getPossibleTypes>[0],
      ),
    ];
    expect(holders.length).toBe(6);
    for (const holder of holders) {
      if (!("getFields" in holder)) throw new Error(`${holder.name}?`);
      const field = holder.getFields().code;
      expect(field, holder.name).toBeDefined();
      expect(isNonNullType(field?.type), holder.name).toBe(true);
      expect(getNamedType(field?.type)?.name, holder.name).toBe(
        "ActorErrorCode",
      );
    }
  });

  it.each(
    ACTOR_ERROR_CODES,
  )("serialises %s through a result union as its own name", async (code: ActorErrorCode) => {
    const { invoke } = stubSidecar({
      "PingActor.ping": () => {
        throw actorErrorForCode(code, `refused: ${code}`);
      },
    });
    const result = await execute({
      schema,
      document: parse(
        `mutation { ping { __typename ... on ActorError { code reason message } } }`,
      ),
      contextValue: testContext(invoke, viewer),
    });
    expect(result.errors).toBeUndefined();
    expect(result.data?.ping).toMatchObject({
      code,
      reason: null,
      message: `refused: ${code}`,
    });
  });
});

describe("the one document shape the enum makes invalid", () => {
  const barcodeTypes = ["Barcode", "LinkedBarcodeItem"] as const;

  it("is still the only shape: no other success type has a `code`", () => {
    // If a third type grows a `code: String!`, its documents hit the same
    // wall — this names them so the alias can be applied before a page breaks.
    const withCode = Object.values(schema.getTypeMap())
      .filter(isObjectType)
      .filter((type) => !type.name.startsWith("__"))
      .filter((type) => {
        const field = type.getFields().code;
        return (
          field !== undefined &&
          getNamedType(field.type)?.name !== "ActorErrorCode"
        );
      })
      .map((type) => type.name)
      .sort();
    expect(withCode).toEqual([...barcodeTypes]);
  });

  it("refuses an unaliased barcode code beside an error code", () => {
    const refused = validate(
      schema,
      parse(`query { barcode(code: "x") {
        ... on Barcode { code }
        ... on ActorError { code }
      } }`),
    );
    expect(refused.map((error) => error.message).join("\n")).toMatch(
      /Fields "code" conflict/,
    );
  });

  it("accepts it once the barcode side is aliased, as the client does", () => {
    expect(
      validate(
        schema,
        parse(`query { barcode(code: "x") {
          ... on Barcode { barcodeCode: code }
          ... on ActorError { code reason message }
        } }`),
      ),
    ).toEqual([]);
  });
});
