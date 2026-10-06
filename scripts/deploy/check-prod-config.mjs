// Refuse a production compose config that still carries a PUBLISHED development
// secret — `cellar-dev-dapr-api-token`, `cellar-dev-app-api-token`,
// `cellar-dev-secret`, Postgres's `cellar` — in any secret-named variable of
// any service.
//
// The production overlay already makes each of those variables `:?` (required
// and non-blank), but "non-blank" is exactly what a copied development value is.
// The app refuses BETTER_AUTH_SECRET's old published value by digest; nothing
// else did, and MinIO's S3 API is internet-facing through the edge.
//
// NO HAND-MAINTAINED LIST OF DEV VALUES. The published values are whatever the
// BASE compose file renders to with an empty environment — the same defaults a
// developer's `bun run stack:up` gets — so a new `${X:-some-dev-secret}` in
// infra/docker-compose.yml is covered the day it lands.
//
// Input, on stdin, one JSON object (so neither half ever touches disk — the
// production render holds every secret in .env.prod):
//
//   { "dev":  <docker compose -f infra/docker-compose.yml --env-file /dev/null config --format json>,
//     "prod": <docker compose -f base -f prod --env-file .env.prod config --format json> }
//
// It also holds THE EDGE'S SHAPE (the second half of this file): the production
// stack sits behind the host's shared nginx-proxy, which routes by environment
// variables on the containers themselves, so "what is on the internet" is a
// property of the rendered config and is checked here, before anything starts.
//
// Prints service and variable NAMES only, never a value. Exit 0 clean, 1 a
// published value or an edge violation found, 2 unusable input (including "nothing was compared",
// which would otherwise pass by not checking anything).
//
// Runs as a plain Node ESM program with no imports, so the deploy can hand it
// to the node inside the image it is deploying (`node --input-type=module -e`)
// on a host that has no Node of its own. Wired into
// scripts/deploy/pull-deploy.sh (its `guard` step, on Loki)
// and self-tested in stack-ci's `compose` job (scripts/deploy/prod-config-selftest.sh).

/** Variable names that hold a credential. Matched against the NAME, per service. */
const SECRET_NAME = /(PASSWORD|SECRET|TOKEN|WEBHOOK_URL|API_KEY|CREDENTIALS_JSON)$/;

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};

const fail = (why) => {
  console.error(`check-prod-config: ${why}`);
  process.exit(2);
};

const secretEntries = (config) => {
  const out = [];
  for (const [service, spec] of Object.entries(config?.services ?? {})) {
    for (const [name, value] of Object.entries(spec?.environment ?? {})) {
      if (SECRET_NAME.test(name) && typeof value === "string" && value !== "") {
        out.push({ service, name, value });
      }
    }
  }
  return out;
};

let input;
try {
  input = JSON.parse(await readStdin());
} catch (error) {
  fail(`stdin is not the expected {dev, prod} JSON object (${error.message})`);
}

const published = new Set(secretEntries(input?.dev).map((e) => e.value));
const checked = secretEntries(input?.prod);

// Both halves have to be non-trivial, or a render that failed upstream (an
// empty object, a missing `services` key) would read as "no dev secret found".
if (published.size < 3) {
  fail(
    `the development render yielded ${published.size} published secret value(s); expected the base file's defaults (at least 3). Refusing to pass vacuously.`,
  );
}
if (checked.length === 0) {
  fail(
    "the production render has no secret-named variable at all. Refusing to pass vacuously.",
  );
}

const hits = checked.filter((e) => published.has(e.value));
for (const { service, name } of hits) {
  console.error(
    `::error::${service}.${name} is set to a PUBLISHED development default (the value infra/docker-compose.yml falls back to). Generate a real one in infra/.env.prod.`,
  );
}

// --- The edge's shape ------------------------------------------------------
//
// nginx-proxy serves every container that carries VIRTUAL_HOST, at VIRTUAL_PATH
// (default "/"), and scripts/deploy/edge.sh attaches exactly those containers to
// the proxy's network. So each rule below is one way the public surface could
// widen without any file named "edge" changing:
//
//   1. The proxied set is exactly api, actors, minio. Postgres, a sidecar or the
//      Dapr control plane with a VIRTUAL_HOST would be published, and attached
//      to a network every container on the host shares.
//   2. api and actors share the edge hostname; minio has its own (SigV4 needs
//      the files host to itself — deploy-loki.md §1).
//   3. On the edge hostname, each path is exactly the one reviewed. A missing
//      VIRTUAL_PATH is "/", which for actors puts every actor method on the
//      internet behind one token; a widened one is the same in degrees.
//      VIRTUAL_DEST would rewrite the path the actor host's canonical-path gate
//      has to see raw, so it must be unset everywhere.
//   4. Nothing is published on every interface. The proxy owns the host's
//      public sockets; a `0.0.0.0` (or blank host_ip) publish here routes
//      around it.
//
// Changing one of these on purpose means changing it here too, in review.
const EDGE_PROXIED = { api: "edge", actors: "edge", minio: "files" };
const EDGE_PATHS = {
  api: "~ ^/(graphql|healthz)$",
  actors: "^~ /api/auth/",
  minio: undefined,
};
const ALL_INTERFACES = new Set(["", "0.0.0.0", "::", "[::]"]);

const services = input?.prod?.services ?? {};
const edgeErrors = [];
const env = (svc) => services[svc]?.environment ?? {};
// `docker compose config` re-escapes a literal `$` as `$$` in its output.
const unescape = (v) => (typeof v === "string" ? v.replaceAll("$$", "$") : v);

const proxied = Object.keys(services).filter(
  (svc) => (env(svc).VIRTUAL_HOST ?? "") !== "",
);
for (const svc of proxied) {
  if (!(svc in EDGE_PROXIED)) {
    edgeErrors.push(
      `${svc} carries VIRTUAL_HOST: nginx-proxy would publish it, and edge.sh would attach it to the proxy's shared network. Only ${Object.keys(EDGE_PROXIED).join(", ")} may.`,
    );
  }
}
for (const svc of Object.keys(EDGE_PROXIED)) {
  if (!proxied.includes(svc)) {
    edgeErrors.push(`${svc} has no VIRTUAL_HOST; the edge would not reach it.`);
  }
}
const edgeHost = env("api").VIRTUAL_HOST;
const filesHost = env("minio").VIRTUAL_HOST;
if (edgeHost !== undefined && env("actors").VIRTUAL_HOST !== edgeHost) {
  edgeErrors.push("actors.VIRTUAL_HOST differs from api.VIRTUAL_HOST.");
}
if (edgeHost !== undefined && filesHost === edgeHost) {
  edgeErrors.push(
    "minio.VIRTUAL_HOST is the edge hostname; MinIO needs a hostname of its own.",
  );
}
for (const [svc, want] of Object.entries(EDGE_PATHS)) {
  const got = unescape(env(svc).VIRTUAL_PATH);
  if (got !== want) {
    edgeErrors.push(
      want === undefined
        ? `${svc}.VIRTUAL_PATH is set; the files host is served whole.`
        : `${svc}.VIRTUAL_PATH is not the reviewed value${got === undefined ? " (unset means \"/\": the whole hostname)" : ""}.`,
    );
  }
}
for (const svc of proxied) {
  if ((env(svc).VIRTUAL_DEST ?? "") !== "") {
    edgeErrors.push(
      `${svc}.VIRTUAL_DEST is set; the actor host's canonical-path gate must see the raw path.`,
    );
  }
}
for (const [svc, spec] of Object.entries(services)) {
  for (const port of spec?.ports ?? []) {
    if (ALL_INTERFACES.has(port?.host_ip ?? "")) {
      edgeErrors.push(
        `${svc} publishes container port ${port?.target} on every interface; bind it to 127.0.0.1 or LAN_BIND_ADDR.`,
      );
    }
  }
}
for (const why of edgeErrors) console.error(`::error::edge: ${why}`);

if (hits.length > 0 || edgeErrors.length > 0) process.exit(1);
console.log(
  `check-prod-config: ${checked.length} secret-named variable(s) across ${new Set(checked.map((e) => e.service)).size} service(s); none equals one of the ${published.size} published development values.`,
);
console.log(
  `check-prod-config: edge shape ok — proxied: ${proxied.sort().join(", ")}; no port on every interface.`,
);
