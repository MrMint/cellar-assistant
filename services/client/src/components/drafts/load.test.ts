/**
 * F-71 · `/needs-details`'s server load presigns a bounded number of draft
 * photos (the first screenful), not one `file(id)` read per draft; the rest
 * are left for each row to read when it scrolls into view.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

mock.module("server-only", () => ({}));

const imageReads: string[] = [];
mock.module("@/lib/api/urql-server", () => ({
  apiServerQuery: async (
    document: { definitions?: { name?: { value?: string } }[] },
    variables: Record<string, unknown>,
  ) => {
    const name = document.definitions?.[0]?.name?.value ?? "";
    if (name === "DraftImage") {
      imageReads.push(String(variables.id));
      return {
        file: {
          __typename: "File",
          id: variables.id,
          url: `u/${variables.id}`,
        },
      };
    }
    // NeedsDetails: 30 drafts, each with a photo.
    return {
      needsDetailsCount: 30,
      needsDetails: {
        __typename: "ItemOnboardingConnection",
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: Array.from({ length: 30 }, (_, i) => ({
          node: {
            __typename: "ItemOnboarding",
            id: `d-${i}`,
            itemType: "BEER",
            status: "NEEDS_DETAILS",
            cellarId: null,
            displayName: `Beer ${i}`,
            displayMaker: null,
            draftFields: { name: `Beer ${i}` },
            confirmedFields: [],
            vintageAnswer: "UNANSWERED",
            imageId: `f-${i}`,
            updatedAt: "2026-11-27T00:00:00Z",
          },
        })),
      },
    };
  },
}));

const { loadNeedsDetails, PRESIGNED_FIRST } = await import("./load");

describe("loadNeedsDetails", () => {
  test("presigns only the first screenful; later rows read their own in view", async () => {
    imageReads.length = 0;
    const load = await loadNeedsDetails(null);
    assert.equal(load.drafts.length, 30);
    assert.equal(imageReads.length, PRESIGNED_FIRST);
    assert.ok(PRESIGNED_FIRST <= 12, "a phone screen's worth");
    assert.equal(load.drafts[0]?.imageUrl, "u/f-0");
    // Undefined (not null): DraftThumb reads it when the row is seen.
    assert.equal(load.drafts[PRESIGNED_FIRST]?.imageUrl, undefined);
  });
});
