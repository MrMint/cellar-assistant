/**
 * "Finish later" (MC-drafts, DECISIONS 34): what `saveDraft` is sent.
 *
 * - It sends this session's onboarding and the chosen cellar, and nothing
 *   else is written: no confirm, no bottle.
 * - A refusal (someone else's draft, a cellar the viewer cannot write) is an
 *   error, never a "saved".
 * - A guess is confirmed only once touched; "No vintage" is its own answer;
 *   a beer is never asked for a vintage.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ItemFormValues } from "@/components/item/ItemForm";
import { formLayout } from "@/components/item/itemFormLayout";
import {
  asksVintage,
  confirmedFieldsFrom,
  differsFrom,
  isDuplicateOfDeclined,
  openFloorPaths,
  type SaveDraft,
  saveOnboardingDraft,
  vintageAnswerFor,
} from "./draft-save";
import { SaveDraftMutation } from "./queries";

const nameOf = (document: unknown): string =>
  (document as { definitions: { name?: { value: string } }[] }).definitions[0]
    ?.name?.value ?? "?";

type Sent = { name: string; variables: Record<string, unknown> };

const stub = (answer: Record<string, unknown>) => {
  const sent: Sent[] = [];
  // The executor of `useMutation(SaveDraftMutation)`: the only write the
  // helper can reach, so anything else it tried would not compile.
  const client: SaveDraft = async (variables) => {
    sent.push({
      name: nameOf(SaveDraftMutation),
      variables: variables as unknown as Record<string, unknown>,
    });
    return { data: { saveDraft: answer } as never };
  };
  return { client, sent };
};

const wine = (vintage: string): ItemFormValues => ({
  name: "Demo Red",
  description: "",
  country: "",
  attributes: { vintage, style: "" },
});

const saved = {
  __typename: "ItemOnboarding",
  id: "onb-1",
  status: "NEEDS_DETAILS",
  cellarId: "cellar-mine",
  confirmedFields: [],
  vintageAnswer: "UNANSWERED",
};

describe("saveOnboardingDraft", () => {
  test("sends only saveDraft, for this onboarding and the chosen cellar", async () => {
    const { client, sent } = stub(saved);
    await saveOnboardingDraft({
      save: client,
      type: "WINE",
      onboardingId: "onb-1",
      cellarId: "cellar-mine",
      values: wine(""),
      brandName: "Demo Winery",
      guessed: ["name", "brandName"],
      touched: new Set(["name"]),
    });
    assert.deepEqual(
      sent.map((call) => call.name),
      ["SaveOnboardingDraft"],
    );
    const input = sent[0]?.variables.input as Record<string, unknown>;
    assert.equal(input.onboardingId, "onb-1");
    assert.equal(input.cellarId, "cellar-mine");
    assert.deepEqual(input.confirmedFields, ["name"]);
    assert.equal(input.vintageAnswer, "UNANSWERED");
    assert.deepEqual(input.fields, {
      name: "Demo Red",
      brandName: "Demo Winery",
      attributes: (input.fields as { attributes: unknown }).attributes,
    });
  });

  test("a cellar or draft that is not yours is refused, never reported saved", async () => {
    const { client } = stub({
      __typename: "NotFoundError",
      code: "NOT_FOUND",
      reason: null,
      retryAt: null,
      message: "cellar not found",
    });
    await assert.rejects(
      saveOnboardingDraft({
        save: client,
        type: "WINE",
        onboardingId: "someone-elses",
        cellarId: "not-my-cellar",
        values: wine(""),
        brandName: "",
        guessed: [],
        touched: new Set(),
      }),
      /isn't yours/,
    );
  });

  test("no answer at all is not a save either", async () => {
    const client: SaveDraft = async () => ({ data: undefined });
    await assert.rejects(
      saveOnboardingDraft({
        save: client,
        type: "BEER",
        onboardingId: "onb-1",
        cellarId: null,
        values: wine(""),
        brandName: "",
        guessed: [],
        touched: new Set(),
      }),
    );
  });
});

describe("confirmedFieldsFrom", () => {
  test("an untouched guess is not confirmed", () => {
    assert.deepEqual(
      confirmedFieldsFrom(
        ["name", "attributes.vintage", "brandName"],
        new Set(["attributes.vintage"]),
      ),
      ["vintage"],
    );
  });
  test("touching a field the read did not fill confirms nothing", () => {
    assert.deepEqual(confirmedFieldsFrom(["name"], new Set(["country"])), []);
  });
});

describe("vintageAnswerFor", () => {
  test("No vintage is stored as its own answer", () => {
    assert.equal(vintageAnswerFor("WINE", wine("NV")), "NON_VINTAGE");
    assert.equal(vintageAnswerFor("WINE", wine("2019")), "VINTAGE");
    assert.equal(vintageAnswerFor("WINE", wine("")), "UNANSWERED");
  });
  test("a beer is never asked, whatever its form holds", () => {
    assert.equal(vintageAnswerFor("BEER", wine("2019")), "UNANSWERED");
    assert.equal(asksVintage("BEER", "vintage"), false);
    assert.equal(asksVintage("WINE", "vintage"), true);
  });
});

describe("the floor and the duplicate warning", () => {
  const layout = formLayout("WINE", "create");
  test("an untouched guess leaves its floor field open", () => {
    const flat = { name: "Demo Red", "attributes.vintage": "2019" };
    const open = openFloorPaths(
      layout,
      flat,
      new Set(["name", "attributes.vintage"]),
      new Set(["name"]),
    );
    assert.ok(open.includes("attributes.vintage"));
    assert.ok(!open.includes("name"));
  });
  test("the same name and maker after Not this is a duplicate", () => {
    const declined = { name: "Demo Red", brandName: "Demo Winery" };
    assert.equal(
      isDuplicateOfDeclined(declined, " demo  red", "DEMO WINERY"),
      true,
    );
    assert.equal(isDuplicateOfDeclined(declined, "Demo Red", "Other"), false);
    assert.equal(isDuplicateOfDeclined(undefined, "Demo Red", ""), false);
  });
  test("a different drink needs one field besides name and maker", () => {
    const before = { name: "A", brandName: "B", "attributes.style": "" };
    assert.equal(differsFrom(before, { ...before, name: "C" }), false);
    assert.equal(
      differsFrom(before, { ...before, "attributes.style": "Red" }),
      true,
    );
  });
});
