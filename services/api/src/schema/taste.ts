/**
 * L03 — the taste profile and friend agreement (`TasteActor`, keyed by the
 * viewer). Three reads, all signed-in only, none taking a viewer id: the
 * actor is addressed by the session's own id, so nothing in `args` can make
 * one viewer read another's profile.
 *
 * Agreement is a count ("7 of 9 shared"), never a percentage, and its
 * `agreed` is null below `AGREEMENT_MIN_SHARED` — the gate is the actor's,
 * not the client's.
 *
 * `tasteCompare` (MC-compare) is the side-by-side rows behind that count: one
 * per item you and a friend both rated. Its rows are a connection on a
 * `TasteCompare` object rather than a list at the root: §1.5 allows a list of
 * objects only as a connection's edges, and the root's paging fields are a
 * counted set (schema.test.ts, A7e), the same reason `friends` sits on the
 * profile.
 */
import type {
  TasteAgreementDto,
  TasteAgreementTypeDto,
  TasteArchetypeDto,
  TasteCompareRowDto,
  TasteProfileDto,
  TasteStyleDto,
  TasteTypeCountDto,
} from "@cellar-assistant/contracts";
import {
  AGREEMENT_MIN_SHARED,
  ForbiddenError,
  itemActorId,
  offsetPage,
  TASTE_ARCHETYPE_KEYS,
  TasteActorDescriptor,
  tasteActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemInterface, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { avatarUrlForUser } from "./user.ts";

// §1.5 has no exception for a list the server knows is short: each list
// here is a connection, paged in memory over the actor's bounded answer.

const TasteArchetypeKeyEnum = builder.enumType("TasteArchetypeKey", {
  description:
    "Which deterministic rule named the archetype (decisions.md, " +
    '"Taste profile and friend agreement").',
  values: Object.fromEntries(
    TASTE_ARCHETYPE_KEYS.map((key) => [key, { value: key }]),
  ) as { [K in (typeof TASTE_ARCHETYPE_KEYS)[number]]: { value: K } },
});

const TasteStyleType = builder
  .objectRef<TasteStyleDto>("TasteStyle")
  .implement({
    description: "A style you have rated at least twice.",
    fields: (t) => ({
      itemType: t.field({ type: ItemTypeEnum, resolve: (s) => s.type }),
      label: t.exposeString("label", {
        description: "The style value as stored: a variety, a beer style, …",
      }),
      count: t.exposeInt("count"),
      average: t.exposeFloat("average", { description: "Half-star scale." }),
    }),
  });

const TasteStyleConnection = builder.connectionObject(
  { type: TasteStyleType, name: "TasteStyleConnection" },
  { name: "TasteStyleEdge" },
);

const TasteTypeCountType = builder
  .objectRef<TasteTypeCountDto>("TasteTypeCount")
  .implement({
    fields: (t) => ({
      itemType: t.field({ type: ItemTypeEnum, resolve: (c) => c.type }),
      count: t.exposeInt("count", { description: "Distinct items rated." }),
    }),
  });

const TasteTypeCountConnection = builder.connectionObject(
  { type: TasteTypeCountType, name: "TasteTypeCountConnection" },
  { name: "TasteTypeCountEdge" },
);

const TasteArchetypeType = builder
  .objectRef<TasteArchetypeDto>("TasteArchetype")
  .implement({
    fields: (t) => ({
      key: t.field({ type: TasteArchetypeKeyEnum, resolve: (a) => a.key }),
      title: t.exposeString("title"),
      loves: t.field({
        type: TasteStyleConnection,
        description: "At or above your mean, best first; at most four.",
        args: t.arg.connectionArgs(),
        resolve: (a, args) =>
          connectionFromPage(offsetPage(a.loves, toPageArgs(args))),
      }),
      lessKeen: t.field({
        type: TasteStyleConnection,
        description: "Below your mean, lowest first; at most two.",
        args: t.arg.connectionArgs(),
        resolve: (a, args) =>
          connectionFromPage(offsetPage(a.lessKeen, toPageArgs(args))),
      }),
    }),
  });

const TasteProfileType = builder
  .objectRef<TasteProfileDto>("TasteProfile")
  .implement({
    description:
      "Your cross-type archetype from your own ratings. Deterministic; a " +
      "model may only phrase `line`, and `linePhrasedByAi` says when it did.",
    fields: (t) => ({
      ratingCount: t.exposeInt("ratingCount"),
      types: t.field({
        type: TasteTypeCountConnection,
        description: "One row per item type you have rated, most first.",
        args: t.arg.connectionArgs(),
        resolve: (p, args) =>
          connectionFromPage(offsetPage(p.types, toPageArgs(args))),
      }),
      archetype: t.field({
        type: TasteArchetypeType,
        nullable: true,
        description: "Null while the data is too thin to name one.",
        resolve: (p) => p.archetype,
      }),
      line: t.exposeString("line"),
      linePhrasedByAi: t.exposeBoolean("linePhrasedByAi"),
    }),
  });

const TasteAgreementTypeType = builder
  .objectRef<TasteAgreementTypeDto>("TasteAgreementByType")
  .implement({
    fields: (t) => ({
      itemType: t.field({ type: ItemTypeEnum, resolve: (r) => r.type }),
      shared: t.exposeInt("shared"),
      agreed: t.int({ nullable: true, resolve: (r) => r.agreed }),
    }),
  });

const TasteAgreementByTypeConnection = builder.connectionObject(
  { type: TasteAgreementTypeType, name: "TasteAgreementByTypeConnection" },
  { name: "TasteAgreementByTypeEdge" },
);

const TasteAgreementType = builder
  .objectRef<TasteAgreementDto>("TasteAgreement")
  .implement({
    description:
      "Items you and this user both rated, counting only ratings you may " +
      `see, and how many of them you agree on. \`agreed\` is null below ` +
      `${AGREEMENT_MIN_SHARED} shared items. Never a percentage.`,
    fields: (t) => ({
      userId: t.exposeID("userId"),
      name: t.exposeString("name"),
      // MC-avatar: through the one avatar helper, so an uploaded picture
      // wins here too; the actor's `user.image` is the fallback.
      avatarUrl: t.string({
        nullable: true,
        resolve: (a, _args, context) =>
          avatarUrlForUser(context, a.userId, a.avatarUrl),
      }),
      shared: t.exposeInt("shared"),
      agreed: t.int({ nullable: true, resolve: (a) => a.agreed }),
      byType: t.field({
        type: TasteAgreementByTypeConnection,
        description: "Empty below the gate.",
        args: t.arg.connectionArgs(),
        resolve: (a, args) =>
          connectionFromPage(offsetPage(a.byType, toPageArgs(args))),
      }),
    }),
  });

const tasteActor = (context: ApiContext, what: string) => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return context.actor(TasteActorDescriptor, tasteActorId(viewerId));
};

builder.queryField("tasteProfile", (t) =>
  t.field({
    type: TasteProfileType,
    description: "L03: the viewer's own taste profile.",
    errors: {},
    resolve: (_root, _args, context) =>
      tasteActor(context, "see your taste profile").profile(),
  }),
);

builder.queryField("tasteAgreement", (t) =>
  t.field({
    type: TasteAgreementType,
    description:
      "L03: agreement with one user. A malformed id, a missing user and " +
      "one you may not see answer alike (NotFound).",
    errors: {},
    args: { userId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      tasteActor(context, "compare tastes").agreement(String(args.userId)),
  }),
);

const TasteAgreementConnection = builder.connectionObject(
  { type: TasteAgreementType, name: "TasteAgreementConnection" },
  { name: "TasteAgreementEdge" },
);

// On the profile rather than at the root: the page reads both at once, and
// the root's paging fields are a counted set (schema.test.ts, A7e). Its own
// error union keeps a failure here from nulling the archetype above it.
builder.objectField(TasteProfileType, "friends", (t) =>
  t.field({
    type: TasteAgreementConnection,
    description:
      "L03: agreement with each of your friends, most shared first. Counts " +
      "only ratings you may see.",
    args: t.arg.connectionArgs(),
    errors: {},
    resolve: async (_profile, args, context) =>
      connectionFromPage(
        offsetPage(
          await tasteActor(context, "compare tastes").friendAgreements(),
          toPageArgs(args),
        ),
      ),
  }),
);

const TasteCompareRowType = builder
  .objectRef<TasteCompareRowDto>("TasteCompareRow")
  .implement({
    description:
      "MC-compare: one item you and a friend both rated, on the half-star " +
      "scale, as you may see the ratings.",
    fields: (t) => ({
      item: t.field({
        type: ItemInterface,
        description: "Through the item DataLoader (§1.5).",
        resolve: (row) => itemActorId(row.item),
      }),
      myScore: t.exposeFloat("myScore"),
      theirScore: t.exposeFloat("theirScore"),
    }),
  });

const TasteCompareRowConnection = builder.connectionObject(
  { type: TasteCompareRowType, name: "TasteCompareRowConnection" },
  { name: "TasteCompareRowEdge" },
);

type CompareRows = readonly TasteCompareRowDto[];

const TasteCompareType = builder
  .objectRef<CompareRows>("TasteCompare")
  .implement({
    description:
      "MC-compare: you and one friend, item by item. Empty for anyone who is " +
      `not your friend, and below ${AGREEMENT_MIN_SHARED} shared items.`,
    fields: (t) => ({
      rows: t.field({
        type: TasteCompareRowConnection,
        description:
          "Biggest difference between the two scores first, then by name.",
        args: t.arg.connectionArgs(),
        resolve: (rows, args) =>
          connectionFromPage(offsetPage(rows, toPageArgs(args))),
      }),
    }),
  });

builder.queryField("tasteCompare", (t) =>
  t.field({
    type: TasteCompareType,
    description:
      "MC-compare / L11: the items you and this friend both rated. A " +
      "non-friend, a missing user and a malformed id answer alike (no rows).",
    errors: {},
    args: {
      userId: t.arg.id({ required: true }),
      itemType: t.arg({
        type: ItemTypeEnum,
        required: false,
        description: "A kind chip: only this type's rows.",
      }),
    },
    resolve: (_root, args, context) =>
      tasteActor(context, "compare tastes").compare({
        userId: String(args.userId),
        itemType: args.itemType ?? null,
      }),
  }),
);
