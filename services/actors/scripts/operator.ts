/**
 * The on-call operator's hands on the outbox: the three privileged methods the
 * alert runbook names, invoked through the actor host's own Dapr sidecar with
 * a `system` ctx.
 *
 *   bun scripts/operator.ts drain
 *   bun scripts/operator.ts report
 *   bun scripts/operator.ts ack --by <who> [--note <why>] [--ids <id,id,…>]
 *                               [--target-actor <Type>] [--method <m>] [--before <ISO-8601>]
 *
 * | command  | invokes                                   | what for |
 * |----------|-------------------------------------------|----------|
 * | `drain`  | `OutboxActor.drain`                        | one drain turn now, rather than on the next 2s tick; prints its `DrainResult` |
 * | `report` | `MaintenanceActor.reportDeadLetters`       | the dead-letter report now, rather than within the hour; prints it |
 * | `ack`    | `MaintenanceActor.acknowledgeDeadLetters`  | record a triage decision so the dead-letter alarm stops paging for those rows (only rows already `dead`; `--by` is required and stored) |
 * | `reembed`| `VectorReembedJobActor(<id>).start`, then `progress` until terminal | re-embed every vector another embedding model made — the cutover step after `gemini-embedding-2` |
 *
 *   bun scripts/operator.ts reembed [--batch-size N] [--max-vectors N]
 *                                   [--tables item_vectors,recipe_vectors]
 *                                   [--poll-seconds 5] [--job-id <uuid>]
 *
 * `reembed` starts a job under a fresh id (printed first) and polls it every
 * `--poll-seconds`, printing a line whenever its progress changes — status,
 * the re-embedded / skipped / failed tallies, and why it stopped if it did —
 * until it is terminal. The job runs in the actor host, not here:
 * interrupting the script leaves it running, and `--job-id <that id>` watches
 * it again — `start` on an existing id returns the job rather than starting a
 * second one.
 *
 * A job that runs out of embedding budget **completes**: its chain stops
 * rather than spending a refusal per vector, so `completed` alone does not
 * mean every vector is on the new model. That case exits 3, not 0 — the
 * cursor's `stopped` says why, and stale vectors are left. Raise the budget
 * and run `reembed` again **without** `--job-id` (a new job; the walk finds
 * only what is still stale).
 *
 * Nor does a job whose walk finished with rows that **failed** to re-embed:
 * a failed row is counted, logged (`vector_reembed.row_failed`, with its id)
 * and passed over, so the job completes with those vectors still on the old
 * model. That exits 4. Check the failures, fix their cause, and run `reembed`
 * again without `--job-id` — the new walk retries exactly the rows still
 * stale. A job that did both exits 3: the rerun after raising the budget
 * retries the failed rows too.
 *
 * Exit 0 is the job's word that it is done. It is not a proof: the runbook's
 * stale-count query (docs/architecture/deploy-loki.md §4.2) reading zero is.
 *
 * ## Where to run it
 *
 * Wherever the actor host's sidecar is reachable, which is usually **inside
 * the actors container** — neither compose file publishes `actors-dapr`'s port:
 *
 *   docker exec cellar-stack-actors-1 bun scripts/operator.ts drain           # shared lane
 *   docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
 *     --env-file infra/.env.prod \
 *     exec actors bun scripts/operator.ts ack --by jared --note "INC-12: requeued"   # production
 *
 * (`--env-file` is not optional there: the production overlay's `:?`
 * variables come from `infra/.env.prod`, and without it compose refuses to
 * render the project at all.)
 *
 * For the per-worktree lane, from `services/actors` on the host, with the
 * port `bun run dev:ports` prints for the actors sidecar:
 *
 *   DAPR_HTTP_PORT=<port> bun scripts/operator.ts report
 *
 * ## The sidecar and its token
 *
 * `DAPR_HOST` / `DAPR_HTTP_PORT` — the same names the host itself reads
 * (`src/config.ts`), which the container already has — default to
 * `127.0.0.1:3502`. The token is `DAPR_API_TOKEN` from the environment (the
 * container's), else `scripts/stack/stack.sh dapr-token` when this is a repo
 * checkout: that resolves infra/.env, then the published development default,
 * exactly as the stack was started. It is passed to the sidecar and **never
 * printed**.
 *
 * ## Why a `system` ctx
 *
 * All four are `requirePrivileged` (system or admin), and an admin ctx needs
 * a user id this operator may not have. A system ctx is what the drain
 * reminder and the maintenance chain run with. It is not a new capability:
 * holding `DAPR_API_TOKEN` already lets a caller invoke any declared method
 * through the sidecar; this script just does it with the arguments spelled
 * out and the answer read correctly (a typed actor error is a `200` with
 * `x-daprerrorresponseheader`, which `invokeActorOverSidecar` turns back into
 * the error).
 *
 * Exit status:
 *
 * | code | meaning |
 * |------|---------|
 * | 0 | done — for `reembed`, `completed` with no `stopped` and no `failed` rows |
 * | 1 | the call failed (the actor's refusal, the sidecar's, or no answer); for `reembed` also `failed`, `cancelled`, or the watch given up after repeated failed polls |
 * | 2 | usage |
 * | 3 | `reembed` only: `completed`, but stopped on the embedding budget with stale vectors left ({@link EXIT_REEMBED_STOPPED}) |
 * | 4 | `reembed` only: `completed` walking every row, but some failed to re-embed and are still stale ({@link EXIT_REEMBED_FAILED}) |
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type Ctx,
  invokeActorOverSidecar,
  isActorError,
  type JobDto,
  systemCtx,
  VECTOR_REEMBED_JOB_ACTOR_TYPE,
  VECTOR_TABLES,
  type VectorReembedJobPayload,
  type VectorReembedProgress,
  type VectorTable,
} from "@cellar-assistant/contracts";

/** `OutboxActor`'s and `MaintenanceActor`'s type and singleton id. `operator.test.ts` holds these to the actors' own constants. */
export const OUTBOX = { type: "OutboxActor", id: "singleton" } as const;
export const MAINTENANCE = {
  type: "MaintenanceActor",
  id: "singleton",
} as const;

/** One invocation the command line asked for. */
export type OperatorCall = {
  readonly actorType: string;
  readonly actorId: string;
  readonly method: string;
  /** The argument after `ctx`, if the method takes one. */
  readonly payload?: unknown;
  readonly timeoutMs: number;
};

export class UsageError extends Error {}

/**
 * A drain turn is bounded by the drain deadline plus one delivery, each at most
 * half of `RECLAIM_AFTER` (10 min) — so wait for all of it and a little more.
 */
const DRAIN_TIMEOUT_MS = 610_000;
const DEFAULT_TIMEOUT_MS = 30_000;

const USAGE = [
  "usage: bun scripts/operator.ts drain",
  "       bun scripts/operator.ts report",
  "       bun scripts/operator.ts ack --by <who> [--note <why>] [--ids <id,…>]",
  "                                   [--target-actor <Type>] [--method <m>] [--before <ISO-8601>]",
  "       bun scripts/operator.ts reembed [--batch-size N] [--max-vectors N]",
  "                                   [--tables item_vectors,recipe_vectors] [--poll-seconds 5] [--job-id <uuid>]",
].join("\n");

/** The command line, as the call it asks for. Throws {@link UsageError}. */
export const parseCommand = (argv: readonly string[]): OperatorCall => {
  const [command, ...rest] = argv;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i] ?? "";
    const value = rest[i + 1];
    if (
      !flag.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new UsageError(
        `expected --flag value, got ${JSON.stringify(flag)}`,
      );
    }
    flags.set(flag.slice(2), value);
    i += 1;
  }
  const only = (allowed: readonly string[]): void => {
    const unknown = [...flags.keys()].filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new UsageError(
        `${command} does not take --${unknown.join(", --")}`,
      );
    }
  };
  switch (command) {
    case "drain":
      only([]);
      return { ...call(OUTBOX, "drain"), timeoutMs: DRAIN_TIMEOUT_MS };
    case "report":
      only([]);
      return call(MAINTENANCE, "reportDeadLetters");
    case "ack": {
      only(["by", "note", "ids", "target-actor", "method", "before"]);
      const by = flags.get("by")?.trim() ?? "";
      if (by === "") {
        throw new UsageError(
          "ack needs --by <who>: an acknowledgement silences an alarm, so it names who decided",
        );
      }
      const before = flags.get("before");
      if (before !== undefined && Number.isNaN(Date.parse(before))) {
        throw new UsageError(
          `--before must be an ISO-8601 instant, got ${before}`,
        );
      }
      const ids = flags.get("ids");
      const payload = {
        by,
        ...optional("note", flags.get("note")),
        ...(ids === undefined
          ? {}
          : {
              ids: ids
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id !== ""),
            }),
        ...optional("targetActor", flags.get("target-actor")),
        ...optional("method", flags.get("method")),
        ...optional("before", before),
      };
      return { ...call(MAINTENANCE, "acknowledgeDeadLetters"), payload };
    }
    default:
      throw new UsageError(
        command === undefined ? "no command" : `unknown command ${command}`,
      );
  }
};

const call = (
  actor: { readonly type: string; readonly id: string },
  method: string,
): OperatorCall => ({
  actorType: actor.type,
  actorId: actor.id,
  method,
  timeoutMs: DEFAULT_TIMEOUT_MS,
});

const optional = <K extends string>(
  key: K,
  value: string | undefined,
): Partial<Record<K, string>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, string>);

/**
 * The sidecar's API token: the environment's, else what `stack.sh dapr-token`
 * resolves (infra/.env, then the development default), else none. `stackSh`
 * is injectable so a test can stand in for the checkout.
 */
export const resolveDaprApiToken = (
  environment: NodeJS.ProcessEnv = process.env,
  stackSh: string | null = findStackSh(),
  run: (script: string) => { status: number | null; stdout: string } = (
    script,
  ) => spawnSync(script, ["dapr-token"], { encoding: "utf8" }),
): string | undefined => {
  const fromEnv = environment.DAPR_API_TOKEN;
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  if (stackSh === null) return undefined;
  const result = run(stackSh);
  return result.status === 0 && result.stdout !== ""
    ? result.stdout
    : undefined;
};

/** `scripts/stack/stack.sh` at the repo root, when this is a checkout. */
const findStackSh = (): string | null => {
  const candidate = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "scripts",
    "stack",
    "stack.sh",
  );
  return existsSync(candidate) ? candidate : null;
};

/** The sidecar's API root, from the same variables the host reads. */
export const sidecarBaseUrl = (
  environment: NodeJS.ProcessEnv = process.env,
): string =>
  `http://${environment.DAPR_HOST || "127.0.0.1"}:${environment.DAPR_HTTP_PORT || "3502"}/v1.0`;

/** The ctx every call carries: `system`, and a request id that says who. */
export const operatorCtx = (method: string, now = Date.now()): Ctx =>
  systemCtx(`operator:${method}:${now}`);

export type Invoke = typeof invokeActorOverSidecar;

/* -------------------------------------------------------------------------- */
/* reembed                                                                     */
/* -------------------------------------------------------------------------- */

/** What `reembed`'s command line asks for. */
export type ReembedCommand = {
  readonly jobId: string;
  readonly payload: VectorReembedJobPayload;
  readonly pollMs: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const positiveInt = (flag: string, raw: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new UsageError(`--${flag} must be a positive integer, got ${raw}`);
  }
  return value;
};

/** `reembed`'s flags (after the command word). Throws {@link UsageError}. */
export const parseReembed = (
  argv: readonly string[],
  newId: () => string = randomUUID,
): ReembedCommand => {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i] ?? "";
    const value = argv[i + 1];
    if (
      !flag.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new UsageError(
        `expected --flag value, got ${JSON.stringify(flag)}`,
      );
    }
    flags.set(flag.slice(2), value);
  }
  const allowed = [
    "batch-size",
    "max-vectors",
    "tables",
    "poll-seconds",
    "job-id",
  ];
  const unknown = [...flags.keys()].filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new UsageError(`reembed does not take --${unknown.join(", --")}`);
  }
  const jobId = flags.get("job-id") ?? newId();
  if (!UUID.test(jobId)) {
    throw new UsageError(`--job-id must be a lower-case uuid, got ${jobId}`);
  }
  const batchSize = flags.get("batch-size");
  const maxVectors = flags.get("max-vectors");
  const tables = flags.get("tables");
  const known: readonly string[] = VECTOR_TABLES;
  const tableList =
    tables === undefined
      ? undefined
      : tables
          .split(",")
          .map((table) => table.trim())
          .filter((table) => table !== "");
  const strange = (tableList ?? []).filter((table) => !known.includes(table));
  if (tableList?.length === 0 || strange.length > 0) {
    throw new UsageError(
      `--tables takes a comma list of ${VECTOR_TABLES.join(", ")}; got ${tables}`,
    );
  }
  return {
    jobId,
    pollMs:
      positiveInt("poll-seconds", flags.get("poll-seconds") ?? "5") * 1000,
    payload: {
      ...(batchSize === undefined
        ? {}
        : { batchSize: positiveInt("batch-size", batchSize) }),
      ...(maxVectors === undefined
        ? {}
        : { maxVectors: positiveInt("max-vectors", maxVectors) }),
      ...(tableList === undefined
        ? {}
        : { tables: tableList as VectorTable[] }),
    },
  };
};

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/** `reembed`: the job completed, but its chain stopped on the budget. */
export const EXIT_REEMBED_STOPPED = 3;

/** `reembed`: the job completed its walk, but rows failed and are still stale. */
export const EXIT_REEMBED_FAILED = 4;

/** How many `get`s in a row may fail before the script stops watching. */
const POLL_FAILURES_ALLOWED = 3;

const progressLine = ({ job, cursor }: VectorReembedProgress): string =>
  `${job.status} ${job.processed}${job.total === null ? "" : `/${job.total}`}` +
  (cursor === null
    ? ""
    : ` (re-embedded ${cursor.reembedded}, skipped ${cursor.skipped}, failed ${cursor.failed})`) +
  (job.attempts > 0 ? ` (batch attempts ${job.attempts})` : "") +
  (job.lastError === null ? "" : ` last error: ${job.lastError}`) +
  (cursor?.stopped == null ? "" : ` stopped: ${cursor.stopped}`);

/** Start the job, then watch it until it ends. Returns the exit status. */
const runReembed = async (
  command: ReembedCommand,
  send: (method: string, args: readonly unknown[]) => Promise<unknown>,
  out: (line: string) => void,
  err: (line: string) => void,
  sleep: (ms: number) => Promise<void>,
): Promise<number> => {
  const where = `${VECTOR_REEMBED_JOB_ACTOR_TYPE}/${command.jobId}`;
  let started: JobDto;
  try {
    started = (await send("start", [
      operatorCtx("reembed"),
      command.payload,
    ])) as JobDto;
  } catch (error) {
    err(failure(`${where}.start`, error));
    return 1;
  }
  out(
    `vector-reembed job ${command.jobId} ${started.startedAt === null ? "created" : "running"}; ` +
      `watch it again with: reembed --job-id ${command.jobId}`,
  );
  // `start` answers a `JobDto`, which has no cursor — so the exit status is
  // only ever decided on a `progress` answer, never on `start`'s. A job that
  // is already terminal (`--job-id` of a finished one) is read once, at once.
  let state: VectorReembedProgress = { job: started, cursor: null };
  let read = false;
  let last = progressLine(state);
  out(last);
  let failures = 0;
  while (!(read && TERMINAL.has(state.job.status))) {
    if (read || failures > 0 || !TERMINAL.has(state.job.status)) {
      await sleep(command.pollMs);
    }
    try {
      state = (await send("progress", [
        operatorCtx("reembed"),
      ])) as VectorReembedProgress;
      read = true;
      failures = 0;
    } catch (error) {
      failures += 1;
      err(failure(`${where}.progress`, error));
      if (failures >= POLL_FAILURES_ALLOWED) {
        err(
          `operator: stopped watching after ${failures} failed polls; the job ` +
            `keeps running. Resume with: reembed --job-id ${command.jobId}`,
        );
        return 1;
      }
      continue;
    }
    const line = progressLine(state);
    if (line !== last) out(line);
    last = line;
  }
  if (state.job.status !== "completed") return 1;
  const stopped = state.cursor?.stopped;
  if (stopped !== undefined && stopped !== null) {
    err(
      `operator: the job completed but stopped early (${stopped}); stale ` +
        "vectors are left. Raise the embedding budget and run reembed again " +
        "without --job-id: a new job walks only what is still stale.",
    );
    return EXIT_REEMBED_STOPPED;
  }
  const failed = state.cursor?.failed ?? 0;
  if (failed > 0) {
    err(
      `operator: the job completed but ${failed} vector(s) failed to re-embed ` +
        "and are still stale. Find them in the vector_reembed.row_failed " +
        "events, fix the cause, and run reembed again without --job-id: a " +
        "new job retries only what is still stale.",
    );
    return EXIT_REEMBED_FAILED;
  }
  return 0;
};

const failure = (where: string, error: unknown): string =>
  isActorError(error)
    ? `operator: ${where} refused: ${error.code}: ${error.message}`
    : `operator: ${where} failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;

/** Make the call and print the answer. Returns the exit status. */
export const runOperator = async (
  argv: readonly string[],
  options: {
    readonly environment?: NodeJS.ProcessEnv;
    readonly invoke?: Invoke;
    readonly token?: string | undefined;
    readonly out?: (line: string) => void;
    readonly err?: (line: string) => void;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly newId?: () => string;
  } = {},
): Promise<number> => {
  const out = options.out ?? ((line) => console.log(line));
  const err = options.err ?? ((line) => console.error(line));
  let request: OperatorCall | undefined;
  let reembed: ReembedCommand | undefined;
  try {
    if (argv[0] === "reembed") {
      reembed = parseReembed(argv.slice(1), options.newId);
    } else {
      request = parseCommand(argv);
    }
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(`operator: ${error.message}`);
    err(USAGE);
    return 2;
  }
  const environment = options.environment ?? process.env;
  const token =
    "token" in options ? options.token : resolveDaprApiToken(environment);
  const invoke = options.invoke ?? invokeActorOverSidecar;
  if (reembed !== undefined) {
    const jobId = reembed.jobId;
    return runReembed(
      reembed,
      (method, args) =>
        invoke({
          baseUrl: sidecarBaseUrl(environment),
          actorType: VECTOR_REEMBED_JOB_ACTOR_TYPE,
          actorId: jobId,
          method,
          args,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          ...(token === undefined ? {} : { apiToken: token }),
        }),
      out,
      err,
      options.sleep ??
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    );
  }
  if (request === undefined) return 2;
  const where = `${request.actorType}/${request.actorId}.${request.method}`;
  try {
    const result = await invoke({
      baseUrl: sidecarBaseUrl(environment),
      actorType: request.actorType,
      actorId: request.actorId,
      method: request.method,
      args: [
        operatorCtx(request.method),
        ...(request.payload === undefined ? [] : [request.payload]),
      ],
      timeoutMs: request.timeoutMs,
      ...(token === undefined ? {} : { apiToken: token }),
    });
    out(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    err(failure(where, error));
    return 1;
  }
};

const isEntryPoint = (): boolean => {
  const script = process.argv[1];
  if (script === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(script)).href;
  } catch {
    return false;
  }
};

if (isEntryPoint()) {
  runOperator(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`operator: ${String(error)}`);
      process.exit(1);
    },
  );
}
