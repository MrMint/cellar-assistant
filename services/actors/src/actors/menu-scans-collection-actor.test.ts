/**
 * `MenuScansCollectionActor` — C3 (§2.2, §2.1).
 *
 * Scans are owner-only (§2.1, enforced by B8). The list must therefore contain
 * the viewer's scans and nothing else, and — because ids are what it returns —
 * every id it hands out must survive `MenuScanActor.get`'s independent owner
 * check, which is what makes an id page safe here.
 */
import { ForbiddenError, pageArgs, userCtx } from "@cellar-assistant/contracts";
import { files } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { MenuScansCollectionActor } from "./menu-scans-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const seedScan = async (db: DbOrTx, userId: string): Promise<string> => {
  const [file] = await db
    .insert(files)
    .values({ key: `menus/${crypto.randomUUID()}.jpg` })
    .returning({ id: files.id });
  if (file === undefined) throw new Error("no file");
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.menu_scans (user_id, original_image_id, processing_status)
    values (${userId}::uuid, ${file.id}::uuid, 'completed')
    returning id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no scan id");
  return id;
};

describe.skipIf(skip)("MenuScansCollectionActor", () => {
  afterAll(closeTestDb);

  it("lists the viewer's own scans and nobody else's", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const mine = await seedScan(db, viewer);
      const theirs = await seedScan(db, other);

      const actor = await activate(
        createActor(MenuScansCollectionActor, viewer, db),
      );
      const page = await actor.list(
        userCtx(viewer, "r"),
        pageArgs({ first: 50 }),
      );
      const ids = page.entries.map((entry) => entry.node);
      expect(ids).toContain(mine);
      expect(ids).not.toContain(theirs);
    });
  });

  it("refuses a caller who is not the viewer it is keyed by", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      await seedScan(db, viewer);
      const actor = await activate(
        createActor(MenuScansCollectionActor, viewer, db),
      );
      await actor.list(userCtx(viewer, "r"), pageArgs({ first: 5 }));
      await expect(
        actor.list(userCtx(other, "r"), pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(actor.queryCount).toBe(1);
    });
  });
});
