/**
 * The Overture Maps source seam — C4b (migration plan §1326, §2.6, §8.4).
 *
 * Places in this database start life as rows in a BigQuery table of Overture
 * Maps points of interest. The old stack loaded them with
 * `functions/refreshPlaces` + `processPlaceRefreshBatch`: `DELETE FROM places`,
 * then a keyset walk of that table upserted 500 at a time on
 * `places_overture_id_key`. C4 ported the *cursor loop* and explicitly did not
 * port the payload, because there was no BigQuery seam and `places` belongs to
 * `PlaceActor`. This module is that seam.
 *
 * ## The failure this module is designed against
 *
 * `functions/refreshPlaces/_services/factory.ts`:
 *
 * ```ts
 * if (!hasCredentials) {
 *   console.warn("… falling back to mock service");
 *   return new MockPlaceDataService();   // reads wisconsin-places.json
 * }
 * ```
 *
 * In production. Every place in the country quietly became a Wisconsin
 * restaurant and nothing failed. So there are exactly three outcomes here and
 * no fourth, the same three `lib/ai/install.ts` has:
 *
 * | `OVERTURE_SOURCE` | what happens |
 * |---|---|
 * | unset | nothing is installed. `overturePlaceSource()` answers `null`, and `OvertureReloadJobActor.start` **refuses**, naming what is missing. Nothing else in the app is affected. |
 * | set, and complete | the real BigQuery client is installed. One log line naming the project and table. |
 * | set, but incomplete | **this throws, and the host does not start.** |
 *
 * **There is deliberately no throwing stub installed as the default.** This
 * repository has been bitten twice by one: Dapr's `ActorManager` constructs
 * actors as `new Cls(daprClient, actorId)`, so a constructor default *is* the
 * production wiring, and an `unconfigured*` object sitting there means the
 * dead path and the live path are indistinguishable until a user finds the
 * hole (B5b's `PlaceReviewer`, and X1's own seam registry before it). Here the
 * absence is a `null` that `start` checks, in front of an admin who is
 * watching — not a throw from the twelfth row of the third batch.
 *
 * ## Nothing in this module has ever made a live BigQuery call
 *
 * `bigQueryOvertureSource` is exercised end to end against an injected
 * transport, with a throwaway RSA key generated inside the test, exactly the
 * way `lib/ai/vertex-ai.ts` is. No credential exists anywhere in this tree and
 * no test reaches the network. What that leaves unverified is named in C4b's
 * outcome note: the wire shape is built from Google's documented
 * `bigquery.jobs.query` response and has not been seen from the real service.
 */
import { readFileSync } from "node:fs";
import type { OverturePlaceInput } from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  ConflictError,
  OvertureReloadJobActorDescriptor,
  PlaceActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import type { FetchLike, ServiceAccountKey } from "./google-service-account.ts";
import {
  accessTokenMinter,
  parseServiceAccountKey,
} from "./google-service-account.ts";
import { emit } from "./telemetry.ts";

/* -------------------------------------------------------------------------- */
/* The port                                                                    */
/* -------------------------------------------------------------------------- */

/** One row as the source hands it over: untyped, untrusted, unvalidated. */
export type OvertureSourceRow = Readonly<Record<string, unknown>>;

export type OvertureBatch = {
  readonly rows: readonly OvertureSourceRow[];
  /**
   * The `overture_id` of the last row in `rows` — the next batch's `after`.
   *
   * Non-null whenever `rows` is non-empty; a source that cannot produce a
   * keyset key cannot be walked, and the job treats a null here as a fatal
   * source defect rather than looping on the same page for ever.
   */
  readonly lastId: string | null;
  readonly hasMore: boolean;
};

export type OvertureFetchOptions = {
  readonly after: string | null;
  readonly limit: number;
};

/**
 * Where Overture places come from. One method, because one keyset page is the
 * whole of what a batch needs.
 */
export type OverturePlaceSource = {
  /** For logs and the job's `last_error`. */
  readonly name: string;
  fetchBatch(options: OvertureFetchOptions): Promise<OvertureBatch>;
};

/* -------------------------------------------------------------------------- */
/* Normalization — the malformed-row fence                                     */
/* -------------------------------------------------------------------------- */

export type NormalizedRow =
  | { readonly ok: true; readonly place: OverturePlaceInput }
  | {
      readonly ok: false;
      readonly overtureId: string | null;
      readonly reason: string;
    };

const MAX_TEXT = 2_000;

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) : trimmed;
};

const finite = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  // BigQuery's REST API returns every scalar as a string.
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const categoriesOf = (raw: OvertureSourceRow): readonly string[] => {
  const listed = Array.isArray(raw.categories)
    ? raw.categories.map(text).filter((c): c is string => c !== null)
    : [];
  if (listed.length > 0) return listed;
  const primary = text(raw.primary_category);
  return primary === null ? [] : [primary];
};

/**
 * One source row → one writable place, or a counted rejection.
 *
 * **Rejections are returned, never thrown, and never coerced.** The old
 * transform did the opposite on both counts: a missing name became the literal
 * string `"Unknown"` and a non-numeric latitude became `NaN`, so a bad row
 * either wrote nonsense or failed the whole GraphQL mutation and took its 499
 * healthy neighbours with it. Here a bad row is dropped, counted, and the
 * batch carries on — which is the only way a reload of a third-party extract
 * ever finishes.
 *
 * `confidence` is the one field that is *repaired* rather than rejected: it is
 * nullable, it is decoration on a row that is otherwise fine, and
 * `places_confidence_check` would reject an out-of-range value at the database
 * anyway. Out of range or unparseable becomes `null`.
 */
export const normalizeOvertureRow = (raw: OvertureSourceRow): NormalizedRow => {
  const overtureId = text(raw.overture_id);
  const reject = (reason: string): NormalizedRow => ({
    ok: false,
    overtureId,
    reason,
  });

  if (overtureId === null) return reject("no overture_id");

  const name = text(raw.name);
  if (name === null) return reject("no name");

  const categories = categoriesOf(raw);
  if (categories.length === 0) return reject("no categories");

  const lat = finite(raw.latitude);
  const lng = finite(raw.longitude);
  if (lat === null || lng === null) {
    return reject("latitude/longitude is not a number");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return reject(`location (${lng}, ${lat}) is out of range`);
  }

  const rawConfidence = finite(raw.confidence);
  const confidence =
    rawConfidence === null || rawConfidence < 0 || rawConfidence > 1
      ? null
      : Number(rawConfidence.toFixed(2));

  const country = text(raw.address_country);
  const countryCode =
    country !== null && /^[A-Za-z]{2}$/.test(country)
      ? country.toUpperCase()
      : null;

  return {
    ok: true,
    place: {
      overtureId,
      name,
      categories,
      location: { lng, lat },
      confidence,
      streetAddress: text(raw.address_freeform),
      locality: text(raw.address_locality),
      region: text(raw.address_region),
      postcode: text(raw.address_postcode),
      countryCode,
      phone: text(raw.phone),
      website: text(raw.website),
    },
  };
};

/* -------------------------------------------------------------------------- */
/* The BigQuery implementation                                                 */
/* -------------------------------------------------------------------------- */

export type OvertureBigQueryConfig = {
  /** The GCP project the *query* is billed to. */
  readonly projectId: string;
  /** `project.dataset.table`, the pre-filtered Overture extract. */
  readonly table: string;
  /** BigQuery dataset location. The old service hardcoded `US`. */
  readonly location: string;
  readonly credentials: ServiceAccountKey;
  readonly timeoutMs: number;
};

/**
 * A table identifier cannot be a query parameter, so it is concatenated — and
 * therefore validated first. Three dot-separated segments of the characters
 * BigQuery itself allows, and nothing else reaches the SQL text.
 */
const TABLE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_$-]+$/;

export const requireTableId = (table: string): string => {
  if (!TABLE_PATTERN.test(table)) {
    throw new ValidationError(
      `OVERTURE_BIGQUERY_TABLE must be \`project.dataset.table\`, got ` +
        `"${table}". It is concatenated into the query text (BigQuery has no ` +
        "parameter for a table name), so anything else is refused here.",
    );
  }
  return table;
};

/** The columns the walk reads. Kept identical to the old service's list. */
export const OVERTURE_COLUMNS = [
  "overture_id",
  "name",
  "primary_category",
  "categories",
  "confidence",
  "latitude",
  "longitude",
  "address_freeform",
  "address_locality",
  "address_region",
  "address_postcode",
  "address_country",
  "phone",
  "website",
] as const;

const QUERY_URL = "https://bigquery.googleapis.com/bigquery/v2/projects";

type BigQueryField = {
  readonly name?: unknown;
  readonly mode?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `{ f: [{ v: … }] }` + the schema's field names → a plain record. */
export const decodeBigQueryRows = (
  schemaFields: readonly unknown[],
  rows: readonly unknown[],
): readonly OvertureSourceRow[] => {
  const names = schemaFields.map((field) => {
    const f = field as BigQueryField;
    return {
      name: typeof f.name === "string" ? f.name : null,
      repeated: f.mode === "REPEATED",
    };
  });

  return rows.map((row) => {
    const cells = isRecord(row) && Array.isArray(row.f) ? row.f : [];
    const out: Record<string, unknown> = {};
    names.forEach((field, index) => {
      if (field.name === null) return;
      const cell = cells[index];
      const value = isRecord(cell) ? cell.v : undefined;
      out[field.name] = field.repeated
        ? (Array.isArray(value) ? value : []).map((entry) =>
            isRecord(entry) ? entry.v : entry,
          )
        : value;
    });
    return out;
  });
};

export const bigQueryOvertureSource = (
  config: OvertureBigQueryConfig,
  fetchImpl: FetchLike,
  now: () => number = Date.now,
): OverturePlaceSource => {
  const table = requireTableId(config.table);
  const accessToken = accessTokenMinter({
    key: config.credentials,
    timeoutMs: config.timeoutMs,
    fetchImpl,
    now,
  });
  const url = `${QUERY_URL}/${encodeURIComponent(config.projectId)}/queries`;

  return {
    name: `bigquery:${table}`,

    async fetchBatch({ after, limit }): Promise<OvertureBatch> {
      const token = await accessToken();
      const query =
        `SELECT ${OVERTURE_COLUMNS.join(", ")} FROM \`${table}\` ` +
        (after === null ? "" : "WHERE overture_id > @cursor ") +
        "ORDER BY overture_id LIMIT @row_limit";

      const parameters: unknown[] = [
        {
          name: "row_limit",
          parameterType: { type: "INT64" },
          parameterValue: { value: String(limit) },
        },
      ];
      if (after !== null) {
        parameters.push({
          name: "cursor",
          parameterType: { type: "STRING" },
          parameterValue: { value: after },
        });
      }

      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query,
            useLegacySql: false,
            parameterMode: "NAMED",
            queryParameters: parameters,
            location: config.location,
            maxResults: limit,
            timeoutMs: config.timeoutMs,
          }),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        throw new ConflictError(
          `BigQuery could not be reached at ${url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const body = await response.text();
      if (!response.ok) {
        throw new ConflictError(
          `BigQuery query failed (${response.status}) for ${table}: ` +
            body.slice(0, 500),
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new ConflictError("BigQuery returned a body that is not JSON");
      }
      if (!isRecord(parsed)) {
        throw new ConflictError(
          "BigQuery returned a body that is not an object",
        );
      }
      // A query that has not finished returns no rows and `jobComplete: false`.
      // Treating that as "the walk is over" would silently truncate the reload
      // at whatever row the timeout fell on — the exact class of quiet wrongness
      // this module exists to refuse.
      if (parsed.jobComplete === false) {
        throw new ConflictError(
          `BigQuery did not finish the page after ${config.timeoutMs}ms ` +
            `(cursor ${after ?? "START"}). Raise OVERTURE_TIMEOUT_MS (at most ` +
            `${MAX_OVERTURE_TIMEOUT_MS}) or lower the batch size; this is ` +
            "not an empty page.",
        );
      }

      const schema = isRecord(parsed.schema) ? parsed.schema : {};
      const fields = Array.isArray(schema.fields) ? schema.fields : [];
      const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
      const rows = decodeBigQueryRows(fields, rawRows);

      const last = rows.at(-1);
      const lastId =
        last === undefined
          ? null
          : typeof last.overture_id === "string" && last.overture_id !== ""
            ? last.overture_id
            : null;

      return { rows, lastId, hasMore: rows.length === limit };
    },
  };
};

/* -------------------------------------------------------------------------- */
/* Configuration and boot wiring                                               */
/* -------------------------------------------------------------------------- */

export type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * What an `OvertureReloadJobActor` batch holds back from its delivery for the
 * turn around the work. The job framework's own `BATCH_BUDGET_MARGIN_MS`
 * (`actors/job-actor/index.ts`); restated rather than imported so this module
 * does not pull the job actor, and its database, into the config path —
 * `overture.test.ts` fails if the two disagree.
 */
export const OVERTURE_BATCH_MARGIN_MS = 5_000;

/**
 * The longest `OVERTURE_TIMEOUT_MS` a reload batch can survive.
 *
 * One batch is one BigQuery page (this timeout) and one
 * `PlaceActor.bulkUpsertFromOverture`, inside one `runBatch` delivery the
 * outbox waits for only as long as the job's descriptor declares. A page
 * timeout past this lets a slow page plus a slow upsert outrun the delivery:
 * the drainer aborts the batch, charges an attempt and retries it while the
 * first turn is still running, and a page that is slow every time
 * dead-letters a reload that was making progress. Derived from the two
 * descriptors, so raising either moves it.
 */
export const MAX_OVERTURE_TIMEOUT_MS =
  actorMethodTimeout(OvertureReloadJobActorDescriptor, "runBatch") -
  OVERTURE_BATCH_MARGIN_MS -
  actorMethodTimeout(PlaceActorDescriptor, "bulkUpsertFromOverture");

const read = (env: Env, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
};

const require_ = (env: Env, name: string): string => {
  const value = read(env, name);
  if (value === undefined) {
    throw new ConflictError(
      `${name} is required when OVERTURE_SOURCE=bigquery. That variable is ` +
        "set, so this is a misconfiguration, not an absence: unset " +
        "OVERTURE_SOURCE entirely if you mean to run without a bulk place " +
        "loader (the reload job then refuses to start, and nothing else " +
        "changes).",
    );
  }
  return value;
};

/**
 * Which source the operator asked for, or `null` for "none".
 *
 * A value that is not `bigquery` **throws**: `OVERTURE_SOURCE=big-query` is a
 * typo, not a request to run without a loader, and quietly treating it as the
 * latter is the mock-fallback bug wearing a different hat.
 */
export const selectOvertureSource = (
  env: Env = process.env,
): "bigquery" | null => {
  const raw = read(env, "OVERTURE_SOURCE");
  if (raw === undefined) return null;
  if (raw !== "bigquery") {
    throw new ValidationError(
      `OVERTURE_SOURCE="${raw}" is not a known source. The only one is ` +
        '"bigquery"; unset it to run with no bulk place loader.',
    );
  }
  return "bigquery";
};

export const readOvertureConfig = (
  env: Env = process.env,
): OvertureBigQueryConfig => {
  if (selectOvertureSource(env) === null) {
    throw new ConflictError(
      "no Overture source is configured: OVERTURE_SOURCE is unset.",
    );
  }
  const inline = read(env, "OVERTURE_GCP_CREDENTIALS_JSON");
  const path = read(env, "GOOGLE_APPLICATION_CREDENTIALS");
  if (inline === undefined && path === undefined) {
    throw new ConflictError(
      "OVERTURE_SOURCE=bigquery needs a service-account key: set " +
        "OVERTURE_GCP_CREDENTIALS_JSON to the key itself, or " +
        "GOOGLE_APPLICATION_CREDENTIALS to a key file path. (The Nhost lane " +
        "that read the key out of the `admin_credentials` table is not " +
        "ported — that table does not exist in the transformed schema, and " +
        "deployment secrets belong in the environment.)",
    );
  }
  const json =
    inline ?? readKeyFile(path ?? "" /* unreachable: checked above */);
  const credentials = parseServiceAccountKey(
    json,
    inline === undefined
      ? `the service-account key at GOOGLE_APPLICATION_CREDENTIALS (${path})`
      : "OVERTURE_GCP_CREDENTIALS_JSON",
  );

  const timeoutRaw = read(env, "OVERTURE_TIMEOUT_MS");
  const timeoutMs =
    timeoutRaw === undefined ? DEFAULT_TIMEOUT_MS : Number(timeoutRaw);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ValidationError(
      `OVERTURE_TIMEOUT_MS must be a positive integer, got ${timeoutRaw}`,
    );
  }
  if (timeoutMs > MAX_OVERTURE_TIMEOUT_MS) {
    throw new ValidationError(
      `OVERTURE_TIMEOUT_MS=${timeoutMs} is longer than a reload batch can ` +
        `wait: at most ${MAX_OVERTURE_TIMEOUT_MS}ms, which is the ` +
        "OvertureReloadJobActor.runBatch delivery less the bulk upsert and the " +
        "batch margin. A slower page would outrun its own delivery and be " +
        "retried while it is still running; lower the timeout, or the batch " +
        "size, instead.",
    );
  }

  return {
    projectId: read(env, "OVERTURE_GCP_PROJECT_ID") ?? credentials.project_id,
    table: requireTableId(require_(env, "OVERTURE_BIGQUERY_TABLE")),
    location: read(env, "OVERTURE_BIGQUERY_LOCATION") ?? "US",
    credentials,
    timeoutMs,
  };
};

const readKeyFile = (path: string): string => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new ConflictError(
      `could not read the service-account key at ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

/* -------------------------------------------------------------------------- */
/* The registry                                                                */
/* -------------------------------------------------------------------------- */

let installed: OverturePlaceSource | null = null;

/**
 * The installed source, or `null` when none is configured.
 *
 * `null`, not a throwing stub — see the module doc. The one caller is
 * `OvertureReloadJobActor`, whose `start` turns a `null` into a refusal an
 * admin sees immediately.
 */
export const overturePlaceSource = (): OverturePlaceSource | null => installed;

/** For tests and for `installOverture`. */
export const setOverturePlaceSource = (
  source: OverturePlaceSource | null,
): void => {
  installed = source;
};

export type InstallOvertureResult =
  | { readonly installed: false; readonly reason: string }
  | { readonly installed: true; readonly source: string };

export type InstallOvertureOptions = {
  readonly env?: Env;
  readonly source?: OverturePlaceSource;
  readonly fetchImpl?: FetchLike;
};

const defaultFetch: FetchLike = (input, init) =>
  fetch(input, init as RequestInit) as unknown as ReturnType<FetchLike>;

/**
 * Boot: install the real BigQuery source, or refuse to pretend.
 *
 * Called once from `boot()` (`src/boot.ts`), before any actor is registered or
 * the server starts. A set-but-incomplete `OVERTURE_SOURCE` throws here and the
 * host never starts serving — the third row of the module doc's table, and the
 * row the Nhost factory got wrong. `overture.test.ts` holds all three rows, and
 * asserts that `boot()` actually calls this (and `boot.test.ts` watches it
 * happen): B5b's lesson is that a seam named in a comment and not installed
 * fails exactly like one nobody wrote.
 */
export const installOverture = (
  options: InstallOvertureOptions = {},
): InstallOvertureResult => {
  const env = options.env ?? process.env;

  // Throws on a value that is not `bigquery`.
  const selected = selectOvertureSource(env);
  if (selected === null && options.source === undefined) {
    const reason =
      "OVERTURE_SOURCE is unset, so no bulk Overture loader is wired. " +
      "OvertureReloadJobActor will refuse to start; every other place " +
      "feature is unaffected. See services/actors/README.md.";
    console.warn(`[overture] ${reason}`);
    setOverturePlaceSource(null);
    return { installed: false, reason };
  }

  if (options.source !== undefined) {
    setOverturePlaceSource(options.source);
    return { installed: true, source: options.source.name };
  }

  // Throws if a required value is missing. Not caught: an incomplete
  // configuration must stop the boot.
  const config = readOvertureConfig(env);
  const source = bigQueryOvertureSource(
    config,
    options.fetchImpl ?? defaultFetch,
  );
  setOverturePlaceSource(source);
  console.log(
    `[overture] source ${source.name} in ${config.location}, billed to ` +
      `${config.projectId}`,
  );
  emit({
    name: "overture.source_installed",
    severity: "INFO",
    message: `overture source ${source.name}`,
    attributes: { "overture.table": config.table },
  });
  return { installed: true, source: source.name };
};
