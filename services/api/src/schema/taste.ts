/**
 * L03 — the taste profile and friend agreement (`TasteActor`, keyed by the
 * viewer). Three reads, all signed-in only, none taking a viewer id: the
 * actor is addressed by the session's own id, so nothing in `args` can make
 * one viewer read another's profile.
 *
 * Agreement is a count ("7 of 9 shared"), never a percentage, and its
 * `agreed` is null below `AGREEMENT_MIN_SHARED` — the gate is the actor's,
 * not the client's.
 */
import type {
  TasteAgreementDto,
  TasteAgreementTypeDto,
  TasteArchetypeDto,
  TasteProfileDto,
  TasteStyleDto,
  TasteTypeCountDto,
} from "@cellar-assistant/contracts";
import {
  AGREEMENT_MIN_SHARED,
  ForbiddenError,
  TASTE_ARCHETYPE_KEYS,
  TasteActorDescriptor,
  tasteActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemTypeEnum } from "./item.ts";

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

const TasteTypeCountType = builder
  .objectRef<TasteTypeCountDto>("TasteTypeCount")
  .implement({
    fields: (t) => ({
      itemType: t.field({ type: ItemTypeEnum, resolve: (c) => c.type }),
      count: t.exposeInt("count", { description: "Distinct items rated." }),
    }),
  });

const TasteArchetypeType = builder
  .objectRef<TasteArchetypeDto>("TasteArchetype")
  .implement({
    fields: (t) => ({
      key: t.field({ type: TasteArchetypeKeyEnum, resolve: (a) => a.key }),
      title: t.exposeString("title"),
      loves: t.field({ type: [TasteStyleType], resolve: (a) => a.loves }),
      lessKeen: t.field({ type: [TasteStyleType], resolve: (a) => a.lessKeen }),
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
      types: t.field({ type: [TasteTypeCountType], resolve: (p) => p.types }),
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
      avatarUrl: t.string({ nullable: true, resolve: (a) => a.avatarUrl }),
      shared: t.exposeInt("shared"),
      agreed: t.int({ nullable: true, resolve: (a) => a.agreed }),
      byType: t.field({
        type: [TasteAgreementTypeType],
        resolve: (a) => a.byType,
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

builder.queryField("friendTasteAgreements", (t) =>
  t.field({
    type: [TasteAgreementType],
    description: "L03: agreement with each of your friends, most shared first.",
    errors: {},
    resolve: (_root, _args, context) =>
      tasteActor(context, "compare tastes").friendAgreements(),
  }),
);
