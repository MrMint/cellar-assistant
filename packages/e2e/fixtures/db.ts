import { execFileSync } from "node:child_process";

/**
 * Direct Postgres access, for fixture teardown that has no API path.
 *
 * A place is created through `createPlace` — "the only place-creation path a
 * client has" (`place-creation-actor.ts`'s module doc) — and there is
 * deliberately no `deletePlace` mutation in `schema.graphql`. Unlike a cellar
 * (`deleteCellar`) or a tier list (`deleteTierList`), a place is a shared
 * reference entity with no per-viewer lifecycle a mutation could authorize, so
 * a spec that creates one has nothing to call to undo it.
 *
 * That matters for `PLACE_RATE_LIMIT_PER_DAY` (25/day,
 * `place-creation-actor.ts#enforceRateLimit`), because the limit counts rows
 * **currently in `places`** — `count(*) from places where created_by = ? and
 * created_at >= now() - 24h` — not a separate ledger that survives a delete.
 * So removing the row a run created does free the quota slot it consumed,
 * which is what makes a database-level cleanup meaningful here rather than
 * cosmetic; see `specs/06-map-places.spec.ts`.
 *
 * `docker exec` against the shared stack's Postgres container is the same
 * access pattern `AGENTS.md` documents for debugging this database by hand
 * ("Current-stack DB access"). Deliberately not a `pg`/`postgres` client
 * dependency: this package has never had a runtime dependency on the database,
 * and adding one would touch the shared root `bun.lock` — outside this
 * package's remit, and unnecessary for one `DELETE` on teardown.
 *
 * Defaults match the shared `cellar-stack` lane, which is what this suite
 * targets by default (`fixtures/accounts.ts`'s `BASE_URL`). The per-worktree
 * lane names its Postgres container after the worktree directory and uses a
 * derived port instead — override these if you point `E2E_BASE_URL` at that
 * lane.
 */
const CONTAINER =
  process.env.E2E_POSTGRES_CONTAINER ?? "cellar-stack-postgres-1";
const DB_USER = process.env.E2E_POSTGRES_USER ?? "cellar";
const DB_NAME = process.env.E2E_POSTGRES_DATABASE ?? "cellar";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run SQL through `psql` inside the Postgres container. Several statements in
 * one string run in one transaction (psql's `-c`), and `-q` keeps their
 * command tags out of the output, so it is the last statement's rows alone.
 */
function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      DB_USER,
      "-d",
      DB_NAME,
      "-tAq",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

/**
 * Delete a place a spec created, by id — the cleanup `createPlace` has no
 * mutation for (see this module's doc comment). Throws unless exactly one row
 * was deleted.
 *
 * `placeId` is the only caller-supplied value that reaches the SQL string
 * below, so its shape is checked first — the same discipline
 * `place-creation-actor.ts#requirePlaceId` applies server-side to the same
 * value.
 *
 * ## Why zero rows is a failure, not a no-op
 *
 * A plain `delete … where id = …` exits 0 whether it removed the row or not,
 * and this used to discard `psql`'s output — so pointed at the wrong Postgres
 * (the per-worktree lane's, a stale container, the default name when the
 * suite ran elsewhere) it printed `DELETE 0`, returned normally, and the row
 * went on holding a slot of the shared account's 25/day quota while the spec
 * reported a clean teardown. The statement now reports its own count
 * (`with … returning` → `select count(*)`, so `-tA` prints a bare number),
 * and anything but 1 throws, naming the database it asked.
 *
 * ## `waitForRowMs`: when the row may not exist *yet*
 *
 * `createPlace` runs its AI review **before** it inserts
 * (`place-creation-actor.ts`), under a 120s invocation timeout. A spec that
 * gave up on a slow create can reach its teardown while that turn is still
 * running and commits afterwards — so "no row" can mean "not yet". A caller
 * that does not know whether the create committed passes a window, and this
 * retries until the row appears and is deleted, or the window closes and it
 * throws. A caller that saw the create succeed passes nothing: the row exists,
 * so zero is wrong immediately.
 */
export async function deletePlace(
  placeId: string,
  { waitForRowMs = 0 }: { waitForRowMs?: number } = {},
): Promise<void> {
  if (!UUID_PATTERN.test(placeId)) {
    throw new Error(`deletePlace: not a uuid: ${placeId}`);
  }
  const deadline = Date.now() + waitForRowMs;
  for (;;) {
    const output = psql(
      `with deleted as (delete from places where id = '${placeId}' returning 1) ` +
        "select count(*) from deleted",
    );
    const count = Number(output);
    if (count === 1) return;
    if (!Number.isInteger(count)) {
      throw new Error(
        `deletePlace: expected a row count from psql, got ${JSON.stringify(output)}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `deletePlace: no place ${placeId} in ${CONTAINER}/${DB_NAME}` +
          (waitForRowMs > 0 ? ` after waiting ${waitForRowMs}ms` : "") +
          ". Either the create never committed, or this is not the database " +
          "the suite ran against — set E2E_POSTGRES_CONTAINER / " +
          "E2E_POSTGRES_DATABASE for the lane E2E_BASE_URL points at.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

/**
 * Delete a cellar a spec created **and filled** — its check-ins, its items,
 * its owners, then the cellar — in one transaction. Throws unless exactly one
 * cellar was deleted.
 *
 * `deleteCellar` refuses a cellar that still holds items (`ConflictError`,
 * "remove them first"), and no mutation removes a cellar item, so a spec that
 * puts a bottle in a cellar has no API path back to zero. That is the same
 * gap `deletePlace` fills, for the same reason: without it the shared test
 * account's cellar count grows every run (see `deleteCellars` in
 * `./data.ts`). Every foreign key on this chain is `ON DELETE RESTRICT`, so
 * the order below is the only one that works.
 *
 * The actor that held the cellar may keep its aggregate in memory until its
 * idle timeout; nothing reads a deleted spec cellar by id afterwards, and the
 * listing (`CellarsCollectionActor`) reads the table, not the actor.
 */
export function deleteCellarWithContents(cellarId: string): void {
  if (!UUID_PATTERN.test(cellarId)) {
    throw new Error(`deleteCellarWithContents: not a uuid: ${cellarId}`);
  }
  const output = psql(
    "delete from check_ins where cellar_item_id in " +
      `(select id from cellar_items where cellar_id = '${cellarId}'); ` +
      `delete from cellar_items where cellar_id = '${cellarId}'; ` +
      `delete from cellar_owners where cellar_id = '${cellarId}'; ` +
      `with deleted as (delete from cellars where id = '${cellarId}' returning 1) ` +
      "select count(*) from deleted",
  );
  if (output !== "1") {
    throw new Error(
      `deleteCellarWithContents: expected to delete cellar ${cellarId} in ` +
        `${CONTAINER}/${DB_NAME}, psql said ${JSON.stringify(output)}. Set ` +
        "E2E_POSTGRES_CONTAINER / E2E_POSTGRES_DATABASE for the lane " +
        "E2E_BASE_URL points at.",
    );
  }
}
