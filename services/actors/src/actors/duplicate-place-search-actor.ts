/**
 * `DuplicatePlaceSearchActor(hash)` — C1 (migration plan §2.3).
 *
 * > | `DuplicatePlaceSearchActor(hash)` | `find_duplicate_places` | no |
 * > projection |
 *
 * Replaces `checkDuplicatePlacesAction`: trigram similarity on the name within
 * a radius, ordered by similarity then distance. The create-place form calls it
 * per keystroke for live feedback, which is exactly the shape a keyed
 * activation is for — the same name at the same rounded coordinate is one
 * query, however many times the form asks.
 *
 * ## It does *not* replace `PlaceCreationActor`'s own duplicate check
 *
 * B5 runs `find_duplicate_places` inside `PlaceCreationActor` under the
 * creation lock, and §2.1 says the actor's `findDuplicates` "will delegate to
 * `DuplicatePlaceSearchActor` once that exists". C1 has **not** made that
 * delegation, deliberately: §8.5's call graph says "entity actors never call
 * collection, view, or search actors synchronously except `CellarActor` →
 * `EmbeddingActor`", and `PlaceCreationActor` is an entity actor. Routing its
 * check through this actor would add an edge the graph forbids *and* move the
 * check outside the lock that makes it sound (B5's module doc). The duplicated
 * SQL is the lesser problem; both call the same function with the same
 * defaults, and `duplicate-place-search-actor.test.ts` asserts they agree.
 * Recorded in the C1 report.
 *
 * ## Viewer: not in the key
 *
 * `places` has no privacy column and no owner branch (B5). One activation
 * serves everyone.
 */
import type {
  ActorCategory,
  Ctx,
  DuplicatePlaceHit,
  DuplicatePlaceSearchActorInterface,
  DuplicatePlaceSearchInput,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  DUPLICATE_SEARCH_MAX_RADIUS_M,
  DUPLICATE_SEARCH_MIN_SIMILARITY,
  DUPLICATE_SEARCH_RADIUS_M,
  DUPLICATE_SEARCH_RESULT_CAP,
  DuplicatePlaceSearchActorDescriptor,
  duplicatePlaceSearchActorId,
  isLngLat,
  ValidationError,
} from "@cellar-assistant/contracts";
import { requireSignedIn } from "../lib/guards.ts";
import { decodePoint, findDuplicatePlaces } from "../lib/place-search-sql.ts";
import { SearchActorBase } from "../lib/search-actor-base.ts";

/**
 * B5's ceiling on the radius. Now `DUPLICATE_SEARCH_MAX_RADIUS_M` in
 * `@cellar-assistant/contracts` (A7g), so `place.ts` can state it in the arg
 * description without a second copy of the number drifting from this check.
 */
const MAX_RADIUS_M = DUPLICATE_SEARCH_MAX_RADIUS_M;

export class DuplicatePlaceSearchActor
  extends SearchActorBase<DuplicatePlaceSearchInput, DuplicatePlaceHit>
  implements DuplicatePlaceSearchActorInterface
{
  static readonly category: ActorCategory =
    DuplicatePlaceSearchActorDescriptor.category;

  protected keyFor(
    input: DuplicatePlaceSearchInput,
    viewerId: string | null,
  ): string {
    return duplicatePlaceSearchActorId(input, viewerId);
  }

  /** `places` has no privacy column (B5): any signed-in viewer. */
  protected override async authorize(ctx: Ctx): Promise<"allow"> {
    requireSignedIn(ctx, "check for duplicate places");
    return "allow";
  }

  async results(
    ctx: Ctx,
    input: DuplicatePlaceSearchInput,
    page: PageArgs,
  ): Promise<Page<DuplicatePlaceHit>> {
    return this.pageOf(ctx, input, page);
  }

  async all(
    ctx: Ctx,
    input: DuplicatePlaceSearchInput,
  ): Promise<readonly DuplicatePlaceHit[]> {
    return this.resultSet(ctx, input);
  }

  protected async runSearch(
    _ctx: Ctx,
    input: DuplicatePlaceSearchInput,
  ): Promise<readonly DuplicatePlaceHit[]> {
    const name = input.name.trim();
    if (name === "") {
      throw new ValidationError("a duplicate check needs a name");
    }
    if (!isLngLat(input.location)) {
      throw new ValidationError(
        "a duplicate check needs a { lng, lat } location",
      );
    }
    const radiusMeters = requireRadius(
      input.radiusMeters ?? DUPLICATE_SEARCH_RADIUS_M,
    );
    const minSimilarity = requireSimilarity(
      input.minSimilarity ?? DUPLICATE_SEARCH_MIN_SIMILARITY,
    );
    const resultLimit = requireLimit(
      input.limit ?? DUPLICATE_SEARCH_RESULT_CAP,
    );

    const rows = await findDuplicatePlaces(this.db, {
      name,
      location: input.location,
      radiusMeters,
      minSimilarity,
      resultLimit,
    });

    return rows.map((row) => ({
      placeId: row.id,
      name: row.name,
      primaryCategory: row.primary_category,
      location: decodePoint(row.location),
      streetAddress: row.street_address,
      locality: row.locality,
      similarity: Number(row.similarity),
      distanceMeters: Number(row.distance_m),
    }));
  }
}

const requireRadius = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_RADIUS_M) {
    throw new ValidationError(
      `radiusMeters must be in (0, ${MAX_RADIUS_M}], got ${value}`,
    );
  }
  return value;
};

const requireSimilarity = (value: number): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(`minSimilarity must be in [0, 1], got ${value}`);
  }
  return value;
};

const requireLimit = (value: number): number => {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > DUPLICATE_SEARCH_RESULT_CAP
  ) {
    throw new ValidationError(
      `limit must be an integer in [1, ${DUPLICATE_SEARCH_RESULT_CAP}], got ${value}`,
    );
  }
  return value;
};
