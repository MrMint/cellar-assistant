/**
 * `GooglePlacesActor(hash)` — C1 (migration plan §2.3).
 *
 * > | `GooglePlacesActor(hash)` | `google_autocomplete`, `google_nearby_search`,
 * > text search | no | projection; **charges via `BudgetActor`** |
 *
 * Replaces `functions/googlePlacesAutocomplete` and
 * `functions/googlePlacesNearbySearch`, whose bodies are `_utils/google-places`'s
 * `autocomplete()` and `nearbySearch()`.
 *
 * ## The activation is what makes this affordable
 *
 * Autocomplete is charged **per keystroke** at 1¢ a call, and nearby search at
 * 4¢. The old functions had no cache at all: every keystroke was a paid call,
 * and the only defence was `checkBudget` refusing once the month's money was
 * gone. Keying the actor by `(mode, input, rounded location, radius)` means the
 * same prefix at the same place is charged **once** per 5-minute idle window,
 * however many users type it and however many times the form re-fires. The
 * coordinate is rounded to 6 decimals by `googlePlacesActorId` so map jitter
 * does not mint a new activation and a new charge.
 *
 * ## Budget: reserve first, call second, and a denial is a result
 *
 * B5's ordering, preserved: `BudgetActor.reserve` is the *only* thing that
 * decides whether money may be spent, and it is called before Google, not
 * around it — the old client's check-then-log pair is the race §2.1 gives
 * `reserve` to close. A denial returns `charged: false` with an empty list and
 * a reason, not a throw: the create-place form should show "no suggestions",
 * not an error, when the month's autocomplete budget is exhausted.
 *
 * `BudgetActor.reserve` takes a `system` or `admin` ctx only (B5), so this
 * actor reserves with a system ctx it constructs for the purpose — the same
 * shape `PlaceActor` uses when the outbox delivers its enrichment. A signed-in
 * user therefore cannot charge the budget directly, only cause a turn that
 * does, and `triggeredBy` records who.
 *
 * ## Budget key: one per real call, never one per actor key
 *
 * `BudgetActor` replays a repeated `reservationId` for the rest of the month:
 * `allowed: true`, and no second `api_usage_log` row. So a key must name one
 * Google call, and the only thing that may let two turns share one is a cache
 * that really stops the second call. The activation cache is that for exactly
 * one activation — about five idle minutes — and a month-long key outlived it
 * by four orders of magnitude: this actor used to reserve under
 * `google-places:${key}` every time, so the first activation after an idle
 * deactivation made a real, paid Google call whose reservation replayed the
 * month's first one, counted nothing and checked no cap.
 *
 * So each cache miss mints its own key (`#reservationId`) immediately before
 * it reserves, and a hit reserves nothing at all. That is the same rule as
 * `PlaceActor`'s module doc — "every reservation sits directly before its
 * paid call" — for the same reason. The key is minted once per turn, so a
 * sidecar-level retry of that one `reserveForSearch` invocation carries the
 * same key and replays rather than double-booking. What it gives up is the
 * other direction: a turn that reserved and then failed before Google
 * answered is charged again by the next turn that tries. That over-count is
 * the conservative side of a cap.
 *
 * ## What a *failed* Google call costs
 *
 * The reservation is not refunded, and that matches the old behaviour in the
 * only direction that matters: `logApiUsage` ran after a successful fetch, so
 * a failure was free — but the old code also called Google *before* it knew it
 * could pay. Reserving first and not refunding is the conservative pair. If
 * refunds are wanted, `BudgetActor` is where that belongs, not here.
 *
 * ## Viewer: not in the key
 *
 * Google's answer does not depend on who asked. `triggeredBy` differs per
 * caller, but it is attribution on a write to `api_usage_log`, not part of the
 * question — so it is deliberately absent from the hash, and the first caller
 * of a shared activation is the one recorded. Noted for E3's cost dashboards.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  Ctx,
  GooglePlaceSuggestion,
  GooglePlacesActorInterface,
  GooglePlacesSearchInput,
  GooglePlacesSearchResult,
} from "@cellar-assistant/contracts";
import {
  GOOGLE_AUTOCOMPLETE_RADIUS_M,
  GOOGLE_NEARBY_MAX_RESULTS,
  GOOGLE_NEARBY_RADIUS_M,
  GooglePlacesActorDescriptor,
  googlePlacesActorId,
  isLngLat,
  ValidationError,
} from "@cellar-assistant/contracts";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { ActorBase } from "../lib/actor-base.ts";
import {
  type BudgetReserver,
  daprSearchBudgetReserver,
} from "../lib/budget-reservers.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import type { GooglePlacesClient } from "../lib/google-places.ts";
import {
  API_COST_CENTS,
  GOOGLE_PLACES_SERVICE,
  googlePlacesClient,
} from "../lib/google-places.ts";
import { requireSignedIn } from "../lib/guards.ts";

const MAX_RADIUS_M = 50_000;
const MAX_RESULTS = 20;

export class GooglePlacesActor
  extends ActorBase
  implements GooglePlacesActorInterface
{
  static readonly category: ActorCategory =
    GooglePlacesActorDescriptor.category;

  readonly #google: GooglePlacesClient;
  readonly #reserve: BudgetReserver;
  #result: GooglePlacesSearchResult | null = null;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    google: GooglePlacesClient = googlePlacesClient(),
    reserve: BudgetReserver = daprSearchBudgetReserver,
  ) {
    super(daprClient, id, db);
    this.#google = google;
    this.#reserve = reserve;
  }

  /** Diagnostics, as `SearchActorBase.searchRuns` is. Not on the interface. */
  get searchRuns(): number {
    return this.#runs;
  }
  #runs = 0;

  async search(
    ctx: Ctx,
    input: GooglePlacesSearchInput,
  ): Promise<GooglePlacesSearchResult> {
    const viewer = requireSignedIn(ctx, "search Google Places");
    const normalised = normalise(input);
    const expected = googlePlacesActorId(normalised, ctx.viewerId);
    if (expected !== this.key) {
      throw new ValidationError(
        `GooglePlacesActor(${this.key}) was called with an input that hashes ` +
          `to ${expected}. A search actor's id is its input (§1.5), and here ` +
          "it is also what stops one paid call from being billed twice.",
      );
    }

    // The activation is the cache, and the cache is what makes a per-keystroke
    // endpoint affordable. A second turn costs nothing.
    if (this.#result !== null) return this.#result;
    this.#runs += 1;

    const endpoint =
      normalised.mode === "autocomplete" ? "autocomplete" : "nearby_search";
    // The caller's own ctx, deliberately: `reserveForSearch` refuses anonymous,
    // fixes the cost from its allow-list and attributes the spend to the
    // viewer. A search actor minting a `system` ctx would break §1.6, which is
    // absolute — "not derivable from a request" — and this call *is* derivable
    // from a request.
    const reservation = await this.#reserve(ctx, {
      kind: { service: GOOGLE_PLACES_SERVICE, endpoint },
      estimatedCostCents: API_COST_CENTS[endpoint],
      entityType: "place",
      triggeredBy: viewer,
      // A fresh key per real call (module doc, "Budget key"): the cache that
      // guards it dies with this activation, so the key must too.
      reservationId: this.#reservationId(),
      metadata: {
        mode: normalised.mode,
        input: normalised.input ?? null,
      },
    });

    if (!reservation.allowed) {
      // A denial is a result, not a failure (B5): the form shows "no
      // suggestions", and nothing was spent. Not cached — the budget may be
      // raised, and re-asking after that should work.
      return {
        suggestions: [],
        charged: false,
        reason: reservation.reason,
      };
    }

    const raw =
      normalised.mode === "autocomplete"
        ? await this.#google.autocomplete(
            normalised.input as string,
            normalised.location,
            { radiusMeters: normalised.radiusMeters },
          )
        : await this.#google.nearbySearch(normalised.location, {
            radiusMeters: normalised.radiusMeters,
            maxResults: normalised.maxResults,
          });

    // `null` is "Google said no" — the old client logged and returned null too.
    const suggestions: readonly GooglePlaceSuggestion[] = (raw ?? []).map(
      (suggestion) => ({
        googlePlaceId: suggestion.googlePlaceId,
        name: suggestion.name,
        secondaryText: suggestion.secondaryText,
        types: suggestion.types,
        location: suggestion.location,
      }),
    );

    const result: GooglePlacesSearchResult = {
      suggestions,
      charged: true,
      reason: raw === null ? "google returned no result" : reservation.reason,
    };
    this.#result = result;
    return result;
  }

  /**
   * The key for the one Google call this turn is about to make: the actor key
   * for attribution when reading the ledger, plus a uuid for identity. Not
   * derived from anything that survives this turn — see the module doc.
   */
  #reservationId(): string {
    return `google-places:${this.key}:${randomUUID()}`;
  }
}

const normalise = (
  input: GooglePlacesSearchInput,
): GooglePlacesSearchInput & {
  readonly radiusMeters: number;
  readonly maxResults: number;
} => {
  if (input.mode !== "autocomplete" && input.mode !== "nearby") {
    throw new ValidationError(
      `mode must be "autocomplete" or "nearby", got ${String(input.mode)}`,
    );
  }
  if (!isLngLat(input.location)) {
    throw new ValidationError("a Google search needs a { lng, lat } location");
  }
  const text = input.input?.trim() ?? "";
  if (input.mode === "autocomplete" && text === "") {
    throw new ValidationError("autocomplete needs something to complete");
  }
  const radiusMeters =
    input.radiusMeters ??
    (input.mode === "autocomplete"
      ? GOOGLE_AUTOCOMPLETE_RADIUS_M
      : GOOGLE_NEARBY_RADIUS_M);
  if (
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0 ||
    radiusMeters > MAX_RADIUS_M
  ) {
    throw new ValidationError(
      `radiusMeters must be in (0, ${MAX_RADIUS_M}], got ${radiusMeters}`,
    );
  }
  const maxResults = input.maxResults ?? GOOGLE_NEARBY_MAX_RESULTS;
  if (
    !Number.isInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > MAX_RESULTS
  ) {
    throw new ValidationError(
      `maxResults must be an integer in [1, ${MAX_RESULTS}], got ${maxResults}`,
    );
  }
  return {
    ...input,
    input: input.mode === "autocomplete" ? text : null,
    radiusMeters,
    maxResults,
  };
};
