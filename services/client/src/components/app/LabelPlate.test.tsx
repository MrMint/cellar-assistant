/**
 * LabelPlate v0 (N28): what it prints, in what order, how it is named, and
 * that each of the six types draws its own vessel — the point of the plate
 * is that two items no longer look the same.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ITEM_TYPE_ORDER } from "@/lib/tokens";
import { openTag, textOf } from "../../test-support/markup";
import { LabelPlate } from "./LabelPlate";

const full = {
  producer: "Vietti",
  name: "Barolo Castiglione",
  vintage: "2016",
  origin: "Piedmont",
  abv: "14%",
};

describe("LabelPlate", () => {
  test("producer, name, vintage, region · ABV — in label order", () => {
    const html = renderToStaticMarkup(<LabelPlate type="WINE" plate={full} />);
    const slots = [
      ...html.matchAll(/data-slot="label-plate-(producer|name|vintage|foot)"/g),
    ].map((match) => match[1]);
    assert.deepEqual(slots, ["producer", "name", "vintage", "foot"]);
    assert.equal(textOf(html), "Vietti Barolo Castiglione 2016 Piedmont · 14%");
  });

  test("decorative by default: hidden from assistive tech", () => {
    const html = renderToStaticMarkup(<LabelPlate type="WINE" plate={full} />);
    const root = openTag(html, 'data-slot="label-plate"');
    assert.match(root, /aria-hidden="true"/);
    assert.doesNotMatch(root, /role="img"/);
  });

  test("labelled: an image named by its own text", () => {
    const html = renderToStaticMarkup(
      <LabelPlate type="WINE" plate={{ ...full, vintage: "NV" }} labelled />,
    );
    const root = openTag(html, 'data-slot="label-plate"');
    assert.match(root, /role="img"/);
    assert.match(
      root,
      /aria-label="Label: Vietti Barolo Castiglione, non-vintage, Piedmont · 14%"/,
    );
  });

  test("absent lines are left off, not printed empty", () => {
    const html = renderToStaticMarkup(
      <LabelPlate type="TEA" plate={{ name: "Sencha" }} />,
    );
    assert.equal(textOf(html), "Sencha");
    assert.doesNotMatch(html, /label-plate-(producer|vintage|foot)/);
  });

  test("six types, six different vessels", () => {
    const vessels = ITEM_TYPE_ORDER.map((type) => {
      const html = renderToStaticMarkup(
        <LabelPlate type={type} plate={{ name: "X" }} />,
      );
      assert.match(
        openTag(html, 'data-slot="label-plate"'),
        new RegExp(`data-type="${type}"`),
      );
      const vessel = /data-vessel="([a-z-]+)"/.exec(html)?.[1];
      const path = /<path d="([^"]+)"/.exec(html)?.[1];
      assert.ok(vessel && path, `${type} drew no vessel`);
      return `${vessel}:${path}`;
    });
    assert.equal(new Set(vessels).size, ITEM_TYPE_ORDER.length);
  });

  test("the same plate renders the same markup (deterministic)", () => {
    const a = renderToStaticMarkup(<LabelPlate type="SAKE" plate={full} />);
    const b = renderToStaticMarkup(
      <LabelPlate type="SAKE" plate={{ ...full }} />,
    );
    assert.equal(a, b);
  });
});
