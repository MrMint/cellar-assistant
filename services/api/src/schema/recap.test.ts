/**
 * L04 — `Query.recap` / `Query.breadthStamps`: the signed-in viewer's own
 * recap, addressed by nothing but the session (no user argument exists), an
 * anonymous caller refused before any actor call, and the period passed
 * through for the actor to validate.
 */
import type { BreadthStampDto, RecapDto } from "@cellar-assistant/contracts";
import { ValidationError } from "@cellar-assistant/contracts";
import { execute, parse } from "graphql";
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

const stamp: BreadthStampDto = { kind: "REGIONS", count: 6, tier: 5 };
const recap: RecapDto = {
  period: "2026-10",
  timeZone: "Europe/Paris",
  cards: [
    {
      kind: "REGIONS",
      count: 6,
      newCount: 4,
      chips: ["Jura", "Etna"],
      itemTypes: [],
      stamp: null,
    },
    {
      kind: "STAMP",
      count: 6,
      newCount: null,
      chips: [],
      itemTypes: [],
      stamp,
    },
  ],
  stamps: [stamp],
};

const RECAP_QUERY = `query ($period: String!, $tz: String) {
  recap(period: $period, timeZone: $tz) {
    __typename
    ... on Recap {
      period timeZone
      cards { kind count newCount chips itemTypes stamp { kind count tier } }
      stamps { kind count tier }
    }
    ... on Error { message }
  }
}`;

const runRecap = (
  context: ReturnType<typeof testContext>,
  variables: Record<string, unknown>,
) =>
  execute({
    schema,
    document: parse(RECAP_QUERY),
    contextValue: context,
    variableValues: variables,
  });

describe("Query.recap", () => {
  it("reads the viewer's own recap, keyed by the session", async () => {
    const { invoke, calls } = stubSidecar({ "RecapActor.recap": () => recap });
    const result = await runRecap(testContext(invoke, viewer), {
      period: "2026-10",
      tz: "Europe/Paris",
    });
    expect(result.errors).toBeUndefined();
    expect(result.data?.recap).toMatchObject({
      __typename: "Recap",
      period: "2026-10",
      cards: [
        { kind: "REGIONS", count: 6, newCount: 4, chips: ["Jura", "Etna"] },
        { kind: "STAMP", stamp: { kind: "REGIONS", count: 6, tier: 5 } },
      ],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      actorType: "RecapActor",
      actorId: viewer.id,
      method: "recap",
    });
    expect(calls[0]?.args[1]).toEqual({
      period: "2026-10",
      timeZone: "Europe/Paris",
    });
  });

  it("has no argument naming whose recap", () => {
    const field = schema.getQueryType()?.getFields().recap;
    expect(field?.args.map((arg) => arg.name).sort()).toEqual([
      "period",
      "timeZone",
    ]);
  });

  it("refuses an anonymous caller without calling the actor", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await runRecap(testContext(invoke), { period: "2026-10" });
    expect(result.data?.recap).toMatchObject({ __typename: "ForbiddenError" });
    expect(calls).toHaveLength(0);
  });

  it("surfaces the actor's refusal of a bad period as a typed error", async () => {
    const { invoke } = stubSidecar({
      "RecapActor.recap": () => {
        throw new ValidationError("not a recap period");
      },
    });
    const result = await runRecap(testContext(invoke, viewer), {
      period: "nope",
    });
    expect(result.data?.recap).toMatchObject({
      __typename: "ValidationError",
    });
  });
});

describe("Query.breadthStamps", () => {
  it("reads the viewer's stamps", async () => {
    const { invoke, calls } = stubSidecar({
      "RecapActor.stamps": () => [stamp],
    });
    const result = await run(
      `{ breadthStamps { __typename ... on QueryBreadthStampsSuccess { data { kind count tier } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.breadthStamps).toEqual({
      __typename: "QueryBreadthStampsSuccess",
      data: [{ kind: "REGIONS", count: 6, tier: 5 }],
    });
    expect(calls[0]).toMatchObject({
      actorType: "RecapActor",
      actorId: viewer.id,
    });
  });

  it("refuses an anonymous caller", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(
      "{ breadthStamps { __typename } }",
      testContext(invoke),
    );
    expect(result.data?.breadthStamps).toEqual({
      __typename: "ForbiddenError",
    });
    expect(calls).toHaveLength(0);
  });
});
