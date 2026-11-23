/**
 * ux-c L08 — `Item.myBrewPrefs` and `setBrewPrefs` address only the
 * viewer's own `UserActor`; the actor's refusal (another user's prefs and a
 * missing item answer alike — `user-actor.test.ts`) comes back on the union.
 */
import { NotFoundError } from "@cellar-assistant/contracts";
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
const TEA_ID = "33333333-3333-4333-8333-333333333333";
const prefs = {
  item: { type: "TEA" as const, id: TEA_ID },
  waterTempC: 90,
  steepSeconds: null,
  doseGrams: null,
  waterMl: null,
  updatedAt: "2026-11-22T20:00:00.000Z",
};

describe("setBrewPrefs", () => {
  it("writes through the viewer's own UserActor, all four fields given", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.setBrewPrefs": () => prefs,
    });
    const result = await run(
      `mutation { setBrewPrefs(
           itemType: TEA, itemId: "${TEA_ID}", waterTempC: 90) {
           __typename ... on SetBrewPrefsPayload {
             prefs { waterTempC steepSeconds doseGrams waterMl } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const call = calls.find((c) => c.method === "setBrewPrefs");
    expect(call?.actorId).toBe(viewer.id);
    expect(call?.args.slice(1)).toEqual([
      {
        item: { type: "TEA", id: TEA_ID },
        waterTempC: 90,
        steepSeconds: null,
        doseGrams: null,
        waterMl: null,
      },
    ]);
    expect(result.data?.setBrewPrefs).toEqual({
      __typename: "SetBrewPrefsPayload",
      prefs: {
        waterTempC: 90,
        steepSeconds: null,
        doseGrams: null,
        waterMl: null,
      },
    });
  });

  it("a missing item comes back as NotFoundError on the union", async () => {
    const { invoke } = stubSidecar({
      "UserActor.setBrewPrefs": () => {
        throw new NotFoundError(`brew prefs for tea ${TEA_ID} not found`);
      },
    });
    const result = await run(
      `mutation { setBrewPrefs(itemType: TEA, itemId: "${TEA_ID}") {
           __typename ... on ActorError { code } } }`,
      testContext(invoke, viewer),
    );
    expect(result.data?.setBrewPrefs).toEqual({
      __typename: "NotFoundError",
      code: "NOT_FOUND",
    });
  });

  it("refuses a signed-out caller before any actor is asked", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(
      `mutation { setBrewPrefs(itemType: TEA, itemId: "${TEA_ID}") {
           __typename ... on ActorError { code } } }`,
      testContext(invoke, null),
    );
    expect(result.data?.setBrewPrefs).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
    });
    expect(calls).toEqual([]);
  });
});
