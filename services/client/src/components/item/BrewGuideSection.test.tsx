/**
 * The item page's brew guide (L08, L38): nothing until its read answers, the
 * typical row against yours, a well-formed <dl> and a 44px Edit. Split from
 * `slots.test.tsx` (C2's) so R3, which owns `BrewGuideSection`, owns its test.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, fetchExchange, Provider } from "urql";
import type { ItemView } from "./adapter";
import { BrewGuideSection, BrewGuideView } from "./BrewGuideSection";
import { brewGuide, typicalBrew } from "./brew-table";

const item = { itemId: "i1", type: "TEA", name: "Sencha" } as ItemView;

describe("BrewGuideSection", () => {
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

  test("Brew guide: a well-formed <dl> (E-10, axe definition-list) and a 44px Edit (CR-9, L8)", () => {
    const html = renderToStaticMarkup(
      <BrewGuideView
        itemType="TEA"
        itemId="i1"
        guide={brewGuide(typicalBrew("TEA", { category: "oolong" }), null)}
        prefs={null}
      />,
    );
    const dl = /<dl[^>]*>([\s\S]*?)<\/dl>/.exec(html)?.[1] ?? "";
    assert.ok(dl.length > 0, "the guide renders its facts");
    // Each group is a <div> holding only <dt> then <dd>s: no stray element,
    // and the term comes first.
    const groups = dl.match(/<div[^>]*>[\s\S]*?<\/div>/g) ?? [];
    assert.ok(groups.length > 0);
    for (const group of groups) {
      const inner = group.replace(/^<div[^>]*>|<\/div>$/g, "");
      const tags = [...inner.matchAll(/<(\w+)[\s>]/g)].map((m) => m[1]);
      assert.equal(tags[0], "dt", `term first: ${group}`);
      assert.ok(
        tags.every((tag) => tag === "dt" || tag === "dd"),
        `only dt/dd in a group: ${tags.join(",")}`,
      );
    }
    const edit = /<button[^>]*>Edit<\/button>/.exec(html)?.[0] ?? "";
    assert.match(edit, /min-h-11/, "the Edit target is at least 44px tall");
  });
});
