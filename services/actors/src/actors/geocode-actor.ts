/**
 * `GeocodeActor(hash)` — C1 (migration plan §2.3).
 *
 * > | `GeocodeActor(hash)` | Photon forward/reverse geocode
 * > (`getCachedGeocode`, the map's address short-circuit) | no | coordinates;
 * > **long idle window (24h)** |
 *
 * Replaces `getCachedGeocode` and `getCachedReverseGeocode` in
 * `src/lib/cache/index.ts`, both `unstable_cache`d for 7 days. The activation
 * is the cache now, and §8.5 gives this actor a **24h** idle window rather than
 * the 5 minutes every other search actor gets — because a street's coordinates
 * do not move and komoot's public instance is a courtesy, not a contract. That
 * is configured in the actors app's Dapr runtime options, not here.
 *
 * ## The reverse key is rounded, and the forward key is not
 *
 * `geocodeActorId` rounds a reverse coordinate to five decimals (~1.1 m) so
 * that a pixel of map drag does not mint a fresh activation and a fresh HTTP
 * call. A forward query is normalised text and rounds nothing.
 *
 * ## Nothing here is a database read
 *
 * This actor touches no table, which is why it takes no `Db` in practice. It is
 * a `search` actor by §1.1's categories — read-only, keyed by input hash — and
 * `ActorBase.tx()` refuses it a write handle regardless.
 *
 * ## X5 — the constructor default is the live wiring
 *
 * Dapr's `ActorManager` constructs every actor with exactly two arguments
 * (`new ActorCls(daprClient, actorId)` — see `@dapr/dapr`'s
 * `ActorManager.js`), so a constructor parameter's *default value* is the only
 * seam through which production ever gets a client; there is no host-side
 * injection point above it. `GooglePlacesActor` sets this precedent with
 * `google: GooglePlacesClient = googlePlacesClient()`, and this actor follows
 * it with `photon: PhotonClient = photonClient()` — **not**
 * `unconfiguredPhotonClient`, which would make every real activation throw
 * `ConflictError` before ever reaching komoot. Every test in
 * `geocode-actor.test.ts` still passes its own fake explicitly, so this
 * default is never exercised there.
 */
import type {
  ActorCategory,
  Ctx,
  ForwardGeocodeResult,
  GeocodeActorInterface,
  GeocodeInput,
  ReverseGeocodeResult,
} from "@cellar-assistant/contracts";
import {
  GeocodeActorDescriptor,
  geocodeActorId,
  isLngLat,
  ValidationError,
} from "@cellar-assistant/contracts";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { ActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { requireSignedIn } from "../lib/guards.ts";
import type { PhotonClient } from "../lib/photon.ts";
import { photonClient } from "../lib/photon.ts";

export class GeocodeActor extends ActorBase implements GeocodeActorInterface {
  static readonly category: ActorCategory = GeocodeActorDescriptor.category;

  readonly #photon: PhotonClient;
  #forward: { value: ForwardGeocodeResult } | null = null;
  #reverse: { value: ReverseGeocodeResult } | null = null;
  #runs = 0;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    photon: PhotonClient = photonClient(),
  ) {
    super(daprClient, id, db);
    this.#photon = photon;
  }

  /** Diagnostics, as `SearchActorBase.searchRuns` is. Not on the interface. */
  get searchRuns(): number {
    return this.#runs;
  }

  async forward(ctx: Ctx, input: GeocodeInput): Promise<ForwardGeocodeResult> {
    requireSignedIn(ctx, "geocode an address");
    if (input.mode !== "forward") {
      throw new ValidationError("`forward` takes a forward geocode input");
    }
    const query = input.query.trim();
    if (query === "") throw new ValidationError("nothing to geocode");
    this.#requireKey(ctx, input);

    // `null` is cached too: "no such address" is an answer, and re-asking
    // komoot for it on every keystroke is exactly what the old 7-day
    // `unstable_cache` existed to prevent.
    if (this.#forward !== null) return this.#forward.value;
    this.#runs += 1;
    const value = await this.#photon.forward(query);
    this.#forward = { value };
    return value;
  }

  async reverse(ctx: Ctx, input: GeocodeInput): Promise<ReverseGeocodeResult> {
    requireSignedIn(ctx, "reverse-geocode a coordinate");
    if (input.mode !== "reverse") {
      throw new ValidationError("`reverse` takes a reverse geocode input");
    }
    if (!isLngLat(input.location)) {
      throw new ValidationError("a reverse geocode needs a { lng, lat }");
    }
    this.#requireKey(ctx, input);

    if (this.#reverse !== null) return this.#reverse.value;
    this.#runs += 1;
    const value = await this.#photon.reverse(input.location);
    this.#reverse = { value };
    return value;
  }

  #requireKey(ctx: Ctx, input: GeocodeInput): void {
    const expected = geocodeActorId(input, ctx.viewerId);
    if (expected === this.key) return;
    throw new ValidationError(
      `GeocodeActor(${this.key}) was called with an input that hashes to ` +
        `${expected}. The activation caches one address for 24 hours (§8.5), ` +
        "so a mismatch would serve one query's coordinates for another.",
    );
  }
}
