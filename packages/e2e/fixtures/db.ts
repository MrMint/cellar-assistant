import { execFileSync } from "node:child_process";

/**
 * Direct Postgres access, for fixture teardown that has no API path.
 *
 * A place is created through `createPlace` — "the only place-creation path a
 * client has" (`place-creation-actor.ts`'s module doc). Since X27 there *is* a
 * `deletePlace` mutation, but only for a place still under review (pending
 * or rejected, its creator's alone): once the review shares it, a place is a
 * shared reference entity with no per-viewer lifecycle a mutation could
 * authorize, so a spec that cannot be sure where the review left its place
 * still needs this.
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
 * `createPlace` used to run its AI review **before** it inserts, under a
 * 120s invocation timeout; since X27 it inserts at once (pending) and the
 * review runs afterwards from the outbox, under a 30s bound. A spec that gave
 * up on a slow create can still reach its teardown while that turn is
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

/**
 * Pretend a bottle was opened `days` ago (X10's Drink soon reads `open_at`
 * against a style table, and nothing in the API backdates it). The bottle
 * must already be open; its cellar's own cleanup removes it.
 */
export function backdateOpened(cellarItemId: string, days: number): void {
  if (!UUID_PATTERN.test(cellarItemId)) {
    throw new Error(`backdateOpened: not a uuid: ${cellarItemId}`);
  }
  if (!Number.isInteger(days) || days < 0 || days > 3650) {
    throw new Error(`backdateOpened: days must be 0..3650, got ${days}`);
  }
  const output = psql(
    `with moved as (update cellar_items set open_at = now() - interval '${days} days' ` +
      `where id = '${cellarItemId}' and open_at is not null returning 1) ` +
      "select count(*) from moved",
  );
  if (output !== "1") {
    throw new Error(
      `backdateOpened: expected one open bottle ${cellarItemId}, psql said ${JSON.stringify(output)}`,
    );
  }
}

/**
 * Insert one active place at a point, for a spec that needs a place *near*
 * somewhere without `createPlace`'s synchronous AI review and its 25/day
 * quota (`/search`'s Nearby Places, G31). Remove it with {@link deletePlace}.
 *
 * Straight into `places` for the reason `deletePlace` reaches it: a place has
 * no per-viewer lifecycle, and a fresh row is in no `PlaceActor`'s cache.
 * `primary_category` is generated from `categories[1]` and `search_text` by a
 * trigger, so neither is written here. Every interpolated value is checked
 * first: the name to `[A-Za-z0-9 ]`, the point to finite WGS-84 numbers.
 */
export function insertPlace(input: {
  id: string;
  name: string;
  lng: number;
  lat: number;
  category: string;
}): void {
  if (!UUID_PATTERN.test(input.id)) {
    throw new Error(`insertPlace: not a uuid: ${input.id}`);
  }
  if (!/^[A-Za-z0-9 ]+$/.test(input.name)) {
    throw new Error(`insertPlace: unsafe name ${JSON.stringify(input.name)}`);
  }
  if (!/^[a-z_]+$/.test(input.category)) {
    throw new Error(`insertPlace: unsafe category ${input.category}`);
  }
  const { lng, lat } = input;
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90
  ) {
    throw new Error(`insertPlace: not a WGS-84 point: ${lng},${lat}`);
  }
  psql(
    "insert into places (id, name, location, categories, confidence, rating, is_active, source) " +
      `values ('${input.id}', '${input.name}', ` +
      `st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography, ` +
      `array['${input.category}']::text[], 0.9, 4.2, true, 'user')`,
  );
}

/**
 * X27 / D28: pin a place's review where a spec needs it, whatever the stack's
 * AI is doing.
 *
 * A new place is saved `pending` and an outbox row queues its AI review. On a
 * lane with a working model that review can land within seconds — approving
 * the place (now everyone's) or rejecting it — and on one without, never. A
 * spec about the *pending* or *rejected* experience therefore cannot just wait;
 * it holds the state instead, in one transaction:
 *
 *  - the place's queued review rows that have not been delivered are deleted,
 *    so none is drawn again;
 *  - `review_requested_at` is re-stamped, so a review already in flight finds
 *    its verdict stale (`PlaceActor.applyReview` compares the stamp) and
 *    writes nothing;
 *  - the status — and for `rejected` the reason — is set.
 *
 * The edit-and-resubmit flow queues a fresh review row of its own afterwards,
 * which this does not touch; call it again after a resubmit to hold the new
 * submission too.
 */
export function holdPlaceInReview(
  placeId: string,
  status: "pending" | "rejected",
  rejectionReason: string | null = null,
): void {
  if (!UUID_PATTERN.test(placeId)) {
    throw new Error(`holdPlaceInReview: not a uuid: ${placeId}`);
  }
  if (
    rejectionReason !== null &&
    !/^[A-Za-z0-9 .,'-]+$/.test(rejectionReason)
  ) {
    throw new Error(
      `holdPlaceInReview: unsafe reason ${JSON.stringify(rejectionReason)}`,
    );
  }
  const reason =
    rejectionReason === null
      ? "null"
      : `'${rejectionReason.replace(/'/g, "''")}'`;
  const output = psql(
    "delete from outbox where target_actor = 'PlaceReviewActor' " +
      `and target_id = '${placeId}' and status in ('pending', 'delivering'); ` +
      "with held as (update places set " +
      `review_status = '${status}', rejection_reason = ${reason}, ` +
      "review_requested_at = clock_timestamp(), " +
      `reviewed_at = ${status === "rejected" ? "now()" : "null"} ` +
      `where id = '${placeId}' returning 1) select count(*) from held`,
  );
  if (output !== "1") {
    throw new Error(
      `holdPlaceInReview: expected to hold place ${placeId} in ` +
        `${CONTAINER}/${DB_NAME}, psql said ${JSON.stringify(output)}`,
    );
  }
}
