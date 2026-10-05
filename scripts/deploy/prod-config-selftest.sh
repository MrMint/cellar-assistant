#!/usr/bin/env bash
# Self-test for the production compose config and its deploy-time guard.
# Run by stack-ci's `compose` job; runnable by hand from any checkout:
#
#   scripts/deploy/prod-config-selftest.sh
#
# Asserts, with no .env.prod and no secret of any kind (every value below is
# generated here):
#
#   1. The overlay renders. `docker compose -f base -f prod config` with an env
#      file built FROM infra/.env.prod.example — every blank value filled with a
#      throwaway — so a `:?` variable the example forgot to list fails here,
#      not on Loki mid-deploy.
#   2. scripts/deploy/check-prod-config.mjs passes that config.
#   3. It REFUSES each published development secret, one at a time: every
#      secret-named variable the base file gives a non-empty default is set to
#      exactly that default, and the guard must exit 1 naming it. The list is
#      derived from the base render, so it cannot go stale.
#   4. A required secret left blank fails the render (the overlay's `:?`),
#      for every `:?` variable .env.prod.example leaves blank — derived from
#      the overlay, so a new required secret is covered the day it lands.
#   5. The guard REFUSES each way the edge could widen — a VIRTUAL_PATH dropped
#      or widened, a VIRTUAL_HOST on a service that must not have one,
#      VIRTUAL_DEST set, a port on every interface — by mutating the good
#      production render one way at a time.
#   6. infra/nginx-proxy/vhost.d/*.conf pass `nginx -t` inside the nginx-proxy
#      image Loki runs (NGINX_PROXY_IMAGE, digest-pinned below), as server-level
#      includes — the same test scripts/deploy/edge.sh runs before installing.
#
# Needs docker (compose v2.24+) and node. Prints variable names, never values —
# though every value here is a throwaway anyway.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="$ROOT/infra/docker-compose.yml"
PROD="$ROOT/infra/docker-compose.prod.yml"
EXAMPLE="$ROOT/infra/.env.prod.example"
CHECK="$ROOT/scripts/deploy/check-prod-config.mjs"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# A clean environment for every compose call, so nothing in the caller's shell
# (a DAPR_API_TOKEN exported for the dev lane, say) leaks into either render.
clean() {
  env -i PATH="$PATH" HOME="$HOME" ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} "$@"
}

render_dev() {
  clean docker compose -f "$BASE" --env-file /dev/null config --format json
}
render_prod() {
  clean docker compose -f "$BASE" -f "$PROD" --env-file "$1" config --format json
}
guard() {
  { printf '{"dev":'; render_dev; printf ',"prod":'; render_prod "$1"; printf '}'; } | node "$CHECK"
}
# The guard over the good render with one JS mutation applied to `prod`
# (a function of `p`, the parsed production config).
guard_mutated() {
  local mutation="$1"
  # shellcheck disable=SC2016  # JS, for node — not the shell
  { printf '{"dev":'; render_dev; printf ',"prod":'; render_prod "$GOOD" | node -e '
      let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const p = JSON.parse(s);
        ('"$mutation"')(p);
        process.stdout.write(JSON.stringify(p));
      });'; printf '}'; } | node "$CHECK"
}

# 1 — the good env: the example, blanks filled.
GOOD="$WORK/good.env"
i=0
while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" =~ ^([A-Z0-9_]+)=$ ]]; then
    i=$((i + 1))
    printf '%s=selftest-%s-%s\n' "${BASH_REMATCH[1]}" "$i" "$RANDOM$RANDOM" >>"$GOOD"
  else
    printf '%s\n' "$line" >>"$GOOD"
  fi
done <"$EXAMPLE"

clean docker compose -f "$BASE" -f "$PROD" --env-file "$GOOD" config --quiet
echo "ok 1 - base + prod overlay render with every blank in .env.prod.example filled"

guard "$GOOD" >/dev/null
echo "ok 2 - check-prod-config passes a config with no published secret"

# 3 — every published secret, one at a time. `name=value` pairs from the dev
# render, restricted to names .env.prod.example actually defines (those are the
# ones an operator sets; DATABASE_URL-style derived values follow them).
# shellcheck disable=SC2016  # a JS template literal, for node — not the shell
pairs="$(render_dev | node -e '
  const re = /(PASSWORD|SECRET|TOKEN|WEBHOOK_URL|API_KEY|CREDENTIALS_JSON)$/;
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const seen = new Map();
    for (const svc of Object.values(JSON.parse(s).services))
      for (const [k, v] of Object.entries(svc.environment ?? {}))
        if (re.test(k) && typeof v === "string" && v !== "") seen.set(k, v);
    for (const [k, v] of seen) console.log(`${k}\t${v}`);
  });')"
tested=0
while IFS=$'\t' read -r name value; do
  grep -q "^${name}=" "$EXAMPLE" || continue
  BAD="$WORK/bad-$name.env"
  grep -v "^${name}=" "$GOOD" >"$BAD"
  printf '%s=%s\n' "$name" "$value" >>"$BAD"
  set +e
  out="$(guard "$BAD" 2>&1)"
  rc=$?
  set -e
  if [ "$rc" -ne 1 ] || ! grep -q "\.${name} is set to a PUBLISHED" <<<"$out"; then
    echo "not ok 3 - check-prod-config accepted the published development value of $name (rc=$rc)" >&2
    echo "$out" >&2
    exit 1
  fi
  if grep -qF -- "$value" <<<"$out"; then
    echo "not ok 3 - check-prod-config printed the value of $name" >&2
    exit 1
  fi
  tested=$((tested + 1))
  echo "ok 3.$tested - refuses the published development value of $name, without printing it"
done <<<"$pairs"
# The dev render has five today (APP_API_TOKEN, AUTH_PROXY_SECRET,
# DAPR_API_TOKEN, MINIO_ROOT_PASSWORD, POSTGRES_PASSWORD — DISCORD_WEBHOOK_URL
# left with the alert webhook, 2026-10-05); fewer than three means the loop
# above stopped seeing them, not that they went away.
if [ "$tested" -lt 3 ]; then
  echo "not ok 3 - only $tested published secret(s) exercised; the derivation is broken" >&2
  exit 1
fi

# 4 — every required secret fails closed when blank. The names are the
# overlay's own `${NAME:?…}` references that are secret-named and that
# .env.prod.example leaves blank for the operator to fill.
required=0
while IFS= read -r name; do
  grep -q "^${name}=$" "$EXAMPLE" || continue
  BLANK="$WORK/blank-$name.env"
  grep -v "^${name}=" "$GOOD" >"$BLANK"
  printf '%s=\n' "$name" >>"$BLANK"
  if clean docker compose -f "$BASE" -f "$PROD" --env-file "$BLANK" config --quiet 2>/dev/null; then
    echo "not ok 4 - the prod overlay rendered with $name blank" >&2
    exit 1
  fi
  required=$((required + 1))
  echo "ok 4.$required - a blank $name fails the production render"
done < <(grep -oE '\$\{[A-Z0-9_]+:\?' "$PROD" | sed -E 's/^\$\{//; s/:\?$//' | sort -u |
  grep -E '(PASSWORD|SECRET|TOKEN|WEBHOOK_URL|API_KEY|CREDENTIALS_JSON)$')
if [ "$required" -lt 3 ]; then
  echo "not ok 4 - only $required required secret(s) exercised; the derivation is broken" >&2
  exit 1
fi

# 5 — the edge's shape fails closed.
# shellcheck disable=SC2016  # JS, for node — not the shell
mutations=(
  'drops actors VIRTUAL_PATH|(p) => { delete p.services.actors.environment.VIRTUAL_PATH; }'
  'widens actors VIRTUAL_PATH to /|(p) => { p.services.actors.environment.VIRTUAL_PATH = "/"; }'
  'widens api VIRTUAL_PATH|(p) => { p.services.api.environment.VIRTUAL_PATH = "~ ^/"; }'
  'gives postgres a VIRTUAL_HOST|(p) => { p.services.postgres.environment.VIRTUAL_HOST = "db.example.com"; }'
  'drops minio VIRTUAL_HOST|(p) => { delete p.services.minio.environment.VIRTUAL_HOST; }'
  'puts minio on the edge hostname|(p) => { p.services.minio.environment.VIRTUAL_HOST = p.services.api.environment.VIRTUAL_HOST; }'
  'sets VIRTUAL_DEST on actors|(p) => { p.services.actors.environment.VIRTUAL_DEST = "/"; }'
  'publishes postgres on every interface|(p) => { p.services.postgres.ports[0].host_ip = ""; }'
  'publishes 443 on 0.0.0.0|(p) => { p.services.api.ports.push({ mode: "ingress", host_ip: "0.0.0.0", target: 443, published: "443", protocol: "tcp" }); }'
)
n=0
for entry in "${mutations[@]}"; do
  what="${entry%%|*}"
  js="${entry#*|}"
  n=$((n + 1))
  set +e
  out="$(guard_mutated "$js" 2>&1)"
  rc=$?
  set -e
  if [ "$rc" -ne 1 ] || ! grep -q '::error::edge:' <<<"$out"; then
    echo "not ok 5.$n - check-prod-config accepted a render that $what (rc=$rc)" >&2
    echo "$out" >&2
    exit 1
  fi
  echo "ok 5.$n - refuses a render that $what"
done

# 6 — the vhost snippets are valid nginx, in a digest-pinned nginx-proxy build.
# Keep it in step with the image the host's edge stack runs; override with
# NGINX_PROXY_IMAGE to test against another.
NGINX_PROXY_IMAGE="${NGINX_PROXY_IMAGE:-nginxproxy/nginx-proxy@sha256:f10a13026f180df97f34a1b313881a1fe838ca2b6a728a3738a36bf8e5b02d89}"
for snippet in "$ROOT"/infra/nginx-proxy/vhost.d/*.conf; do
  name="$(basename "$snippet")"
  # shellcheck disable=SC2016  # the wrapper is expanded by the container's sh
  if ! docker run --rm --network none -v "$snippet:/snippet.conf:ro" --entrypoint sh "$NGINX_PROXY_IMAGE" -c '
      printf "%s\n" "events {}" "http {" "  server {" "    listen 127.0.0.1:65535;" \
        "    server_name selftest.invalid;" "    include /snippet.conf;" \
        "    location / { return 404; }" "  }" "}" >/tmp/t.conf
      nginx -q -t -c /tmp/t.conf' >"$WORK/nginx-$name.log" 2>&1; then
    echo "not ok 6 - infra/nginx-proxy/vhost.d/$name fails nginx -t" >&2
    cat "$WORK/nginx-$name.log" >&2
    exit 1
  fi
  if ! head -n1 "$snippet" | grep -q '^# managed-by: cellar-assistant '; then
    echo "not ok 6 - infra/nginx-proxy/vhost.d/$name lacks the ownership marker edge.sh checks" >&2
    exit 1
  fi
  echo "ok 6 - infra/nginx-proxy/vhost.d/$name passes nginx -t in the pinned nginx-proxy image"
done
