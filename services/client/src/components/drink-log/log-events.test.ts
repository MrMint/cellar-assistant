import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { announceDrinkLogChanged, onDrinkLogChanged } from "./log-events";

describe("drink-log change events (W-14)", () => {
  test("a listener hears its own item and an unknown one, not another item", () => {
    const heard: string[] = [];
    const stop = onDrinkLogChanged("ridge", () => heard.push("ridge"));
    announceDrinkLogChanged("ridge");
    announceDrinkLogChanged("other");
    announceDrinkLogChanged(null);
    stop();
    announceDrinkLogChanged("ridge");
    assert.deepEqual(heard, ["ridge", "ridge"]);
  });
});
