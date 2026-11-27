/**
 * FR-15 (H-43): the place page keeps one quiet line, "Place details from
 * Google", in the kit's caption style, followed by the attribution blocks
 * the Places terms require.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleAttribution } from "./GoogleAttribution";

const enrichment = {
  googlePlaceId: "g",
  name: "Corner Tap",
  formattedAddress: null,
  rating: null,
  userRatingsTotal: null,
  priceLevel: null,
  website: null,
  phone: null,
  openingHours: null,
  types: [],
  businessStatus: null,
  editorialSummary: null,
  attributions: [] as string[],
};

describe("GoogleAttribution (FR-15)", () => {
  test('one quiet line: "Place details from Google", t-cap in ink-3', () => {
    const html = renderToStaticMarkup(
      <GoogleAttribution enrichment={enrichment} />,
    );
    assert.match(html, />Place details from Google<\/p>$/);
    assert.doesNotMatch(html, /Powered by/);
    assert.match(html, /class="t-cap [^"]*text-ink-3/);
  });

  test("the terms' blocks and photo authors follow on the same line", () => {
    const html = renderToStaticMarkup(
      <GoogleAttribution
        enrichment={{ ...enrichment, attributions: ["<b>Yelp</b>"] }}
        photos={[
          {
            id: "ph",
            url: null,
            displayOrder: 0,
            attributions: [{ displayName: "Ann Author" }],
          },
        ]}
      />,
    );
    assert.match(html, /Place details from Google · Yelp · Photos: Ann Author/);
  });

  test("nothing without Google's data", () => {
    assert.equal(
      renderToStaticMarkup(<GoogleAttribution enrichment={null} />),
      "",
    );
  });
});
