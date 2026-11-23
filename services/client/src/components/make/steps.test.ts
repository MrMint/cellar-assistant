import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { durationInText, stepsFrom } from "./steps";

const instruction = (
  step_number: number,
  instruction_text: string,
  time_minutes: number | null = null,
) => ({ id: `s${step_number}`, step_number, instruction_text, time_minutes });

describe("Make mode steps (ux-c L08)", () => {
  test("steps run in step order, blank ones dropped", () => {
    const steps = stepsFrom([
      instruction(2, "Stir"),
      instruction(1, "Fill a glass with ice."),
      instruction(3, "   "),
    ]);
    assert.deepEqual(
      steps.map((s) => s.text),
      ["Fill a glass with ice.", "Stir"],
    );
  });

  test("time_minutes makes a timed step", () => {
    const [step] = stepsFrom([instruction(1, "Steep the tea", 4)]);
    assert.equal(step?.timerSeconds, 240);
  });

  test("a duration in the text makes a timed step; none means no timer", () => {
    const [stir, strain] = stepsFrom([
      instruction(1, "Stir for 30 seconds, until very cold."),
      instruction(2, "Strain over a large cube."),
    ]);
    assert.equal(stir?.timerSeconds, 30);
    assert.equal(strain?.timerSeconds, null);
  });

  test("durations: units, ranges take the longer end, long waits are not timers", () => {
    assert.equal(durationInText("shake 15 sec"), 15);
    assert.equal(durationInText("simmer 2 minutes"), 120);
    assert.equal(durationInText("shake for 10-15 seconds"), 15);
    assert.equal(durationInText("rest 1.5 min"), 90);
    assert.equal(durationInText("infuse 24 hours"), null);
    assert.equal(durationInText("add 2 oz gin"), null);
  });
});
