/**
 * The process-level policy: a rejection nobody awaited is reported and the
 * host keeps running; an uncaught exception is reported, flushed, and exits 1.
 *
 * The first block drives the listeners through a fake `process`. The second
 * runs them in a real child process of the same runtime as this suite —
 * `process.execPath`, which is Bun under `bun run --bun vitest` — because
 * "the process stays up" and "the process exits 1" are claims about the
 * runtime, not about this module, and Bun's default on an unhandled rejection
 * (exit 1, measured on 1.4.2) is what took the actor host down.
 */
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type GuardedProcess, installProcessGuards } from "./process-guard.ts";

const OTLP = "http://otel.test:4318";

type Posted = { name: string; body: string };

/** Decode the one log record in an OTLP body into its event name. */
const eventName = (body: string): string => {
  const parsed = JSON.parse(body) as {
    resourceLogs: {
      scopeLogs: {
        logRecords: {
          attributes: { key: string; value: { stringValue?: string } }[];
        }[];
      }[];
    }[];
  };
  const record = parsed.resourceLogs[0]?.scopeLogs[0]?.logRecords[0];
  return (
    record?.attributes.find((a) => a.key === "event.name")?.value.stringValue ??
    ""
  );
};

/** A DrizzleQueryError-shaped failure whose message is the thing to keep out. */
const queryFailure = (): Error =>
  Object.assign(new Error("Failed query: select … params: secret-value"), {
    name: "DrizzleQueryError",
    cause: Object.assign(new Error("invalid input syntax"), {
      name: "DatabaseError",
      code: "22P02",
    }),
  });

describe("installProcessGuards, against a fake process", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const setUp = () => {
    const posted: Posted[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", OTLP);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = String(init?.body);
        posted.push({ name: eventName(body), body });
        // The collector answers only when the test says so, so "exit waited
        // for the post" is observable.
        await gate;
        return new Response(null, { status: 200 });
      }),
    );
    const printed: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      printed.push(String(line));
    });
    const proc = new EventEmitter();
    const exit = vi.fn();
    installProcessGuards({ proc: proc as unknown as GuardedProcess, exit });
    return { proc, exit, posted, printed, release };
  };

  it("reports an unhandled rejection and does not exit", async () => {
    const { proc, exit, posted, printed, release } = setUp();
    release();

    proc.emit("unhandledRejection", queryFailure());
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(exit).not.toHaveBeenCalled();
    expect(posted.map((p) => p.name)).toEqual(["process.unhandled_rejection"]);
    const [line = ""] = printed;
    expect(line.split("\n")[0]).toBe(
      "[process.unhandled_rejection] unhandled rejection: DrizzleQueryError; the host keeps running " +
        JSON.stringify({
          "error.name": "DrizzleQueryError",
          "error.code": "22P02",
          "error.cause": "DatabaseError",
        }),
    );
    expect(printed.join("\n")).not.toContain("secret-value");
    expect(posted[0]?.body).not.toContain("secret-value");
  });

  it("reports an uncaught exception, waits for the post, then exits 1", async () => {
    const { proc, exit, posted, release } = setUp();

    proc.emit("uncaughtException", queryFailure(), "uncaughtException");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(posted.map((p) => p.name)).toEqual(["process.fatal"]);
    // The post is still in flight: exiting now would drop the one event that
    // says why the host went down.
    expect(exit).not.toHaveBeenCalled();

    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(posted[0]?.body).not.toContain("secret-value");
  });

  it("flushes once even if a second exception lands while the first is flushing", async () => {
    const { proc, exit, posted, release } = setUp();
    proc.emit("uncaughtException", new TypeError("one"), "uncaughtException");
    proc.emit("uncaughtException", new TypeError("two"), "uncaughtException");
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(posted).toHaveLength(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("installProcessGuards, in a real child process", () => {
  const GUARD = fileURLToPath(new URL("./process-guard.ts", import.meta.url));

  /**
   * Reject a promise nobody awaits; if still alive 100ms later, say so and
   * throw from a timer. With the guards: "alive", then exit 1 from the
   * exception. Without them (the control): exit 1 from the rejection, and
   * "alive" never printed.
   */
  const run = (guarded: boolean) => {
    const dir = mkdtempSync(join(tmpdir(), "actorcrash-guard-"));
    const script = join(dir, "child.ts");
    writeFileSync(
      script,
      [
        `import { installProcessGuards } from ${JSON.stringify(GUARD)};`,
        guarded ? "installProcessGuards();" : "",
        `void Promise.reject(Object.assign(new Error("rejected with secret-value"), { code: "22P02" }));`,
        `setTimeout(() => {`,
        `  console.log("alive after the rejection");`,
        `  setTimeout(() => { throw new TypeError("thrown with secret-value"); }, 0);`,
        `}, 100);`,
      ].join("\n"),
    );
    try {
      return spawnSync(process.execPath, [script], {
        encoding: "utf8",
        timeout: 20_000,
        env: { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: "" },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("keeps running through a rejection, and exits 1 on an exception, having said why", () => {
    const child = run(true);

    expect(child.stdout).toContain("alive after the rejection");
    expect(child.status).toBe(1);
    expect(child.stderr).toContain(
      '[process.unhandled_rejection] unhandled rejection: Error; the host keeps running {"error.name":"Error","error.code":"22P02"}',
    );
    expect(child.stderr).toContain(
      "[process.fatal] uncaught exception: TypeError; the host is exiting",
    );
    expect(`${child.stdout}${child.stderr}`).not.toContain("secret-value");
  });

  it("control: without the guards, the rejection alone ends the process", () => {
    const child = run(false);

    expect(child.stdout).not.toContain("alive after the rejection");
    expect(child.status).not.toBe(0);
  });
});
