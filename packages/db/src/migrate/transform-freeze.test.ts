/**
 * The transform is frozen at the ledger's horizon (`ledger.ts`,
 * `TRANSFORM_HORIZON`).
 *
 * Before the ledger, every post-baseline migration needed a hand-written mirror
 * in `transform/`, because the transform was the only thing that built a fresh
 * database and nothing applied migrations to it. Now `db:migrate` applies every
 * migration after the horizon to every database, fresh ones included — so a
 * mirror would be applied twice (the migration is not idempotent, and would
 * fail), and an edit that changes what the transform *builds* would move the
 * horizon without moving `ADOPTION`'s probes.
 *
 * So the files are pinned by checksum. If this fails:
 *
 *   - a SCHEMA change belongs in a new migration under `packages/db/migrations`
 *     (`drizzle-kit generate`), never here. Revert the transform edit.
 *   - an edit that changes only how Nhost DATA is converted (a guard, an enum
 *     value production turns out to hold, a data fix-up) and leaves the
 *     resulting schema byte-identical is allowed: update the pin in the same
 *     commit and say in the message why the resulting schema did not change.
 *     `cutover.sh`'s `baseline` phase is what proves that.
 *
 * The checked-in dump is pinned for the same reason: it is the transform's
 * input, and regenerating it is a change to what the transform builds.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TRANSFORM_DIR = fileURLToPath(
  new URL("../../transform", import.meta.url),
);

const FROZEN: Readonly<Record<string, string>> = {
  "01_drop_hasura_artifacts.sql":
    "34f14a7c081994bba29765a8a658f761d6c657ed1b1bea820f457d6a068a82b0",
  "02_drop_phantom_result_tables.sql":
    "7f9947b5947b1abb43bcd6150aa2135026482ab08c985d10845c7749b5a90861",
  "03_drop_legacy_views_jobs_triggers.sql":
    "a901584af3e9736f0a2a539ab55f8629b4e46f0bdde509e68160915e4263b8c3",
  "04_enum_split.sql":
    "cc31fddd902a2f418acb59d05bd5995e27c501c896e004e21e6a6e9583417cef",
  "05_money_to_numeric.sql":
    "01d963fa4411f667f17b0d4ee7838189d07d41672cbb001a3133aacfa6901af8",
  "06_new_tables.sql":
    "641f199730a1803c863cb9b9e23218b355699ff9a1f4cfeb06ddcb7119244cfe",
  "07_align_constraint_names.sql":
    "76da9f390349784c14aaeb599b497390a07e9145e6289ef83e8735f9e4d80888",
  "08_item_favorites_missing_uniques.sql":
    "a3cde8c077b3a74b12dfff070a5b72bc84d3d697396b4950bf9c745e142ec50b",
  "09_item_file_fk_repoint.sql":
    "a340c8a1b40134c2fd9c60ec689d1357b35fa9a212bb2dd4701a6c8fc5bec680",
  "10_place_file_fk_repoint.sql":
    "92d83783f563e6ce501870550f293d8ec5f99f2161ce6c8b30df66afff0fd494",
  "11_drop_broken_sakes_country_default.sql":
    "30b36339b4c28beb5be8586c855cf0dec448e6900366f8ea503fac152c1e94d6",
  "12_menu_scan_file_fk_repoint.sql":
    "023257a803623829198185aced7e4911ff91427db10df526c9cf20fbefb0f99b",
  "13_better_auth_tables.sql":
    "e21898a9d6589711fb626c27d314cdc56e6b9e17e9e19c59f62dde5a8b637e35",
  "14_repoint_user_fks.sql":
    "f54abca8ca0be65cdfa19750612423f34fd654adbfd8cc13ee6df7c6daea3403",
  "15_drop_auth_schema.sql":
    "e01c5b28f674a71c80c151b2fe8dc9286d1ef8874065860eb54f93ae686292a1",
  "16_widen_menu_item_detected_type.sql":
    "e96147165d4dec812dfabef1e733a891fe14baff0199d3cdd90ca79617dd2ab2",
  "17_target_indexes.sql":
    "04954513f4497a692339ddaba2e5711cc98148b5f121284993707cedcd6dd2d2",
  "18_teas_country_fk.sql":
    "2780aa78f32472a43d8d857e21f234e557117987bed4cead528e81713e6062a3",
  "nhost-schema.sql":
    "398fec08e888cc212966d794573d08237564a320bc9b7cf164428c25f645014a",
};

const onDisk = (): string[] =>
  readdirSync(TRANSFORM_DIR)
    .filter((f) => /^[0-9][0-9]_.*\.sql$/.test(f) || f === "nhost-schema.sql")
    .sort();

const hash = (file: string): string =>
  createHash("sha256")
    .update(readFileSync(`${TRANSFORM_DIR}/${file}`))
    .digest("hex");

describe("transform/ is frozen at the ledger horizon", () => {
  it("has exactly the pinned files — no new numbered step, none removed", () => {
    expect(onDisk()).toEqual(Object.keys(FROZEN).sort());
  });

  it("has every pinned file byte-identical", () => {
    const changed = onDisk().filter((f) => FROZEN[f] !== hash(f));
    expect(changed).toEqual([]);
  });
});
