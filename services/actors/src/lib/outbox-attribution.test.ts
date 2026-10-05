/**
 * `outbox.attributed_to` is attribution and nothing else.
 *
 * An outbox delivery runs as `systemCtx`, so a model call made inside one used
 * to be booked to nobody (`api_usage_log.triggered_by = NULL` — 63 of 93
 * embedding rows, 13 of 13 menu extractions on the compose stack). The fix
 * records the enqueuing viewer on the row and lets `BudgetActor` copy it into
 * `triggered_by`. The risk in that fix is the obvious one: a viewer id riding
 * along with a `systemCtx` is one careless line away from being *used as* a
 * viewer — by a policy check, an owner gate, anything that reads a ctx. So
 * this file holds the property from three sides:
 *
 *  1. **what is recorded** — the enqueuer's own viewer, or the delivering
 *     row's attribution down a chain, and nothing a caller can name;
 *  2. **what a delivery receives** — exactly the `systemCtx` it always did,
 *     with `viewerId: null`, and a `ClaimedRow` that has no field to read;
 *  3. **who can read it** — a scan of the source: the column is named by
 *     `lib/outbox.ts` (the writer) and `actors/budget-actor.ts` (the one
 *     reader) and nowhere else, and never by the policy or contracts packages.
 *
 *   bun run --filter @cellar-assistant/actors test outbox-attribution
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Ctx } from "@cellar-assistant/contracts";
import {
  adminCtx,
  anonymousCtx,
  systemCtx,
  userCtx,
} from "@cellar-assistant/contracts";
import { outbox } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { bypassesPolicy } from "@cellar-assistant/policy";
import { afterAll, describe, expect, it, vi } from "vitest";
import { OUTBOX_TARGETS } from "./outbox-targets.ts";

/** Every sidecar invocation the drainer makes, instead of making it. */
const invoked = vi.hoisted(() => [] as unknown[][]);
vi.mock("./sidecar.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sidecar.ts")>()),
  invokeActorMethod: vi.fn(async (...args: unknown[]) => {
    invoked.push(args);
    return undefined;
  }),
}));

import type { ClaimedRow } from "../actors/outbox-actor.ts";
import { OUTBOX_ACTOR_ID, OutboxActor } from "../actors/outbox-actor.ts";
import type { DbOrTx } from "./db.ts";
import { enqueueOutbox, enqueueOutboxOnce } from "./outbox.ts";
import {
  activate,
  closeTestDb,
  createActor,
  deliveryCtx,
  resolveTestDatabase,
  testDelivery,
  withTestDb,
} from "./testing.ts";

const USER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "11111111-1111-4111-8111-111111111111";

/** A declared `(targetActor, method)` pair, so the drainer will deliver it. */
const TARGET = OUTBOX_TARGETS["ItemActor.regenerateVector"];
const ENTRY = {
  targetId: "wine:00000000-0000-4000-8000-000000000001",
  payload: {
    reason: "update",
    itemType: "WINE",
    itemId: "00000000-0000-4000-8000-000000000001",
  },
} as const;

const attributionOf = async (
  db: DbOrTx,
  id: string | null,
): Promise<string | null> => {
  const [row] = await db
    .select({ attributedTo: outbox.attributedTo })
    .from(outbox)
    .where(eq(outbox.id, id ?? ""));
  if (row === undefined) throw new Error(`outbox row ${id} vanished`);
  return row.attributedTo;
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("what an enqueue records", () => {
  afterAll(closeTestDb);

  it("is the enqueuing turn's own viewer, or nobody", async () => {
    await withTestDb(async (db) => {
      const enqueue = (attributeTo?: Parameters<typeof userCtx>[0] | null) =>
        attributeTo === undefined
          ? enqueueOutbox(db, TARGET, ENTRY)
          : enqueueOutbox(db, TARGET, ENTRY, {
              attributeTo:
                attributeTo === null
                  ? anonymousCtx("r-anon")
                  : userCtx(attributeTo, "r-user"),
            });

      expect(await attributionOf(db, await enqueue(USER))).toBe(USER);
      expect(
        await attributionOf(
          db,
          await enqueueOutbox(db, TARGET, ENTRY, {
            attributeTo: adminCtx(ADMIN, "r-admin"),
          }),
        ),
      ).toBe(ADMIN);
      // Signed out, not said, or a system turn that is not a delivery (a
      // reminder, a job's own context): the system originated it.
      expect(await attributionOf(db, await enqueue(null))).toBeNull();
      expect(await attributionOf(db, await enqueue())).toBeNull();
      expect(
        await attributionOf(
          db,
          await enqueueOutbox(db, TARGET, ENTRY, {
            attributeTo: systemCtx("maintenance:reap"),
          }),
        ),
      ).toBeNull();
    });
  });

  it("follows a chain of deliveries back to the person who started it", async () => {
    await withTestDb(async (db) => {
      const first = await enqueueOutbox(db, TARGET, ENTRY, {
        attributeTo: userCtx(USER, "r-user"),
      });
      // The delivery of `first` enqueues the next hop, from its systemCtx.
      const second = await enqueueOutbox(db, TARGET, ENTRY, {
        attributeTo: deliveryCtx(first),
      });
      const third = await enqueueOutboxOnce(
        db,
        TARGET,
        { ...ENTRY, targetId: "wine:00000000-0000-4000-8000-000000000002" },
        { attributeTo: deliveryCtx(second) },
      );
      expect(await attributionOf(db, second)).toBe(USER);
      expect(await attributionOf(db, third)).toBe(USER);
      // A request id that only looks like a delivery attributes to nobody,
      // and does not fail the enqueue (and with it the domain write).
      expect(
        await attributionOf(
          db,
          await enqueueOutbox(db, TARGET, ENTRY, {
            attributeTo: testDelivery("not-a-uuid"),
          }),
        ),
      ).toBeNull();
    });
  });
});

describe.skipIf(skip)("what a delivery receives", () => {
  afterAll(closeTestDb);

  it("is the same viewerless systemCtx, attributed row or not", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(db, TARGET, ENTRY, {
        attributeTo: userCtx(USER, "r-user"),
      });
      expect(await attributionOf(db, id)).toBe(USER);

      invoked.length = 0;
      const drainer = await activate(
        createActor(OutboxActor, OUTBOX_ACTOR_ID, db),
      );
      await drainer.drain(systemCtx("attribution-test-drain"));

      const args = invoked
        .map((call) => call[3])
        .find(
          (a): a is [Ctx, unknown] =>
            Array.isArray(a) &&
            (a[0] as Ctx | undefined)?.delivery?.outboxId === id,
        );
      if (args === undefined) throw new Error("the row was not delivered");
      const [ctx, payload] = args;
      // Exactly the ctx an unattributed row gets: no viewer, still system,
      // still policy-bypassing — attribution changed none of that.
      expect(ctx).toEqual(deliveryCtx(id));
      expect(bypassesPolicy(deliveryCtx(id))).toBe(true);
      expect(payload).toEqual(ENTRY.payload);
      // And the viewer id is nowhere in what the target method is handed.
      expect(JSON.stringify(args)).not.toContain(USER);
    });
  });

  it("hands the delivery no field to read it from", () => {
    const row = {} as ClaimedRow;
    // @ts-expect-error — the drain never selects `attributed_to`, so the row a
    // delivery is built from cannot carry it. Typecheck fails here if it does.
    expect(row.attributedTo).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Who can read it                                                             */
/* -------------------------------------------------------------------------- */

const ACTORS_SRC = fileURLToPath(new URL("..", import.meta.url));
const PACKAGES = fileURLToPath(
  new URL("../../../../packages", import.meta.url),
);

const sourceFiles = (root: string): string[] =>
  readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter(
      (path) =>
        path.endsWith(".ts") &&
        !path.endsWith(".test.ts") &&
        !path.endsWith("testing.ts") &&
        !path.includes("node_modules"),
    )
    .map((path) => join(root, path));

/** The column, by either of its names. `attributeTo` (the option) is not it. */
const NAMES_THE_COLUMN = /attributedTo|attributed_to/;

describe("who can read the attribution", () => {
  it("is named by its writer and its one reader in services/actors, and nothing else", () => {
    const naming = sourceFiles(ACTORS_SRC)
      .filter((path) => NAMES_THE_COLUMN.test(readFileSync(path, "utf8")))
      .map((path) => relative(ACTORS_SRC, path))
      .sort();
    expect(naming).toEqual(["actors/budget-actor.ts", "lib/outbox.ts"]);
  });

  it("is never named by the policy or contracts packages", () => {
    for (const pkg of ["policy", "contracts"]) {
      const root = join(PACKAGES, pkg, "src");
      const naming = sourceFiles(root).filter((path) =>
        NAMES_THE_COLUMN.test(readFileSync(path, "utf8")),
      );
      expect(naming, pkg).toEqual([]);
    }
  });
});
