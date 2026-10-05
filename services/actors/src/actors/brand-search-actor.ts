/**
 * `BrandSearchActor(hash)` — C1 (migration plan §2.3).
 *
 * > | `BrandSearchActor(hash)` | picker autocomplete `_ilike` | no | projection |
 *
 * Replaces `SearchBrandsQuery` in `src/components/brand/queries.ts`
 * (`brands where name _ilike $search order_by name asc limit 10`) and the
 * `BrandsListQuery` behind `/brands`, which is the same query with a bigger
 * limit and an offset. Both become one keyed activation with in-memory paging,
 * which is what makes the picker's per-keystroke query stop being a database
 * round trip per keystroke.
 *
 * ## `%` and `_` are escaped, and that is a behaviour change
 *
 * `BrandPicker.tsx` builds its pattern with a local `escapeLike` helper and
 * `BrandsListClient` does not, so today a `%` typed into the brands list page
 * matches everything. The escaping happens here now, once, for every caller:
 * the term is a *term*, not a pattern, and no client should be able to choose
 * between the two. §1.5's "no unbounded read" agrees — an unescaped `%` is
 * exactly the unbounded read.
 *
 * ## Ordering
 *
 * `ORDER BY (name = term) DESC, length(name), lower(name), id` — an exact match
 * first, then the shortest containing name, then alphabetical. Today's query
 * sorts by `name` alone, which buries "Krug" under "Krug Grande Cuvée
 * Brut" for the query "krug"; the picker's whole job is to surface the exact
 * brand. The final `id` term makes the order total, which an offset cursor
 * requires (§1.5).
 *
 * ## Viewer: not in the key
 *
 * Brands are catalog data: B3 settled the rule as "any signed-in viewer;
 * anonymous refused" and this actor applies exactly that, so one activation
 * serves every viewer. The three-viewer test exists anyway (§1.6).
 */
import type {
  ActorCategory,
  BrandSearchActorInterface,
  BrandSearchHit,
  BrandSearchInput,
  Ctx,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  BRAND_SEARCH_RESULT_CAP,
  BrandSearchActorDescriptor,
  brandSearchActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { brands } from "@cellar-assistant/db";
import { asc, ilike, sql } from "@cellar-assistant/db/orm";
import { requireSignedIn } from "../lib/guards.ts";
import { SearchActorBase } from "../lib/search-actor-base.ts";

/**
 * `%`, `_` and `\` are pattern syntax in `LIKE`. A user typing them means the
 * characters, so they are escaped with an explicit `ESCAPE '\'`.
 */
export const escapeLike = (term: string): string =>
  term.replace(/[\\%_]/g, (match) => `\\${match}`);

export class BrandSearchActor
  extends SearchActorBase<BrandSearchInput, BrandSearchHit>
  implements BrandSearchActorInterface
{
  static readonly category: ActorCategory = BrandSearchActorDescriptor.category;

  protected keyFor(input: BrandSearchInput, viewerId: string | null): string {
    return brandSearchActorId(input, viewerId);
  }

  /** Catalog data: any signed-in viewer, anonymous refused (B3's rule). */
  protected override async authorize(ctx: Ctx): Promise<"allow"> {
    requireSignedIn(ctx, "search brands");
    return "allow";
  }

  async results(
    ctx: Ctx,
    input: BrandSearchInput,
    page: PageArgs,
  ): Promise<Page<BrandSearchHit>> {
    return this.pageOf(ctx, input, page);
  }

  async all(
    ctx: Ctx,
    input: BrandSearchInput,
  ): Promise<readonly BrandSearchHit[]> {
    return this.resultSet(ctx, input);
  }

  protected async runSearch(
    _ctx: Ctx,
    input: BrandSearchInput,
  ): Promise<readonly BrandSearchHit[]> {
    const term = (input.term ?? "").trim();
    const limit = requireLimit(input.limit ?? BRAND_SEARCH_RESULT_CAP);
    const lowered = term.toLowerCase();

    const rows = await this.db
      .select({
        id: brands.id,
        name: brands.name,
        brandType: brands.brandType,
        logoUrl: brands.logoUrl,
      })
      .from(brands)
      .where(
        term === ""
          ? sql`true`
          : ilike(brands.name, sql`${`%${escapeLike(term)}%`} escape '\\'`),
      )
      .orderBy(
        sql`(lower(${brands.name}) = ${lowered}) desc`,
        sql`length(${brands.name}) asc`,
        sql`lower(${brands.name}) asc`,
        asc(brands.id),
      )
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      brandType: row.brandType ?? null,
      logoUrl: row.logoUrl ?? null,
    }));
  }
}

const requireLimit = (value: number): number => {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > BRAND_SEARCH_RESULT_CAP
  ) {
    throw new ValidationError(
      `limit must be an integer in [1, ${BRAND_SEARCH_RESULT_CAP}], got ${value}`,
    );
  }
  return value;
};
