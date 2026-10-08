/**
 * The Overture seam — C4b.
 *
 * Four things, and the last two are the ones that matter more than the code:
 *
 *  1. **normalization is total and never coerces.** The old transform turned a
 *     missing name into `"Unknown"` and a bad latitude into `NaN`; every case
 *     here asserts a *rejection* instead;
 *  2. **the BigQuery client works end to end against an injected transport**,
 *     with a throwaway RSA key generated inside the test. No credential exists
 *     in this tree and nothing here reaches the network;
 *  3. **the three-outcome table**: unset installs nothing, complete installs
 *     the real client, incomplete throws. That third row is the whole of C4b's
 *     "must throw instead";
 *  4. **`src/boot.ts` actually calls `installOverture()`.** B5b's lesson: a
 *     seam that is declared, defaulted and never installed fails exactly like
 *     one nobody wrote, and stays green the entire time.
 */
import { generateKeyPairSync } from "node:crypto";
import {
  findCalls,
  PROGRAM_TIMEOUT_MS,
  type Project,
  sourceFileAt,
} from "@cellar-assistant/analysis";
import { ConflictError, ValidationError } from "@cellar-assistant/contracts";
import ts from "typescript";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ACTOR_REGISTRY } from "../actors/registry.ts";
import { ACTORS_SRC, actorsProject } from "./analysis-testing.ts";
import type { FetchLike } from "./google-service-account.ts";
import type {
  Env,
  OverturePlaceSource,
  OvertureSourceRow,
} from "./overture.ts";
import {
  bigQueryOvertureSource,
  decodeBigQueryRows,
  installOverture,
  MAX_OVERTURE_TIMEOUT_MS,
  normalizeOvertureRow,
  overturePlaceSource,
  readOvertureConfig,
  requireTableId,
  selectOvertureSource,
  setOverturePlaceSource,
} from "./overture.ts";

/**
 * The host's program, for the two source readings below: built once, under a
 * timeout sized for CPU rather than inside whichever test reaches it first
 * (PROGRAM_TIMEOUT_MS says why).
 */
let project: Project;
beforeAll(() => {
  project = actorsProject();
}, PROGRAM_TIMEOUT_MS);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const goodRow: OvertureSourceRow = {
  overture_id: "08f2a1b",
  name: "  The Wine Bar  ",
  primary_category: "wine_bar",
  categories: ["wine_bar", "restaurant"],
  confidence: "0.873",
  latitude: "37.7749",
  longitude: "-122.4194",
  address_freeform: "1 Market St",
  address_locality: "San Francisco",
  address_region: "CA",
  address_postcode: "94105",
  address_country: "us",
  phone: "+14155550100",
  website: "https://example.test",
};

type Call = { url: string; headers: Record<string, string>; body: unknown };

const recorder = (
  replies: readonly { ok?: boolean; status?: number; body: unknown }[],
): { fetchImpl: FetchLike; calls: Call[] } => {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetchImpl: FetchLike = async (url, init) => {
    const raw = init?.body ?? "";
    calls.push({
      url,
      headers: init?.headers ?? {},
      body: raw.startsWith("{") ? JSON.parse(raw) : raw,
    });
    const reply = queue.shift();
    if (reply === undefined) throw new Error(`no queued reply for ${url}`);
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      text: async () =>
        typeof reply.body === "string"
          ? reply.body
          : JSON.stringify(reply.body),
    };
  };
  return { fetchImpl, calls };
};

const tokenReply = { body: { access_token: "tok", expires_in: 3600 } };

const bigQueryPage = (rows: readonly OvertureSourceRow[]) => ({
  body: {
    jobComplete: true,
    schema: {
      fields: [
        { name: "overture_id", type: "STRING" },
        { name: "name", type: "STRING" },
        { name: "categories", type: "STRING", mode: "REPEATED" },
        { name: "latitude", type: "FLOAT" },
        { name: "longitude", type: "FLOAT" },
      ],
    },
    rows: rows.map((row) => ({
      f: [
        { v: row.overture_id },
        { v: row.name },
        {
          v: (Array.isArray(row.categories) ? row.categories : []).map((c) => ({
            v: c,
          })),
        },
        { v: row.latitude },
        { v: row.longitude },
      ],
    })),
  },
});

const serviceAccountJson = (): string => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return JSON.stringify({
    type: "service_account",
    project_id: "cellar-overture",
    client_email: "svc@cellar-overture.iam.gserviceaccount.com",
    private_key: privateKey,
  });
};

const configuredEnv = (overrides: Env = {}): Env => ({
  OVERTURE_SOURCE: "bigquery",
  OVERTURE_BIGQUERY_TABLE: "cellar-overture.places.overture_pois",
  OVERTURE_GCP_CREDENTIALS_JSON: serviceAccountJson(),
  ...overrides,
});

/* -------------------------------------------------------------------------- */

describe("normalizeOvertureRow (C4b)", () => {
  it("accepts a good row and trims, clamps and upper-cases it", () => {
    const result = normalizeOvertureRow(goodRow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.place).toEqual({
      overtureId: "08f2a1b",
      name: "The Wine Bar",
      categories: ["wine_bar", "restaurant"],
      location: { lng: -122.4194, lat: 37.7749 },
      confidence: 0.87,
      streetAddress: "1 Market St",
      locality: "San Francisco",
      region: "CA",
      postcode: "94105",
      countryCode: "US",
      phone: "+14155550100",
      website: "https://example.test",
    });
  });

  it("falls back to primary_category when categories is empty", () => {
    const result = normalizeOvertureRow({ ...goodRow, categories: [] });
    expect(result.ok && result.place.categories).toEqual(["wine_bar"]);
  });

  /**
   * Each of these was a silent coercion in `processPlaceRefreshBatch`. A row
   * the source cannot describe is dropped and counted, never invented.
   */
  it.each([
    ["no overture_id", { overture_id: "  " }, "no overture_id"],
    ["no name", { name: null }, "no name"],
    [
      "no categories at all",
      { categories: [], primary_category: "" },
      "no categories",
    ],
    ["a non-numeric latitude", { latitude: "n/a" }, "not a number"],
    ["a latitude past the pole", { latitude: "91" }, "out of range"],
    ["a longitude past the meridian", { longitude: "181" }, "out of range"],
  ])("rejects %s rather than coercing it", (_what, patch, reason) => {
    const result = normalizeOvertureRow({ ...goodRow, ...patch });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain(reason);
  });

  it("repairs an out-of-range confidence to null rather than rejecting", () => {
    // `places_confidence_check` would refuse 7.5 anyway, and the row is
    // otherwise a perfectly good place.
    const result = normalizeOvertureRow({ ...goodRow, confidence: "7.5" });
    expect(result.ok && result.place.confidence).toBeNull();
  });

  it("drops a country code that is not two letters", () => {
    const result = normalizeOvertureRow({
      ...goodRow,
      address_country: "USA",
    });
    expect(result.ok && result.place.countryCode).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("decodeBigQueryRows", () => {
  it("turns { f: [{ v }] } plus the schema into records, arrays included", () => {
    expect(
      decodeBigQueryRows(
        [
          { name: "overture_id" },
          { name: "categories", mode: "REPEATED" },
          { name: "phone" },
        ],
        [
          {
            f: [{ v: "a" }, { v: [{ v: "bar" }, { v: "cafe" }] }, { v: null }],
          },
        ],
      ),
    ).toEqual([{ overture_id: "a", categories: ["bar", "cafe"], phone: null }]);
  });
});

describe("requireTableId", () => {
  it("accepts project.dataset.table", () => {
    expect(requireTableId("p-1.ds_2.tbl$3")).toBe("p-1.ds_2.tbl$3");
  });

  it.each(["dataset.table", "p.ds.tbl; drop table places", "p.ds.`tbl`", ""])(
    "refuses %s — it is concatenated into the query text",
    (table) => {
      expect(() => requireTableId(table)).toThrow(ValidationError);
    },
  );
});

/* -------------------------------------------------------------------------- */

describe("bigQueryOvertureSource (against an injected transport)", () => {
  const config = () => ({
    projectId: "cellar-overture",
    table: "cellar-overture.places.overture_pois",
    location: "US",
    credentials: JSON.parse(serviceAccountJson()),
    timeoutMs: 30_000,
  });

  it("mints a token, sends a parameterised keyset query, and decodes the page", async () => {
    const { fetchImpl, calls } = recorder([
      tokenReply,
      bigQueryPage([goodRow, { ...goodRow, overture_id: "08f2a1c" }]),
    ]);
    const source = bigQueryOvertureSource(config(), fetchImpl);

    const batch = await source.fetchBatch({ after: "08f2a1a", limit: 2 });

    // 1. the token exchange, RFC 7523.
    expect(calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(String(calls[0]?.body)).toContain(
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer",
    );
    // 2. the query itself.
    const query = calls[1]?.body as {
      query: string;
      queryParameters: { name: string; parameterValue: { value: string } }[];
    };
    expect(calls[1]?.headers.authorization).toBe("Bearer tok");
    expect(query.query).toContain("WHERE overture_id > @cursor");
    expect(query.query).toContain("ORDER BY overture_id LIMIT @row_limit");
    expect(
      query.queryParameters.find((p) => p.name === "cursor")?.parameterValue
        .value,
    ).toBe("08f2a1a");
    // 3. the page.
    expect(batch.rows).toHaveLength(2);
    expect(batch.lastId).toBe("08f2a1c");
    expect(batch.hasMore).toBe(true);
  });

  it("omits the cursor predicate on the first page and reuses the token", async () => {
    const { fetchImpl, calls } = recorder([
      tokenReply,
      bigQueryPage([goodRow]),
      bigQueryPage([]),
    ]);
    const source = bigQueryOvertureSource(config(), fetchImpl);

    const first = await source.fetchBatch({ after: null, limit: 5 });
    await source.fetchBatch({ after: "08f2a1b", limit: 5 });

    const second = calls[1];
    if (second === undefined) throw new Error("no query call");
    expect((second.body as { query: string }).query).not.toContain("@cursor");
    expect(first.hasMore).toBe(false);
    // One token exchange for two queries: the minter caches.
    expect(calls.filter((c) => c.url.includes("oauth2")).length).toBe(1);
  });

  it("throws rather than reporting an empty page when the query did not finish", async () => {
    const { fetchImpl } = recorder([
      tokenReply,
      { body: { jobComplete: false } },
    ]);
    const source = bigQueryOvertureSource(config(), fetchImpl);
    await expect(source.fetchBatch({ after: null, limit: 5 })).rejects.toThrow(
      /did not finish the page/,
    );
  });

  it("propagates a transport failure instead of answering plausibly", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const source = bigQueryOvertureSource(config(), fetchImpl);
    await expect(source.fetchBatch({ after: null, limit: 5 })).rejects.toThrow(
      ConflictError,
    );
  });

  it("propagates a non-2xx", async () => {
    const { fetchImpl } = recorder([
      tokenReply,
      { ok: false, status: 403, body: { error: { message: "denied" } } },
    ]);
    const source = bigQueryOvertureSource(config(), fetchImpl);
    await expect(source.fetchBatch({ after: null, limit: 5 })).rejects.toThrow(
      /BigQuery query failed \(403\)/,
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("configuration — the three outcomes, and no fourth", () => {
  afterEach(() => setOverturePlaceSource(null));

  it("unset: installs nothing, and says so without throwing", () => {
    const result = installOverture({ env: {} });
    expect(result).toEqual({
      installed: false,
      reason: expect.stringContaining("OVERTURE_SOURCE is unset"),
    });
    expect(overturePlaceSource()).toBeNull();
  });

  it("complete: installs the real BigQuery client, not a stub", () => {
    const result = installOverture({ env: configuredEnv() });
    expect(result).toEqual({
      installed: true,
      source: "bigquery:cellar-overture.places.overture_pois",
    });
    expect(overturePlaceSource()?.name).toBe(
      "bigquery:cellar-overture.places.overture_pois",
    );
  });

  it.each([
    [
      "no table",
      { OVERTURE_BIGQUERY_TABLE: undefined },
      /OVERTURE_BIGQUERY_TABLE is required/,
    ],
    [
      "no credentials",
      { OVERTURE_GCP_CREDENTIALS_JSON: undefined },
      /needs a service-account key/,
    ],
    [
      "a key that cannot sign",
      { OVERTURE_GCP_CREDENTIALS_JSON: '{"project_id":"p"}' },
      /missing client_email, private_key/,
    ],
  ])(
    "incomplete (%s): throws, so the host does not start",
    (_what, patch, message) => {
      const env = { ...configuredEnv(), ...patch };
      expect(() => installOverture({ env })).toThrow(message);
      expect(overturePlaceSource()).toBeNull();
    },
  );

  it("a typo in OVERTURE_SOURCE is a misconfiguration, not 'run without one'", () => {
    expect(() =>
      selectOvertureSource({ OVERTURE_SOURCE: "big-query" }),
    ).toThrow(ValidationError);
  });

  it("refuses an OVERTURE_TIMEOUT_MS a reload batch could not wait for", () => {
    // The largest page timeout that still leaves the bulk upsert room inside
    // one `runBatch` delivery is accepted, and the default sits under it…
    expect(
      readOvertureConfig(
        configuredEnv({ OVERTURE_TIMEOUT_MS: String(MAX_OVERTURE_TIMEOUT_MS) }),
      ).timeoutMs,
    ).toBe(MAX_OVERTURE_TIMEOUT_MS);
    expect(readOvertureConfig(configuredEnv()).timeoutMs).toBeLessThanOrEqual(
      MAX_OVERTURE_TIMEOUT_MS,
    );
    // …and one millisecond more stops the boot, naming the bound.
    const env = configuredEnv({
      OVERTURE_TIMEOUT_MS: String(MAX_OVERTURE_TIMEOUT_MS + 1),
    });
    expect(() => readOvertureConfig(env)).toThrow(ValidationError);
    expect(() => installOverture({ env })).toThrow(
      `at most ${MAX_OVERTURE_TIMEOUT_MS}ms`,
    );
    expect(overturePlaceSource()).toBeNull();
  });

  it("defaults the billing project to the key's own project_id", () => {
    const config = readOvertureConfig(configuredEnv());
    expect(config.projectId).toBe("cellar-overture");
    expect(config.location).toBe("US");
  });

  it("has no NODE_ENV branch anywhere: the mock lane is not reachable", () => {
    // A reading of literal text and names, on purpose: the lane was reached
    // by a string compare, and a string has no symbol.
    const file = sourceFileAt(project, `${ACTORS_SRC}/lib/overture.ts`);
    const hits: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isStringLiteralLike(node) &&
        /NODE_ENV|NHOST_LOCAL|wisconsin/i.test(node.text)
      ) {
        hits.push(node.text);
      }
      if (ts.isIdentifier(node) && node.text === "NODE_ENV")
        hits.push("NODE_ENV");
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(hits).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */

describe("boot wiring (B5b's lesson)", () => {
  it("src/boot.ts calls installOverture()", () => {
    // Resolved, not grepped: the prose around the call names it too, and a
    // comment is not a call — nor is a local that shares the name, while a
    // renamed import is. `src/boot.test.ts` drives `boot()` and sees the call
    // happen; this keeps the guard beside the seam it guards, and
    // `src/boot-wiring.test.ts` proves `index.ts` calls `boot()`.
    const { calls, refusals } = findCalls(
      project,
      [{ module: `${ACTORS_SRC}/lib/overture.ts`, name: "installOverture" }],
      {
        rule: "overture/boot",
        files: [sourceFileAt(project, `${ACTORS_SRC}/boot.ts`)],
      },
    );
    expect(refusals).toEqual([]);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("registers OvertureReloadJobActor", () => {
    expect(ACTOR_REGISTRY.map(({ actorClass }) => actorClass.name)).toContain(
      "OvertureReloadJobActor",
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("the registry", () => {
  afterEach(() => setOverturePlaceSource(null));

  it("hands back exactly what was installed", () => {
    const fake: OverturePlaceSource = {
      name: "fake",
      fetchBatch: async () => ({ rows: [], lastId: null, hasMore: false }),
    };
    setOverturePlaceSource(fake);
    expect(overturePlaceSource()).toBe(fake);
  });
});
