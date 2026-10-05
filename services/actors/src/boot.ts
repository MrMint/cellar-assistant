/**
 * The boot manifest: everything the host does between "an HTTP app exists"
 * and "serving", as one function a test can drive.
 *
 * ## Why this is not simply `index.ts`
 *
 * `index.ts` cannot be imported by a test — it binds a port at module scope —
 * so everything it did was a seam nobody could exercise: a line connecting a
 * component nobody doubts to the runtime that has to call it. This branch paid
 * for that twice. `MaintenanceActor` was registered but its reminder never
 * armed, so it never ran for nine days; `installSeams` never filled
 * `setPlaceReviewer`, so AI place review was dark behind a green suite. Both
 * were caught by hand, and the guards written afterwards could only *parse*
 * `index.ts` for the calls.
 *
 * So the calls live here, driven by data, and `boot.test.ts` runs them against
 * a fake server and a fake sidecar:
 *
 *  1. **AI** — `installAI()` installs a provider behind every row of
 *     `SEAMS` (`lib/ai/install.ts`, typed `satisfies Record<ModelSeam, …>`,
 *     so a seam without a row does not compile), or with `AI_PROVIDER` unset
 *     installs nothing and leaves each seam throwing its own `unconfigured*`
 *     error. A set-but-incomplete `AI_PROVIDER` **throws here**, before any
 *     actor is registered or the server starts, so the host never serves on a
 *     stub — the opposite of the Nhost `refreshPlaces` factory's
 *     `console.warn` and mock data.
 *  2. **Overture** — `installOverture()`, the same three-outcome contract for
 *     the BigQuery source `OvertureReloadJobActor` reads (C4b).
 *  3. **Actors** — every `ACTOR_REGISTRY` entry, registered once, in order.
 *  4. **Start** — `server.start()`.
 *  5. **Keep-alives** — every entry that declares one is armed through the one
 *     retry helper in `lib/keep-alive.ts`. Not awaited: it retries until the
 *     sidecar's actor subsystem is up, which it is not the instant the app's
 *     server is. The promise is returned so a caller (a test) can wait on it.
 *
 * What stays in `index.ts` is what is about the *process* rather than the
 * actors: the process guards (first, before anything can reject), better-auth
 * and the pool's idle-error listener, the error envelope and route guard on
 * the Express app, constructing `DaprServer`, and shutdown.
 *
 * ## Seams stay constructor defaults
 *
 * Dapr constructs every actor as `new Cls(daprClient, actorId)`, so an
 * actor's collaborators cannot arrive through registration; each is a
 * defaulted constructor parameter reading a module-level setter (what
 * `installAI` fills). That is unchanged — `boot()` fills the setters, it does
 * not build actors.
 */
import { ACTOR_REGISTRY, type RegistryEntry } from "./actors/registry.ts";
import { installAI } from "./lib/ai/install.ts";
import {
  type ArmRetry,
  armKeepAlive,
  DEFAULT_ARM_RETRY,
  type RegisterReminder,
} from "./lib/keep-alive.ts";
import { installOverture } from "./lib/overture.ts";

/** The part of `DaprServer` boot uses. */
export type BootServer = {
  readonly actor: {
    registerActor(actorClass: RegistryEntry["actorClass"]): Promise<void>;
    getRegisteredActors(): Promise<string[]>;
  };
  start(): Promise<void>;
};

/** The part of the sidecar boot uses (`lib/sidecar.ts` in production). */
export type BootSidecar = {
  readonly registerReminder: RegisterReminder;
};

export type BootOptions = {
  /** How hard to try each keep-alive. Tests shorten it. */
  readonly retry?: ArmRetry;
};

export type KeepAliveOutcome = {
  readonly actorType: string;
  readonly reminder: string;
  readonly armed: boolean;
};

export type BootResult = {
  /** What the server reports as registered, after `start()`. */
  readonly registered: readonly string[];
  /** Settles once every keep-alive is armed or has given up. Never rejects. */
  readonly keepAlives: Promise<readonly KeepAliveOutcome[]>;
};

export const boot = async (
  server: BootServer,
  sidecar: BootSidecar,
  options: BootOptions = {},
): Promise<BootResult> => {
  installAI();
  installOverture();

  for (const { actorClass } of ACTOR_REGISTRY) {
    await server.actor.registerActor(actorClass);
  }

  await server.start();

  const retry = options.retry ?? DEFAULT_ARM_RETRY;
  const keepAlives = Promise.all(
    ACTOR_REGISTRY.flatMap(({ descriptor, keepAlive }) =>
      keepAlive === undefined
        ? []
        : [
            armKeepAlive(
              sidecar.registerReminder,
              descriptor.actorType,
              keepAlive,
              retry,
            ).then((armed) => ({
              actorType: descriptor.actorType,
              reminder: keepAlive.reminder,
              armed,
            })),
          ],
    ),
  );

  return {
    registered: await server.actor.getRegisteredActors(),
    keepAlives,
  };
};
