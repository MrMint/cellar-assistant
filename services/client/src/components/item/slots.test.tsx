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
import { BrewGuideSection } from "./BrewGuideSection";
import { SeenAtSection } from "./SeenAtSection";

const item = { itemId: "i1", type: "TEA", name: "Sencha" } as ItemView;

describe("ux-c M4 slots", () => {
  test("SeenAtSection renders nothing", () => {
    assert.equal(renderToStaticMarkup(<SeenAtSection item={item} />), "");
  });

  test("BrewGuideSection renders nothing", () => {
    assert.equal(renderToStaticMarkup(<BrewGuideSection item={item} />), "");
  });

  test("MeStamps renders nothing", () => {
    assert.equal(renderToStaticMarkup(<MeStamps />), "");
  });
});
