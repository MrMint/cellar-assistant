/**
 * N09's client half: one idempotency key per creation, reused on a retry.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type CreatePlaceInput, createPlaceMutationInput } from "./actions";

const fields: CreatePlaceInput = {
  name: "  Cork & Barrel  ",
  categories: ["wine_bar"],
  latitude: 43.07,
  longitude: -89.38,
  street_address: " 1 Main St ",
  country_code: "us",
  website: "corkbarrel.example",
  description: "",
};

describe("createPlaceMutationInput", () => {
  test("uses the caller's placeId, so a retry is the same creation", () => {
    const placeId = "6f1c1a52-6a8f-4c43-9d4f-0a8e4a0f5b11";
    let minted = 0;
    const mint = () => {
      minted += 1;
      return "should-not-be-used";
    };
    const first = createPlaceMutationInput({ ...fields, placeId }, mint);
    const retry = createPlaceMutationInput(
      { ...fields, placeId, description: "edited while waiting" },
      mint,
    );
    assert.equal(first.placeId, placeId);
    assert.equal(retry.placeId, placeId);
    assert.equal(minted, 0);
  });

  test("mints one only when the caller has none", () => {
    const input = createPlaceMutationInput(fields, () => "minted-id");
    assert.equal(input.placeId, "minted-id");
  });

  test("trims, nulls blanks, upper-cases the country and normalises the website", () => {
    const input = createPlaceMutationInput(fields, () => "id");
    assert.equal(input.name, "Cork & Barrel");
    assert.equal(input.streetAddress, "1 Main St");
    assert.equal(input.description, null);
    assert.equal(input.countryCode, "US");
    assert.equal(input.website, "https://corkbarrel.example/");
    assert.deepEqual(input.location, { lat: 43.07, lng: -89.38 });
  });
});
