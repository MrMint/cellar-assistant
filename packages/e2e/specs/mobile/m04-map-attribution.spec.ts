import { bottomNav, edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { sitsAbove } from "../../fixtures/mobile-rules.ts";

/**
 * N20 · map attribution sits above the tab bar (observation 59, map-14).
 *
 * At 390x844 the map runs underneath the bottom nav: the MapLibre/CARTO
 * attribution was measured at bottom 829 px against a nav top of 794 px, so it
 * is hidden, and so is the bottom ~50 px of map. Attribution is a licensing
 * obligation, not polish (N22). This reads only — no place is created.
 *
 * Two checks, because either can fail alone: the attribution's box ends above
 * the nav's top edge, and the attribution is what a tap at its centre
 * actually hits (nothing — the nav, a sheet, a FAB — is painted over it).
 */

test("the map attribution is visible above the tab bar", async ({ page }) => {
  await page.goto("/map");

  const webgl = await page.evaluate(
    () => document.createElement("canvas").getContext("webgl2") !== null,
  );
  test.skip(
    !webgl,
    "this browser has no WebGL2, so MapLibre cannot draw a map or its attribution — an environment limit, not a verdict on the layout",
  );

  const attribution = page.locator(".maplibregl-ctrl-attrib").first();
  await expect(
    attribution,
    "the map never rendered its attribution control",
  ).toBeAttached({ timeout: 30_000 });

  const nav = await bottomNav(page);
  const navEdges = await edgesOf(nav);
  const attrEdges = await edgesOf(attribution);
  expect(
    sitsAbove(attrEdges, navEdges),
    `the attribution ends at ${Math.round(attrEdges.bottom)}px but the tab bar starts at ${Math.round(navEdges.top)}px — the map runs under the nav (N22: size the map to the content area)`,
  ).toBe(true);

  const hit = await attribution.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return {
      onTop: top !== null && (el === top || el.contains(top)),
      coveredBy:
        top === null
          ? "nothing (off screen)"
          : `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 60)}`,
    };
  });
  expect(hit.onTop, `the attribution is painted over by ${hit.coveredBy}`).toBe(
    true,
  );
});
