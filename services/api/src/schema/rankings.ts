/**
 * `Query.rankings` — C2's `RankingsActor`, given a door (A7f).
 *
 * `/rankings` is D7's page and, like `/map`, it had no field to call: C2 built
 * the actor, A7 had already written the schema skeleton, and nothing came back
 * to connect them.
 *
 * ## The reviewer set is an enum, and that is the security fix
 *
 * `target-stack.md` §7: *"the `item_scores` native query takes the reviewer
 * list from the client, so any user can compute rankings over any reviewer
 * set."* Today `src/components/ranking/fragments.ts` sends
 * `$reviewers: String!` as `{uuid, uuid, …}` and the native query aggregates
 * over whatever it is handed — so anyone could compute "what do these
 * particular five people think", over a social graph they are not allowed to
 * read.
 *
 * **The fix is that there is nothing to send.** `scope` is one of four values;
 * the ids behind it are resolved inside the actor from `ctx.viewerId` and the
 * viewer's own `friends` rows. There is deliberately **no argument here that
 * takes a user id, under any name, in any shape** — not a list, not a single
 * id, not an "on behalf of". A denied or empty scope returns nothing, rather
 * than widening to the global ranking the way an empty `{}` array does today.
 *
 * If a future field needs "rankings among this group", the group has to be a
 * server-resolvable *name* (a tier list, a cellar, a friend circle) that the
 * actor can check the viewer's membership of — never an array of uuids.
 *
 * ## Why an entry is two numbers and an item ref
 *
 * §2.2/Q4: ids for owned lists, projections for high-cardinality catalog
 * lists. The *ranking* is the projection worth returning whole; the item
 * behind each row is a ref Pothos dataloads through `ItemActor`, so a page of
 * 50 costs one batched round of entity calls and only if `item` is selected.
 * The old query inlined name, vintage, brand, images, favourite count and
 * "have I reviewed this" through six per-type fragments; none of that is
 * ranking data. `itemId`/`itemType` are the ref itself and cost nothing, so a
 * client that only needs a stable list key never triggers the loader.
 */
import type { RankingEntry } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  itemActorId,
  RANKING_SCOPES,
  RANKINGS_RESULT_CAP,
  RankingsActorDescriptor,
  rankingsActorId,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { ItemInterface, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";

/**
 * Who the average is taken over.
 *
 * These four values are exactly the four states the existing two-button toggle
 * group can be in, so nothing the UI can express is lost in becoming an enum.
 */
const RankingScopeEnum = builder.enumType("RankingScope", {
  description:
    "Whose reviews the average is taken over. **This is an enum and not a " +
    "list of user ids on purpose** (target-stack §7): the ids are resolved " +
    "inside the actor from the viewer's own session and friend rows, so a " +
    "client cannot aggregate over a social graph it may not read. `FRIENDS` " +
    "with no friends returns nothing — it does not fall back to `EVERYONE`.",
  values: Object.fromEntries(
    RANKING_SCOPES.map((scope) => [scope, { value: scope }]),
  ) as { [K in (typeof RANKING_SCOPES)[number]]: { value: K } },
});

const RankingEntryType = builder
  .objectRef<RankingEntry>("RankingEntry")
  .implement({
    description:
      "One ranked item: `AVG(score)` and `COUNT(*)` over `item_reviews` for " +
      "the chosen scope, plus a ref to the item itself.",
    fields: (t) => ({
      itemId: t.id({ resolve: (entry) => entry.item.id }),
      itemType: t.field({
        type: ItemTypeEnum,
        resolve: (entry) => entry.item.type,
      }),
      item: t.field({
        type: ItemInterface,
        description: "The full item. One batched loader call per page.",
        resolve: (entry) => itemActorId(entry.item),
      }),
      score: t.exposeFloat("score", {
        description: "`AVG(score)`. Half-star scale, 0.5–5.",
      }),
      reviewCount: t.exposeInt("reviewCount", {
        description: "`COUNT(*)` — the tiebreak, descending, after `score`.",
      }),
    }),
  });

const RankingsConnection = builder.connectionObject(
  { type: RankingEntryType, name: "RankingsConnection" },
  { name: "RankingsEdge" },
);

builder.queryField("rankings", (t) =>
  t.field({
    type: RankingsConnection,
    description:
      "Top-rated items (RankingsActor), replacing the `item_scores` native " +
      `query: top ${RANKINGS_RESULT_CAP} by average score then review count. ` +
      "Signed-in only, and always the viewer's own scope — there is no " +
      "argument naming reviewers.",
    // A7e — an error union, for the reason `pagination.ts` records.
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      scope: t.arg({
        type: RankingScopeEnum,
        required: true,
        description: "Defaults are the client's business; the server has none.",
      }),
      types: t.arg({
        type: [ItemTypeEnum],
        required: false,
        description: "Restrict to these item types. Omit or empty for all.",
      }),
    },
    resolve: async (_root, args, context) => {
      const viewerId = context.ctx.viewerId;
      // `rankingsActorId` takes a viewer id; an anonymous request has none.
      // The actor refuses this too (`ViewActorBase#requireViewerKey`).
      if (viewerId === null) {
        throw new ForbiddenError("sign in to read rankings");
      }
      const input = { scope: args.scope, types: args.types ?? null };
      return connectionFromPage(
        // Keyed by the viewer. Nothing in `args` can reach this call site.
        await context
          .actor(RankingsActorDescriptor, rankingsActorId(viewerId))
          .results(input, toPageArgs(args)),
      );
    },
  }),
);
