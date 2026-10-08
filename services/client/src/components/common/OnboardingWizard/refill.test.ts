/**
 * The back-label refill rule (X05/N21): a later read fills a field only
 * when the person has not made it their own — empty, or still the earlier
 * read's value. What they typed is never overwritten (E2c).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/add",
}));

const { refillWrites } = await import("./OnboardingItemForm");

describe("refillWrites", () => {
  test("fills empty fields and replaces untouched drafts", () => {
    assert.deepEqual(
      refillWrites(
        { name: "CHATEAU", "attributes.vintage": "" },
        { name: "CHATEAU", "attributes.vintage": "", country: "" },
        {
          name: "Château Margaux",
          "attributes.vintage": "2015",
          country: "FRANCE",
        },
      ),
      {
        name: "Château Margaux",
        "attributes.vintage": "2015",
        country: "FRANCE",
      },
    );
  });

  test("never writes over what the person typed", () => {
    assert.deepEqual(
      refillWrites(
        { name: "CHATEAU" },
        { name: "My own name" },
        { name: "Château Margaux" },
      ),
      {},
    );
  });

  test("a blank proposal, or the value already there, writes nothing", () => {
    assert.deepEqual(
      refillWrites({}, { name: "Ridge" }, { name: "Ridge", region: " " }),
      {},
    );
  });
});
