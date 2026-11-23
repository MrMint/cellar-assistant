/**
 * ux-c M4: the three slots render nothing in seams. Each fetches its own data
 * and draws only once it has some (plan L38); until a later stream gives them
 * a query, they must add no markup to the item page or the Me hub.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, fetchExchange, Provider } from "urql";
import { MeStamps } from "../user/MeStamps";
import type { ItemView } from "./adapter";
import { BrewGuideSection, BrewGuideView } from "./BrewGuideSection";
import { brewGuide, typicalBrew } from "./brew-table";
import { SeenAtSection } from "./SeenAtSection";

const item = { itemId: "i1", type: "TEA", name: "Sencha" } as ItemView;

describe("ux-c M4 slots", () => {
  test("SeenAtSection renders nothing", () => {
    assert.equal(renderToStaticMarkup(<SeenAtSection item={item} />), "");
  });

  test("BrewGuideSection renders nothing until its read answers (L38)", () => {
    const client = new Client({
      url: "http://localhost/graphql",
      exchanges: [fetchExchange],
      // Never answers: the section must still render nothing, not throw.
      fetch: () => new Promise<Response>(() => {}),
    });
    assert.equal(
      renderToStaticMarkup(
        <Provider value={client}>
          <BrewGuideSection item={item} />
        </Provider>,
      ),
      "",
    );
  });

  test("Brew guide: a style with no row shows no guide until you add your own (L08)", () => {
    const html = renderToStaticMarkup(
      <BrewGuideView
        itemType="TEA"
        itemId="i1"
        guide={brewGuide(typicalBrew("TEA", { category: "blend" }), null)}
        prefs={null}
      />,
    );
    assert.match(html, /Add your own/);
    assert.doesNotMatch(html, />typical</);
    assert.doesNotMatch(html, /Typical for/);
    assert.doesNotMatch(html, /Start first steep/);
  });

  test("Brew guide: the typical row is labelled typical, yours as yours", () => {
    const prefs = {
      waterTempC: 95,
      steepSeconds: null,
      doseGrams: null,
      waterMl: null,
    };
    const html = renderToStaticMarkup(
      <BrewGuideView
        itemType="TEA"
        itemId="i1"
        guide={brewGuide(typicalBrew("TEA", { category: "oolong" }), prefs)}
        prefs={prefs}
      />,
    );
    assert.match(html, /How to steep/);
    assert.match(html, /95 °C/);
    assert.match(html, />yours</);
    assert.match(html, />typical</);
    assert.match(html, /Typical for oolong/);
    assert.match(html, /Start first steep · 3:00/);
  });

  test("MeStamps renders nothing", () => {
    assert.equal(renderToStaticMarkup(<MeStamps />), "");
  });
});
