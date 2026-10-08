/**
 * `AIDraftField` (N19): one mark per source, drawn only while the field still
 * holds the drafted value — and the same wrapper either way, so the input
 * inside keeps its identity when the mark goes.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AIDraftField } from "./AIDraftField";

const html = (
  source: "label" | "suggested" | "pin" | "barcode",
  drafted: boolean,
) =>
  renderToStaticMarkup(
    <AIDraftField source={source} drafted={drafted}>
      <input name="vintage" />
    </AIDraftField>,
  );

describe("AIDraftField", () => {
  test("each source carries its own words", () => {
    assert.match(html("label", true), />From label</);
    assert.match(html("suggested", true), />Suggested</);
    assert.match(html("pin", true), />From pin</);
    assert.match(html("barcode", true), />From barcode</);
    assert.match(html("barcode", true), /<svg/, "the barcode glyph");
  });

  test("not drafted: no mark, same wrapper around the same field", () => {
    const off = html("label", false);
    assert.doesNotMatch(off, /From label/);
    assert.doesNotMatch(off, /data-ai-draft/);
    assert.match(off, /<div[^>]*><input name="vintage"\/><\/div>$/);
    assert.match(html("label", true), /data-ai-draft="label"/);
  });
});
