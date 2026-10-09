/**
 * The drink log (X02, decisions D5 and D8) — `CheckInActor`'s surface.
 *
 * One rating per item (the review, `upsertReview`) plus **many logs**. A log is
 * an `ItemCheckIn` — declared in `item.ts`, because `Item.checkIns` returns it
 * — and this module adds what it links to (its place and photo) and the four
 * operations on it:
 *
 * - `logDrink` — "I had this": an item, optionally the bottle it was poured
 *   from, and an optional score (half stars, never the review), note, flavour
 *   tags, place, photo and companions. The client mints the id, which makes a
 *   retry after a dropped response the same log (§8.4) and is what Undo
 *   removes.
 * - `updateDrinkLog` / `deleteDrinkLog` — your own entry; deleting the one
 *   you logged for a table removes the companions' rows you wrote with it,
 *   except those a companion has since made their own (`canRemoveCheckIn`).
 * - `setDrinkLogCompanions` — who else was there, after the fact (X03).
 * - `restoreDrinkLog` — Undo of `deleteDrinkLog`: the same rows, ids and
 *   dates, for an hour, to whoever removed them (X03).
 * - `suggestFlavourTags` — a typed note → flavour words the drinker may tap.
 *   An abstaining model seam (`services/actors/src/lib/ai/seams.ts`,
 *   `providerFlavourTags`): it returns only words the note itself contains,
 *   and nothing is applied until the person confirms a chip.
 *
 * Visibility is the actor's (`canSeeCheckIn`), and a log you may not see is
 * `NotFoundError` — the same answer as one that does not exist.
 */
import { randomUUID } from "node:crypto";
import type {
  FlavourTagSuggestionDto,
  ItemCheckInDto,
  ItemType,
  LogDrinkInput as LogDrinkInputType,
  LoggedDrinkDto,
  RemovedCheckIns,
  RestoredCheckIns,
  UpdateDrinkLogInput as UpdateDrinkLogInputType,
} from "@cellar-assistant/contracts";
import {
  CheckInActorDescriptor,
  FileActorDescriptor,
  offsetPage,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { FileType } from "./file.ts";
import { ItemCheckInType, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { type PatchPolicy, patch, present } from "./patch.ts";
import { PlaceStubType } from "./tier-list.ts";

/* -------------------------------------------------------------------------- */
/* What a log links to                                                         */
/* -------------------------------------------------------------------------- */

builder.objectFields(ItemCheckInType, (t) => ({
  place: t.field({
    type: PlaceStubType,
    nullable: true,
    description: "Where it was drunk, when the drinker said.",
    resolve: (checkIn) =>
      checkIn.placeId === null ? null : { id: checkIn.placeId },
  }),
  photo: t.field({
    type: FileType,
    nullable: true,
    description:
      "The drinker's photo of it. Readable by whoever may see the log " +
      "(`FileActor` derives that from the log). Select `photo { url }` only " +
      "where you draw it — one presign per photo.",
    resolve: (checkIn, _args, context) =>
      checkIn.photoFileId === null
        ? null
        : context.actor(FileActorDescriptor, checkIn.photoFileId).get(),
  }),
}));

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

const LogItemRefInput = builder.inputType("DrinkLogItemInput", {
  description: "What was drunk: which item table, and which row.",
  fields: (t) => ({
    type: t.field({ type: ItemTypeEnum, required: true }),
    id: t.id({ required: true }),
  }),
});

const DrinkLogBottleInput = builder.inputType("DrinkLogBottleInput", {
  description:
    "The cellar bottle it was poured from. The cellar must be visible to " +
    "you; the item is read off the bottle.",
  fields: (t) => ({
    cellarId: t.id({ required: true }),
    cellarItemId: t.id({ required: true }),
  }),
});

const LogDrinkInput = builder.inputType("LogDrinkInput", {
  description:
    "A drink you had. `item` or `bottle` (or both, agreeing). Everything else " +
    "is optional; a score here is this glass's, not the item's review.",
  fields: (t) => ({
    item: t.field({ type: LogItemRefInput, required: false }),
    bottle: t.field({ type: DrinkLogBottleInput, required: false }),
    score: t.float({
      required: false,
      description: "Half stars, 0.5 to 5.",
    }),
    note: t.string({ required: false, description: "Up to 2000 characters." }),
    tags: t.stringList({
      required: false,
      description:
        "Flavour words you confirmed — at most 12, each 32 characters or " +
        "less; stored lower case.",
    }),
    placeId: t.id({ required: false }),
    photoFileId: t.id({
      required: false,
      description: "A verified upload of your own (`createUploadTarget`).",
    }),
    companionIds: t.idList({
      required: false,
      description:
        "Friends who drank it with you. Each gets an entry of their own, " +
        "about them; one who is not your friend rejects the call.",
    }),
    includeSelf: t.boolean({
      required: false,
      description:
        "Defaults to true. False logs a round for your companions only, " +
        "and then takes no score, note, tags or photo.",
    }),
    drankAt: t.field({
      type: "DateTime",
      required: false,
      description:
        "When it was drunk — backdating a log. Defaults to now; no later " +
        "than now (plus a few minutes of clock skew), no earlier than 1900. " +
        "It is the entry's `createdAt`.",
    }),
  }),
});

const UpdateDrinkLogInput = builder.inputType("UpdateDrinkLogInput", {
  description:
    "Only the fields you pass are written; `null` clears one (`tags: []` " +
    "clears the tags).",
  fields: (t) => ({
    score: t.float({ required: false }),
    note: t.string({ required: false }),
    tags: t.stringList({ required: false }),
    placeId: t.id({ required: false }),
    photoFileId: t.id({ required: false }),
    drankAt: t.field({
      type: "DateTime",
      required: false,
      description:
        "Re-date the drink. On the entry you logged for a table it moves the " +
        "companions' entries you wrote with it too, except any a friend has " +
        "made their own. Cannot be cleared.",
    }),
  }),
});

const UPDATE_DRINK_LOG = {
  score: "clearable",
  note: "clearable",
  tags: { policy: "clearable", map: (tags) => tags.map(String) },
  placeId: { policy: "clearable", map: String },
  photoFileId: { policy: "clearable", map: String },
  drankAt: { policy: "reject", map: String },
} satisfies PatchPolicy<typeof UpdateDrinkLogInput.$inferInput>;

const toLogInput = (
  input: typeof LogDrinkInput.$inferInput,
): LogDrinkInputType => ({
  ...(present(input.item)
    ? {
        item: {
          type: input.item.type as ItemType,
          id: String(input.item.id),
        },
      }
    : {}),
  ...(present(input.bottle)
    ? {
        bottle: {
          cellarId: String(input.bottle.cellarId),
          cellarItemId: String(input.bottle.cellarItemId),
        },
      }
    : {}),
  ...(present(input.score) ? { score: input.score } : {}),
  ...(present(input.note) ? { note: input.note } : {}),
  ...(present(input.tags) ? { tags: input.tags.map(String) } : {}),
  ...(present(input.placeId) ? { placeId: String(input.placeId) } : {}),
  ...(present(input.photoFileId)
    ? { photoFileId: String(input.photoFileId) }
    : {}),
  ...(present(input.companionIds)
    ? { companionIds: input.companionIds.map(String) }
    : {}),
  ...(present(input.includeSelf) ? { includeSelf: input.includeSelf } : {}),
  ...(present(input.drankAt) ? { drankAt: String(input.drankAt) } : {}),
});

/* -------------------------------------------------------------------------- */
/* Payloads                                                                    */
/* -------------------------------------------------------------------------- */

const LoggedDrinkPayload = builder
  .objectRef<LoggedDrinkDto>("LoggedDrinkPayload")
  .implement({
    description: "What `logDrink` wrote.",
    fields: (t) => ({
      entry: t.field({
        type: ItemCheckInType,
        description:
          "Your entry — or, for a round you logged for friends, the first of theirs.",
        resolve: (logged) => logged.entry,
      }),
      drinkerCount: t.int({
        description: "How many entries were written: one per drinker.",
        resolve: (logged) => logged.rows.length,
      }),
      entryIds: t.idList({
        description: "Every entry written, `entry` first.",
        resolve: (logged) => logged.rows.map((row) => row.id),
      }),
    }),
  });

const DeletedDrinkLogPayload = builder
  .objectRef<RemovedCheckIns>("DeletedDrinkLogPayload")
  .implement({
    fields: (t) => ({
      ids: t.exposeIDList("ids", {
        description:
          "Every entry removed — the one you named first, then the companion " +
          "entries you wrote with it that their drinkers had not added to.",
      }),
    }),
  });

const RestoredDrinkLogPayload = builder
  .objectRef<RestoredCheckIns>("RestoredDrinkLogPayload")
  .implement({
    description: "What `restoreDrinkLog` put back.",
    fields: (t) => ({
      ids: t.exposeIDList("ids", {
        description:
          "Every entry restored, with the ids it had — the one you named first.",
      }),
      entry: t.field({
        type: ItemCheckInType,
        description: "The entry you named, as it is again.",
        resolve: (restored) => restored.entry,
      }),
    }),
  });

type Suggestion = FlavourTagSuggestionDto["tags"][number];

const FlavourTagSuggestionType = builder
  .objectRef<Suggestion>("FlavourTagSuggestion")
  .implement({
    description:
      "A flavour word lifted from your note. A suggestion: nothing is " +
      "applied until you confirm it.",
    fields: (t) => ({
      tag: t.exposeString("tag"),
      evidence: t.exposeString("evidence", {
        description: "The words in your note it was read from, verbatim.",
      }),
    }),
  });

const FlavourTagSuggestionConnection = builder.connectionObject(
  { type: FlavourTagSuggestionType, name: "FlavourTagSuggestionConnection" },
  { name: "FlavourTagSuggestionEdge" },
);

const FlavourTagSuggestionsPayload = builder
  .objectRef<FlavourTagSuggestionDto>("FlavourTagSuggestionsPayload")
  .implement({
    description:
      'The model\'s answer to "which flavours does this note name?". ' +
      "`abstained` is a real answer — the note names none — not a failure.",
    fields: (t) => ({
      abstained: t.exposeBoolean("abstained"),
      suggestions: t.field({
        type: FlavourTagSuggestionConnection,
        args: t.arg.connectionArgs(),
        resolve: (answer, args) =>
          connectionFromPage(offsetPage(answer.tags, toPageArgs(args))),
      }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

builder.mutationField("logDrink", (t) =>
  t.field({
    type: LoggedDrinkPayload,
    description:
      "Log a drink — with or without a bottle (X02). Your score here never " +
      "changes your review of the item.",
    errors: {},
    args: {
      id: t.arg.id({
        required: false,
        description:
          "Mint it yourself: a retry with the same id is the same log (§8.4), " +
          "and it is what `deleteDrinkLog` takes to undo it.",
      }),
      input: t.arg({ type: LogDrinkInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          CheckInActorDescriptor,
          present(args.id) ? String(args.id) : randomUUID(),
        )
        .log(toLogInput(args.input)),
  }),
);

builder.mutationField("updateDrinkLog", (t) =>
  t.field({
    type: ItemCheckInType,
    description: "Change your own entry. Only the drinker may.",
    errors: {},
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateDrinkLogInput, required: true }),
    },
    resolve: (_root, args, context): Promise<ItemCheckInDto> =>
      context
        .actor(CheckInActorDescriptor, String(args.id))
        .update(
          patch(args.input, UPDATE_DRINK_LOG) satisfies UpdateDrinkLogInputType,
        ),
  }),
);

builder.mutationField("deleteDrinkLog", (t) =>
  t.field({
    type: DeletedDrinkLogPayload,
    description:
      "Remove an entry about you, or one you wrote that its drinker has not " +
      "added to. Removing the entry you logged for a table removes the " +
      "companions' entries you wrote with it (Undo) — except any a friend " +
      "has since scored, noted, tagged or photographed, which are theirs.",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(CheckInActorDescriptor, String(args.id)).remove(),
  }),
);

builder.mutationField("setDrinkLogCompanions", (t) =>
  t.field({
    type: ItemCheckInType,
    description:
      "Who else was there, after the fact: the complete set of friends who " +
      "drank with you (not a change list). Only on your own entry of a drink " +
      "you logged. A friend added gets an entry of their own in the same " +
      "occasion; one left out loses the entry you wrote for them — unless " +
      "they have added to it, which is a `ConflictError`.",
    errors: {},
    args: {
      id: t.arg.id({ required: true }),
      companionIds: t.arg.idList({ required: true }),
    },
    resolve: (_root, args, context): Promise<ItemCheckInDto> =>
      context
        .actor(CheckInActorDescriptor, String(args.id))
        .setCompanions({ companionIds: args.companionIds.map(String) }),
  }),
);

builder.mutationField("restoreDrinkLog", (t) =>
  t.field({
    type: RestoredDrinkLogPayload,
    description:
      "Undo `deleteDrinkLog`: the entries it removed come back with their " +
      "own ids and dates. Only for whoever removed them, within an hour. " +
      "A bottle, place or photo that has gone since comes back as none; a " +
      "companion who is no longer your friend does not come back.",
    errors: {},
    args: {
      id: t.arg.id({
        required: true,
        description: "The id `deleteDrinkLog` was called with.",
      }),
    },
    resolve: (_root, args, context) =>
      context.actor(CheckInActorDescriptor, String(args.id)).restore(),
  }),
);

builder.mutationField("suggestFlavourTags", (t) =>
  t.field({
    type: FlavourTagSuggestionsPayload,
    description:
      "Flavour words from a typed note, for the drinker to confirm. Returns " +
      "only words the note contains; abstains when it names no flavour. " +
      "Writes nothing. A model call (`ai_model/flavour_tags`).",
    errors: {},
    args: {
      logId: t.arg.id({
        required: true,
        description: "The id the log sheet minted for `logDrink`.",
      }),
      note: t.arg.string({ required: true }),
      itemType: t.arg({ type: ItemTypeEnum, required: true }),
      existing: t.arg.stringList({
        required: false,
        description: "Tags already chosen; never suggested again.",
      }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(CheckInActorDescriptor, String(args.logId))
        .suggestFlavourTags({
          note: args.note,
          itemType: args.itemType,
          existing: args.existing ?? [],
        }),
  }),
);
