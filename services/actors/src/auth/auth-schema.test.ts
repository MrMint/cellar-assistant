/**
 * The contract between better-auth and the Drizzle baseline (X2).
 *
 * better-auth's Drizzle adapter addresses a table by the key it is exported
 * under in `authSchema` and a **column by its JS property name** — so a rename
 * in `packages/db/src/schema/tables.ts` breaks sign-in at runtime and compiles
 * perfectly. That file is `drizzle-kit pull` output: it is regenerated wholesale
 * every time the baseline is re-taken, and the person re-taking it has no reason
 * to look at better-auth. This test is what makes that safe.
 *
 * It is the reason the five tables are pulled like every other table instead of
 * being kept as a hand-written second copy: a copy would have to be *noticed*
 * to drift, and this cannot be missed.
 *
 * No database is touched. `betterAuth()` builds its schema from its options
 * alone, and node-postgres does not connect until a query is issued, so the
 * unreachable URL below is never dialled.
 */
import { authSchema } from "@cellar-assistant/db";
import { getTableColumns, getTableName } from "@cellar-assistant/db/orm";
import { getAuthTables } from "better-auth/db";
import { describe, expect, it } from "vitest";
import { makeTestAuth } from "./testing.ts";

/** Never connected to — see the module doc. */
const UNREACHABLE = "postgres://cellar:cellar@127.0.0.1:1/does-not-exist";

const { auth } = makeTestAuth(UNREACHABLE);
const expected = getAuthTables(auth.options);

/**
 * The Postgres column a Drizzle property is expected to sit on.
 *
 * better-auth resolves a field to a **property name** (its own field name, or
 * `fieldName` if one is declared; `camelCase: true` in `./auth.ts` keeps that
 * camelCase). The property is what the adapter uses, and what the first half of
 * the check below asserts. The column underneath it is `drizzle-kit pull`'s
 * business — snake_case of the same name, straight out of
 * `packages/db/transform/13_better_auth_tables.sql` — and is checked separately
 * so a re-pull against a *renamed column* is caught too, not just a renamed
 * property.
 */
const snakeCase = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

const columnOf = (field: string, attributes: { fieldName?: string }): string =>
  snakeCase(attributes.fieldName ?? field);

describe("better-auth ⇄ Drizzle schema", () => {
  it("declares every model better-auth expects", () => {
    // `jwks` comes from the `jwt` plugin, the other four from core.
    expect(Object.keys(expected).sort()).toEqual([
      "account",
      "jwks",
      "session",
      "user",
      "verification",
    ]);
    expect(Object.keys(authSchema).sort()).toEqual(
      Object.keys(expected).sort(),
    );
  });

  it("maps each model onto the table better-auth names", () => {
    for (const [model, definition] of Object.entries(expected)) {
      const table = authSchema[model as keyof typeof authSchema];
      expect(table, `authSchema.${model} is missing`).toBeDefined();
      expect(getTableName(table)).toBe(definition.modelName);
    }
  });

  it("has a column for every field, under the property name the adapter uses", () => {
    const problems: string[] = [];
    for (const [model, definition] of Object.entries(expected)) {
      const table = authSchema[model as keyof typeof authSchema];
      const columns = getTableColumns(table) as Record<
        string,
        { name: string } | undefined
      >;
      // `id` is implicit in better-auth's field list.
      for (const field of ["id", ...Object.keys(definition.fields)]) {
        const attributes =
          field === "id"
            ? {}
            : (definition.fields[field] as { fieldName?: string });
        const column = columns[field];
        if (column === undefined) {
          problems.push(
            `${model}: no \`${field}\` property on the Drizzle table. ` +
              "The adapter looks columns up by property name, so this is a " +
              "runtime break, not a type error.",
          );
          continue;
        }
        const wanted = columnOf(field, attributes);
        if (column.name !== wanted) {
          problems.push(
            `${model}.${field}: Drizzle says column "${column.name}", ` +
              `better-auth says "${wanted}".`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps the three columns carried over from Nhost's auth.users", () => {
    // `role`, `locale` and `disabled` are `additionalFields` declared
    // `input: false` in `./auth.ts`. They are not part of better-auth's core
    // user model, so nothing but this notices if a re-pull loses them.
    const columns = getTableColumns(authSchema.user) as Record<
      string,
      { name: string } | undefined
    >;
    expect(columns.role?.name).toBe("role");
    expect(columns.locale?.name).toBe("locale");
    expect(columns.disabled?.name).toBe("disabled");
  });

  it("keeps every id column a uuid", () => {
    // What made X2's foreign-key repoint a constraint swap rather than a
    // column-type migration (A6b; `packages/db/transform/14`).
    for (const [model, table] of Object.entries(authSchema)) {
      const columns = getTableColumns(table) as Record<
        string,
        { columnType: string } | undefined
      >;
      expect(columns.id?.columnType, `${model}.id`).toBe("PgUUID");
    }
    const session = getTableColumns(authSchema.session) as Record<
      string,
      { columnType: string } | undefined
    >;
    const account = getTableColumns(authSchema.account) as Record<
      string,
      { columnType: string } | undefined
    >;
    expect(session.userId?.columnType).toBe("PgUUID");
    expect(account.userId?.columnType).toBe("PgUUID");
    // …and the ones that are deliberately not uuids, because they hold a
    // provider's own opaque strings.
    expect(session.token?.columnType).toBe("PgText");
    expect(account.accountId?.columnType).toBe("PgText");
    expect(account.providerId?.columnType).toBe("PgText");
  });
});
