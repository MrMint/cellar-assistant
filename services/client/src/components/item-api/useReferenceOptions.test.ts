import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { referenceFetching } from "./useReferenceOptions";

describe("referenceFetching — the country list is not complete at 100", () => {
  const idle = { fetching: false, fetchingMore: false };

  test("the render where page one lands, before page two reports fetching", () => {
    assert.equal(
      referenceFetching({ ...idle, nextCursor: "c100", moreArrived: false }),
      true,
    );
  });

  test("done once page two has arrived (or failed)", () => {
    assert.equal(
      referenceFetching({ ...idle, nextCursor: "c100", moreArrived: true }),
      false,
    );
  });

  test("done when there is no second page", () => {
    assert.equal(
      referenceFetching({ ...idle, nextCursor: null, moreArrived: false }),
      false,
    );
  });

  test("either query's own fetching still counts", () => {
    assert.equal(
      referenceFetching({
        fetching: true,
        fetchingMore: false,
        nextCursor: null,
        moreArrived: false,
      }),
      true,
    );
    assert.equal(
      referenceFetching({
        fetching: false,
        fetchingMore: true,
        nextCursor: "c100",
        moreArrived: true,
      }),
      true,
    );
  });
});
