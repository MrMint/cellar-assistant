/**
 * Every `updated_at` column in `public` is either stamped by the one trigger
 * function, or is named here as stamped by its writer — and every trigger
 * provably fires.
 *
 * Until `packages/db/migrations/20260928181546_one_updated_at_trigger_function`
 * the same `NEW.updated_at = now()` body lived under eight function names, and
 * `ItemActor` stamped sakes and teas by hand because they "use a different
 * trigger". The tables are discovered from the catalog, not listed: a new
 * table with an `updated_at` column fails the first test until someone decides
 * which side it is on.
 *
 * The behavioural half fires each trigger for real. A generic fixture row
 * cannot satisfy thirty tables' foreign keys and CHECKs, so each table gets a
 * transaction of its own (rolled back; a few milliseconds, so the lock it
 * takes — ACCESS EXCLUSIVE, first, see below — never sits in front of another
 * suite for long) in which foreign keys
 * and other triggers are off (`session_replication_role = replica`), CHECKs are
 * dropped, and only the trigger under test is switched to fire anyway
 * (`ENABLE ALWAYS`). A row is inserted with a placeholder for every required
 * column, `updated_at` is set to the year 2000, and the trigger must put it
 * back to `now()`.
 */
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "./db.ts";
import { closeTestDb, resolveTestDatabase, withTestDb } from "./testing.ts";

const { skip } = await resolveTestDatabase();

const TRIGGER_FUNCTION = "set_current_timestamp_updated_at";

/** Tables whose writer stamps `updated_at` itself, and why no trigger. */
const WRITER_STAMPED: Readonly<Record<string, string>> = {
  outbox:
    "updated_at is the time of death (MaintenanceActor's ACK_COVERS_DEATH); a trigger would move it on every claim",
  jobs: "JobActor stamps it on every cursor/status write",
  cellars: "CellarActor stamps it on every header write",
  files: "FileActor stamps it",
  api_budget_config: "BudgetActor stamps it",
  item_image_vectors:
    "ItemActor.embedImage, its one writer, sets updated_at = now() on every upsert",
  account: "better-auth manages its own tables' updatedAt",
  session: "better-auth manages its own tables' updatedAt",
  user: "better-auth manages its own tables' updatedAt",
  verification: "better-auth manages its own tables' updatedAt",
};

type TriggerRow = {
  readonly table: string;
  readonly trigger: string | null;
  readonly fn: string | null;
  readonly timing: string | null;
};

const updatedAtTables = async (db: DbOrTx): Promise<TriggerRow[]> => {
  // tgtype bits: 1 = ROW, 2 = BEFORE, 16 = UPDATE.
  const { rows } = await db.execute<TriggerRow>(sql`
    select c.relname as "table", t.tgname as trigger, p.proname as fn,
           case when t.tgoid is null then null
                else concat_ws(' ',
                  case when t.tgtype & 2 = 2 then 'before' else 'after' end,
                  case when t.tgtype & 16 = 16 then 'update' end,
                  case when t.tgtype & 1 = 1 then 'row' else 'statement' end,
                  'enabled=' || t.tgenabled::text) end as timing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at'
                       and not a.attisdropped
    left join lateral (
      select tg.oid as tgoid, tg.tgname, tg.tgtype, tg.tgenabled, tg.tgfoid
      from pg_trigger tg
      join pg_proc fp on fp.oid = tg.tgfoid
      where tg.tgrelid = c.oid and not tg.tgisinternal
        and fp.prosrc ilike '%updated_at%'
    ) t on true
    left join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public' and c.relkind = 'r'
    order by 1, 2
  `);
  return rows;
};

/** A placeholder for a required column, by its formatted type. */
const placeholder = (type: string, enumLabel: string | null): string => {
  if (enumLabel !== null) return `'${enumLabel.replace(/'/g, "''")}'`;
  const halfvec = /^halfvec\((\d+)\)$/.exec(type);
  if (halfvec !== null) {
    return `('[' || array_to_string(array_fill(1, array[${halfvec[1]}]), ',') || ']')::${type}`;
  }
  const known: Record<string, string> = {
    boolean: "false",
    date: "current_date",
    "geography(Point,4326)": "'SRID=4326;POINT(0 0)'::geography",
    jsonb: "'{}'::jsonb",
    real: "0",
    integer: "0",
    numeric: "0",
    text: "'x'",
    "text[]": "'{}'::text[]",
    uuid: "gen_random_uuid()",
    "timestamp with time zone": "now()",
  };
  const value = known[type];
  if (value === undefined) {
    throw new Error(
      `updated-at-triggers.test.ts has no placeholder for a required ${type} column — add one`,
    );
  }
  return value;
};

describe.skipIf(skip)("updated_at triggers", () => {
  afterAll(closeTestDb);

  it("stamp every updated_at table with the one function, or the table is named as writer-stamped", async () => {
    await withTestDb(async (db) => {
      const rows = await updatedAtTables(db);
      const byTable = new Map<string, TriggerRow[]>();
      for (const row of rows) {
        byTable.set(row.table, [...(byTable.get(row.table) ?? []), row]);
      }
      const problems: string[] = [];
      for (const [table, triggers] of byTable) {
        const bound = triggers.filter((row) => row.trigger !== null);
        if (table in WRITER_STAMPED) {
          if (bound.length > 0) {
            problems.push(
              `${table}: listed as writer-stamped but has a trigger`,
            );
          }
          continue;
        }
        if (bound.length !== 1) {
          problems.push(
            `${table}: ${bound.length} updated_at triggers, want 1`,
          );
          continue;
        }
        const [only] = bound;
        if (only?.fn !== TRIGGER_FUNCTION) {
          problems.push(`${table}: trigger runs ${only?.fn}`);
        }
        if (only?.timing !== "before update row enabled=O") {
          problems.push(`${table}: trigger is ${only?.timing}`);
        }
      }
      for (const table of Object.keys(WRITER_STAMPED)) {
        if (!byTable.has(table)) problems.push(`${table}: listed but absent`);
      }
      expect(problems).toEqual([]);
      // Not vacuous: the discovered set is the thirty-one this migration left.
      expect(byTable.size - Object.keys(WRITER_STAMPED).length).toBe(31);
    });
  });

  it("each trigger actually fires: updated_at comes back as now(), not what the UPDATE wrote", async () => {
    const triggered = (await withTestDb(updatedAtTables)).filter(
      (row) => row.trigger !== null && row.fn === TRIGGER_FUNCTION,
    );
    expect(triggered.length).toBeGreaterThan(0);

    const stale: string[] = [];
    for (const { table, trigger } of triggered) {
      await withTestDb(async (db) => {
        const t = sql.identifier(table);
        await db.execute(sql`set local lock_timeout = '10s'`);
        // The strongest lock this transaction will need, taken FIRST. Taking
        // ALTER TABLE's weaker lock and then DROP CONSTRAINT's ACCESS
        // EXCLUSIVE is a lock upgrade, and a concurrent suite holding
        // ACCESS SHARE on the same table (a read earlier in its transaction)
        // then deadlocks with it — measured: item-actor.test.ts's
        // item_vectors insert died with 40P01. Waiting for the lock up front
        // can only queue behind that suite, never deadlock with it.
        await db.execute(sql`lock table ${t} in access exclusive mode`);
        await db.execute(sql`set local session_replication_role = replica`);
        await db.execute(
          sql`alter table ${t} enable always trigger ${sql.identifier(trigger ?? "")}`,
        );
        const { rows: checks } = await db.execute<{ name: string }>(sql`
          select conname as name from pg_constraint
          where conrelid = ${`public.${table}`}::regclass and contype = 'c'
        `);
        for (const { name } of checks) {
          await db.execute(
            sql`alter table ${t} drop constraint ${sql.identifier(name)}`,
          );
        }
        const { rows: required } = await db.execute<{
          name: string;
          type: string;
          label: string | null;
        }>(sql`
          select a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
                 (select e.enumlabel from pg_enum e
                   where e.enumtypid = a.atttypid order by e.enumsortorder limit 1)
                   as label
          from pg_attribute a
          where a.attrelid = ${`public.${table}`}::regclass and a.attnum > 0
            and not a.attisdropped and a.attnotnull and not a.atthasdef
            and a.attgenerated = '' and a.attidentity = ''
          order by a.attnum
        `);
        const columns = required.map((c) => sql.identifier(c.name));
        const values = required.map((c) =>
          sql.raw(placeholder(c.type, c.label)),
        );
        await (columns.length === 0
          ? db.execute(sql`insert into ${t} default values`)
          : db.execute(
              sql`insert into ${t} (${sql.join(columns, sql`, `)})
                  values (${sql.join(values, sql`, `)})`,
            ));
        await db.execute(
          sql`update ${t} set updated_at = '2000-01-01T00:00:00Z'`,
        );
        const { rows } = await db.execute<{ fresh: boolean }>(
          sql`select bool_and(updated_at = now()) as fresh from ${t}`,
        );
        if (rows[0]?.fresh !== true) stale.push(table);
      });
    }
    expect(stale).toEqual([]);
  });
});
