/**
 * `referenceData` — A9 (migration plan §2.5).
 *
 * Reads §4's ten surviving reference tables (corrected by A3: catalog data
 * code never branches on, keyed on `value`) through `ReferenceDataActor(kind)`
 * — one activation per table, never a single actor for all ten (§1.5).
 *
 * A Relay connection, per §8.3 ("every list field is a Relay connection") —
 * enforced by `schema.test.ts`'s "no unbounded list field" check, which fails
 * any composite list that is not a connection's own `edges`. The actor itself
 * has no notion of paging (§2.5 specifies exactly `all()`/`byValue()`, and
 * every table is small and fully cached on activate — the largest, `country`,
 * is 197 rows), so paging happens here, in the resolver, over the actor's
 * already-in-memory result: `offsetPage` is the same helper a search actor
 * uses to page a capped, in-memory result set (§1.5).
 */
import type { ReferenceRow } from "@cellar-assistant/contracts";
import {
  offsetPage,
  ReferenceDataActorDescriptor,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";

/**
 * Maps friendly, GraphQL-conventional enum names onto the lowercase table
 * names `ReferenceDataActor` is keyed by — `REFERENCE_KINDS` in
 * `@cellar-assistant/contracts` is the source of truth for the ten values.
 */
export const ReferenceKindEnum = builder.enumType("ReferenceKind", {
  description:
    "Which of §4's ten reference tables to read (corrected by A3: catalog " +
    "data code never branches on, not the twelve compile-time enums).",
  values: {
    BEER_STYLE: { value: "beer_style" },
    COFFEE_CULTIVAR: { value: "coffee_cultivar" },
    COUNTRY: { value: "country" },
    SAKE_CATEGORY: { value: "sake_category" },
    SAKE_RICE_VARIETY: { value: "sake_rice_variety" },
    SAKE_TYPE: { value: "sake_type" },
    SPIRIT_TYPE: { value: "spirit_type" },
    TEA_CATEGORY: { value: "tea_category" },
    WINE_STYLE: { value: "wine_style" },
    WINE_VARIETY: { value: "wine_variety" },
  } as const,
});

export const ReferenceRowType = builder
  .objectRef<ReferenceRow>("ReferenceRow")
  .implement({
    description:
      "One row of a reference table — a value and its display comment.",
    fields: (t) => ({
      value: t.exposeString("value"),
      comment: t.exposeString("comment", { nullable: true }),
    }),
  });

/** One connection type, shared by every kind — matches `ItemConnection`'s
 * reasoning in `item.ts`: `t.connection` would otherwise mint a fresh
 * `<Parent><Field>Connection` per field for one structurally identical shape. */
export const ReferenceRowConnection = builder.connectionObject(
  { type: ReferenceRowType, name: "ReferenceRowConnection" },
  { name: "ReferenceRowEdge" },
);

builder.queryField("referenceData", (t) =>
  t.field({
    type: ReferenceRowConnection,
    description:
      "Every row of one of §4's ten reference tables, ordered by value. " +
      "`country` is the largest at 197 rows, so it takes two pages at the " +
      "100-row cap — ask for `first: 100` and follow `pageInfo.endCursor`.",
    /**
     * A7c (6). A form that fills ten dropdowns aliases this field ten times,
     * and without the union **one bad alias took the other nine down**: the
     * page cap raises a `ValidationError`, the field is `ReferenceRowConnection!`
     * so the null propagated to the root, and the response was `data: null`.
     * With the errors union the failure is a value in `data`, and the nine
     * good dropdowns still render.
     *
     * The companion half of this is in `src/index.ts` — the same error was
     * also being reported as `INTERNAL_SERVER_ERROR` with its message
     * stripped, for every root field that pages.
     */
    errors: {},
    args: {
      kind: t.arg({ type: ReferenceKindEnum, required: true }),
      ...t.arg.connectionArgs(),
    },
    resolve: async (_root, args, context) => {
      const rows = await context
        .actor(ReferenceDataActorDescriptor, args.kind)
        .all();
      return connectionFromPage(offsetPage(rows, toPageArgs(args)));
    },
  }),
);
