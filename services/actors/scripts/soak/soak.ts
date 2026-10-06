/**
 * The soak driver: representative traffic against a running actor host, with
 * memory, event-loop, reminder and Postgres health sampled to a file that can be
 * read hours later.
 *
 *   bun  scripts/soak/soak.ts  --seconds 1800 --out .stack/<slug>/soak/run-1
 *   node scripts/soak/soak.ts  --seconds 1800 --out .stack/<slug>/soak/run-1
 *
 * Normally started by `scripts/soak/run-soak.sh`, which brings the host up on
 * the runtime under test and passes the ports; it runs standalone against any
 * already-running stack too.
 *
 * ## The failure this is built to catch
 *
 * Not a red test. A host that passes CI, serves traffic, and then hours later
 * grows RSS until it OOMs — or quietly stops firing actor reminders — in the one
 * process that owns the database, with nothing failing anywhere. So every signal
 * here is a *trend over time*, written to disk as it is taken, and the summary
 * is a slope rather than a pass/fail.
 *
 * ## The traffic, and why each stream is in the mix
 *
 * | stream | exercises |
 * |---|---|
 * | `PingActor.ping` through a sidecar | sidecar → app: HTTP dispatch, actor activation, turn serialization |
 * | `outbox` rows targeting `PingActor.ping` | app → sidecar: the only direction that could put `@dapr/dapr` on grpc-js / `node:http2` |
 * | `ReferenceDataActor.all` | `pg`, the pool, and a real query under concurrency |
 * | `GET /api/auth/jwks` | better-auth on the same Express app, ahead of Dapr's body-parser |
 * | one timed outbox probe row every `--probe-seconds` | **the 2 s drain reminder is still firing** — enqueue-to-delivered latency is the liveness signal |
 *
 * The outbox stream is the load-bearing one for the leak question. An inbound
 * actor call never makes the host originate an RPC; an outbox delivery does
 * (`src/lib/sidecar.ts`), and originating is what would accumulate per-RPC
 * state on an HTTP/2 session if this app had one.
 *
 * `PingActor.ping` is the outbox's one declared *operational probe*
 * (`services/actors/src/lib/outbox-targets.ts`): the drainer refuses any undeclared
 * pair on attempt 1, so these rows only exercise delivery because it is
 * declared. The run checks that first — one probe row must be delivered
 * before any traffic starts, or it exits 2 saying why — rather than spend
 * hours enqueueing rows that are refused on sight.
 *
 * ## The rows it leaves behind: none
 *
 * Every outbox row it inserts carries this run's id in `payload.soakRun`, and
 * all of them are deleted when the run ends (after a short wait for the last
 * ones to drain). The retention sweep would eventually take the `delivered`
 * ones, but never a `dead` one: those are kept as evidence, sit in
 * `MaintenanceActor`'s dead-letter report, and page. A run killed with
 * SIGKILL skips the cleanup; delete `where payload->>'soakRun' = '<id>'` by
 * hand — the id is printed at start.
 *
 * ## What it writes
 *
 * - `samples.jsonl` — one line per tick: cumulative counters, latency
 *   percentiles, host RSS/heap/loop-delay (joined from the in-process
 *   instrument), Postgres backend count, outbox backlog, reminder lag.
 * - `summary.json` — the regression: bytes of RSS retained per RPC, with the
 *   window it was fitted over, plus every counter and the failure list.
 *
 * Both are appended as they are taken, so a run that is killed at hour 19 still
 * has 19 hours of evidence.
 *
 * ## Deliberately credential-free
 *
 * Postgres is reached through `docker exec <container> psql`, not a connection
 * string. This app is the only process in the system allowed to hold database
 * credentials (§1.5) and a test harness is not it. It also means the harness
 * needs no environment beyond ports, which is what makes it safe to leave
 * running unattended for two days.
 */

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

type Options = {
  readonly seconds: number;
  readonly tickSeconds: number;
  readonly rps: number;
  readonly outboxRps: number;
  readonly refRps: number;
  readonly probeSeconds: number;
  readonly jwksSeconds: number;
  readonly out: string;
  readonly daprPort: string;
  readonly actorsPort: string;
  readonly pgContainer: string;
  readonly pgUser: string;
  readonly pgDb: string;
  readonly hostSamples: string;
  readonly hostPid: string;
  readonly label: string;
  readonly maxInFlight: number;
};

const flag = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
};

const num = (name: string, fallback: number): number => {
  const value = Number(flag(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
};

const options: Options = {
  seconds: num("seconds", 1_800),
  tickSeconds: num("tick-seconds", 10),
  rps: num("rps", 40),
  outboxRps: num("outbox-rps", 4),
  refRps: num("ref-rps", 4),
  probeSeconds: num("probe-seconds", 30),
  jwksSeconds: num("jwks-seconds", 15),
  out: flag("out", ".stack/soak"),
  daprPort: flag("dapr-port", process.env.ACTORS_DAPR_HTTP_PORT ?? "3502"),
  actorsPort: flag("actors-port", process.env.ACTORS_PORT ?? "3002"),
  pgContainer: flag(
    "pg-container",
    `${process.env.COMPOSE_PROJECT_NAME ?? "cellar-stack"}-postgres-1`,
  ),
  pgUser: flag("pg-user", process.env.POSTGRES_USER ?? "cellar"),
  pgDb: flag("pg-db", process.env.POSTGRES_DB ?? "cellar"),
  hostSamples: flag("host-samples", ""),
  hostPid: flag("host-pid", ""),
  label: flag("label", "soak"),
  maxInFlight: num("max-in-flight", 64),
};

/* -------------------------------------------------------------------------- */
/* Counters                                                                    */
/* -------------------------------------------------------------------------- */

const counters = {
  pings: 0,
  pingErrors: 0,
  refReads: 0,
  refErrors: 0,
  outboxEnqueued: 0,
  outboxEnqueueErrors: 0,
  jwks: 0,
  jwksErrors: 0,
  probesArmed: 0,
  probesDelivered: 0,
  probesLate: 0,
};

/** Reset every tick; percentiles are per-tick, not for the whole run. */
let latencies: number[] = [];
let inFlight = 0;

/** Stamped into every outbox row this run inserts, so it can delete them all. */
const RUN_ID = `${options.label}-${crypto.randomUUID()}`;

const failures: string[] = [];
const note = (message: string): void => {
  const line = `${new Date().toISOString()} ${message}`;
  failures.push(line);
  console.error(`  ! ${line}`);
};

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

const systemCtx = (requestId: string) =>
  ({ viewerId: null, kind: "system", requestId }) as const;

const actorUrl = (type: string, id: string, method: string): string =>
  `http://127.0.0.1:${options.daprPort}/v1.0/actors/${type}/${id}/method/${method}`;

/**
 * One actor invocation through the sidecar, as `src/lib/sidecar.ts` makes it.
 *
 * A typed `ActorError` comes back as **HTTP 200 plus
 * `x-daprerrorresponseheader`** (see `src/lib/actor-error-envelope.ts`), so
 * `response.ok` alone is not success. Getting that wrong here would report a
 * host that refuses every call as a perfectly healthy one.
 */
/**
 * The sidecar API token, resolved ONCE and exactly as the stack being soaked
 * was started with it: `scripts/stack/stack.sh dapr-token` reads the
 * environment, then infra/.env, then the published development default. This
 * used to be `process.env.DAPR_API_TOKEN ?? "cellar-dev-dapr-api-token"`, which
 * skipped infra/.env — a token set there reached the sidecars and not this
 * harness, and every call 401'd. Captured from stdout, never printed.
 */
const daprApiToken = ((): string => {
  const fromEnv = process.env.DAPR_API_TOKEN;
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const stackSh = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "scripts",
    "stack",
    "stack.sh",
  );
  const result = spawnSync(stackSh, ["dapr-token"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout === "") {
    throw new Error(
      `soak: could not resolve DAPR_API_TOKEN via ${stackSh} dapr-token (exit ${result.status}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
})();

const invoke = async (
  type: string,
  id: string,
  method: string,
  args: readonly unknown[],
  timeoutMs = 15_000,
): Promise<{
  ok: boolean;
  status: number;
  typedError: boolean;
  body: string;
}> => {
  const response = await fetch(actorUrl(type, id, method), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // See `daprApiToken`: the same token the sidecars were started with.
      "dapr-api-token": daprApiToken,
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  const typedError = response.headers.has("x-daprerrorresponseheader");
  return {
    ok: response.ok && !typedError,
    status: response.status,
    typedError,
    body,
  };
};

const psql = (sql: string): string => {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      options.pgContainer,
      "psql",
      "-U",
      options.pgUser,
      "-d",
      options.pgDb,
      "-At",
      "-c",
      sql,
    ],
    { encoding: "utf8", timeout: 20_000 },
  );
  if (result.status !== 0) {
    throw new Error(
      `psql failed (${result.status}): ${(result.stderr ?? "").trim().slice(0, 200)}`,
    );
  }
  return (result.stdout ?? "").trim();
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** `ps` is the fallback when the host was not started with the instrument. */
const rssFromPs = (pid: string): number | null => {
  if (pid === "") return null;
  const result = spawnSync("ps", ["-o", "rss=", "-p", pid], {
    encoding: "utf8",
  });
  const kb = Number((result.stdout ?? "").trim());
  return Number.isFinite(kb) && kb > 0 ? kb * 1024 : null;
};

/* -------------------------------------------------------------------------- */
/* Traffic streams                                                             */
/* -------------------------------------------------------------------------- */

const fire = (work: Promise<void>): void => {
  inFlight += 1;
  void work.finally(() => {
    inFlight -= 1;
  });
};

const pingOnce = async (): Promise<void> => {
  const started = Date.now();
  try {
    // A rotating id so the run exercises activation and idle eviction rather
    // than one permanently warm actor.
    const id = `soak-${counters.pings % 64}`;
    const result = await invoke("PingActor", id, "ping", [
      systemCtx(`soak-ping-${counters.pings}`),
      "soak",
    ]);
    if (!result.ok) {
      counters.pingErrors += 1;
      if (counters.pingErrors % 50 === 1) {
        note(`ping failed: ${result.status} ${result.body.slice(0, 160)}`);
      }
      return;
    }
    counters.pings += 1;
    latencies.push(Date.now() - started);
  } catch (error) {
    counters.pingErrors += 1;
    if (counters.pingErrors % 50 === 1) note(`ping threw: ${message(error)}`);
  }
};

const REFERENCE_KINDS = [
  "wine_style",
  "wine_variety",
  "beer_style",
  "spirit_type",
  "country",
  "sake_type",
  "tea_category",
  "coffee_cultivar",
] as const;

const refOnce = async (): Promise<void> => {
  try {
    const kind =
      REFERENCE_KINDS[counters.refReads % REFERENCE_KINDS.length] ??
      REFERENCE_KINDS[0];
    const result = await invoke("ReferenceDataActor", kind, "all", [
      systemCtx(`soak-ref-${counters.refReads}`),
    ]);
    if (!result.ok) {
      counters.refErrors += 1;
      if (counters.refErrors % 20 === 1) {
        note(
          `reference read failed: ${result.status} ${result.body.slice(0, 160)}`,
        );
      }
      return;
    }
    counters.refReads += 1;
  } catch (error) {
    counters.refErrors += 1;
    if (counters.refErrors % 20 === 1)
      note(`reference read threw: ${message(error)}`);
  }
};

/**
 * Enqueue an outbox row. Written straight to Postgres on purpose: an outbox row
 * is data, and what is under test is the *drainer* — the reminder that fires
 * every 2 s, the claim, and the app-originated sidecar call that delivers it.
 */
const enqueueOutbox = (count: number, tag: string): void => {
  try {
    psql(
      `insert into outbox (target_actor, target_id, method, payload)
       select 'PingActor', 'soak-outbox-' || (g % 16), 'ping',
              jsonb_build_object('tag', '${tag}', 'n', g, 'soakRun', '${RUN_ID}')
       from generate_series(1, ${count}) g`,
    );
    counters.outboxEnqueued += count;
  } catch (error) {
    counters.outboxEnqueueErrors += 1;
    if (counters.outboxEnqueueErrors % 10 === 1) {
      note(`outbox enqueue failed: ${message(error)}`);
    }
  }
};

const jwksOnce = async (): Promise<void> => {
  try {
    const response = await fetch(
      `http://127.0.0.1:${options.actorsPort}/api/auth/jwks`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const body = await response.text();
    if (!response.ok || !body.includes("keys")) {
      counters.jwksErrors += 1;
      note(`jwks unhealthy: ${response.status} ${body.slice(0, 120)}`);
      return;
    }
    counters.jwks += 1;
  } catch (error) {
    counters.jwksErrors += 1;
    note(`jwks threw: ${message(error)}`);
  }
};

/**
 * The reminder-liveness probe, and the single most important number this
 * harness produces.
 *
 * One row is inserted with a unique tag and the time it takes to reach
 * `delivered` is measured. Nothing else in the system can move that row: only
 * `OutboxActor.drain`, and nothing invokes `OutboxActor` — it is activated by
 * its Scheduler-backed reminder alone (`OUTBOX_KEEP_ALIVE`, §2.7). So a row that
 * reaches `delivered` is proof that a Dapr reminder fired inside this host, and
 * one that does not is the silent failure this whole exercise is about.
 */
const probeReminder = async (): Promise<number | null> => {
  const tag = `soak-probe-${Date.now()}`;
  const armedAt = Date.now();
  try {
    psql(
      `insert into outbox (target_actor, target_id, method, payload)
       values ('PingActor', 'soak-probe', 'ping',
               jsonb_build_object('tag', '${tag}', 'soakRun', '${RUN_ID}'))`,
    );
    counters.probesArmed += 1;
  } catch (error) {
    note(`probe enqueue failed: ${message(error)}`);
    return null;
  }

  const deadline = armedAt + 60_000;
  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const status = psql(
        `select status from outbox
          where payload->>'tag' = '${tag}' limit 1`,
      );
      if (status === "delivered") {
        const lag = Date.now() - armedAt;
        counters.probesDelivered += 1;
        if (lag > 15_000) {
          counters.probesLate += 1;
          note(`reminder lag ${lag} ms (> 15 s) — drain is falling behind`);
        }
        return lag;
      }
      if (status === "dead") {
        note(
          `probe row dead-lettered (tag ${tag}): ${lastErrorOf(tag)}` +
            " — the drain is running; delivery is what failed",
        );
        return null;
      }
    } catch (error) {
      note(`probe poll failed: ${message(error)}`);
      return null;
    }
  }
  note(
    `REMINDER LIVENESS FAILURE: probe row never delivered within 60 s ` +
      `(tag ${tag}). The 2 s drain reminder is not firing.`,
  );
  return null;
};

/** `last_error` of the probe row tagged `tag`, for a failure message. */
const lastErrorOf = (tag: string): string => {
  try {
    return (
      psql(
        `select coalesce(last_error, '(none)') from outbox
          where payload->>'tag' = '${tag}' limit 1`,
      ) || "(row gone)"
    );
  } catch (error) {
    return `(could not read it: ${message(error)})`;
  }
};

/**
 * One probe row must reach `delivered` before any traffic starts.
 *
 * Otherwise a host that refuses the probe target — one built before
 * `PingActor.ping` was declared, say — soaks for hours on rows the drainer
 * dead-letters on sight, and the only symptom is a failure list nobody reads
 * until the end. Exits 2 with the row's own `last_error`, which names the
 * cause.
 */
const preflight = async (): Promise<void> => {
  const lag = await probeReminder();
  if (lag !== null) {
    console.log(`[soak] preflight: a probe row was delivered in ${lag} ms`);
    failures.length = 0;
    counters.probesArmed = 0;
    counters.probesDelivered = 0;
    counters.probesLate = 0;
    return;
  }
  console.error(
    "[soak] PRECONDITION FAILED: the preflight probe row was not delivered.\n" +
      failures.map((line) => `  ${line}`).join("\n") +
      "\n  'not in OUTBOX_TARGETS' means the host under test predates " +
      "PingActor.ping's probe declaration — restart it on the current tree.",
  );
  cleanupOutbox();
  process.exit(2);
};

/**
 * Delete every outbox row this run inserted, after giving the last ones a
 * moment to drain, and record any that never made it as a failure.
 */
const cleanupOutbox = (): { deleted: number; undelivered: number } => {
  const mine = `payload->>'soakRun' = '${RUN_ID}'`;
  try {
    for (let i = 0; i < 30; i += 1) {
      const live = Number(
        psql(
          `select count(*) from outbox
            where ${mine} and status in ('pending', 'delivering')`,
        ),
      );
      if (live === 0) break;
      spawnSync("sleep", ["1"]);
    }
    const undelivered = psql(
      `select status || ' ' || count(*) || ': ' ||
              coalesce(left(min(last_error), 160), '')
         from outbox where ${mine} and status <> 'delivered'
        group by status`,
    );
    const deleted = Number(
      psql(
        `with gone as (delete from outbox where ${mine} returning 1)
         select count(*) from gone`,
      ),
    );
    if (undelivered !== "") {
      note(`outbox rows this run left undelivered: ${undelivered}`);
    }
    console.log(
      `[soak] cleanup: deleted ${deleted} outbox row(s) (run ${RUN_ID})`,
    );
    return {
      deleted,
      undelivered: undelivered === "" ? 0 : undelivered.split("\n").length,
    };
  } catch (error) {
    note(
      `outbox cleanup failed — delete where payload->>'soakRun' = ` +
        `'${RUN_ID}' by hand: ${message(error)}`,
    );
    return { deleted: 0, undelivered: -1 };
  }
};

/* -------------------------------------------------------------------------- */
/* Host samples (joined from the in-process instrument)                        */
/* -------------------------------------------------------------------------- */

type HostSample = {
  rss: number | null;
  heapUsed: number | null;
  external: number | null;
  loopDriftMeanMs: number | null;
  loopDriftP99Ms: number | null;
  http2Sessions: number | null;
  http2SecureSessions: number | null;
  tlsSockets: number | null;
  handles: number | null;
  runtime: string | null;
  pid: string | null;
  source: "instrument" | "ps" | "none";
};

const EMPTY_HOST: HostSample = {
  rss: null,
  heapUsed: null,
  external: null,
  loopDriftMeanMs: null,
  loopDriftP99Ms: null,
  http2Sessions: null,
  http2SecureSessions: null,
  tlsSockets: null,
  handles: null,
  runtime: null,
  pid: null,
  source: "none",
};

const readHostSample = (): HostSample => {
  if (options.hostSamples !== "") {
    try {
      const lines = readFileSync(options.hostSamples, "utf8")
        .trim()
        .split("\n");
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line === undefined || line === "") continue;
        const record = JSON.parse(line) as Record<string, unknown>;
        if (record.kind !== "sample") continue;
        return {
          rss: asNumber(record.rss),
          heapUsed: asNumber(record.heapUsed),
          external: asNumber(record.external),
          loopDriftMeanMs: asNumber(record.loopDriftMeanMs),
          loopDriftP99Ms: asNumber(record.loopDriftP99Ms),
          http2Sessions: asNumber(record.http2Sessions),
          http2SecureSessions: asNumber(record.http2SecureSessions),
          tlsSockets: asNumber(record.tlsSockets),
          handles: asNumber(record.handles),
          runtime: typeof record.runtime === "string" ? record.runtime : null,
          pid: record.pid === undefined ? null : String(record.pid),
          source: "instrument",
        };
      }
    } catch {
      // fall through to ps
    }
  }
  const rss = rssFromPs(options.hostPid);
  return rss === null ? EMPTY_HOST : { ...EMPTY_HOST, rss, source: "ps" };
};

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/* -------------------------------------------------------------------------- */
/* The run                                                                     */
/* -------------------------------------------------------------------------- */

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  );
};

type Sample = {
  readonly t: number;
  readonly elapsedS: number;
  readonly rpcs: number;
  readonly rss: number | null;
  readonly heapUsed: number | null;
};

const main = async (): Promise<void> => {
  mkdirSync(options.out, { recursive: true });
  const samplesPath = join(options.out, "samples.jsonl");
  const summaryPath = join(options.out, "summary.json");

  const startedAt = Date.now();
  const endsAt = startedAt + options.seconds * 1_000;
  const samples: Sample[] = [];

  console.log(
    `[soak] ${options.label}: ${options.seconds}s, ping ${options.rps}/s, ` +
      `outbox ${options.outboxRps}/s, ref ${options.refRps}/s, ` +
      `sidecar 127.0.0.1:${options.daprPort}, out ${options.out}, ` +
      `run ${RUN_ID}`,
  );
  await preflight();

  // Traffic pacing: one dispatcher tick every 100 ms issues its share of each
  // stream without awaiting, bounded by `maxInFlight` so a stalled host produces
  // back-pressure here instead of an unbounded queue in this process (which
  // would look exactly like the host leaking).
  const dispatchMs = 100;
  let pingDebt = 0;
  let refDebt = 0;
  const dispatcher = setInterval(() => {
    if (inFlight >= options.maxInFlight) return;
    pingDebt += (options.rps * dispatchMs) / 1_000;
    refDebt += (options.refRps * dispatchMs) / 1_000;
    while (pingDebt >= 1 && inFlight < options.maxInFlight) {
      pingDebt -= 1;
      fire(pingOnce());
    }
    while (refDebt >= 1 && inFlight < options.maxInFlight) {
      refDebt -= 1;
      fire(refOnce());
    }
  }, dispatchMs);

  // Outbox rows are inserted in batches: one `docker exec psql` per second is
  // cheap, sixty of them a second is not.
  const outboxTimer = setInterval(() => {
    if (options.outboxRps > 0) {
      enqueueOutbox(Math.max(1, Math.round(options.outboxRps)), options.label);
    }
  }, 1_000);

  const jwksTimer = setInterval(() => {
    void jwksOnce();
  }, Math.max(1, options.jwksSeconds) * 1_000);

  let lastReminderLagMs: number | null = null;
  let probing = false;
  const probeTimer = setInterval(() => {
    if (probing) return;
    probing = true;
    void probeReminder()
      .then((lag) => {
        lastReminderLagMs = lag;
      })
      .finally(() => {
        probing = false;
      });
  }, Math.max(5, options.probeSeconds) * 1_000);

  const tick = (): void => {
    const now = Date.now();
    const host = readHostSample();
    const tickLatencies = latencies;
    latencies = [];

    let pgBackends: number | null = null;
    let outboxBacklog: number | null = null;
    try {
      pgBackends = Number(
        psql(
          `select count(*) from pg_stat_activity
            where datname = current_database() and pid <> pg_backend_pid()`,
        ),
      );
      outboxBacklog = Number(
        psql(`select count(*) from outbox where status <> 'delivered'`),
      );
    } catch (error) {
      note(`pg sample failed: ${message(error)}`);
    }

    const rpcs = counters.pings + counters.refReads + counters.outboxEnqueued;
    const record = {
      kind: "tick",
      t: now,
      elapsedS: Math.round((now - startedAt) / 1_000),
      label: options.label,
      runtime: host.runtime,
      rpcs,
      ...counters,
      inFlight,
      latencyP50Ms: percentile(tickLatencies, 0.5),
      latencyP99Ms: percentile(tickLatencies, 0.99),
      latencyMaxMs: tickLatencies.length === 0 ? 0 : Math.max(...tickLatencies),
      rss: host.rss,
      heapUsed: host.heapUsed,
      external: host.external,
      loopDriftMeanMs: host.loopDriftMeanMs,
      loopDriftP99Ms: host.loopDriftP99Ms,
      http2Sessions: host.http2Sessions,
      http2SecureSessions: host.http2SecureSessions,
      tlsSockets: host.tlsSockets,
      handles: host.handles,
      hostSampleSource: host.source,
      pgBackends,
      outboxBacklog,
      reminderLagMs: lastReminderLagMs,
      failures: failures.length,
    };
    appendFileSync(samplesPath, `${JSON.stringify(record)}\n`);
    samples.push({
      t: now,
      elapsedS: record.elapsedS,
      rpcs,
      rss: host.rss,
      heapUsed: host.heapUsed,
    });

    console.log(
      `[soak] +${String(record.elapsedS).padStart(5)}s ` +
        `rpc=${String(rpcs).padStart(7)} ` +
        `rss=${mib(host.rss)} heap=${mib(host.heapUsed)} ` +
        `p50=${record.latencyP50Ms}ms p99=${record.latencyP99Ms}ms ` +
        `loop=${host.loopDriftP99Ms ?? "?"}ms ` +
        `pg=${pgBackends ?? "?"} backlog=${outboxBacklog ?? "?"} ` +
        `remind=${lastReminderLagMs ?? "-"}ms ` +
        `err=${counters.pingErrors + counters.refErrors + counters.jwksErrors}`,
    );
  };

  const tickTimer = setInterval(tick, Math.max(1, options.tickSeconds) * 1_000);

  let stopped = false;
  const stop = (): void => {
    stopped = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopped && Date.now() < endsAt) await sleep(500);

  clearInterval(dispatcher);
  clearInterval(outboxTimer);
  clearInterval(jwksTimer);
  clearInterval(probeTimer);
  clearInterval(tickTimer);
  // Let in-flight work finish so the last sample is not taken mid-storm.
  await sleep(2_000);
  tick();
  const outboxCleanup = cleanupOutbox();

  const summary = { ...summarise(samples, startedAt), outboxCleanup };
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\n[soak] summary -> ${summaryPath}`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.verdict === "failures recorded" ? 1 : 0);
};

/**
 * Least-squares fit of RSS against cumulative RPC count.
 *
 * The first `warmup` samples are dropped: a host that has just booted is still
 * JIT-warming, filling pools and populating caches, and counting that as a leak
 * would condemn every runtime. What remains is the steady-state slope, in bytes
 * retained per RPC, which is the number oven-sh/bun#40646 is quoted in.
 */
const summarise = (samples: readonly Sample[], startedAt: number) => {
  const warmup = Math.min(3, Math.max(0, samples.length - 3));
  const window = samples.slice(warmup);
  const fit = (pick: (s: Sample) => number | null) => {
    const points = window
      .map((s) => ({ x: s.rpcs, y: pick(s) }))
      .filter((p): p is { x: number; y: number } => p.y !== null);
    if (points.length < 3) return null;
    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const meanY = sumY / n;
    const intercept = meanY - (slope * sumX) / n;
    const ssTot = points.reduce((a, p) => a + (p.y - meanY) ** 2, 0);
    const ssRes = points.reduce(
      (a, p) => a + (p.y - (intercept + slope * p.x)) ** 2,
      0,
    );
    return {
      bytesPerRpc: Math.round(slope * 100) / 100,
      r2: ssTot === 0 ? null : Math.round((1 - ssRes / ssTot) * 1000) / 1000,
      points: n,
      firstRpc: points[0]?.x ?? null,
      lastRpc: points[n - 1]?.x ?? null,
      firstBytes: points[0]?.y ?? null,
      lastBytes: points[n - 1]?.y ?? null,
    };
  };

  const rssFit = fit((s) => s.rss);
  const durationS = Math.round((Date.now() - startedAt) / 1_000);
  const rpcs = window[window.length - 1]?.rpcs ?? 0;
  const rpcsPerSecond = durationS === 0 ? 0 : rpcs / durationS;

  return {
    label: options.label,
    durationS,
    windowSamples: window.length,
    warmupSamplesDropped: warmup,
    counters,
    rpcsPerSecond: Math.round(rpcsPerSecond * 100) / 100,
    rss: rssFit,
    heapUsed: fit((s) => s.heapUsed),
    /**
     * Hours until a 1 GiB container limit is reached at the measured slope and
     * rate, from the last observed RSS. `null` when the slope is flat or
     * negative, which is the answer everyone is hoping for.
     */
    hoursToOneGiB:
      rssFit === null ||
      rssFit.bytesPerRpc <= 0 ||
      rpcsPerSecond === 0 ||
      rssFit.lastBytes === null
        ? null
        : Math.round(
            (1_073_741_824 - rssFit.lastBytes) /
              (rssFit.bytesPerRpc * rpcsPerSecond) /
              3_600,
          ),
    reminderLiveness: {
      armed: counters.probesArmed,
      delivered: counters.probesDelivered,
      late: counters.probesLate,
    },
    failures,
    verdict: failures.length === 0 ? "clean" : "failures recorded",
  };
};

const mib = (bytes: number | null): string =>
  bytes === null ? "?" : `${(bytes / 1024 / 1024).toFixed(1)}M`;

await main();
