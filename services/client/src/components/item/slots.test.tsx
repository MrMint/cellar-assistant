/**
 * ux-c M4: the three slots render nothing in seams. Each fetches its own data
 * and draws only once it has some (plan L38); until a later stream gives them
 * a query, they must add no markup to the item page or the Me hub.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MeStamps } from "../user/MeStamps";
import type { ItemView } from "./adapter";
import { ThisBottleRows } from "./BottleFreshnessFields";
import { freshnessModel } from "./freshness";
import { SeenAtSection } from "./SeenAtSection";

const item = { itemId: "i1", type: "TEA", name: "Sencha" } as ItemView;

describe("ux-c M4 slots", () => {
  test("SeenAtSection renders nothing", () => {
    assert.equal(renderToStaticMarkup(<SeenAtSection item={item} />), "");
  });

  test("This bottle: the Edit target is at least 44px tall (CR-9, L8)", () => {
    const model = freshnessModel(
      {
        openAt: null,
        emptyAt: null,
        packagedOn: null,
        acquiredOn: null,
        drinkFrom: null,
        drinkUntil: null,
        priceAmount: null,
        priceCurrency: null,
        location: null,
      },
      { type: "WINE", style: "RED", form: null, vintageYear: 2020 },
      "2026-11-22",
    );
    const html = renderToStaticMarkup(
      <ThisBottleRows model={model} onEdit={() => {}} />,
    );
    const edit = /<button[^>]*>Edit<\/button>/.exec(html)?.[0] ?? "";
    assert.ok(edit.length > 0, "This bottle has an Edit");
    assert.match(edit, /min-h-11/);
  });

  test("MeStamps renders nothing", () => {
    assert.equal(renderToStaticMarkup(<MeStamps />), "");
  });
});
