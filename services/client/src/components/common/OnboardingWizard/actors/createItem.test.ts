import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Client } from "urql";
import { emptyFormValues } from "../adapter";
import { createOnboardedItem } from "./createItem";

/** A urql client that records each operation's variables and answers the
 * confirm and the readback poll, so the confirm input can be inspected. */
const recordingClient = () => {
  const sent: { kind: string; variables: Record<string, unknown> }[] = [];
  const reply = (data: unknown) => ({
    toPromise: async () => ({ data }),
  });
  const client = {
    mutation: (_doc: unknown, variables: Record<string, unknown>) => {
      sent.push({ kind: "mutation", variables });
      return reply({
        confirmItemOnboarding: {
          __typename: "ConfirmedItemOnboarding",
          itemId: "11111111-1111-4111-8111-111111111111",
          cellarItemId: null,
        },
      });
    },
    query: (_doc: unknown, variables: Record<string, unknown>) => {
      sent.push({ kind: "query", variables });
      return reply({ item: { __typename: "QueryItemSuccess" } });
    },
  } as unknown as Client;
  return { client, sent };
};

describe("createOnboardedItem", () => {
  test("F-54: the confirm asks the server to file no bottle (cellarId: null)", async () => {
    const { client, sent } = recordingClient();
    const values = { ...emptyFormValues(), name: "Demo Red" };
    await createOnboardedItem({
      urqlClient: client,
      type: "WINE",
      onboardingId: "22222222-2222-4222-8222-222222222222",
      values,
      brandName: "",
      barcode: "",
    });
    const confirm = sent.find((op) => op.kind === "mutation");
    const input = confirm?.variables.input as Record<string, unknown>;
    // Absent would let confirm fall back to the saved draft's cellar and file
    // a bottle there while the machine files its own: two bottles.
    assert.equal("cellarId" in input, true);
    assert.equal(input.cellarId, null);
  });
});
