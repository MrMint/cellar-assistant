#!/usr/bin/env bash
# Does a built services/api or services/actors image actually hold everything
# its entry point imports?
#
#   scripts/ci/image-smoke.sh api    <image>
#   scripts/ci/image-smoke.sh actors <image>
#
# Run by stack-ci's `images` job on every PR (against images built exactly as
# deploy-loki.yaml builds them) and by deploy-loki.yaml's own build job before
# it pushes, so an image that cannot start is never published.
#
# Why this exists: each runtime stage's `COPY packages/…` list is written by
# hand. services/api/src/dockerfile-workspaces.test.ts guards the manifests and
# runtime.test.ts the CMD, but neither sees the source COPYs — so api starting
# to import @cellar-assistant/policy would typecheck, test green on the host,
# build, and fail at boot, first noticed on `main`.
#
# Three checks, all inside the image, as its own USER and WORKDIR, with no
# network and no configuration:
#
#   1. `bun build src/index.ts` — resolves every static and literal dynamic
#      import, transitively, against the image's own node_modules and
#      packages/*. A missing COPY or dependency is "Could not resolve".
#   2. The entry point is loaded for real, under bun (the CMD) and under node
#      (the documented rollback). With no configuration it must stop at the
#      app's own config check — which proves every module linked, since ESM
#      links the whole graph before evaluating any of it. ERR_MODULE_NOT_FOUND,
#      "Cannot find module/package", or a clean load (a config check that no
#      longer runs first, so this check stopped proving anything) all fail.
#   3. actors only: no Next.js/React in the store (services/actors/Dockerfile's
#      `--omit=peer`; better-auth's optional peers otherwise add ~850 MB).
set -euo pipefail

app="${1:?usage: image-smoke.sh <api|actors> <image>}"
image="${2:?usage: image-smoke.sh <api|actors> <image>}"
case "$app" in api | actors) ;; *) echo "image-smoke: unknown app $app" >&2; exit 2 ;; esac

in_image() {
  docker run --rm --network none --entrypoint sh "$image" -c "$1"
}

echo "== $app: bun build src/index.ts ($image)"
in_image 'cd /workspace/services/'"$app"' && bun build src/index.ts --target=bun --outdir=/tmp/image-smoke >/tmp/out 2>&1 || { cat /tmp/out; exit 1; }; grep -m1 index.js /tmp/out'

# The loader prints one line: LOADED, MISSING <detail> or STOPPED <detail>.
# shellcheck disable=SC2016  # JS for the image's runtimes, not the shell
load='import("./src/index.ts").then(
  () => { console.log("LOADED"); process.exit(0); },
  (e) => {
    const m = String(e?.message ?? e);
    // node: ERR_MODULE_NOT_FOUND. bun: no code on a missing workspace link,
    // just `ENOENT reading "…/node_modules/<pkg>"` (measured, bun 1.4.2).
    const missing = ["ERR_MODULE_NOT_FOUND", "ENOENT"].includes(e?.code) || /Cannot find (module|package)|Could not resolve|ENOENT reading/.test(m);
    console.log(`${missing ? "MISSING" : "STOPPED"} ${e?.code ?? ""} ${m.split("\n")[0].slice(0, 200)}`);
    process.exit(0);
  });'
for runtime in "bun" "node --input-type=module"; do
  echo "== $app: load src/index.ts under ${runtime%% *}"
  out="$(in_image "cd /workspace/services/$app && $runtime -e '$load' 2>&1" | grep -E '^(LOADED|MISSING|STOPPED)' | tail -1 || true)"
  echo "   $out"
  case "$out" in
    STOPPED*) ;;
    MISSING*)
      echo "::error::$app image: a module the entry point imports is not in the image ($out)" >&2
      exit 1
      ;;
    *)
      echo "::error::$app image: expected the entry point to stop at its production config check with no configuration; got '${out:-no output}'. Either it now starts unconfigured, or it died before printing — either way this check no longer proves the modules linked." >&2
      exit 1
      ;;
  esac
done

if [ "$app" = actors ]; then
  echo "== actors: no Next.js / React in the runtime store"
  leaked="$(in_image 'ls /workspace/node_modules/.bun' | grep -E '^(next|react|react-dom|@next\+swc-[^@]*)@' || true)"
  if [ -n "$leaked" ]; then
    echo "::error::actors image ships frontend packages (better-auth's optional peers; see --omit=peer in services/actors/Dockerfile):" >&2
    echo "$leaked" >&2
    exit 1
  fi
  echo "   none"
fi
echo "== $app image: ok"
