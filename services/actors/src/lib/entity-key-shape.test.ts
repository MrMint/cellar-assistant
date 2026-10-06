/**
 * No id makes an entity actor's activation throw — for **every** registered
 * entity actor, not the one that happened to crash the host.
 *
 * `ItemActor("sake:not-a-uuid")` activated by sending `not-a-uuid` to a `uuid`
 * column, and that failed activation became a host crash ten minutes later
 * (`./actor-route-guard.ts`). Five other uuid-keyed actors had the same hole
 * and had simply not been hit. So this file does not list actors: it reads
 * the registered set out of `ACTOR_REGISTRY` (`src/actors/registry.ts`, the
 * list `src/index.ts` registers from), so an actor registered tomorrow is
 * covered tomorrow.
 *
 * Two claims per actor, per hostile key:
 *
 * 1. **A key its `keyShape` rejects never reaches SQL.** The actor is given a
 *    database that throws on first touch; activation must still succeed, and
 *    every turn must be refused with `NotFoundError` before the method runs.
 * 2. **A key its `keyShape` accepts is one Postgres accepts.** Activated
 *    against the real test database, it must load (as a row or as `null`)
 *    without an error — which is what catches a shape that is too loose, such
 *    as a text key that lets a NUL through.
 */
import { NotFoundError } from "@cellar-assistant/contracts";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import { ACTOR_REGISTRY } from "../actors/registry.ts";
import { EntityActorBase, type KeyShape } from "./actor-base.ts";
import type { DbOrTx } from "./db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  withTestDb,
} from "./testing.ts";

type EntityClass = (abstract new (
  ...args: never[]
) => EntityActorBase<unknown>) & { readonly keyShape: KeyShape };

/** The registered classes that extend `EntityActorBase`, by name. */
const registeredEntityActors = (): ReadonlyMap<string, EntityClass> =>
  new Map(
    ACTOR_REGISTRY.filter(
      ({ actorClass }) => actorClass.prototype instanceof EntityActorBase,
    ).map(({ actorClass }) => [
      actorClass.name,
      actorClass as unknown as EntityClass,
    ]),
  );

/**
 * Ids a client can put in a GraphQL `ID`, or a caller can build by mistake.
 * The first two are the production case: a valid item prefix around an id
 * Postgres cannot cast.
 */
const HOSTILE_KEYS = [
  "sake:not-a-uuid",
  "wine:not-a-uuid",
  "generic:not-a-uuid",
  "not-a-uuid",
  "wine:00000000-0000-0000-0000-00000000000g",
  "00000000-0000-0000-0000-00000000000g",
  "singleton",
  "overture-bulk",
  "wine_style",
  "' OR '1'='1",
  "nul\u0000byte",
  "x".repeat(300),
  // Postgres reads each of these as a real row id; Dapr reads each as a
  // different actor. See the next block.
  "3F2B7A52-9F0A-4D8E-8F3E-2A1C5B6D7E8F",
  "{3f2b7a52-9f0a-4d8e-8f3e-2a1c5b6d7e8f}",
  "SAKE:3f2b7a52-9f0a-4d8e-8f3e-2a1c5b6d7e8f",
  "sake:3F2B7A52-9F0A-4D8E-8F3E-2A1C5B6D7E8F",
] as const;

const CANONICAL = "3f2b7a52-9f0a-4d8e-8f3e-2a1c5b6d7e8f";

/** A database that fails the test the moment anything touches it. */
const untouchable = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(
        `SQL reached: the actor touched its database (.${String(property)})`,
      );
    },
  },
) as DbOrTx;

/** Every entity actor's constructor defaults whatever follows `db`. */
const construct = (Actor: EntityClass, key: string, db: DbOrTx) =>
  createActor(
    Actor as unknown as new (
      client: DaprClient,
      id: ActorId,
      db: DbOrTx,
    ) => EntityActorBase<unknown>,
    key,
    db,
  );

const { skip } = await resolveTestDatabase();
const actors = registeredEntityActors();

describe.skipIf(skip)(
  "every registered entity actor, activated with hostile keys",
  () => {
    afterAll(closeTestDb);

    it("finds the registered entity actors at all", () => {
      // The canary: if the filter silently found nothing, every row below
      // would be vacuously green.
      expect(actors.size).toBeGreaterThanOrEqual(15);
      for (const name of [
        "ItemActor",
        "CellarActor",
        "TierListActor",
        "FileActor",
        "BrandActor",
        "PlaceRefreshJobActor",
      ]) {
        expect(actors.has(name), `${name} is not an EntityActorBase?`).toBe(
          true,
        );
      }
    });

    it("rejects the key that took the host down, and accepts the real ones", () => {
      const item = actors.get("ItemActor");
      expect(item?.keyShape("sake:not-a-uuid")).toBe(false);
      expect(item?.keyShape(`sake:${CANONICAL}`)).toBe(true);
      expect(item?.keyShape(`generic:${CANONICAL}`)).toBe(true);
    });

    /**
     * One row, one actor (§1.1). Postgres matches `3F2B…`, `{3f2b…}` and
     * `3f2b…` to the same row; Dapr would host three activations with three
     * caches for it, each writing on its own. Only the spelling Postgres itself
     * produces is a key.
     */
    it("accepts a uuid key only in the spelling Postgres produces", () => {
      for (const name of ["CellarActor", "FileActor", "PlaceRefreshJobActor"]) {
        const shape = actors.get(name)?.keyShape;
        expect(shape?.(CANONICAL), name).toBe(true);
        expect(shape?.(CANONICAL.toUpperCase()), name).toBe(false);
        expect(shape?.(`{${CANONICAL}}`), name).toBe(false);
      }
      const item = actors.get("ItemActor");
      expect(item?.keyShape(`SAKE:${CANONICAL}`)).toBe(false);
      expect(item?.keyShape(`sake:${CANONICAL.toUpperCase()}`)).toBe(false);
    });

    const rows = [...actors].flatMap(([name, Actor]) =>
      HOSTILE_KEYS.map((key) => ({
        name,
        Actor,
        key,
        label: JSON.stringify(key.length > 40 ? `${key.slice(0, 12)}…` : key),
      })),
    );

    it.each(
      rows.filter(({ Actor, key }) => !Actor.keyShape(key)),
    )("$name($label): rejected by its shape, activates without SQL, refuses every turn", async ({
      Actor,
      key,
    }) => {
      const actor = await activate(construct(Actor, key, untouchable));
      await expect(actor.onActorMethodPre()).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it.each(
      rows.filter(({ Actor, key }) => Actor.keyShape(key)),
    )("$name($label): accepted by its shape, and Postgres accepts it too", async ({
      Actor,
      key,
    }) => {
      await withTestDb(async (db) => {
        const actor = await activate(construct(Actor, key, db));
        await actor.onActorMethodPre();
      });
    });
  },
);
