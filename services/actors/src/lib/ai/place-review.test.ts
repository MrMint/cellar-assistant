/**
 * `providerPlaceReviewer` — B5b's half of the AI place review.
 *
 * Kept out of `seams.test.ts`, which drives the other six, for one reason: the
 * thing most worth pinning down here is not the translation but the *output
 * schema*, and the schema has a fence of its own (`PLACE_REVIEW_CATEGORIES`
 * against the create form's list) that has nothing to do with a fake provider.
 *
 * ## What these tests are actually defending
 *
 * The old `functions/reviewUserPlace` required five of its six fields, and
 * `required` is not advice — a provider compiles it into the sampler's
 * grammar, so the decoder cannot close the object without emitting those keys.
 * That is how E2c got an entire invented Château d'Yquem out of the
 * item-defaults seam at confidence 0.9, and the same pressure here lands on
 * `enrichedDescription`, which `PlaceCreationActor.createPlace` writes into
 * `places.description` whenever the submitter left theirs blank. So:
 *
 *   - a bare `{"approved": true}` has to be a *complete, usable* answer;
 *   - `PLACE_REVIEW_SCHEMA.required` has to stay `["approved"]`;
 *   - and a missing `approved` has to throw rather than default either way.
 *
 * No network: the provider is faked at the `AIProvider` boundary, exactly as
 * `seams.test.ts` does.
 *
 *   bun run --filter @cellar-assistant/actors test place-review
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Ctx } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import type { PlaceReviewSubject } from "../../actors/place-creation-actor.ts";
import {
  PLACE_REVIEW_CATEGORIES,
  PLACE_REVIEW_FLAGS,
  PLACE_REVIEW_SCHEMA,
} from "./prompts.ts";
import { providerPlaceReviewer } from "./seams.ts";
import type {
  AIProvider,
  GenerateContentRequest,
  ModelQuality,
  ProviderFor,
} from "./types.ts";

const ctx: Ctx = { viewerId: "u-1", kind: "user", requestId: "r-1" };

type Recorded = {
  readonly request: GenerateContentRequest;
  readonly quality: ModelQuality | undefined;
};

/** Answers with the JSON it was handed, and records what it was asked. */
const fakeProvider = (
  content: string,
): { provider: ProviderFor; asked: Recorded[] } => {
  const asked: Recorded[] = [];
  const raw: AIProvider = {
    name: "ollama",
    getAvailableQualities: () => ["low", "medium", "high"],
    async generateContent(request, quality) {
      asked.push({ request, quality });
      return {
        content,
        metadata: {
          model: "fake-model",
          provider: "ollama",
          processingTime: 1,
        },
      };
    },
    async generateEmbeddings() {
      throw new Error("not used by this seam");
    },
  };
  return { provider: () => raw, asked };
};

const SUBJECT: PlaceReviewSubject = {
  name: "Bar Part Time",
  categories: ["wine_bar"],
  location: { lng: -122.4194, lat: 37.7749 },
  streetAddress: "496 14th St",
  locality: "San Francisco",
  region: "CA",
  countryCode: "US",
  phone: null,
  website: "https://barparttime.com/",
  description: null,
};

/* -------------------------------------------------------------------------- */
/* The schema — the field this seam exists to get right                        */
/* -------------------------------------------------------------------------- */

describe("PLACE_REVIEW_SCHEMA", () => {
  it("requires `approved` and nothing else", () => {
    // The Nhost schema required five fields. `required` compiles into the
    // sampler's grammar, so every extra entry here is a field the model is
    // forbidden from declining to answer — and `enrichedDescription` is
    // persisted as the place's own description. If this assertion is failing
    // because a field was added, read `PLACE_REVIEW_SCHEMA`'s doc first.
    expect(PLACE_REVIEW_SCHEMA.required).toEqual(["approved"]);
  });

  it("offers every field the old function's ReviewResult carried", () => {
    expect(Object.keys(PLACE_REVIEW_SCHEMA.properties ?? {}).sort()).toEqual([
      "approved",
      "confidenceAdjustment",
      "enrichedDescription",
      "flags",
      "rejectionReason",
      "suggestedCategories",
    ]);
  });

  it("constrains suggestions and flags to closed sets", () => {
    expect(
      PLACE_REVIEW_SCHEMA.properties?.suggestedCategories?.items?.enum,
    ).toEqual([...PLACE_REVIEW_CATEGORIES]);
    expect(PLACE_REVIEW_SCHEMA.properties?.flags?.items?.enum).toEqual([
      ...PLACE_REVIEW_FLAGS,
    ]);
  });
});

/**
 * The fence under `PLACE_REVIEW_CATEGORIES`.
 *
 * `places.categories` is `text[]` with no foreign key, so nothing in the
 * database will ever object to an invented category — it is simply a chip the
 * user cannot act on, because the frontend renders from its own fixed list
 * (`PLACE_CATEGORY_TIERS`, restored from the old shared package with the map).
 * That makes this list a hand-written mirror of a file in another app, which is
 * precisely the shape that goes stale silently. Held against the source rather
 * than against a copy of itself.
 */
describe("PLACE_REVIEW_CATEGORIES vs the create form", () => {
  const placesDir = new URL(
    "../../../../../services/client/src/components/map/places/",
    import.meta.url,
  );
  const categoriesFile = fileURLToPath(
    new URL("userPlaceCategories.ts", placesDir),
  );
  const formFile = fileURLToPath(new URL("CreatePlaceForm.tsx", placesDir));

  const formCategories = (): readonly string[] => {
    const source = readFileSync(categoriesFile, "utf8");
    const block =
      /export const PLACE_CATEGORY_TIERS[\s\S]*?\n\} as const;/.exec(source);
    if (block === null) {
      throw new Error(
        `PLACE_CATEGORY_TIERS is no longer in ${categoriesFile}. It is what ` +
          "the place review's category enum mirrors; find where it moved to.",
      );
    }
    // Every slug is a quoted lower-snake-case string; the tier keys
    // (`venues:`, `retail:`) are bare identifiers, so the pattern separates
    // them without parsing the file.
    return [...block[0].matchAll(/"([a-z][a-z_]*)"/g)].map(
      (match) => match[1] ?? "",
    );
  };

  it("reads the list the create form actually renders", () => {
    // If the form stops building its options from `PLACE_CATEGORY_TIERS`,
    // the comparison below would be holding the enum against a file nobody
    // renders — so pin the form's source too.
    const form = readFileSync(formFile, "utf8");
    expect(form).toMatch(/from "\.\/userPlaceCategories"/);
    expect(form).toContain("PLACE_CATEGORY_TIERS.venues");
    expect(form).toContain("PLACE_CATEGORY_TIERS.retail");
  });

  it("names exactly the categories the form offers", () => {
    const form = [...formCategories()].sort();
    expect(form.length).toBeGreaterThan(0);
    expect(new Set(form).size).toBe(form.length);
    expect([...PLACE_REVIEW_CATEGORIES].sort()).toEqual(form);
  });
});

/* -------------------------------------------------------------------------- */
/* The seam                                                                    */
/* -------------------------------------------------------------------------- */

describe("providerPlaceReviewer", () => {
  it("returns the model's verdict, at the tier the old function asked for", async () => {
    const { provider, asked } = fakeProvider(
      JSON.stringify({
        approved: true,
        confidenceAdjustment: 0.2,
        enrichedDescription: "A natural wine bar in San Francisco.",
        suggestedCategories: ["bar"],
        rejectionReason: null,
        flags: [],
      }),
    );

    const review = await providerPlaceReviewer(provider)(ctx, SUBJECT);

    expect(review).toEqual({
      approved: true,
      confidenceAdjustment: 0.2,
      enrichedDescription: "A natural wine bar in San Francisco.",
      suggestedCategories: ["bar"],
      rejectionReason: null,
      flags: [],
    });
    expect(asked[0]?.quality).toBe("low");
    expect(asked[0]?.request.schema).toBe(PLACE_REVIEW_SCHEMA);
    // Slugs, not the Title Case labels `formatAllCategories()` used to print —
    // a suggestion the form cannot match is a suggestion nobody can take.
    expect(asked[0]?.request.prompt).toContain("coffee_shop");
    expect(asked[0]?.request.prompt).not.toContain("Coffee Shop");
    expect(asked[0]?.request.prompt).toContain("Bar Part Time");
  });

  it('treats a bare {"approved": true} as a complete answer', async () => {
    // The whole point of the one-field `required` list: "I have nothing to
    // add" has to be sayable, and has to mean something on this side.
    const { provider } = fakeProvider(JSON.stringify({ approved: true }));

    const review = await providerPlaceReviewer(provider)(ctx, SUBJECT);

    expect(review.approved).toBe(true);
    // No movement from the 0.5 base, and — the field that matters — no
    // description invented for a venue the model has never heard of.
    expect(review.confidenceAdjustment).toBe(0);
    expect(review.enrichedDescription).toBe(null);
    expect(review.suggestedCategories).toEqual([]);
    expect(review.rejectionReason).toBe(null);
    expect(review.flags).toEqual([]);
  });

  it("carries a rejection and its reason through unchanged", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        approved: false,
        confidenceAdjustment: -0.3,
        rejectionReason: "This looks like test data rather than a venue.",
        flags: ["low_quality", "fictional"],
      }),
    );

    const review = await providerPlaceReviewer(provider)(ctx, SUBJECT);

    expect(review.approved).toBe(false);
    expect(review.rejectionReason).toMatch(/test data/);
    expect(review.flags).toEqual(["low_quality", "fictional"]);
  });

  it("refuses an answer with no `approved` rather than guessing the verdict", async () => {
    // Defaulting to `true` is the silent approval this seam exists to refuse;
    // defaulting to `false` refuses a genuine submission over a decoding
    // glitch. Throwing lands on `#reviewOrNull`, which records `review: null`.
    const { provider } = fakeProvider(
      JSON.stringify({ confidenceAdjustment: 0.3, flags: [] }),
    );
    await expect(providerPlaceReviewer(provider)(ctx, SUBJECT)).rejects.toThrow(
      /has no `approved`/,
    );
  });

  it("refuses a non-JSON completion rather than reading it as an approval", async () => {
    const { provider } = fakeProvider("Sure! That place looks great to me.");
    await expect(providerPlaceReviewer(provider)(ctx, SUBJECT)).rejects.toThrow(
      /place review answer is not JSON/,
    );
  });

  it("does not call the model at all when there is nothing to review", async () => {
    // `requirePlaceReviewSubject` runs first, on purpose: a model asked an
    // empty question invents a venue and returns a verdict on it.
    const { provider, asked } = fakeProvider(
      JSON.stringify({ approved: true }),
    );
    await expect(
      providerPlaceReviewer(provider)(ctx, {
        ...SUBJECT,
        name: "   ",
        categories: [],
      }),
    ).rejects.toThrow(/missing a name, at least one category/);
    expect(asked).toHaveLength(0);
  });

  it("drops non-strings out of the model's arrays without inventing values", async () => {
    const { provider } = fakeProvider(
      JSON.stringify({
        approved: true,
        suggestedCategories: ["bar", 7, null, "cafe"],
        flags: "spam",
      }),
    );

    const review = await providerPlaceReviewer(provider)(ctx, SUBJECT);

    expect(review.suggestedCategories).toEqual(["bar", "cafe"]);
    // A bare string is not an array of flags, and this seam does not guess
    // which one it meant.
    expect(review.flags).toEqual([]);
  });
});
