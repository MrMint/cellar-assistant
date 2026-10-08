/**
 * X19 — the catalog correction loop's two model calls on `ItemOnboardingActor`:
 * `rereadLabel` and `suggestDetails`. The seams are fakes (the model cannot run
 * in a test); what is real is the gate — whose onboarding, whose item, and that
 * the two belong together — and that neither call writes anything.
 */
import { randomUUID } from "node:crypto";
import {
  ForbiddenError,
  NotFoundError,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { files } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type {
  ItemDefaultsProvider,
  ItemDefaultsRequest,
} from "../lib/item-defaults.ts";
import type {
  ItemSuggestionsProvider,
  ItemSuggestionsRequest,
} from "../lib/item-suggestions.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { ItemOnboardingActor } from "./item-onboarding-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const reading =
  (seen: ItemDefaultsRequest[]): ItemDefaultsProvider =>
  async (_ctx, request) => {
    seen.push(request);
    return {
      defaults: { name: "LYTTON SPRINGS", wine: { vintage: "2016" } },
      raw: "{}",
      model: "test-vision",
      confidence: 0.7,
      brandName: "Ridge",
    };
  };

const suggesting =
  (seen: ItemSuggestionsRequest[]): ItemSuggestionsProvider =>
  async (_ctx, request) => {
    seen.push(request);
    return {
      abstained: false,
      note: "Ridge Lytton Springs.",
      defaults: { wine: { variety: "ZINFANDEL" } },
      model: "test-text",
    };
  };

const actorFor = (
  db: DbOrTx,
  id: string,
  defaults: ItemDefaultsProvider,
  suggestions: ItemSuggestionsProvider,
): ItemOnboardingActor =>
  new ItemOnboardingActor(
    daprClient(),
    new ActorId(id),
    db,
    defaults,
    async (_ctx, code) => ({ code }),
    async () => {
      throw new Error("no BrandRegistryActor in this test");
    },
    async () => {
      throw new Error("no FileActor in this test");
    },
    suggestions,
  );

/** A confirmed session with a front label, and the wine it created. */
const seedCorrectable = async (db: DbOrTx, owner: string) => {
  await db.execute(
    sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
  );
  const [file] = await db
    .insert(files)
    .values({
      key: `labels/${randomUUID()}.jpg`,
      uploadedBy: owner,
      verifiedAt: new Date(),
    })
    .returning({ id: files.id });
  const onboardingId = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type, status, front_label_image_id)
    values (${onboardingId}::uuid, ${owner}::uuid, 'WINE', 'CONFIRMED', ${file?.id ?? null}::uuid)
  `);
  const wineId = randomUUID();
  await db.execute(sql`
    insert into public.wines (id, name, created_by_id, style, item_onboarding_id)
    values (${wineId}::uuid, 'Lytton Springs', ${owner}::uuid, 'RED', ${onboardingId}::uuid)
  `);
  return { onboardingId, wineId, frontId: file?.id ?? "" };
};

const statusOf = async (db: DbOrTx, id: string) =>
  (
    await db.execute<{ status: string; defaults: unknown }>(
      sql`select status, defaults from public.item_onboardings where id = ${id}::uuid`,
    )
  ).rows[0];

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("ItemOnboardingActor — X19 corrections", () => {
  afterAll(closeTestDb);

  it("rereadLabel reads the stored photographs again, for the creator, and stores nothing", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const { onboardingId, wineId, frontId } = await seedCorrectable(
        db,
        owner,
      );
      const seen: ItemDefaultsRequest[] = [];
      const actor = await activate(
        actorFor(db, onboardingId, reading(seen), suggesting([])),
      );
      const before = await statusOf(db, onboardingId);

      const result = await actor.rereadLabel(userCtx(owner, "r"), {
        item: { type: "WINE", id: wineId },
      });
      expect(result).toEqual({
        defaults: JSON.stringify({
          name: "LYTTON SPRINGS",
          wine: { vintage: "2016" },
        }),
        brandName: "Ridge",
        confidence: 0.7,
        model: "test-vision",
      });
      expect(seen).toEqual([
        {
          itemType: "WINE",
          frontLabelImageId: frontId,
          backLabelImageId: null,
          barcode: null,
          barcodeType: null,
        },
      ]);
      // Asking again calls the model again: re-reading is the point.
      await actor.rereadLabel(userCtx(owner, "r"), {
        item: { type: "WINE", id: wineId },
      });
      expect(seen).toHaveLength(2);
      expect(await statusOf(db, onboardingId)).toEqual(before);
    });
  });

  it("suggestDetails asks only about the empty suggestible fields, with the form's values as context", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const { onboardingId, wineId } = await seedCorrectable(db, owner);
      const seen: ItemSuggestionsRequest[] = [];
      const actor = await activate(
        actorFor(db, onboardingId, reading([]), suggesting(seen)),
      );
      const result = await actor.suggestDetails(userCtx(owner, "r"), {
        item: { type: "WINE", id: wineId },
        name: "Lytton Springs",
        brandName: " Ridge Vineyards ",
        country: "UNITED_STATES",
        attributes: { style: "RED", vintage: "2016-01-01" },
      });
      expect(result).toEqual({
        abstained: false,
        note: "Ridge Lytton Springs.",
        defaults: JSON.stringify({ wine: { variety: "ZINFANDEL" } }),
        model: "test-text",
      });
      expect(seen[0]).toMatchObject({
        itemType: "WINE",
        name: "Lytton Springs",
        brandName: "Ridge Vineyards",
        wanted: [
          { field: "variety", on: "attributes" },
          { field: "region", on: "attributes" },
        ],
      });
    });
  });

  it("refuses anyone but the creator, and an item this session did not create", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const { onboardingId, wineId } = await seedCorrectable(db, owner);
      const other = await seedCorrectable(db, owner);
      const seen: ItemDefaultsRequest[] = [];
      const actor = await activate(
        actorFor(db, onboardingId, reading(seen), suggesting([])),
      );

      // Someone else's session is absent, not forbidden (E5b).
      await expect(
        actor.rereadLabel(userCtx(stranger, "r"), {
          item: { type: "WINE", id: wineId },
        }),
      ).rejects.toThrow(NotFoundError);
      // The owner's own wine, but created through another session: this
      // session's photographs are not evidence about it.
      await expect(
        actor.rereadLabel(userCtx(owner, "r"), {
          item: { type: "WINE", id: other.wineId },
        }),
      ).rejects.toThrow(ValidationError);
      await expect(
        actor.suggestDetails(userCtx(owner, "r"), {
          item: { type: "WINE", id: randomUUID() },
          name: "x",
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(seen).toHaveLength(0);
    });
  });
});
