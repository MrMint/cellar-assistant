/**
 * `fetchDefaults` on a deployment with no AI provider (N07, D25).
 *
 * The session row `confirm` reads is written by `startItemOnboarding`, so the
 * call has to be made even where label reading is known to be unavailable —
 * a client that skipped it left every bottle on such a deployment
 * unsaveable. What changes there is only what the person is told: nothing.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Client } from "urql";
import { createActor, toPromise } from "xstate";
import { fetchDefaults } from "./actors/fetchDefaults";
import type { DefaultValuesResult } from "./actors/types";

const nameOf = (document: unknown): string =>
  (document as { definitions: { name?: { value: string } }[] }).definitions[0]
    ?.name?.value ?? "?";

/** A client whose one mutation answers `startItemOnboarding` with `answer`. */
const stub = (answer: Record<string, unknown>) => {
  const mutations: string[] = [];
  const client = {
    mutation: (document: unknown) => {
      mutations.push(nameOf(document));
      return {
        toPromise: async () => ({ data: { startItemOnboarding: answer } }),
      };
    },
    query: () => ({
      toPromise: async () => ({
        data: {
          me: {
            __typename: "Viewer",
            id: "u1",
            aiCapabilities: {
              __typename: "AiCapabilities",
              semanticSearch: false,
              imageSearch: false,
              labelRead: false,
              menuScan: false,
              recipePhoto: false,
              tierListInsights: false,
            },
          },
        },
      }),
    }),
  } as unknown as Client;
  return { client, mutations };
};

const run = (client: Client): Promise<DefaultValuesResult> =>
  toPromise(
    createActor(fetchDefaults, {
      input: {
        urqlClient: client,
        itemType: "WINE",
        itemOnboardingId: "00000000-0000-4000-8000-000000000001",
        frontLabelFileId: "00000000-0000-4000-8000-000000000002",
      },
    }).start(),
  );

const refusal = (reason: string, code: string) => ({
  __typename: code === "VALIDATION" ? "ValidationError" : "ConflictError",
  code,
  reason,
  retryAt: null,
  message:
    "no AI provider is configured … Set AI_PROVIDER=ollama for a local model",
});

describe("fetchDefaults with no AI provider", () => {
  test("still starts the session confirm needs, and says nothing", async () => {
    const { client, mutations } = stub(refusal("AI_UNCONFIGURED", "CONFLICT"));
    const result = await run(client);
    assert.deepEqual(mutations, ["StartItemOnboarding"]);
    assert.equal(result.extractionError, undefined);
    assert.equal(result.confidence, 0);
  });

  test("a label that could not be read is still explained, in mapped words", async () => {
    const { client } = stub(refusal("NOTHING_READ", "VALIDATION"));
    const result = await run(client);
    assert.equal(result.extractionError?.kind, "nothing-read");
    assert.doesNotMatch(
      `${result.extractionError?.title} ${result.extractionError?.message}`,
      /AI_PROVIDER|ollama/,
    );
  });
});
