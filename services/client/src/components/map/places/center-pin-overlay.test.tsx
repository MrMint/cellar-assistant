/**
 * CB-7 (L23): the centre pin draws in the kit's tokens only — its base dot
 * is the scrim, not a raw `bg-black/20`.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CenterPinOverlay } from "./CenterPinOverlay";

const RAW_COLOUR =
  /\b(?:bg|text|border|fill|stroke|ring|from|to|via)-(?:black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b|#[0-9a-f]{3,8}\b/i;

describe("CenterPinOverlay (L23)", () => {
  test("no raw colour classes; the pin's base dot is the scrim token", () => {
    const html = renderToStaticMarkup(
      <CenterPinOverlay onConfirm={() => {}} onCancel={() => {}} />,
    );
    const classes = Array.from(html.matchAll(/class="([^"]*)"/g)).map(
      (match) => match[1] ?? "",
    );
    const raw = classes.filter((value) => RAW_COLOUR.test(value));
    assert.deepEqual(raw, []);
    assert.ok(
      classes.some((value) => /\bbg-scrim\b/.test(value)),
      "the base dot uses bg-scrim",
    );
  });
});
