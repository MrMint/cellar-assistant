import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Client } from "urql";
import { createActor } from "xstate";
import { mapMachine } from "./mapMachine";

const start = () =>
  createActor(mapMachine, {
    input: { userId: "u1", client: {} as Client },
  }).start();

describe("the map's theme (F-189)", () => {
  test("the app's light theme reaches the map before the map has loaded", () => {
    // The renderer sends the app's theme on mount, before INITIALIZE (the
    // map's own onLoad). Dropping it there left light mode on the dark map.
    const actor = start();
    assert.equal(actor.getSnapshot().value, "uninitializedMap");
    actor.send({ type: "SET_DARK_MODE", isDark: false });
    assert.equal(actor.getSnapshot().context.isDarkMode, false);
    actor.stop();
  });

  test("Map options' switch works before load too, and after", () => {
    const actor = start();
    actor.send({ type: "TOGGLE_DARK_MODE" });
    assert.equal(actor.getSnapshot().context.isDarkMode, false);
    actor.send({ type: "INITIALIZE" });
    actor.send({ type: "SET_DARK_MODE", isDark: true });
    assert.equal(actor.getSnapshot().context.isDarkMode, true);
    actor.stop();
  });
});
