/**
 * `scripts/operator.ts` — the runbook's `drain`, `report`, `ack` and `reembed`. The
 * sidecar hop is replaced; the actors on the far side are the real ones, on
 * the run's test database, so what is proven is that the command line becomes
 * a call those methods accept.
 */
import {
  type Ctx,
  declaredMethods,
  type JobDto,
  NotFoundError,
  VECTOR_REEMBED_JOB_ACTOR_TYPE,
  type VectorReembedCursor,
  VectorReembedJobActorDescriptor,
  type VectorReembedJobPayload,
  type VectorReembedProgress,
} from "@cellar-assistant/contracts";
import { jobs, outbox } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it, onTestFinished } from "vitest";
import {
  MAINTENANCE_ACTOR_ID,
  MaintenanceActor,
} from "../src/actors/maintenance-actor.ts";
import {
  MAINTENANCE_ACTOR_TYPE,
  MaintenanceActorDescriptor,
} from "../src/actors/maintenance-actor-descriptor.ts";
import {
  OUTBOX_ACTOR_ID,
  OUTBOX_ACTOR_TYPE,
  OutboxActor,
  OutboxActorDescriptor,
} from "../src/actors/outbox-actor.ts";
import { VectorReembedJobActor } from "../src/actors/vector-reembed-job-actor.ts";
import { isWellFormedCtx } from "../src/lib/actor-method-allowlist.ts";
import type { DbOrTx } from "../src/lib/db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  insertOutboxRowForTest,
  resolveTestDatabase,
  withTestDb,
} from "../src/lib/testing.ts";
import { setEmbeddingModel } from "../src/lib/vectors.ts";
import {
  EXIT_REEMBED_FAILED,
  EXIT_REEMBED_STOPPED,
  type Invoke,
  MAINTENANCE,
  OUTBOX,
  parseCommand,
  parseReembed,
  resolveDaprApiToken,
  runOperator,
  sidecarBaseUrl,
  UsageError,
} from "./operator.ts";

const TOKEN = "not-a-real-token-but-a-secret-all-the-same";

/** Captures the invocation, answers with `answer`. */
const recording = (answer: () => Promise<unknown>) => {
  const seen: Parameters<Invoke>[0][] = [];
  const invoke: Invoke = async (request) => {
    seen.push(request);
    return answer();
  };
  return { invoke, seen };
};

const run = async (argv: string[], invoke: Invoke) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runOperator(argv, {
    environment: { DAPR_HOST: "actors-dapr", DAPR_HTTP_PORT: "3502" },
    invoke,
    token: TOKEN,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
};

describe("operator: the command line", () => {
  it("names the actors and methods the host really has", () => {
    expect(OUTBOX).toEqual({ type: OUTBOX_ACTOR_TYPE, id: OUTBOX_ACTOR_ID });
    expect(MAINTENANCE).toEqual({
      type: MAINTENANCE_ACTOR_TYPE,
      id: MAINTENANCE_ACTOR_ID,
    });
    expect(declaredMethods(OutboxActorDescriptor)).toContain(
      parseCommand(["drain"]).method,
    );
    for (const argv of [["report"], ["ack", "--by", "me"]]) {
      expect(declaredMethods(MaintenanceActorDescriptor)).toContain(
        parseCommand(argv).method,
      );
    }
    // What `reembed` calls: `start`, then `progress` (the one with a cursor).
    expect(declaredMethods(VectorReembedJobActorDescriptor)).toEqual(
      expect.arrayContaining(["start", "progress"]),
    );
  });

  it("turns ack's flags into the method's payload", () => {
    expect(
      parseCommand([
        "ack",
        "--by",
        " jared ",
        "--note",
        "INC-12",
        "--ids",
        "a, b,,c",
        "--target-actor",
        "ItemActor",
        "--method",
        "create",
        "--before",
        "2026-09-28T00:00:00Z",
      ]).payload,
    ).toEqual({
      by: "jared",
      note: "INC-12",
      ids: ["a", "b", "c"],
      targetActor: "ItemActor",
      method: "create",
      before: "2026-09-28T00:00:00Z",
    });
  });

  it("refuses an ack that names nobody, a flag a command does not take, and nonsense", () => {
    for (const argv of [
      ["ack"],
      ["ack", "--by", "  "],
      ["ack", "--by", "me", "--before", "yesterday"],
      ["drain", "--by", "me"],
      ["ack", "--by"],
      ["purge"],
      [],
    ]) {
      expect(() => parseCommand(argv), argv.join(" ")).toThrow(UsageError);
    }
  });

  it("exits 2 with the usage on a bad command line, and calls nothing", async () => {
    const { invoke, seen } = recording(async () => null);
    const result = await run(["ack"], invoke);
    expect(result.code).toBe(2);
    expect(result.err).toContain("usage:");
    expect(seen).toEqual([]);
  });

  it("reads the sidecar's address from the variables the host reads", () => {
    expect(sidecarBaseUrl({})).toBe("http://127.0.0.1:3502/v1.0");
    expect(
      sidecarBaseUrl({ DAPR_HOST: "actors-dapr", DAPR_HTTP_PORT: "9" }),
    ).toBe("http://actors-dapr:9/v1.0");
  });

  it("takes the token from the environment first, then stack.sh, and never prints it", async () => {
    const ran: string[] = [];
    const stack = (script: string) => {
      ran.push(script);
      return { status: 0, stdout: "from-stack" };
    };
    expect(
      resolveDaprApiToken({ DAPR_API_TOKEN: "from-env" }, "/s", stack),
    ).toBe("from-env");
    expect(ran).toEqual([]);
    expect(resolveDaprApiToken({}, "/s", stack)).toBe("from-stack");
    expect(resolveDaprApiToken({}, null, stack)).toBeUndefined();
    expect(
      resolveDaprApiToken({}, "/s", () => ({ status: 1, stdout: "" })),
    ).toBeUndefined();

    const { invoke, seen } = recording(async () => ({ ok: true }));
    const result = await run(["drain"], invoke);
    expect(seen[0]?.apiToken).toBe(TOKEN);
    expect(`${result.out}\n${result.err}`).not.toContain(TOKEN);
  });

  it("sends a well-formed system ctx, then the payload, to the right actor", async () => {
    const { invoke, seen } = recording(async () => ({ acknowledged: 0 }));
    const result = await run(["ack", "--by", "me"], invoke);
    expect(result.code).toBe(0);
    const [request] = seen;
    expect(request).toMatchObject({
      baseUrl: "http://actors-dapr:3502/v1.0",
      actorType: MAINTENANCE_ACTOR_TYPE,
      actorId: MAINTENANCE_ACTOR_ID,
      method: "acknowledgeDeadLetters",
    });
    const [ctx, payload] = request?.args ?? [];
    expect(isWellFormedCtx(ctx)).toBe(true);
    expect((ctx as Ctx).kind).toBe("system");
    expect(payload).toEqual({ by: "me" });
    expect(JSON.parse(result.out)).toEqual({ acknowledged: 0 });
  });

  it("exits 1 on the actor's refusal, saying which, and on no answer", async () => {
    const refused = await run(
      ["report"],
      recording(async () => {
        throw new NotFoundError("gone");
      }).invoke,
    );
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("refused: NOT_FOUND: gone");

    const silent = await run(
      ["drain"],
      recording(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }).invoke,
    );
    expect(silent.code).toBe(1);
    expect(silent.err).toContain("TimeoutError");
  });
});

/* -------------------------------------------------------------------------- */
/* reembed                                                                     */
/* -------------------------------------------------------------------------- */

const JOB_ID = "0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

const job = (over: Partial<JobDto>): JobDto => ({
  id: JOB_ID,
  kind: "vector-reembed",
  status: "running",
  total: null,
  processed: 0,
  attempts: 0,
  lastError: null,
  cancelRequested: false,
  createdBy: null,
  createdAt: "2026-09-28T00:00:00.000Z",
  updatedAt: "2026-09-28T00:00:00.000Z",
  startedAt: "2026-09-28T00:00:00.000Z",
  finishedAt: null,
  ...over,
});

const cursor = (over: Partial<VectorReembedCursor>): VectorReembedCursor => ({
  table: "item_vectors",
  lastId: 0,
  model: "gemini-embedding-2",
  reembedded: 0,
  skipped: 0,
  failed: 0,
  ...over,
});

/** A `progress` answer: the job, and its cursor once a batch has run. */
const progress = (
  over: Partial<JobDto>,
  at: Partial<VectorReembedCursor> | null = null,
): VectorReembedProgress => ({
  job: job(over),
  cursor: at === null ? null : cursor(at),
});

/** Answers `start` with the first state and each `progress` with the next. */
const scripted = (
  states: readonly (JobDto | VectorReembedProgress | Error)[],
) => {
  const seen: Parameters<Invoke>[0][] = [];
  let at = 0;
  const invoke: Invoke = async (request) => {
    seen.push(request);
    const next = states[Math.min(at, states.length - 1)];
    at += 1;
    if (next instanceof Error) throw next;
    return next;
  };
  return { invoke, seen };
};

const reembed = async (argv: string[], invoke: Invoke) => {
  const out: string[] = [];
  const err: string[] = [];
  const slept: number[] = [];
  const code = await runOperator(["reembed", ...argv], {
    environment: {},
    invoke,
    token: TOKEN,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    sleep: async (ms) => {
      slept.push(ms);
    },
    newId: () => JOB_ID,
  });
  return { code, out, err, slept };
};

describe("operator: reembed", () => {
  it("parses its flags into the job's payload", () => {
    expect(parseReembed([], () => JOB_ID)).toEqual({
      jobId: JOB_ID,
      pollMs: 5_000,
      payload: {},
    });
    expect(
      parseReembed(
        [
          "--batch-size",
          "20",
          "--max-vectors",
          "100",
          "--tables",
          "recipe_vectors, item_vectors",
          "--poll-seconds",
          "2",
          "--job-id",
          JOB_ID,
        ],
        () => "unused",
      ),
    ).toEqual({
      jobId: JOB_ID,
      pollMs: 2_000,
      payload: {
        batchSize: 20,
        maxVectors: 100,
        tables: ["recipe_vectors", "item_vectors"],
      },
    });
    for (const argv of [
      ["--batch-size", "0"],
      ["--max-vectors", "1.5"],
      ["--tables", "cellars"],
      ["--tables", ","],
      ["--job-id", "not-a-uuid"],
      ["--by", "me"],
    ]) {
      expect(() => parseReembed(argv), argv.join(" ")).toThrow(UsageError);
    }
  });

  it("starts the job with a system ctx, then polls it to completion, printing only changes", async () => {
    const { invoke, seen } = scripted([
      job({}),
      progress({ processed: 10, total: 30 }, { reembedded: 9, skipped: 1 }),
      progress({ processed: 10, total: 30 }, { reembedded: 9, skipped: 1 }),
      progress(
        { processed: 30, total: 30, status: "completed" },
        { reembedded: 28, skipped: 2 },
      ),
    ]);
    const result = await reembed(["--max-vectors", "30"], invoke);
    expect(result.code).toBe(0);
    expect(seen.map((r) => `${r.actorType}/${r.actorId}.${r.method}`)).toEqual([
      `${VECTOR_REEMBED_JOB_ACTOR_TYPE}/${JOB_ID}.start`,
      `${VECTOR_REEMBED_JOB_ACTOR_TYPE}/${JOB_ID}.progress`,
      `${VECTOR_REEMBED_JOB_ACTOR_TYPE}/${JOB_ID}.progress`,
      `${VECTOR_REEMBED_JOB_ACTOR_TYPE}/${JOB_ID}.progress`,
    ]);
    const [ctx, payload] = seen[0]?.args ?? [];
    expect(isWellFormedCtx(ctx)).toBe(true);
    expect((ctx as Ctx).kind).toBe("system");
    expect(payload).toEqual({ maxVectors: 30 });
    expect(seen.every((r) => r.apiToken === TOKEN)).toBe(true);
    expect(result.out[0]).toContain(`--job-id ${JOB_ID}`);
    expect(result.out.slice(1)).toEqual([
      "running 0",
      "running 10/30 (re-embedded 9, skipped 1, failed 0)",
      "completed 30/30 (re-embedded 28, skipped 2, failed 0)",
    ]);
    expect(result.slept).toEqual([5_000, 5_000, 5_000]);
    expect(result.err).toEqual([]);
  });

  /*
   * A budget refusal stops the chain and *completes* the job, so `completed`
   * was an exit 0 for a run that left stale vectors behind — and the line
   * printed never said so, because `JobDto` has no cursor.
   */
  it("exits 3, not 0, when the job completed but stopped on the budget, and says why", async () => {
    const stopped = await reembed(
      [],
      scripted([
        job({}),
        progress(
          { processed: 12, status: "completed" },
          {
            reembedded: 12,
            stopped: "BUDGET_EXCEEDED: embedding budget spent",
          },
        ),
      ]).invoke,
    );
    expect(stopped.code).toBe(EXIT_REEMBED_STOPPED);
    expect(EXIT_REEMBED_STOPPED).not.toBe(0);
    expect(EXIT_REEMBED_STOPPED).not.toBe(1);
    expect(EXIT_REEMBED_STOPPED).not.toBe(2);
    expect(stopped.out.at(-1)).toBe(
      "completed 12 (re-embedded 12, skipped 0, failed 0) stopped: BUDGET_EXCEEDED: embedding budget spent",
    );
    expect(stopped.err.join("\n")).toContain("stale vectors are left");
    expect(stopped.err.join("\n")).toContain("without --job-id");

    // A null `stopped` is a finished walk.
    const clean = await reembed(
      [],
      scripted([
        job({}),
        progress({ status: "completed" }, { reembedded: 3, stopped: null }),
      ]).invoke,
    );
    expect(clean.code).toBe(0);
  });

  /*
   * A row that fails to re-embed is counted and passed over, so the walk
   * finishes and the job *completes* with that vector still on the old model
   * — the same "completed but not done" shape as a budget stop, and it exited
   * 0 the same way.
   */
  it("exits 4 — not 0, and not the budget's 3 — when rows failed, and says what to do", async () => {
    const failed = await reembed(
      [],
      scripted([
        job({}),
        progress(
          { processed: 30, total: 30, status: "completed" },
          { reembedded: 27, skipped: 1, failed: 2, stopped: null },
        ),
      ]).invoke,
    );
    expect(failed.code).toBe(EXIT_REEMBED_FAILED);
    for (const other of [0, 1, 2, EXIT_REEMBED_STOPPED]) {
      expect(EXIT_REEMBED_FAILED).not.toBe(other);
    }
    expect(failed.out.at(-1)).toBe(
      "completed 30/30 (re-embedded 27, skipped 1, failed 2)",
    );
    const said = failed.err.join("\n");
    expect(said).toContain("2 vector(s) failed");
    expect(said).toContain("vector_reembed.row_failed");
    expect(said).toContain("without --job-id");

    // Stopped on the budget *and* rows failed: the budget's 3, because the
    // rerun it asks for retries the failed rows too.
    const both = await reembed(
      [],
      scripted([
        job({}),
        progress(
          { status: "completed", processed: 4 },
          { reembedded: 3, failed: 1, stopped: "BUDGET_EXCEEDED" },
        ),
      ]).invoke,
    );
    expect(both.code).toBe(EXIT_REEMBED_STOPPED);

    // The same answer read by `--job-id` of an already-finished job.
    const watched = await reembed(
      ["--job-id", JOB_ID],
      scripted([
        job({ status: "completed", processed: 30 }),
        progress({ status: "completed", processed: 30 }, { failed: 1 }),
      ]).invoke,
    );
    expect(watched.code).toBe(EXIT_REEMBED_FAILED);
  });

  it("decides on progress, not on start's cursorless answer: watching a finished job reads it once", async () => {
    // `--job-id` of a job that already completed on the budget: `start`
    // returns it terminal, and that must not read as a clean exit.
    const { invoke, seen } = scripted([
      job({ status: "completed", processed: 5 }),
      progress(
        { status: "completed", processed: 5 },
        { reembedded: 5, stopped: "BUDGET_EXCEEDED" },
      ),
    ]);
    const result = await reembed(["--job-id", JOB_ID], invoke);
    expect(result.code).toBe(EXIT_REEMBED_STOPPED);
    expect(seen.map((r) => r.method)).toEqual(["start", "progress"]);
    expect(result.slept).toEqual([]);
  });

  it("exits 1 when the job fails or is cancelled, with its last error", async () => {
    const failed = await reembed(
      [],
      scripted([
        job({}),
        progress({ status: "failed", attempts: 10, lastError: "embed: 503" }),
      ]).invoke,
    );
    expect(failed.code).toBe(1);
    expect(failed.out.at(-1)).toBe(
      "failed 0 (batch attempts 10) last error: embed: 503",
    );
    const cancelled = await reembed(
      [],
      scripted([
        job({ status: "cancelled" }),
        progress({ status: "cancelled" }),
      ]).invoke,
    );
    expect(cancelled.code).toBe(1);
    expect(cancelled.slept).toEqual([]);
  });

  it("rides out a failed poll, and stops watching after three, saying how to resume", async () => {
    const blip = await reembed(
      [],
      scripted([
        job({}),
        new Error("socket hang up"),
        progress({ status: "completed", processed: 1 }),
      ]).invoke,
    );
    expect(blip.code).toBe(0);
    expect(blip.err).toHaveLength(1);

    const gone = await reembed(
      [],
      scripted([job({}), new Error("sidecar down")]).invoke,
    );
    expect(gone.code).toBe(1);
    expect(gone.err.at(-1)).toContain(`reembed --job-id ${JOB_ID}`);
    expect(gone.slept).toHaveLength(3);
  });

  it("exits 1 on a refused start, and polls nothing", async () => {
    const { invoke, seen } = scripted([new NotFoundError("no such job")]);
    const result = await reembed([], invoke);
    expect(result.code).toBe(1);
    expect(result.err.join("\n")).toContain("start refused: NOT_FOUND");
    expect(seen).toHaveLength(1);
  });
});

const { skip } = await resolveTestDatabase();

/** An invoke that hands the call to real actors on the test database. */
const inProcess =
  (db: DbOrTx): Invoke =>
  async (request) => {
    const [ctx, payload] = request.args as [Ctx, unknown];
    if (request.actorType === VECTOR_REEMBED_JOB_ACTOR_TYPE) {
      const actor = await activate(
        createActor(VectorReembedJobActor, request.actorId, db),
      );
      return request.method === "start"
        ? actor.start(ctx, payload as VectorReembedJobPayload)
        : actor.progress(ctx);
    }
    if (request.actorType === OUTBOX_ACTOR_TYPE) {
      const actor = await activate(
        createActor(OutboxActor, request.actorId, db),
      );
      return actor.drain(ctx);
    }
    const actor = await activate(
      createActor(MaintenanceActor, request.actorId, db),
    );
    if (request.method === "acknowledgeDeadLetters") {
      return actor.acknowledgeDeadLetters(
        ctx,
        payload as Parameters<MaintenanceActor["acknowledgeDeadLetters"]>[1],
      );
    }
    return actor.reportDeadLetters(ctx);
  };

describe.skipIf(skip)("operator: against the real actors", () => {
  afterAll(closeTestDb);

  it("acknowledges a dead row by id, as the operator named on the command line", async () => {
    await withTestDb(async (db) => {
      const id = await insertOutboxRowForTest(db, {
        targetActor: "ItemActor",
        targetId: "operator-test",
        method: "regenerateVector",
      });
      await db
        .update(outbox)
        .set({ status: "dead", attempts: 10 })
        .where(eq(outbox.id, id));

      const result = await run(
        ["ack", "--by", "operator-test", "--note", "known", "--ids", id],
        inProcess(db),
      );
      expect(result.err).toBe("");
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out)).toMatchObject({
        acknowledged: 1,
        ids: [id],
      });
    });
  });

  it("starts a real re-embed job with the operator's ctx, and reads it back", async () => {
    // `start` refuses a process with no embedding configured; boot installs
    // one beside the embedder.
    setEmbeddingModel({
      key: "test:model@3/RETRIEVAL_DOCUMENT",
      acceptsImages: false,
    });
    onTestFinished(() => setEmbeddingModel(null));
    await withTestDb(async (db) => {
      const real = inProcess(db);
      const methods: string[] = [];
      // Nothing drains the outbox here, so the job never moves: the first
      // poll is answered by the real actor, and the rest fail, which is how
      // the watch ends without a terminal status.
      const invoke: Invoke = async (request) => {
        methods.push(request.method);
        if (request.method === "progress" && methods.length > 2) {
          throw new Error("no sidecar here");
        }
        return real(request);
      };
      const out: string[] = [];
      const err: string[] = [];
      const code = await runOperator(
        ["reembed", "--max-vectors", "1", "--job-id", JOB_ID],
        {
          environment: {},
          invoke,
          token: undefined,
          out: (line) => out.push(line),
          err: (line) => err.push(line),
          sleep: async () => {},
        },
      );
      // start and the first progress: both accepted the operator's system ctx.
      expect(err.filter((line) => line.includes("refused"))).toEqual([]);
      expect(out.slice(1)).toEqual(["running 0"]);
      expect(code).toBe(1);
      expect(err.at(-1)).toContain(`reembed --job-id ${JOB_ID}`);
      const [row] = await db
        .select({ kind: jobs.kind, createdBy: jobs.createdBy })
        .from(jobs)
        .where(eq(jobs.id, JOB_ID));
      expect(row).toEqual({ kind: "vector-reembed", createdBy: null });
    });
  });

  it("drains and reports, both accepting the operator's ctx", async () => {
    await withTestDb(async (db) => {
      const drained = await run(["drain"], inProcess(db));
      expect(drained.err).toBe("");
      expect(JSON.parse(drained.out)).toHaveProperty("claimed");
      const reported = await run(["report"], inProcess(db));
      expect(reported.err).toBe("");
      expect(reported.code).toBe(0);
    });
  });
});
