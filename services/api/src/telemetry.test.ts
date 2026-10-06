/**
 * The exporter on its own: when it posts, what it posts, and that it never
 * throws. The payload assertions are the parity contract with
 * `services/actors/src/lib/telemetry.ts`. Grafana reads both services with one
 * query shape only as long as `service.name`, `event.name` and the severity
 * numbers are spelled identically, so they are spelled out here rather than
 * round-tripped through the code under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emit } from "./telemetry.ts";

type Posted = { url: string; init: RequestInit };

let posted: Posted[];

beforeEach(() => {
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      posted.push({ url: String(url), init });
      return new Response(null, { status: 200 });
    }),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const sample = {
  name: "graphql.limit_refused",
  severity: "WARN",
  message: "Deep: refused by QUERY_TOO_DEEP",
  attributes: {
    "limit.code": "QUERY_TOO_DEEP",
    "error.count": 3,
    ratio: 0.5,
    "api.graphiql": false,
  },
} as const;

describe("disabled (no OTEL_EXPORTER_OTLP_ENDPOINT)", () => {
  it("makes no request at all, and still writes the console line", () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");

    emit(sample);

    expect(fetch).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      `[graphql.limit_refused] Deep: refused by QUERY_TOO_DEEP ${JSON.stringify(sample.attributes)}`,
    );
  });
});

describe("enabled", () => {
  beforeEach(() => {
    // The trailing slash is how compose files often spell it; it must not
    // produce `//v1/logs`.
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-lgtm:4318/");
    vi.stubEnv("OTEL_SERVICE_NAME", "");
    delete process.env.OTEL_SERVICE_NAME;
  });

  it("posts one OTLP/HTTP JSON log record to <endpoint>/v1/logs", () => {
    emit(sample);

    expect(posted).toHaveLength(1);
    const { url, init } = posted[0] ?? { url: "", init: {} };
    expect(url).toBe("http://otel-lgtm:4318/v1/logs");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(init.body));
    expect(body.resourceLogs).toHaveLength(1);
    const [resourceLog] = body.resourceLogs;
    // `service.name` becomes the Loki stream label `service_name`.
    expect(resourceLog.resource.attributes).toEqual([
      { key: "service.name", value: { stringValue: "api" } },
    ]);
    expect(resourceLog.scopeLogs).toHaveLength(1);
    const [scopeLog] = resourceLog.scopeLogs;
    expect(scopeLog.scope).toEqual({ name: "cellar.api" });
    expect(scopeLog.logRecords).toHaveLength(1);
    const [record] = scopeLog.logRecords;

    expect(record.timeUnixNano).toMatch(/^\d{19}$/);
    expect(record.severityNumber).toBe(13);
    expect(record.severityText).toBe("WARN");
    expect(record.body).toEqual({
      stringValue: "Deep: refused by QUERY_TOO_DEEP",
    });
    // `event.name` first, then the caller's attributes, each typed the way
    // OTLP types a scalar. Loki turns the dots into underscores.
    expect(record.attributes).toEqual([
      { key: "event.name", value: { stringValue: "graphql.limit_refused" } },
      { key: "limit.code", value: { stringValue: "QUERY_TOO_DEEP" } },
      { key: "error.count", value: { intValue: 3 } },
      { key: "ratio", value: { doubleValue: 0.5 } },
      { key: "api.graphiql", value: { boolValue: false } },
    ]);
  });

  it("uses OTEL_SERVICE_NAME when compose sets it", () => {
    vi.stubEnv("OTEL_SERVICE_NAME", "api-canary");

    emit(sample);

    const body = JSON.parse(String(posted[0]?.init.body));
    expect(body.resourceLogs[0].resource.attributes).toEqual([
      { key: "service.name", value: { stringValue: "api-canary" } },
    ]);
  });

  it("maps each severity onto the OTLP number and the matching console method", () => {
    emit({ name: "a.info", severity: "INFO", message: "i" });
    emit({ name: "a.warn", severity: "WARN", message: "w" });
    emit({ name: "a.error", severity: "ERROR", message: "e" });

    const numbers = posted.map(
      ({ init }) =>
        JSON.parse(String(init.body)).resourceLogs[0].scopeLogs[0].logRecords[0]
          .severityNumber,
    );
    expect(numbers).toEqual([9, 13, 17]);
    expect(console.log).toHaveBeenCalledWith("[a.info] i");
    expect(console.warn).toHaveBeenCalledWith("[a.warn] w");
    expect(console.error).toHaveBeenCalledWith("[a.error] e");
  });

  it("does not throw, or leave a rejection behind, when the collector is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      expect(() => emit(sample)).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("does not throw when fetch throws synchronously", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new TypeError("Invalid URL");
      }),
    );

    expect(() => emit(sample)).not.toThrow();
  });
});
