#!/usr/bin/env node
/**
 * `${NAME}` substitution over the process environment, for the files
 * `scripts/stack/stack.sh` generates into `.stack/<slug>/`:
 *
 *   render.mjs <template> <output>
 *
 * Deliberately not `envsubst`: it ships with GNU gettext, which is not on a
 * stock macOS, and — the reason that matters — it substitutes an *unset*
 * variable with the empty string. A missing `PLACEMENT_PORT` would then render
 * `placementHostAddress: 127.0.0.1:` and the failure would surface much later
 * as a sidecar that cannot find an actor type. This exits non-zero instead and
 * names every placeholder it could not resolve.
 *
 * `$$` escapes a literal `$`. Nothing else is interpreted, so a component YAML
 * that legitimately contains `$` passes through untouched.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [template, output] = process.argv.slice(2);
if (template === undefined || output === undefined) {
  console.error("usage: render.mjs <template> <output>");
  process.exit(2);
}

const source = readFileSync(template, "utf8");
const missing = new Set();

const rendered = source.replace(
  /\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
  (match, name) => {
    if (name === undefined) return "$";
    const value = process.env[name];
    if (value === undefined || value === "") {
      missing.add(name);
      return match;
    }
    return value;
  },
);

if (missing.size > 0) {
  console.error(
    `render.mjs: ${template}: unresolved placeholder(s): ${[...missing].sort().join(", ")}`,
  );
  process.exit(1);
}

writeFileSync(output, rendered, { mode: 0o600 });
