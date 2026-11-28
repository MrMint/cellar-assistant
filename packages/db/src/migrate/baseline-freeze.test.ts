/**
 * `baseline/schema.sql` is frozen at the ledger's horizon (`ledger.ts`,
 * `BASELINE_HORIZON`).
 *
 * `db:migrate` applies every migration after the horizon to every database,
 * fresh ones included, and adopts the ones before it by probing for their
 * objects. Editing the baseline would change what a fresh build starts from
 * without moving `ADOPTION`'s probes, and a schema change written into it as
 * well as into a migration would be applied twice.
 *
 * So the file is pinned by checksum. If this fails, revert the edit: a schema
 * change belongs in a new migration under `packages/db/migrations`
 * (`drizzle-kit generate`), never here.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BASELINE = fileURLToPath(
  new URL("../../baseline/schema.sql", import.meta.url),
);

const PINNED =
  "6801b7bc6c92b5f01687abf8fa99001e4dfebabc4b61c6f0b5c08a4e097276d0";

describe("baseline/schema.sql is frozen at the ledger horizon", () => {
  it("is byte-identical to the pinned baseline", () => {
    const actual = createHash("sha256")
      .update(readFileSync(BASELINE))
      .digest("hex");
    expect(actual).toBe(PINNED);
  });
});
