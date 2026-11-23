/**
 * ux-c L08 Make mode: a recipe's instructions as steps, each with the timer
 * it needs, if any. Pure — `steps.test.ts`.
 *
 * A step is timed when the recipe says so: `time_minutes` on the
 * instruction, or a duration written in its text ("Stir for 30 seconds",
 * "steep 4 minutes"). Nothing is guessed — a step with neither has no timer.
 */
import type { RecipeInstruction } from "@/components/recipe/adapter";

export type MakeStep = {
  readonly id: string;
  readonly text: string;
  /** The countdown this step asks for, in seconds, or `null`. */
  readonly timerSeconds: number | null;
};

const UNIT_SECONDS: Readonly<Record<string, number>> = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
};

/** At most an hour: a longer wait ("infuse 24 hours") is not a step timer. */
const MAX_TIMER_SECONDS = 60 * 60;

/** The first duration written in `text`, in seconds, or `null`. */
export const durationInText = (text: string): number | null => {
  const match =
    /\b(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|s|minutes?|mins?|hours?|hrs?)\b/i.exec(
      text,
    );
  if (match === null) return null;
  const unit = UNIT_SECONDS[(match[3] ?? "").toLowerCase()];
  // "30–45 seconds": the longer end, so the timer never stops early.
  const amount = Number(match[2] ?? match[1]);
  if (unit === undefined || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const seconds = Math.round(amount * unit);
  return seconds > MAX_TIMER_SECONDS ? null : seconds;
};

export const stepsFrom = (
  instructions: readonly RecipeInstruction[],
): MakeStep[] =>
  [...instructions]
    .sort((a, b) => a.step_number - b.step_number)
    .map((instruction) => {
      const text = instruction.instruction_text.trim();
      const minutes = instruction.time_minutes;
      const fromField =
        typeof minutes === "number" && minutes > 0
          ? Math.min(Math.round(minutes * 60), MAX_TIMER_SECONDS)
          : null;
      return {
        id: instruction.id,
        text,
        timerSeconds: fromField ?? durationInText(text),
      };
    })
    .filter((step) => step.text !== "");
