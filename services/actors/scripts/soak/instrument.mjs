/**
 * In-process sampler for the actor host, loaded **before** `src/index.ts`.
 *
 *   bun  --preload ./scripts/soak/instrument.mjs src/index.ts
 *   node --import   ./scripts/soak/instrument.mjs src/index.ts
 *
 * It is inert unless `SOAK_SAMPLE_PATH` is set, so the same command is safe to
 * leave in a run file. With it set, one JSON object per line is appended to that
 * path every `SOAK_SAMPLE_INTERVAL_MS` (default 5000).
 *
 * ## Why this file is .mjs and not .ts
 *
 * Everything else in this app is TypeScript, because both runtimes strip types
 * for the *entry point*. A **preload** is a different code path in both of them,
 * and the harness has to work identically on Bun and on Node for its numbers to
 * be comparable at all. Plain ESM JavaScript is the one thing neither runtime
 * can disagree about, so the one file whose job is to be identical across
 * runtimes has no types to strip.
 *
 * ## What it measures, and why each one is here
 *
 * - **rss / heapUsed / external / arrayBuffers** — the failure this whole phase
 *   is about is "passes CI, serves traffic, OOMs six hours later". RSS over a
 *   known RPC count is the only thing that catches it.
 * - **event-loop delay** — a runtime that is fine on throughput can still stall,
 *   and a stalled loop in *this* process stops actor reminders without failing
 *   anything. `perf_hooks.monitorEventLoopDelay` when the runtime has it, a
 *   timer-drift probe when it does not; the sample says which it used.
 * - **http2 sessions, and whether they are TLS** — oven-sh/bun#40646 retains
 *   ~237 bytes per RPC over TLS on `node:http2` and is fixed in no released
 *   version. `@dapr/dapr` reaches the sidecar over grpc-js *when configured for
 *   gRPC*, and grpc-js rides entirely on `node:http2`. Whether that code path is
 *   live in this app is a question about this app, not about the SDK, so it is
 *   answered by counting sessions rather than by reading the SDK.
 * - **tls sessions** — same question one layer down, and it also catches a TLS
 *   Postgres connection (`sslmode=require`) that would put `pg` on a path the
 *   plaintext measurement does not cover.
 *
 * Patching `http2.connect` requires importing `node:http2`, which means this
 * file **loads that module whether or not the app would have**. That is
 * deliberate and it costs nothing: "was the module loaded" is not the question —
 * a loaded-but-unused module retains nothing. "Was a session created, and was it
 * secure" is the question, and that is what the counters answer.
 *
 * ## Rules
 *
 * It runs inside the process that owns the database. It therefore never throws,
 * never rejects, never holds the event loop open (`unref`), and never writes
 * anywhere but its own file. Any failure disables the sampler and leaves the
 * host running.
 */

import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * Builtins are reached through `createRequire` rather than `await import` so
 * that a patch applied here is applied to the *same* module object the app will
 * see, synchronously, before the app's first import runs. Ordering is the whole
 * point of a preload.
 */
const req = createRequire(import.meta.url);

const SAMPLE_PATH = process.env.SOAK_SAMPLE_PATH ?? "";

if (SAMPLE_PATH !== "") {
  install();
}

function install() {
  const intervalMs = positiveInt(process.env.SOAK_SAMPLE_INTERVAL_MS, 5_000);
  const forceGc = process.env.SOAK_FORCE_GC !== "0";

  const counters = {
    http2Sessions: 0,
    http2SecureSessions: 0,
    http2Authorities: new Set(),
    tlsSockets: 0,
    tlsHosts: new Set(),
  };

  patchHttp2(counters);
  patchTls(counters);

  const loop = makeLoopDelayProbe();

  const runtime = globalThis.Bun === undefined ? "node" : "bun";
  const version =
    runtime === "bun" ? process.versions.bun : process.versions.node;

  write({
    kind: "boot",
    at: Date.now(),
    pid: process.pid,
    runtime,
    version,
    execPath: process.execPath,
    argv: process.argv.slice(1),
    // Node lists every native module it has loaded. Captured here — before the
    // app's first import — it is the "nothing has loaded http2 yet" baseline
    // that makes the session counters below interpretable.
    nativeModulesAtBoot:
      typeof process.moduleLoadList === "object" &&
      Array.isArray(process.moduleLoadList)
        ? process.moduleLoadList.filter((m) => /http2|tls|grpc/i.test(m))
        : null,
    intervalMs,
    forceGc,
    loopHistAvailable: loop.hist !== null,
  });

  const timer = setInterval(() => {
    try {
      sample();
    } catch {
      // A sampler that can fail the host is worse than no sampler.
    }
  }, intervalMs);
  // The host must be able to exit on SIGTERM with this loaded.
  timer.unref?.();

  function sample() {
    if (forceGc) collectGarbage();
    const memory = process.memoryUsage();
    write({
      kind: "sample",
      at: Date.now(),
      pid: process.pid,
      runtime,
      uptimeS: Math.round(process.uptime()),
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers ?? null,
      // Two numbers on purpose. `drift*` is the same arithmetic on both
      // runtimes and is therefore the only one worth comparing between them;
      // `hist*` is the runtime's own libuv histogram, which is more accurate
      // and NOT comparable — measured, Node's `monitorEventLoopDelay` reports
      // roughly `resolution + delay` (≈12 ms at rest with resolution 10) while
      // Bun 1.4.2 reports the delay alone (≈2 ms at rest). Comparing those two
      // would read as a 6x regression that does not exist.
      loopDriftMeanMs: loop.drift.meanMs(),
      loopDriftP99Ms: loop.drift.p99Ms(),
      loopHistMeanMs: loop.hist === null ? null : loop.hist.meanMs(),
      loopHistP99Ms: loop.hist === null ? null : loop.hist.p99Ms(),
      http2Sessions: counters.http2Sessions,
      http2SecureSessions: counters.http2SecureSessions,
      http2Authorities: [...counters.http2Authorities].slice(0, 8),
      tlsSockets: counters.tlsSockets,
      tlsHosts: [...counters.tlsHosts].slice(0, 8),
      handles: activeHandleCount(),
    });
    loop.drift.reset();
    loop.hist?.reset();
  }

  function write(record) {
    try {
      appendFileSync(SAMPLE_PATH, `${JSON.stringify(record)}\n`);
    } catch {
      // ignore: the file may be on a volume that went away
    }
  }
}

/**
 * Count `http2.connect` calls and remember whether they were secure.
 *
 * grpc-js calls `http2.connect(authority, options)`; an `https:` authority (or
 * a `createConnection` returning a TLS socket) is the leaking configuration in
 * oven-sh/bun#40646. A plaintext `http:` authority measured 8.5 bytes/RPC,
 * i.e. flat.
 */
function patchHttp2(counters) {
  try {
    const http2 = req("node:http2");
    const original = http2.connect;
    if (typeof original !== "function") return;
    http2.connect = function connect(authority, options, listener) {
      try {
        counters.http2Sessions += 1;
        const text = String(authority ?? "");
        counters.http2Authorities.add(text.slice(0, 120));
        if (text.startsWith("https:") || options?.protocol === "https:") {
          counters.http2SecureSessions += 1;
        }
      } catch {
        // never break a real connection to count it
      }
      return original.call(this, authority, options, listener);
    };
  } catch {
    // node:http2 unavailable: nothing can be riding it either
  }
}

function patchTls(counters) {
  try {
    const tls = req("node:tls");
    const original = tls.connect;
    if (typeof original !== "function") return;
    tls.connect = function connect(...args) {
      try {
        counters.tlsSockets += 1;
        const first = args[0];
        const host =
          typeof first === "object" && first !== null
            ? `${first.host ?? first.servername ?? "?"}:${first.port ?? "?"}`
            : `${first ?? "?"}`;
        counters.tlsHosts.add(String(host).slice(0, 120));
      } catch {
        // as above
      }
      return original.apply(this, args);
    };
  } catch {
    // ignore
  }
}

/**
 * Event-loop delay, measured two ways.
 *
 * The **drift** probe is a self-timed 20 ms interval: the gap between when the
 * timer was due and when it actually ran is the delay. It is crude, it is
 * identical arithmetic on both runtimes, and that is exactly why it is here —
 * the whole point of this harness is a Bun-vs-Node comparison, and a metric
 * whose *definition* differs between the two is worse than no metric.
 *
 * The **histogram** (`perf_hooks.monitorEventLoopDelay`) is libuv-level and
 * more accurate, and both runtimes have it. Its scale is not the same, though:
 * measured at rest, Node reports ≈12 ms with `resolution: 10` (it records
 * `resolution + delay`) and Bun 1.4.2 reports ≈2 ms (it records `delay`). Both
 * are recorded; only `drift` is compared.
 */
function makeLoopDelayProbe() {
  return { drift: makeDriftProbe(), hist: makeHistogramProbe() };
}

function makeHistogramProbe() {
  try {
    const { monitorEventLoopDelay } = req("node:perf_hooks");
    if (typeof monitorEventLoopDelay !== "function") return null;
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    return {
      meanMs: () => nanosToMs(histogram.mean),
      p99Ms: () => nanosToMs(histogram.percentile(99)),
      reset: () => {
        try {
          histogram.reset();
        } catch {
          // some implementations refuse; a monotonic histogram is still useful
        }
      },
    };
  } catch {
    return null;
  }
}

function makeDriftProbe() {
  const periodMs = 20;
  let last = Date.now();
  let sum = 0;
  let count = 0;
  const samples = [];
  const timer = setInterval(() => {
    const now = Date.now();
    const delay = Math.max(0, now - last - periodMs);
    last = now;
    sum += delay;
    count += 1;
    if (samples.length < 4096) samples.push(delay);
  }, periodMs);
  timer.unref?.();

  return {
    meanMs: () => (count === 0 ? 0 : round(sum / count)),
    p99Ms: () => {
      if (samples.length === 0) return 0;
      const sorted = [...samples].sort((a, b) => a - b);
      const index = Math.min(
        sorted.length - 1,
        Math.floor(sorted.length * 0.99),
      );
      return round(sorted[index]);
    },
    reset: () => {
      sum = 0;
      count = 0;
      samples.length = 0;
    },
  };
}

function collectGarbage() {
  try {
    if (typeof globalThis.Bun?.gc === "function") {
      globalThis.Bun.gc(true);
      return;
    }
    // Node: only present with --expose-gc, which the orchestrator passes.
    globalThis.gc?.();
  } catch {
    // ignore
  }
}

function activeHandleCount() {
  try {
    const handles = process._getActiveHandles?.();
    return Array.isArray(handles) ? handles.length : null;
  } catch {
    return null;
  }
}

function nanosToMs(nanos) {
  return typeof nanos === "number" && Number.isFinite(nanos)
    ? round(nanos / 1e6)
    : 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function positiveInt(raw, fallback) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
