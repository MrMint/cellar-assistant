import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DRAFT_SOURCE_LABEL,
  draftedPaths,
  flattenFormValues,
  isDrafted,
} from "./ai-draft.ts";

const draft = {
  name: "Château Margaux",
  description: "",
  country: "FRANCE",
  attributes: { vintage: "2015", style: "RED" },
};

describe("flattenFormValues", () => {
  test("nested records become react-hook-form paths; non-text is ignored", () => {
    assert.deepEqual(
      flattenFormValues({
        name: "X",
        attributes: { vintage: "2015", nested: { deep: "y" } },
        categories: ["bar"],
        count: 3,
      }),
      {
        name: "X",
        "attributes.vintage": "2015",
        "attributes.nested.deep": "y",
      },
    );
    assert.deepEqual(flattenFormValues(null), {});
    assert.deepEqual(flattenFormValues("text"), {});
  });
});

describe("draftedPaths (N19: mark by diffing the draft against the form)", () => {
  test("untouched drafted values are marked; blanks in the draft are not", () => {
    assert.deepEqual([...draftedPaths(draft, draft)].sort(), [
      "attributes.style",
      "attributes.vintage",
      "country",
      "name",
    ]);
  });

  test("a value the person changed or cleared loses its mark", () => {
    const now = {
      ...draft,
      name: "Pavillon Rouge",
      attributes: { vintage: "", style: "RED" },
    };
    assert.deepEqual([...draftedPaths(draft, now)].sort(), [
      "attributes.style",
      "country",
    ]);
  });

  test("a value typed back to the draft's is the draft's again", () => {
    const now = { ...draft, name: "  Château Margaux " };
    assert.ok(draftedPaths(draft, now).has("name"));
  });

  test("a field the form does not hold is not drafted", () => {
    assert.deepEqual([...draftedPaths({ ghost: "x" }, {})], []);
  });

  test("a value typed into a field the draft left blank is the person's", () => {
    const now = { ...draft, description: "Grand vin." };
    assert.ok(!draftedPaths(draft, now).has("description"));
  });
});

describe("isDrafted", () => {
  test("one field", () => {
    assert.equal(isDrafted("Main St", "Main St"), true);
    assert.equal(isDrafted("Main St", "Main Street"), false);
    assert.equal(isDrafted("", ""), false);
    assert.equal(isDrafted(undefined, "x"), false);
    assert.equal(isDrafted("x", null), false);
  });
});

describe("DRAFT_SOURCE_LABEL", () => {
  test("every source has its own words", () => {
    const labels = Object.values(DRAFT_SOURCE_LABEL);
    assert.equal(new Set(labels).size, labels.length);
    assert.equal(DRAFT_SOURCE_LABEL.pin, "From pin");
  });
});
