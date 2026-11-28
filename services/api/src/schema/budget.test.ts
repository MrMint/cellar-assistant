/**
 * SV-A — `myAiQuota` (MC-quota). Against a stub sidecar, like the other
 * schema tests: this proves the field reaches `BudgetActor.myQuota` with the
 * viewer's own ctx and no user id of its own, and marshals the result. That
 * the actor counts only the viewer's rows is `budget-actor.test.ts`.
 */
import type { AiQuotaDto, PageArgs } from "@cellar-assistant/contracts";
import { BUDGET_ACTOR_ID, offsetPage } from "@cellar-assistant/contracts";
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

const QUERY = `{ myAiQuota(first: 20) {
  __typename
  ... on AiQuotaConnection { edges { node { kind used limit resetsAt } } }
  ... on Error { message }
} }`;

const quotas: AiQuotaDto[] = [
  {
    kind: "ai_model/tier_list_insights",
    used: 3,
    limit: 1500,
    resetsAt: "2026-12-01T00:00:00.000Z",
  },
];

describe("myAiQuota (SV-A)", () => {
  it("reads the viewer's own allowance from the BudgetActor singleton", async () => {
    const { invoke, calls } = stubSidecar({
      "BudgetActor.myQuota": (_id, _ctx, page) =>
        offsetPage(quotas, page as PageArgs),
    });
    const result = await run(QUERY, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();
    expect(result.data?.myAiQuota).toEqual({
      __typename: "AiQuotaConnection",
      edges: [{ node: quotas[0] }],
    });
    // One call, the singleton, with the viewer's own ctx and the page as its
    // only arguments: there is no user id for a client to put anywhere.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      actorType: "BudgetActor",
      actorId: BUDGET_ACTOR_ID,
      method: "myQuota",
      args: [{ viewerId: viewer.id, kind: "user" }, { first: 20 }],
    });
    expect(calls[0]?.args).toHaveLength(2);
  });

  it("refuses a signed-out caller before reaching the actor", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(QUERY, testContext(invoke));
    expect(result.data?.myAiQuota).toMatchObject({
      __typename: "ForbiddenError",
    });
    expect(calls).toEqual([]);
  });

  it("F-230: carries Google Places' allowance as its own row, with its service", async () => {
    const rows: AiQuotaDto[] = [
      ...quotas,
      {
        kind: "google_places",
        used: 12,
        limit: 5000,
        resetsAt: "2026-12-01T00:00:00.000Z",
      },
    ];
    const { invoke } = stubSidecar({
      "BudgetActor.myQuota": (_id, _ctx, page) =>
        offsetPage(rows, page as PageArgs),
    });
    const result = await run(
      `{ myAiQuota(first: 20) { ... on AiQuotaConnection {
        edges { node { kind service used limit } } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.myAiQuota).toEqual({
      edges: [
        {
          node: {
            kind: "ai_model/tier_list_insights",
            service: "AI_MODEL",
            used: 3,
            limit: 1500,
          },
        },
        {
          node: {
            kind: "google_places",
            service: "GOOGLE_PLACES",
            used: 12,
            limit: 5000,
          },
        },
      ],
    });
  });

  it("takes no argument naming a user", () => {
    const field = schema.getQueryType()?.getFields().myAiQuota;
    expect(field?.args.map((a) => a.name).sort()).toEqual(
      ["after", "before", "first", "last"].sort(),
    );
  });
});
