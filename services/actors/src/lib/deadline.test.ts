/**
 * `withDeadline` (`./deadline.ts`) — moved here from
 * `place-creation-actor.test.ts` when X27 took the AI review out of the
 * creation turn, which was the deadline's first user (N09).
 */
import { describe, expect, it } from "vitest";
import { DeadlineExceededError, withDeadline } from "./deadline.ts";

describe("withDeadline (N09)", () => {
  it("resolves with the work when it finishes first", async () => {
    await expect(
      withDeadline(Promise.resolve("done"), 1_000, () => new Error("late")),
    ).resolves.toBe("done");
  });

  it("rejects with the timeout error when the deadline passes first", async () => {
    const never = new Promise<string>(() => {});
    await expect(
      withDeadline(never, 10, () => new DeadlineExceededError("late")),
    ).rejects.toBeInstanceOf(DeadlineExceededError);
  });

  it("propagates the work's own rejection", async () => {
    await expect(
      withDeadline(
        Promise.reject(new Error("model down")),
        1_000,
        () => new Error("late"),
      ),
    ).rejects.toThrow("model down");
  });

  it("treats a non-positive or non-finite deadline as none", async () => {
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve("eventually"), 20),
    );
    await expect(withDeadline(slow, 0, () => new Error("late"))).resolves.toBe(
      "eventually",
    );
  });

  it("cancels work handed as a function: its signal aborts at the deadline, with the timeout error as reason", async () => {
    let seen: AbortSignal | undefined;
    const late = new DeadlineExceededError("late");
    await expect(
      withDeadline(
        (signal) => {
          seen = signal;
          return new Promise<string>(() => {});
        },
        10,
        () => late,
      ),
    ).rejects.toBe(late);
    expect(seen?.aborted).toBe(true);
    expect(seen?.reason).toBe(late);
  });

  it("leaves the signal alone when the work wins", async () => {
    let seen: AbortSignal | undefined;
    await expect(
      withDeadline(
        async (signal) => {
          seen = signal;
          return "done";
        },
        1_000,
        () => new Error("late"),
      ),
    ).resolves.toBe("done");
    expect(seen?.aborted).toBe(false);
  });
});
