/**
 * `ProbeJobActor.armRestartProbe` refuses a caller who may not read the job
 * the way every other job method does: as if the job did not exist.
 *
 * It used to answer a non-owner `Forbidden` ("job … is not yours to arm")
 * about a real job, while `get`, `cancel` and `start` answered the same caller
 * `NotFound` — so this one method told a stranger which job ids were live.
 * The refusal happens before the reminder is registered, so no sidecar is
 * needed to exercise it.
 */
import { randomUUID } from "node:crypto";
import { NotFoundError, userCtx } from "@cellar-assistant/contracts";
import { afterAll, describe, expect, it } from "vitest";
import {
  activate,
  closeTestDb,
  createActor,
  refusalOf,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { ProbeJobActor } from "./probe-job-actor.ts";

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("ProbeJobActor.armRestartProbe", () => {
  afterAll(closeTestDb);

  it("conceals another user's job exactly as get does", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const id = randomUUID();
      const actor = await activate(createActor(ProbeJobActor, id, db));
      await actor.start(userCtx(owner, "r"), { batches: 1 });

      const asStranger = userCtx(stranger, "r");
      const arm = await refusalOf(
        () => actor.armRestartProbe(asStranger, 5),
        id,
      );
      const get = await refusalOf(() => actor.get(asStranger), id);
      expect(arm).toEqual(get);
      expect(arm.code).toBe(new NotFoundError("x").code);
    });
  });
});
