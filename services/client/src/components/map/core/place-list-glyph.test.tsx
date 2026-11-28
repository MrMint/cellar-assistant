import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlaceResult } from "../types";
import { PlaceList } from "./PlaceList";

const place = (id: string, primary: string): PlaceResult => ({
  id,
  name: id,
  primary_category: primary,
  categories: [primary],
  location: { coordinates: [0, 0] },
});

const rowFor = (primary: string) => {
  const out = renderToStaticMarkup(
    <PlaceList
      places={[place("Row", primary)]}
      origin={null}
      title="In view"
      loading={false}
      query=""
      globalSearch={false}
      onOpen={() => {}}
      onAddPlace={() => {}}
      onSearchEverywhere={() => {}}
    />,
  );
  return out.slice(out.indexOf("<li"));
};

describe("a list row's glyph is the pin's glyph (F-192)", () => {
  it("a beer bar's row draws the beer glyph, not the cocktail glass", () => {
    const row = rowFor("beer_bar");
    expect(row).toContain("lucide-kit-beer");
    expect(row).not.toContain("lucide-martini");
  });

  it("an izakaya's row draws the food glyph, as its pin does", () => {
    const row = rowFor("izakaya");
    expect(row).toContain("lucide-kit-food");
    expect(row).not.toContain("lucide-martini");
  });

  it("a wine bar's row draws the wine glyph; a cocktail bar keeps the glass", () => {
    expect(rowFor("wine_bar")).toContain("lucide-kit-wine");
    expect(rowFor("cocktail_bar")).toContain("lucide-martini");
  });
});
