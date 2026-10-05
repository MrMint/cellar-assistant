#!/usr/bin/env bash
# Put the production stack behind the host's existing nginx-proxy.
#
#   scripts/deploy/edge.sh install   # before `up`: per-host nginx config into vhost.d
#   scripts/deploy/edge.sh attach    # after `up`: connect the proxied services
#   scripts/deploy/edge.sh verify    # after attach: prove the routing through the proxy
#
# Run from the repository root (the deploy workflow's checkout, or Loki's
# clone). docs/architecture/deploy-loki.md §1 and §3 explain the shape; this is
# the part of it Compose cannot express.
#
# WHY A SCRIPT AND NOT COMPOSE. On Loki, nginx-proxy lives on Docker's DEFAULT
# `bridge` network (network_mode: bridge, owned by another repository's edge
# stack, which keeps it there for its other services). A Compose service cannot join `bridge` alongside its project
# network — the daemon refuses the service-name alias Compose always adds
# ("network-scoped aliases are only supported for user-defined networks",
# measured with compose v5.5.1 / Docker 29.8.1). `docker network connect`
# can, and the connection survives `up -d` with an unchanged config and a
# container restart, but NOT a recreate (also measured). So `attach` runs after
# every `up`, and is idempotent.
#
# Which services: exactly those whose rendered config carries VIRTUAL_HOST
# (api, actors, minio). scripts/deploy/check-prod-config.mjs refuses a render
# in which that set is anything else, so this script needs no list of its own.
#
# Environment:
#   COMPOSE_ENV_FILE        REQUIRED. infra/.env.prod (the deploy's ENV_FILE_PATH).
#   NGINX_PROXY_VHOST_DIR   REQUIRED for `install`. The HOST path mounted at
#                           /etc/nginx/vhost.d in the proxy (the `Source` of
#                           that mount in `docker inspect nginx-proxy`). No
#                           default: the deploy sets it from the repository
#                           variable LOKI_NGINX_PROXY_VHOST_DIR.
#   NGINX_PROXY_CONTAINER   default nginx-proxy
#   NGINX_PROXY_NETWORK     default bridge — the network the proxy is on
#   COMPOSE_FILES           default infra/docker-compose.yml:infra/docker-compose.prod.yml
#   COMPOSE_PROJECT         optional `-p` for every compose call
#   EDGE_VERIFY_ADDR        default 127.0.0.1 — where `verify` dials the proxy
#   EDGE_VERIFY_PORT        default 443
#   EDGE_VERIFY_INSECURE    1 = skip certificate verification in `verify`, for a
#                           first deploy whose certificate is not issued yet or
#                           is a staging one. Routing is what `verify` proves;
#                           the certificate is deploy-loki.md §5's check.
#
# Needs docker, jq and curl on the host.
# Prints hostnames and container names, never a value from the env file.
set -euo pipefail

die() {
  echo "::error::edge.sh: $*" >&2
  exit 1
}

cmd="${1:-}"
: "${COMPOSE_ENV_FILE:?COMPOSE_ENV_FILE is required (infra/.env.prod)}"
PROXY="${NGINX_PROXY_CONTAINER:-nginx-proxy}"
NET="${NGINX_PROXY_NETWORK:-bridge}"
MARKER_PREFIX="# managed-by: cellar-assistant "

compose() {
  local args=()
  local f
  IFS=: read -r -a files <<<"${COMPOSE_FILES:-infra/docker-compose.yml:infra/docker-compose.prod.yml}"
  for f in "${files[@]}"; do args+=(-f "$f"); done
  [ -n "${COMPOSE_PROJECT:-}" ] && args+=(-p "$COMPOSE_PROJECT")
  docker compose "${args[@]}" --env-file "$COMPOSE_ENV_FILE" "$@"
}

# The rendered config holds every secret, so it only ever goes down a pipe into
# jq, and only hostnames and service names come back out.
rendered() { compose config --format json; }

valid_host() { [[ "$1" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] && [[ "$1" == *.* ]]; }

# "<service> <VIRTUAL_HOST>" for every service that carries one.
proxied_services() {
  rendered | jq -r '.services | to_entries[] | select(.value.environment.VIRTUAL_HOST // "" | length > 0) | "\(.key) \(.value.environment.VIRTUAL_HOST)"'
}

# The two hostnames, from the services that own them. api and actors share the
# edge hostname; minio has the files one.
read_hosts() {
  local json
  json="$(rendered)"
  EDGE_HOST="$(jq -r '.services.api.environment.VIRTUAL_HOST // ""' <<<"$json")"
  FILES_HOST="$(jq -r '.services.minio.environment.VIRTUAL_HOST // ""' <<<"$json")"
  local actors_host
  actors_host="$(jq -r '.services.actors.environment.VIRTUAL_HOST // ""' <<<"$json")"
  valid_host "$EDGE_HOST" || die "api's VIRTUAL_HOST is not a hostname: '$EDGE_HOST'"
  valid_host "$FILES_HOST" || die "minio's VIRTUAL_HOST is not a hostname: '$FILES_HOST'"
  [ "$actors_host" = "$EDGE_HOST" ] || die "actors' VIRTUAL_HOST ($actors_host) differs from api's ($EDGE_HOST)"
  [ "$FILES_HOST" != "$EDGE_HOST" ] || die "the files host and the edge host are the same name"
}

proxy_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$PROXY" 2>/dev/null)" = "true" ]
}

# nginx -t of one snippet on its own, inside the proxy's own nginx, before it
# is put where the proxy's real config can include it. A broken file in
# vhost.d is not a cellar outage, it is every service on the host: the next
# docker-gen reload (any container event on Loki) would fail, and a restart of
# the proxy would not come back.
test_snippet() {
  local staged_name="$1"
  docker exec -i "$PROXY" sh -c '
    set -e
    conf=/tmp/cellar-edge-snippet-test.conf
    cat >"$conf" <<EOF
events {}
http {
  server {
    listen 127.0.0.1:65535;
    server_name cellar-edge-snippet-test.invalid;
    include /etc/nginx/vhost.d/'"$staged_name"';
    location / { return 404; }
  }
}
EOF
    if nginx -q -t -c "$conf"; then rc=0; else rc=1; fi
    rm -f "$conf"
    exit $rc'
}

install_one() {
  local src="$1" host="$2" dir="$3"
  local dest="$dir/$host" staged_name=".cellar-staged-$host"
  [ -f "$src" ] || die "$src is missing"
  head -n1 "$src" | grep -qF "$MARKER_PREFIX" || die "$src does not start with the ownership marker"
  if [ -e "$dest" ] && ! head -n1 "$dest" | grep -qF "$MARKER_PREFIX"; then
    die "$dest exists and is not ours (no '$MARKER_PREFIX' first line). Refusing to overwrite another service's nginx config."
  fi
  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    echo "edge.sh: $host — unchanged"
    return 1
  fi
  cp "$src" "$dir/$staged_name"
  if ! test_snippet "$staged_name"; then
    rm -f "$dir/$staged_name"
    die "$src fails nginx -t inside $PROXY; nothing was installed"
  fi
  [ -f "$dest" ] && cp -p "$dest" "$dir/.cellar-previous-$host"
  # Same directory, so a rename: the proxy (which mounts the directory, not the
  # file) never sees a half-written file.
  mv -f "$dir/$staged_name" "$dest"
  echo "edge.sh: $host — installed $src"
  return 0
}

restore_previous() {
  local host="$1" dir="$2"
  if [ -f "$dir/.cellar-previous-$host" ]; then
    mv -f "$dir/.cellar-previous-$host" "$dir/$host"
  else
    rm -f "$dir/$host"
  fi
}

do_install() {
  : "${NGINX_PROXY_VHOST_DIR:?NGINX_PROXY_VHOST_DIR is required: the host directory mounted at /etc/nginx/vhost.d in $PROXY}"
  local dir="$NGINX_PROXY_VHOST_DIR"
  [ -d "$dir" ] && [ -w "$dir" ] || die "$dir is not a writable directory"
  proxy_running || die "$PROXY is not running; it is what tests the config, so nothing was installed"
  # The directory given must really be the one the proxy reads, or every
  # check below passes against a file nginx never sees.
  local mounted
  mounted="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/nginx/vhost.d"}}{{.Source}}{{end}}{{end}}' "$PROXY")"
  [ "$(cd "$dir" && pwd -P)" = "$(cd "$mounted" 2>/dev/null && pwd -P || echo "$mounted")" ] ||
    die "NGINX_PROXY_VHOST_DIR ($dir) is not what $PROXY mounts at /etc/nginx/vhost.d ($mounted)"
  read_hosts
  local changed=()
  if install_one infra/nginx-proxy/vhost.d/edge.conf "$EDGE_HOST" "$dir"; then changed+=("$EDGE_HOST"); fi
  if install_one infra/nginx-proxy/vhost.d/files.conf "$FILES_HOST" "$dir"; then changed+=("$FILES_HOST"); fi
  [ "${#changed[@]}" -gt 0 ] || return 0
  # The whole proxy config, now including any file it already references.
  if ! docker exec "$PROXY" nginx -q -t; then
    local h
    for h in "${changed[@]}"; do restore_previous "$h" "$dir"; done
    die "$PROXY's full config fails nginx -t with the new files; restored the previous ones"
  fi
  docker exec "$PROXY" nginx -s reload
  # The signal returns before the new workers take over: measured, a request in
  # the first instant after it still met the old config. `verify` retries, but
  # a by-hand install should not report a change that has not landed yet.
  sleep 2
  rm -f "$dir"/.cellar-previous-*
  echo "edge.sh: reloaded $PROXY. A host whose file is new is picked up when 'attach' makes docker-gen regenerate."
}

do_attach() {
  proxy_running || die "$PROXY is not running"
  docker network inspect "$NET" >/dev/null 2>&1 || die "network $NET does not exist"
  local proxy_nets
  proxy_nets="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$PROXY")"
  [[ " $proxy_nets " == *" $NET "* ]] || die "$PROXY is not on network $NET (it is on: $proxy_nets)"

  local want=() svc host cid
  while read -r svc host; do
    [ -n "$svc" ] || continue
    want+=("$svc")
    cid="$(compose ps -q "$svc")"
    [ -n "$cid" ] || die "$svc ($host) has no container; run 'up' first"
    if docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$cid" | grep -qw -- "$NET"; then
      echo "edge.sh: $svc already on $NET"
    else
      docker network connect "$NET" "$cid"
      echo "edge.sh: connected $svc to $NET (for $host)"
    fi
  done < <(proxied_services)
  [ "${#want[@]}" -gt 0 ] || die "no service in the rendered config carries VIRTUAL_HOST"

  # Nothing else of this project may sit on the proxy's network: Postgres, the
  # sidecars and the control plane have no business being reachable from every
  # container on the host. Disconnect rather than fail — it is our container.
  local all proxy_id
  proxy_id="$(docker inspect -f '{{.Id}}' "$PROXY")"
  for cid in $(compose ps -q --no-trunc); do
    # Never the proxy itself, should it ever share this project (a test lane
    # does; measured — the first version of this loop disconnected it).
    [ "$cid" = "$proxy_id" ] && continue
    svc="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$cid")"
    [[ " ${want[*]} " == *" $svc "* ]] && continue
    if docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$cid" | grep -qw -- "$NET"; then
      docker network disconnect "$NET" "$cid"
      echo "::warning::edge.sh: $svc was on $NET and should not be; disconnected it"
    fi
  done
  all="$(printf '%s ' "${want[@]}")"
  echo "edge.sh: on $NET: $all"
}

do_verify() {
  read_hosts
  local addr="${EDGE_VERIFY_ADDR:-127.0.0.1}" port="${EDGE_VERIFY_PORT:-443}"
  local k=()
  [ "${EDGE_VERIFY_INSECURE:-0}" = "1" ] && k=(-k)
  # Address the proxy as the public name — SNI and Host both — while dialling
  # it locally, so this needs neither public DNS nor the router.
  status() {
    local host="$1" path="$2"
    local code
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --path-as-is "${k[@]}" \
      --connect-to "$host:443:$addr:$port" "https://$host$path" 2>/dev/null)" || true
    echo "${code:-000}"
  }
  local -a checks=(
    # host            path                                   want
    "$EDGE_HOST       /healthz                               200"
    "$EDGE_HOST       /api/auth/jwks                         200"
    "$EDGE_HOST       /                                      404"
    "$EDGE_HOST       /actors/PingActor/edge-check/method/ping 404"
    "$EDGE_HOST       /dapr/config                           404"
    "$EDGE_HOST       /api/auth/../../actors/PingActor/x/method/ping 404"
    # These two DO reach the actor host — nginx matches the normalised path —
    # and must be refused there, raw, by its canonical-path gate (host-app.ts).
    "$EDGE_HOST       /actors/../api/auth/jwks               400"
    "$EDGE_HOST       //api/auth/jwks                        400"
    "$FILES_HOST      /minio/health/live                     200"
  )
  # docker-gen regenerates within a second of `attach`, and acme-companion may
  # still be swapping certificates in; give the routing a minute to settle.
  local deadline=$((SECONDS + 60)) failed line host path want got last=""
  while :; do
    failed=0
    for line in "${checks[@]}"; do
      read -r host path want <<<"$line"
      got="$(status "$host" "$path")"
      if [ "$got" != "$want" ]; then
        failed=$((failed + 1))
        last="https://$host$path -> $got (want $want)"
      fi
    done
    [ "$failed" -eq 0 ] && break
    if [ "$SECONDS" -ge "$deadline" ]; then
      die "edge routing is wrong after 60s; $failed check(s) failing, e.g. $last"
    fi
    sleep 3
  done
  for line in "${checks[@]}"; do
    read -r host path want <<<"$line"
    echo "edge.sh: ok  https://$host$path -> $want"
  done
  echo "edge.sh: routing verified through $PROXY (${addr}:${port})"
}

case "$cmd" in
  install) do_install ;;
  attach) do_attach ;;
  verify) do_verify ;;
  *)
    echo "usage: $0 install|attach|verify   (see the header)" >&2
    exit 2
    ;;
esac
