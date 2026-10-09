/**
 * The Pour sheet's rules (X03), without a browser: what a glass takes out of
 * each type's bottle, where the liquid sits and what a finger on it asks for,
 * and what the writes and their Undo send.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canPourTo,
  clampLevel,
  containerNote,
  defaultPour,
  GLASS_PRESETS,
  LIQUID_BOUNDS,
  levelAfterPreset,
  levelAtPointer,
  levelForKey,
  levelValueText,
  liquidTop,
  meAndLabel,
  notYetLevel,
  parseCompanions,
  pourBottleInput,
  pouredMessage,
  pourLabel,
  presetFor,
  presetPercent,
  rememberedCompanions,
  undoPourBottleInput,
} from "./pour-plan";

const glassOf = (type: keyof typeof GLASS_PRESETS) => {
  const preset = GLASS_PRESETS[type][1];
  assert.ok(preset);
  return preset;
};

describe("glass presets", () => {
  test("a pour of wine is about 150 ml of a 750 ml bottle: 20%", () => {
    assert.equal(presetPercent("WINE", glassOf("WINE")), 20);
    assert.equal(levelAfterPreset("WINE", 100, glassOf("WINE")), 80);
    assert.equal(containerNote("WINE"), "Measured against a 750 ml bottle.");
  });

  test("a spirit measure is 45 ml of 700: 6%; a beer glass is the bottle", () => {
    assert.equal(presetPercent("SPIRIT", glassOf("SPIRIT")), 6);
    const beerGlass = GLASS_PRESETS.BEER[2];
    assert.ok(beerGlass);
    assert.equal(presetPercent("BEER", beerGlass), 100);
  });

  test("every type has three pours, smallest first, each at least 1%", () => {
    for (const type of Object.keys(
      GLASS_PRESETS,
    ) as (keyof typeof GLASS_PRESETS)[]) {
      const percents = GLASS_PRESETS[type].map((preset) =>
        presetPercent(type, preset),
      );
      assert.equal(percents.length, 3, type);
      assert.deepEqual(
        [...percents].sort((a, b) => a - b),
        percents,
        type,
      );
      assert.ok(
        percents.every((percent) => percent >= 1),
        type,
      );
    }
  });

  test("a pour never goes below empty, and the default is a glass or the rest", () => {
    assert.equal(levelAfterPreset("WINE", 10, glassOf("WINE")), 0);
    assert.equal(defaultPour("WINE", 60), 40);
    assert.equal(defaultPour("WINE", 15), 0);
  });

  test("presetFor names the pour a level is exactly one of — never the last", () => {
    assert.equal(presetFor("WINE", 60, 40)?.id, "glass");
    assert.equal(presetFor("WINE", 60, 41), null);
    assert.equal(presetFor("WINE", 15, 0), null);
  });
});

describe("the level", () => {
  test("clampLevel is a whole percent between 0 and the max", () => {
    assert.equal(clampLevel(41.6), 42);
    assert.equal(clampLevel(-3), 0);
    assert.equal(clampLevel(120), 100);
    assert.equal(clampLevel(80, 60), 60);
    assert.equal(clampLevel(Number.NaN), 0);
  });

  test("the liquid fills from the base to the shoulder", () => {
    const { full, bottom } = LIQUID_BOUNDS.WINE;
    assert.equal(liquidTop("WINE", 100), full);
    assert.equal(liquidTop("WINE", 0), bottom);
    assert.equal(liquidTop("WINE", 50), (full + bottom) / 2);
  });

  test("a finger asks for the level under it, never more than was there", () => {
    const rect = { top: 100, height: 320 }; // 2 px per vessel unit
    const { full, bottom } = LIQUID_BOUNDS.WINE;
    const half = (full + bottom) / 2;
    assert.equal(levelAtPointer("WINE", rect.top + half * 2, rect, 100), 50);
    // Above the shoulder is full — but only as full as the bottle was.
    assert.equal(levelAtPointer("WINE", rect.top, rect, 60), 60);
    // Below the base is empty.
    assert.equal(levelAtPointer("WINE", rect.top + 400, rect, 60), 0);
    assert.equal(levelAtPointer("WINE", 0, { top: 0, height: 0 }, 60), 60);
  });

  test("keys move it by 1, 10 with shift or Page keys; Home empties, End resets", () => {
    assert.equal(levelForKey("ArrowDown", 50, 80), 49);
    assert.equal(levelForKey("ArrowLeft", 50, 80, true), 40);
    assert.equal(levelForKey("ArrowUp", 80, 80), 80);
    assert.equal(levelForKey("PageDown", 5, 80), 0);
    assert.equal(levelForKey("Home", 50, 80), 0);
    assert.equal(levelForKey("End", 10, 80), 80);
    assert.equal(levelForKey("Enter", 10, 80), null);
  });

  test("the spoken value says what is left and what is poured", () => {
    assert.equal(levelValueText(60, 60), "60% left, nothing poured yet");
    assert.equal(levelValueText(60, 40), "40% left, pouring 20%");
    assert.equal(levelValueText(60, 0), "Empty — pouring the last of it");
  });
});

describe("what the writes send", () => {
  const sealed = { percentageRemaining: 100, openAt: null };
  const open = { percentageRemaining: 60, openAt: "2026-10-01T18:00:00.000Z" };
  const at = "2026-10-08T20:00:00.000Z";

  test("the first pour opens the bottle when it was poured", () => {
    assert.deepEqual(pourBottleInput(sealed, 80, at), {
      percentageRemaining: 80,
      openAt: at,
    });
    assert.deepEqual(pourBottleInput(open, 40, at), {
      percentageRemaining: 40,
    });
  });

  test("Undo puts the level back, and a sealed bottle sealed again", () => {
    assert.deepEqual(undoPourBottleInput(sealed), {
      percentageRemaining: 100,
      openAt: null,
    });
    assert.deepEqual(undoPourBottleInput(open), { percentageRemaining: 60 });
  });

  test("Not yet after the last pour leaves a drop", () => {
    assert.equal(notYetLevel(open), 5);
    assert.equal(notYetLevel({ percentageRemaining: 3, openAt: null }), 3);
    assert.equal(notYetLevel({ percentageRemaining: 0, openAt: null }), 1);
  });

  test("the button and the toast name the pour", () => {
    assert.equal(pourLabel("WINE", 60, 40), "Pour 150 ml");
    assert.equal(pourLabel("WINE", 60, 47), "Pour 13%");
    assert.equal(pourLabel("WINE", 60, 0), "Pour the last of it");
    assert.equal(pourLabel("WINE", 60, 60), "Pour");
    assert.equal(pourLabel("WINE", 0, 0), "Pour the last of it");
    assert.equal(canPourTo(60, 60), false);
    assert.equal(canPourTo(60, 59), true);
    assert.equal(canPourTo(0, 0), true);
    assert.equal(pouredMessage("WINE", 60, 40), "Poured 150 ml · 40% left");
    assert.equal(pouredMessage("SPIRIT", 60, 48), "Poured 12% · 48% left");
    assert.equal(pouredMessage("SPIRIT", 60, 47), "Poured 90 ml · 47% left");
  });
});

describe("who with", () => {
  const sam = { id: "s", displayName: "Sam", avatarUrl: null };
  const ana = { id: "a", displayName: "Ana", avatarUrl: null };
  const lee = { id: "l", displayName: "Lee", avatarUrl: null };

  test("Just me, me + Sam, and a table", () => {
    assert.equal(meAndLabel([]), "Just me");
    assert.equal(meAndLabel([sam]), "me + Sam");
    assert.equal(meAndLabel([sam, ana]), "me + Sam and Ana");
    assert.equal(meAndLabel([sam, ana, lee]), "me + Sam, Ana and 1 other");
  });

  test("the remembered set keeps only friends who are still friends", () => {
    assert.deepEqual(rememberedCompanions([sam, ana], [{ id: "a" }]), [ana]);
    assert.deepEqual(rememberedCompanions([sam], null), [sam]);
  });

  test("what storage holds is parsed defensively", () => {
    assert.deepEqual(parseCompanions(null), []);
    assert.deepEqual(parseCompanions("{nope"), []);
    assert.deepEqual(parseCompanions('{"id":"s"}'), []);
    assert.deepEqual(
      parseCompanions(
        JSON.stringify([sam, { id: 3 }, { ...ana, avatarUrl: 7 }]),
      ),
      [sam, ana],
    );
  });
});
