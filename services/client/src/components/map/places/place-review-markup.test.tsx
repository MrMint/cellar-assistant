/**
 * X27 / D28 — what a place under review renders, on every surface that shows
 * one: the badge, the place page's review panel, the drawer's note, the edit
 * form and the pin's label.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { stripStyleBlocks } from "@/test-support/markup";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/places/p1",
  useSearchParams: () => new URLSearchParams(),
}));

const { PlaceReviewBadge } = await import("./PlaceReviewBadge");
const { PlaceReviewPanel } = await import("./PlaceReviewPanel");
const { PlaceDetailsContent } = await import("./PlaceDetailsContent");
const { CreatePlaceForm } = await import("./CreatePlaceForm");
const { transformToGeoJSON, REJECTED_PIN_OPACITY } = await import(
  "../maplibre/utils/geoJsonTransform"
);

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(<Provider value={client}>{node}</Provider>),
  );

const panel = (
  overrides: Partial<Parameters<typeof PlaceReviewPanel>[0]> = {},
) =>
  render(
    <PlaceReviewPanel
      placeId="p1"
      placeName="Copper Lantern"
      status="PENDING"
      rejectionReason={null}
      categories={["wine_bar"]}
      description={null}
      suggestedCategories={[]}
      suggestedDescription={null}
      refetch={() => {}}
      {...overrides}
    />,
  );

describe("PlaceReviewBadge", () => {
  test("pending and rejected carry glyph, words and who can see them; shared carries nothing", () => {
    const pending = render(<PlaceReviewBadge status="PENDING" />);
    assert.match(pending, /Under review/);
    assert.match(pending, /aria-label="Under review — only you can see/);
    assert.match(pending, /data-review-status="PENDING"/);
    assert.match(pending, /<svg/);

    const rejected = render(<PlaceReviewBadge status="REJECTED" />);
    assert.match(rejected, /Not approved/);

    assert.equal(render(<PlaceReviewBadge status="APPROVED" />), "");
    assert.equal(render(<PlaceReviewBadge status={null} />), "");
  });
});

describe("PlaceReviewPanel", () => {
  test("pending: under review, who can see it, Edit and Delete", () => {
    const html = panel();
    assert.match(html, /data-testid="place-review-panel"/);
    assert.match(html, /Under review/);
    assert.match(html, /Only you can see it until it&#x27;s been checked/);
    assert.match(html, /href="\/places\/p1\/edit"/);
    assert.match(html, />Edit</);
    assert.match(html, /Delete/);
  });

  test("rejected: the reviewer's reason, and 'Edit & resubmit' as the main action", () => {
    const html = panel({
      status: "REJECTED",
      rejectionReason: "Looks like a private residence.",
    });
    assert.match(html, /Not approved/);
    assert.match(html, /Looks like a private residence\./);
    assert.match(html, /Edit &amp; resubmit/);
  });

  test("approved with nothing to offer renders nothing at all", () => {
    assert.equal(panel({ status: "APPROVED" }), "");
  });

  test("suggestions: dashed 'also tagged as' chips the creator taps, and a description offer — never applied for them", () => {
    const html = panel({
      status: "APPROVED",
      categories: ["wine_bar"],
      suggestedCategories: [
        "cocktail_bar",
        "wine_bar",
        "beer_wine_and_spirits",
      ],
      suggestedDescription: "A snug natural-wine bar.",
    });
    assert.match(html, /Also tagged as…/);
    assert.match(html, /aria-label="Add category Cocktail Bar"/);
    // Already on the place: not offered again.
    assert.doesNotMatch(html, /Add category Wine Bar/);
    assert.match(html, /Add category Beer, Wine &amp; Spirits/);
    assert.match(html, /border-dashed/);
    assert.match(html, /Use this description/);
    assert.match(html, /aria-label="Dismiss suggestions"/);
    // No review state for a shared place.
    assert.doesNotMatch(html, /Under review|Not approved/);
  });

  test("a description is not offered over the creator's own", () => {
    const html = panel({
      status: "APPROVED",
      description: "Ours.",
      suggestedDescription: "Theirs.",
    });
    assert.equal(html, "");
  });
});

describe("the map drawer", () => {
  const props = {
    userInteraction: undefined,
    menuItems: [],
    loadingDetails: false,
    hasMenuItems: false,
    userId: "",
    variant: "desktop" as const,
    onClose: () => {},
    refetch: () => {},
    setInteraction: async () => null,
    enrichment: null,
    googlePhotos: [],
  };

  test("a pending place carries the badge and a line saying only you can see it", () => {
    const html = render(
      <PlaceDetailsContent
        {...props}
        place={{
          id: "p1",
          name: "Copper Lantern",
          categories: ["bar"],
          review_status: "PENDING",
        }}
      />,
    );
    assert.match(html, /Under review/);
    assert.match(html, /data-testid="drawer-review-note"/);
    assert.match(
      html,
      /Only you can see this place until it&#x27;s been checked/,
    );
    assert.match(html, /Edit or delete/);
  });

  test("a shared place carries neither", () => {
    const html = render(
      <PlaceDetailsContent
        {...props}
        place={{
          id: "p1",
          name: "Copper Lantern",
          categories: ["bar"],
          review_status: "APPROVED",
        }}
      />,
    );
    assert.doesNotMatch(html, /Under review|drawer-review-note/);
  });
});

describe("Edit & resubmit", () => {
  const edit = {
    placeId: "p1",
    reviewStatus: "REJECTED" as const,
    rejectionReason: "Looks like a private residence.",
    values: {
      name: "Copper Lantern",
      categories: ["wine_bar", "speakeasy"],
      street_address: "1 Main St",
      locality: "Madison",
      region: "WI",
      postcode: "53703",
      country_code: "US",
      phone: "",
      website: "",
      description: "",
    },
  };

  test("starts from the place's own values, shows the reason, and sends for review — no Google pre-fill", () => {
    const html = render(
      <CreatePlaceForm latitude={43.07} longitude={-89.4} edit={edit} />,
    );
    assert.match(html, /value="Copper Lantern"/);
    assert.match(html, /value="1 Main St"/);
    assert.match(html, /Why it wasn&#x27;t approved/);
    assert.match(html, /Looks like a private residence\./);
    assert.match(html, /Send for review/);
    assert.match(html, /aria-label="Back to place"/);
    assert.doesNotMatch(
      html,
      /Add Place|Loading address|Pre-filled from Google/,
    );
    // A category outside the form's list is kept, not dropped on resubmit.
    assert.match(html, /Speakeasy/);
  });
});

describe("the pin", () => {
  const place = (review_status?: "PENDING" | "APPROVED" | "REJECTED") => ({
    id: `p-${review_status ?? "none"}`,
    name: "Copper Lantern",
    primary_category: "bar",
    categories: ["bar"],
    location: { coordinates: [-89.4, 43.07] as [number, number] },
    review_status,
    overallRelevance: 10,
  });

  test("the creator's own place under review carries a second label line; a shared pin does not", () => {
    const collection = transformToGeoJSON([
      place("PENDING"),
      place("REJECTED"),
      place("APPROVED"),
      place(),
    ]);
    const labels = collection.features.map((f) =>
      "reviewLabel" in f.properties ? f.properties.reviewLabel : undefined,
    );
    assert.deepEqual(labels, ["Under review", "Not approved", null, null]);
  });

  test("a rejected pin is dimmed; a pending one is drawn at full strength whatever the filters", () => {
    const collection = transformToGeoJSON(
      [place("PENDING"), place("REJECTED")],
      {
        selectedItemTypes: ["wine"],
        searchQuery: "",
        minRating: 0,
      } as never,
    );
    const opacities = collection.features.map((f) =>
      "opacity" in f.properties ? f.properties.opacity : undefined,
    );
    assert.equal(opacities[1], REJECTED_PIN_OPACITY);
    assert.ok((opacities[0] ?? 0) > (opacities[1] ?? 0));
  });
});
