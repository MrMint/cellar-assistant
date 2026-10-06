/**
 * Guards the second half of the pipeline: `schema.graphql` → `graphql-env.d.ts`.
 *
 * `services/api`'s snapshot test guards the first half (Pothos → `schema.graphql`).
 * Together they mean a schema change cannot land without both files moving with
 * it, and that the frontend's types always describe the schema CI built.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageDir = new URL("..", import.meta.url).pathname;
const current = join(packageDir, "graphql-env.d.ts");
const scratch = mkdtempSync(join(tmpdir(), "gql-tada-"));
const regenerated = join(scratch, "graphql-env.d.ts");

try {
  execFileSync(
    join(packageDir, "node_modules/.bin/gql.tada"),
    ["generate-output", "--output", regenerated],
    { cwd: packageDir, stdio: "pipe" },
  );

  if (readFileSync(current, "utf8") !== readFileSync(regenerated, "utf8")) {
    console.error(
      "graphql-env.d.ts is stale.\n" +
        "Run: bun run --filter @cellar-assistant/schema codegen",
    );
    process.exit(1);
  }
  console.log("graphql-env.d.ts is up to date with schema.graphql");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
