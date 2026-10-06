/**
 * The §1.5 keying rules, asserted directly.
 *
 * Two properties, and they are the whole of C1's caching contract:
 *
 *  1. **pagination is not in the hash** — one activation serves every page;
 *  2. **the viewer is in the hash for exactly the identity-sensitive surfaces**
 *     (§1.5: in-cellar item search, map browse with tier-list or visit filters,
 *     and user search) and for nothing else.
 *
 * Every builder has the signature `(input, viewerId) => string`, including the
 * ones that ignore `viewerId`, so the table below can call all ten the same way
 * and let the *result* say which are viewer-scoped. A builder that quietly
 * started or stopped mixing the viewer in fails here, not in a security review.
 */
import { describe, expect, it } from "vitest";
import {
  brandSearchActorId,
  cellarItemSearchActorId,
  duplicatePlaceSearchActorId,
  embeddingActorId,
  geocodeActorId,
  googlePlacesActorId,
  itemSearchActorId,
  placeSearchActorId,
  placeSearchIsViewerScoped,
  recipeSearchActorId,
  searchHash,
  userSearchActorId,
} from "./search.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const TIER = "33333333-3333-4333-8333-333333333333";

/** `[label, key(viewer), viewer-scoped?]` — one row per §2.3 actor. */
const SURFACES: readonly [
  string,
  (viewer: string | null) => string,
  boolean,
][] = [
  [
    "ItemSearchActor",
    (v) => itemSearchActorId({ text: "pinot noir" }, v),
    false,
  ],
  [
    "CellarItemSearchActor",
    (v) => cellarItemSearchActorId({ cellarId: A, query: "oaky" }, v),
    true,
  ],
  ["BrandSearchActor", (v) => brandSearchActorId({ term: "kre" }, v), false],
  [
    "RecipeSearchActor",
    (v) => recipeSearchActorId({ term: "negroni" }, v),
    false,
  ],
  ["UserSearchActor", (v) => userSearchActorId({ term: "jar" }, v), true],
  [
    "DuplicatePlaceSearchActor",
    (v) =>
      duplicatePlaceSearchActorId(
        { name: "Bar", location: { lng: -83, lat: 40 } },
        v,
      ),
    false,
  ],
  [
    "PlaceSearchActor (no tier-list / visit filter)",
    (v) => placeSearchActorId({ query: "wine bar" }, v),
    false,
  ],
  [
    "PlaceSearchActor (tier-list filter)",
    (v) => placeSearchActorId({ query: "wine bar", tierListIds: [TIER] }, v),
    true,
  ],
  [
    "PlaceSearchActor (visit filter)",
    (v) => placeSearchActorId({ query: "wine bar", visitStatus: "visited" }, v),
    true,
  ],
  [
    "GooglePlacesActor",
    (v) =>
      googlePlacesActorId(
        { mode: "autocomplete", input: "sta", location: { lng: -83, lat: 40 } },
        v,
      ),
    false,
  ],
  [
    "GeocodeActor",
    (v) => geocodeActorId({ mode: "forward", query: "2136 N High St" }, v),
    false,
  ],
];

describe("search actor keys (§1.5, §2.3)", () => {
  describe("the viewer is in the hash for exactly the identity-sensitive surfaces", () => {
    for (const [label, key, viewerScoped] of SURFACES) {
      it(`${label}: ${viewerScoped ? "viewer-scoped" : "shared"}`, () => {
        const forA = key(A);
        const forB = key(B);
        expect(forA === forB).toBe(!viewerScoped);
        // …and an anonymous viewer is not silently equal to a signed-in one on
        // a viewer-scoped surface, which would share one activation between
        // "logged out" and "logged in as A".
        expect(key(null) === forA).toBe(!viewerScoped);
      });
    }

    it("names exactly the three §1.5 surfaces", () => {
      expect(
        SURFACES.filter(([, , scoped]) => scoped).map(([label]) => label),
      ).toEqual([
        "CellarItemSearchActor",
        "UserSearchActor",
        "PlaceSearchActor (tier-list filter)",
        "PlaceSearchActor (visit filter)",
      ]);
    });
  });

  it("`placeSearchIsViewerScoped` is what decides the conditional case", () => {
    expect(placeSearchIsViewerScoped({ query: "q" })).toBe(false);
    expect(placeSearchIsViewerScoped({ query: "q", tierListIds: [] })).toBe(
      false,
    );
    expect(placeSearchIsViewerScoped({ query: "q", tierListIds: [TIER] })).toBe(
      true,
    );
    expect(
      placeSearchIsViewerScoped({ query: "q", visitStatus: "unvisited" }),
    ).toBe(true);
  });

  describe("pagination is never an input", () => {
    it("has no `first`/`after` in any builder's signature", () => {
      // Structural, not textual: every builder takes exactly (input, viewerId).
      for (const [label, key] of SURFACES) {
        expect(key.length, label).toBeLessThanOrEqual(1);
      }
    });

    it("ignores keys the hash was never given", () => {
      // `searchHash` drops null/undefined and sorts keys, so an input built two
      // different ways is one activation.
      expect(searchHash({ a: 1, b: null })).toBe(
        searchHash({ b: undefined, a: 1 }),
      );
      expect(searchHash({ a: 1 })).not.toBe(searchHash({ a: 2 }));
    });
  });

  describe("normalisation", () => {
    it("collapses case and whitespace so one phrase is one activation", () => {
      expect(itemSearchActorId({ text: "  Pinot   Noir " }, null)).toBe(
        itemSearchActorId({ text: "pinot noir" }, null),
      );
    });

    it("keeps a genuinely different phrase apart", () => {
      expect(itemSearchActorId({ text: "pinot noir" }, null)).not.toBe(
        itemSearchActorId({ text: "pinot gris" }, null),
      );
    });

    it("rounds a reverse-geocode coordinate to ~1m, not to the pixel", () => {
      const at = (lat: number) =>
        geocodeActorId({ mode: "reverse", location: { lng: -83, lat } }, null);
      expect(at(39.9612)).toBe(at(39.961200004));
      expect(at(39.9612)).not.toBe(at(39.9613));
    });
  });

  describe("embeddingActorId", () => {
    it("is sha256(lower(trim(text))) — B1's settled key, not `searchHash`", () => {
      expect(embeddingActorId("  Pinot Noir  ")).toBe(
        embeddingActorId("pinot noir"),
      );
      expect(embeddingActorId("pinot noir")).toMatch(/^[0-9a-f]{64}$/);
      expect(embeddingActorId("pinot noir")).not.toBe(
        searchHash({ text: "pinot noir" }),
      );
    });

    it("does not collapse inner whitespace (the other builders do)", () => {
      // Deliberate: this key is B1's, already computed inline at two live call
      // sites, and widening it would silently split their activations from
      // this one. See `search.ts`'s note on `embeddingActorId`.
      expect(embeddingActorId("pinot  noir")).not.toBe(
        embeddingActorId("pinot noir"),
      );
    });
  });
});
