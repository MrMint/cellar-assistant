/**
 * `ItemOnboardingActor` (migration plan §2.1, §3, §8.5) — B2.
 *
 * > **`ItemOnboardingActor(onboardingId)`**
 * > - Owns: `item_onboardings`.
 * > - Methods: `start(type, images)` (AI label/barcode extraction — replaces
 * >   the six `*_defaults` actions and `getItemDefaults`; the AI call runs in
 * >   this actor's turn, which blocks only this onboarding), `defaults`,
 * >   `confirm(itemInput)` → `ItemActor.create` + `BarcodeActor.ensure` +
 * >   `BrandRegistryActor.resolve` + `CellarActor.addItem`, as idempotent
 * >   calls, `reprocess` (system, called by `OnboardingReprocessJobActor`).
 * > - Visibility: owner only.
 *
 * ## Why this actor exists at all
 *
 * It is the answer to a §8.5 problem, not a modelling one. Dapr is turn-based:
 * one turn at a time per actor id. A multi-second vision call inside
 * `UserActor` or `ItemActor` would stall every other operation for that id —
 * §2.1 says so explicitly under `UserActor` ("No AI or external call runs
 * inside a `UserActor` turn … Onboarding therefore has its own actor"). Giving
 * onboarding its own key means the only thing that queues behind a 30-second
 * model call is the one onboarding it belongs to.
 *
 * `start` is one of §8.5's two sanctioned request-driven long operations (the
 * other is `PlaceCreationActor`); set the API's actor-invocation timeout to
 * 120s for it and accept the wait.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ReadTarget } from "./files.ts";
import type { ItemRef, ItemType } from "./items.ts";

/**
 * `item_onboardings.status` — plain `text` with no check constraint, so this
 * list is a convention rather than an enforced domain. `START` is the column
 * default and `COMPLETED` is what `getItemDefaults` writes today; `CONFIRMED`
 * and `FAILED` are B2's additions, for the two states the old flow had nowhere
 * to record.
 *
 * `MATCHED` (N02/N19 follow-up): the person filed a bottle of an item the
 * catalogue already held — the 15 s quick-add or "Is it this one? +1
 * bottle" — so the session closed without creating anything. Distinct from
 * `CONFIRMED`, which means *this* onboarding created an item (and which
 * `confirm` short-circuits on, answering with this session's derived item
 * id); without it, every quick-add left a `COMPLETED` row behind that looked
 * exactly like a session someone walked away from.
 */
export const ONBOARDING_STATUSES = [
  "START",
  "COMPLETED",
  "CONFIRMED",
  "FAILED",
  "MATCHED",
  // SV-B (L6, FR-1): a draft the person set aside with "Finish later", floor
  // met or not — a bottle that is not a cellar item yet, counted on the cellar
  // it is aimed at. `confirm` from here follows the normal path.
  "NEEDS_DETAILS",
  // H-133 (F-65): a draft its owner deleted (`discardDraft`). Nothing was
  // created from it, and no draft list or count reads it again: they all read
  // `NEEDS_DETAILS`. Kept as a row rather than deleted, like every other
  // closed status, so a late `confirm` from another tab is refused rather
  // than recreating the session.
  "DISCARDED",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const isOnboardingStatus = (value: string): value is OnboardingStatus =>
  (ONBOARDING_STATUSES as readonly string[]).includes(value);

/**
 * SV-B · MC-drafts: the person's answer to "which vintage?", kept apart from
 * the year itself. `NON_VINTAGE` is an answer ("No vintage"); `UNANSWERED` is
 * the absence of one — the two read the same in `wines.vintage` (NULL) once
 * an item exists, which is why a draft has to hold the difference.
 */
export const VINTAGE_ANSWERS = [
  "VINTAGE",
  "NON_VINTAGE",
  "UNANSWERED",
] as const;
export type VintageAnswer = (typeof VINTAGE_ANSWERS)[number];

export const isVintageAnswer = (value: unknown): value is VintageAnswer =>
  typeof value === "string" &&
  (VINTAGE_ANSWERS as readonly string[]).includes(value);

/** At most this many names in `confirmedFields`, each at most 64 characters. */
export const CONFIRMED_FIELDS_MAX = 64;

/**
 * One `item_onboardings` row.
 *
 * `defaults` is the `jsonb` column: the AI's proposal, whose per-type shape is
 * owned by the model prompt rather than by this contract, so it crosses the
 * wire as a JSON string exactly as `item_reviews.text` does.
 */
export type ItemOnboardingDto = {
  readonly id: string;
  readonly userId: string;
  readonly status: OnboardingStatus;
  readonly itemType: ItemType;
  readonly barcode: string | null;
  readonly barcodeType: string | null;
  readonly frontLabelImageId: string | null;
  readonly backLabelImageId: string | null;
  /** JSON, or `null` before `start` has run. */
  readonly defaults: string | null;
  /** The model's raw text, kept for debugging a bad extraction. */
  readonly rawDefaults: string | null;
  /**
   * F-77: the kind of drink the label read says the photographed label is
   * for, or `null` when it named none (or no read has run). When it differs
   * from `itemType`, `defaults` is empty — the label was read against the
   * wrong kind's vocabulary — and the client can start a read as this kind,
   * so the kind is picked after the shot rather than before it. Read from the
   * stored completion (`raw_defaults`'s `labelItemType`), its one record.
   */
  readonly detectedItemType: ItemType | null;
  readonly aiModel: string | null;
  readonly confidence: number | null;
  readonly lastReprocessResult: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** SV-B: the cellar a saved draft is aimed at; `null` for none. */
  readonly cellarId: string | null;
  /** SV-B: the guessed fields the person accepted or edited. */
  readonly confirmedFields: readonly string[];
  readonly vintageAnswer: VintageAnswer;
  /** SV-B: what a "Needs details" row shows — the draft's name. */
  readonly displayName: string | null;
  /** SV-B: the draft's maker (its brand name). */
  readonly displayMaker: string | null;
  /** SV-B: the draft's picture, a `files.id` — its front label. */
  readonly imageId: string | null;
  /** SV-B: the saved draft's fields, JSON (`SaveDraftFields`); `null` unsaved. */
  readonly draftFields: string | null;
};

/**
 * X05 · what the photographed text is printed on, as the label read itself
 * says (`itemDefaultsSchema`'s `surfaceKind`). Answered in the same
 * completion as the verdict — never a separate classifier call (D25) — and
 * consulted only when the verdict is "no label": a `menu` then becomes the
 * `LOOKS_LIKE_MENU` refusal, so the client can offer to scan it as a menu.
 */
export const LABEL_SURFACE_KINDS = ["label", "menu", "other"] as const;
export type LabelSurfaceKind = (typeof LABEL_SURFACE_KINDS)[number];

/**
 * X05 · how sure the read is of one field, in words (design §3.8: "Sure ·
 * Likely · Check this", never a percentage). The model answers them in
 * `defaults.fieldConfidence`, declared *after* the values in the schema so
 * each judgement is made about a value already written.
 */
export const FIELD_CONFIDENCES = ["sure", "likely", "check"] as const;
export type FieldConfidence = (typeof FIELD_CONFIDENCES)[number];

/** Where `defaults` carries the per-field confidences. */
export const FIELD_CONFIDENCE_KEY = "fieldConfidence";

/**
 * `defaults.fieldConfidence`, kept to what it may hold: a flat map from a
 * field the read proposed (`name`, `brandName`, `country`, or a per-type
 * attribute key such as `vintage`) to one of {@link FIELD_CONFIDENCES}.
 * Anything else — a number, an unknown word, a nested object — is dropped,
 * not coerced: an invented "92%" must never reach the form as a confidence.
 */
export const sanitiseFieldConfidence = (
  value: unknown,
): Record<string, FieldConfidence> => {
  const out: Record<string, FieldConfidence> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return out;
  }
  for (const [key, level] of Object.entries(value)) {
    if (
      typeof level === "string" &&
      (FIELD_CONFIDENCES as readonly string[]).includes(level)
    ) {
      out[key] = level as FieldConfidence;
    }
  }
  return out;
};

export type StartOnboardingInput = {
  readonly itemType: ItemType;
  /** `files.id`, both optional — a barcode-only onboarding has neither. */
  readonly frontLabelImageId?: string | null;
  readonly backLabelImageId?: string | null;
  readonly barcode?: string | null;
  readonly barcodeType?: string | null;
};

/** What the AI seam returns; the actor persists it and never interprets it. */
export type ItemDefaults = {
  /** The proposed item fields, as JSON. Per-type shape owned by the prompt. */
  readonly defaults: Record<string, unknown>;
  readonly raw: string;
  readonly model: string;
  /** 0–1. Drives whether the client pre-fills or merely suggests. */
  readonly confidence: number;
  /** A brand name for `BrandRegistryActor.resolve`, if the label showed one. */
  readonly brandName?: string | null;
};

/**
 * `confirm`'s argument: the fields the user accepted, plus where the bottle
 * goes.
 *
 * Everything here is idempotent downstream, which is the whole design: the
 * `itemId` addresses `ItemActor(type:itemId)`, `BarcodeActor.ensure` is
 * find-or-create on a primary key, `BrandRegistryActor.resolve` is
 * find-or-create on `lower(name)`, and `CellarActor.addItem` keys on
 * `cellarItemId ?? idempotencyKey(ctx, …) ?? randomUUID()` (B1). So a
 * re-delivered `confirm` produces one item, one brand and one cellar item.
 */
export type ConfirmOnboardingInput = {
  /**
   * Mint it client-side. This is the idempotency key for the whole cascade —
   * without it a redelivery would create a second item.
   */
  readonly itemId?: string | null;
  readonly name: string;
  readonly description?: string | null;
  readonly country?: string | null;
  /** Per-type attributes, same bags `CreateItemInput` carries. */
  readonly attributes?: Record<string, unknown> | null;
  /** Resolved through `BrandRegistryActor`, never written directly. */
  readonly brandName?: string | null;
  /** Add the item to this cellar too (`CellarActor.addItem`). */
  readonly cellarId?: string | null;
  /** Mint it to make the cellar half idempotent as well (§8.4). */
  readonly cellarItemId?: string | null;
  /**
   * SV-B: the guessed fields the person accepted or edited, so the item's
   * `unconfirmedFields` can name the ones they never touched. Absent keeps
   * what a saved draft recorded.
   */
  readonly confirmedFields?: readonly string[] | null;
};

/**
 * SV-B · MC-drafts: what a saved draft holds — `ConfirmOnboardingInput`'s item
 * fields, any of them missing. Stored as given (after shape checks) in
 * `item_onboardings.draft_fields`.
 */
export type SaveDraftFields = {
  readonly name?: string | null;
  readonly description?: string | null;
  readonly country?: string | null;
  readonly brandName?: string | null;
  readonly attributes?: Record<string, unknown> | null;
};

/**
 * SV-B · MC-drafts: `saveDraft`'s argument. Nothing outside the shape checks
 * blocks saving, and every saved draft becomes `NEEDS_DETAILS` (FR-1), listed
 * until `confirm` — floor met or not, since a beer's floor is just a name.
 */
export type SaveDraftInput = {
  /** The cellar it is aimed at; the owner must be able to write it. */
  readonly cellarId?: string | null;
  readonly fields: SaveDraftFields;
  readonly confirmedFields: readonly string[];
  readonly vintageAnswer: VintageAnswer;
};

export type ConfirmOnboardingResult = {
  readonly onboardingId: string;
  readonly item: ItemRef;
  readonly brandId: string | null;
  readonly cellarItemId: string | null;
  readonly barcode: string | null;
};

/**
 * X19 — "Re-read label": what `ItemOnboardingActor.rereadLabel` returns. The
 * same reading `start` makes, of the same stored photographs, **not stored**:
 * the session that created the item keeps its original `defaults`, and nothing
 * here is written to the item. The edit form offers each value as a chip the
 * creator taps; Save is the only write.
 */
export type ItemLabelReading = {
  /** JSON, the shape `ItemOnboardingDto.defaults` has. */
  readonly defaults: string;
  readonly brandName: string | null;
  /** 0–1, the model's own. */
  readonly confidence: number;
  readonly model: string;
};

export type RereadLabelInput = {
  /** The item being corrected; its onboarding must be this actor's key. */
  readonly item: ItemRef;
};

/**
 * F-75 — the fields the item's creator accepted on its edit page, which
 * `Item.unconfirmedFields` then stops pointing at. Added to the session's
 * `confirmedFields`; nothing is ever un-confirmed.
 */
export type ConfirmItemFieldsInput = {
  /** The item edited; its onboarding must be this actor's key. */
  readonly item: ItemRef;
  readonly fields: readonly string[];
};

/**
 * X19 — the text-only pass's question: the item as the edit form holds it
 * now (the name may have just been corrected), and which details are empty.
 */
export type SuggestItemDetailsInput = {
  readonly item: ItemRef;
  readonly name: string;
  readonly brandName?: string | null;
  readonly country?: string | null;
  /** The per-type bag as the form holds it now, by wire key. */
  readonly attributes?: Record<string, unknown> | null;
};

/** X07: the type a text-only draft will create. */
export type OpenDraftInput = {
  readonly itemType: ItemType;
};

/**
 * X07 "Add to catalog": the same text-only pass for an item that does not
 * exist yet — a menu line nobody has filed, drafted into a card the person
 * confirms. The type and the details the draft already holds are context;
 * every empty suggestible field is asked for. Nothing is written.
 */
export type SuggestNewItemDetailsInput = {
  readonly itemType: ItemType;
  readonly name: string;
  readonly brandName?: string | null;
  readonly country?: string | null;
  /** The per-type bag as the draft holds it now, by wire key. */
  readonly attributes?: Record<string, unknown> | null;
};

/**
 * What the text-only pass came back with. `defaults` is shaped like a label
 * read's (`country` and the per-type bag) so the client merges both the same
 * way, but every value is a **suggestion**: recalled from what the model knows
 * about a named product, never read off it, so the form shows each as a
 * "Suggested" chip and applies none without a tap.
 */
export type ItemDetailSuggestions = {
  /**
   * The model declined — it does not recognise this product well enough to
   * say anything about it. `defaults` is then `{}`. A correct and common
   * answer, not a failure.
   */
  readonly abstained: boolean;
  /** The model's one-line account of what it took the product to be. */
  readonly note: string | null;
  /** JSON object; only fields the form had empty, only from closed lists. */
  readonly defaults: string;
  readonly model: string | null;
};

export type ReprocessResult = {
  readonly onboardingId: string;
  readonly reprocessed: boolean;
  readonly reason: string;
};

export type ItemOnboardingActorInterface = {
  get(ctx: Ctx): Promise<ItemOnboardingDto>;
  /**
   * The AI call. Runs **in this actor's turn** — which is exactly why the
   * actor exists (§8.5). Idempotent on `this.key`: a retry after a completed
   * extraction returns the stored defaults without calling the model again.
   */
  start(ctx: Ctx, input: StartOnboardingInput): Promise<ItemOnboardingDto>;
  /** The stored `defaults`, without re-running the model. */
  defaults(ctx: Ctx): Promise<ItemOnboardingDto>;
  /**
   * X07: open a session with nothing to read — a draft the person types or
   * carries over from a menu line — so `confirm` can create its item (four
   * of the six types cannot exist outside an onboarding). Inserts the `START`
   * row and calls no model. Idempotent on the key; a repeat with a different
   * type is refused, since the row's type is what `confirm` creates.
   */
  openDraft(ctx: Ctx, input: OpenDraftInput): Promise<ItemOnboardingDto>;
  /**
   * SV-B · MC-drafts: keep an unfinished bottle on the account. Owner only;
   * refused once the session has `CONFIRMED` or `MATCHED`. Idempotent: the
   * same input stores the same row.
   */
  saveDraft(ctx: Ctx, input: SaveDraftInput): Promise<ItemOnboardingDto>;
  confirm(
    ctx: Ctx,
    input: ConfirmOnboardingInput,
  ): Promise<ConfirmOnboardingResult>;
  /**
   * Close the session as `MATCHED`: the person filed an existing catalogue
   * item instead of creating one. Idempotent, and never a downgrade — a
   * session that already `CONFIRMED` an item of its own stays `CONFIRMED`.
   */
  closeAsMatched(ctx: Ctx): Promise<ItemOnboardingDto>;
  /**
   * X19: read the session's label photographs again, for the item it created.
   * The item's creator only, and only from the onboarding that item records.
   * Not idempotent by design — asking again is the point — and not stored.
   */
  rereadLabel(ctx: Ctx, input: RereadLabelInput): Promise<ItemLabelReading>;
  /**
   * F-75: record fields the creator confirmed after the item was made, from
   * `updateItem`. Same gate as `rereadLabel`; idempotent (a set union).
   */
  confirmItemFields(
    ctx: Ctx,
    input: ConfirmItemFieldsInput,
  ): Promise<ItemOnboardingDto>;
  /**
   * X19: suggest the item's empty details from its name and brand — a text
   * model call, no photograph. Same gate as `rereadLabel`. Abstains rather
   * than guesses (`ItemDetailSuggestions.abstained`); never writes anything.
   */
  suggestDetails(
    ctx: Ctx,
    input: SuggestItemDetailsInput,
  ): Promise<ItemDetailSuggestions>;
  /**
   * X07: `suggestDetails` for an item not created yet — a draft card's
   * "Suggest details" (a menu line's "Add to catalog"). Keyed by a draft id
   * the client mints; any signed-in caller, and an id that already names an
   * onboarding must be the caller's. Abstains rather than guesses; stores
   * nothing, and never creates the item — the person's confirm does that,
   * through `openDraft` then `confirm`.
   */
  suggestNewItem(
    ctx: Ctx,
    input: SuggestNewItemDetailsInput,
  ): Promise<ItemDetailSuggestions>;
  /**
   * H-133 (F-65): delete a draft — "Delete draft" on Needs details. Owner
   * only (someone else's is absent, `NotFoundError`). Its status becomes
   * `DISCARDED`: nothing is created, and it leaves every draft list and count.
   * A filed session (`CONFIRMED`, `MATCHED`) is a `ConflictError`, since its
   * bottle exists. Idempotent. After it, `saveDraft` and `confirm` are refused.
   */
  discardDraft(ctx: Ctx): Promise<ItemOnboardingDto>;
  /**
   * H-133 (F-71): a browser GET URL for each draft's picture in
   * `filter.onboardingIds`, aligned, in one turn — a page of Needs details is
   * one call, not one file query per row. Addressed at
   * {@link draftImageBatchActorId} (the viewer's own id) and refused for any
   * other viewer. An id is signed only when it names one of the viewer's own
   * onboardings whose picture is a verified file the viewer uploaded;
   * anything else is `null`, never an error. At most
   * {@link DRAFT_IMAGE_BATCH_MAX_IDS} ids.
   */
  draftImageUrls(
    ctx: Ctx,
    filter: DraftImageBatchFilter,
  ): Promise<readonly (ReadTarget | null)[]>;
};

/** The drafts one {@link ItemOnboardingActorInterface.draftImageUrls} signs. */
export type DraftImageBatchFilter = {
  readonly onboardingIds: readonly string[];
};

/** The most ids one {@link DraftImageBatchFilter} may carry. */
export const DRAFT_IMAGE_BATCH_MAX_IDS = 100;

/**
 * The `ItemOnboardingActor` key a viewer's draft-picture batch runs at: the
 * viewer's own id, which names no onboarding, so a batch queues only behind
 * that viewer's own batches (`avatarBatchActorId`'s rule).
 */
export const draftImageBatchActorId = (viewerId: string): string =>
  viewerId.toLowerCase();

/**
 * Delivered by the outbox from `OnboardingReprocessJobActor` — never by a
 * resolver, which cannot name it.
 */
export type InternalItemOnboardingActorInterface = {
  /** `system`; called by `OnboardingReprocessJobActor` (C4). */
  reprocess(ctx: Ctx, input: Record<string, unknown>): Promise<ReprocessResult>;
};

export const ItemOnboardingActorDescriptor: ActorDescriptor<
  ItemOnboardingActorInterface,
  InternalItemOnboardingActorInterface
> = {
  actorType: "ItemOnboardingActor",
  category: "entity",
  methods: {
    get: {},
    // §8.5: one of the two request-driven exceptions — the user is waiting
    // on a vision model's defaults inside the request.
    start: { timeoutMs: 120_000, modelBacked: true },
    defaults: {},
    // One insert, no model (X07).
    openDraft: {},
    // One update, no model (SV-B).
    saveDraft: {},
    // Enqueues the new item's `regenerateVector` (an embedding).
    confirm: { modelBacked: true },
    // One status write; no model, no outbox.
    closeAsMatched: {},
    // One status write; no model, no outbox (H-133).
    discardDraft: {},
    // One select, signed in process (H-133).
    draftImageUrls: {},
    // `start`'s vision call again, with the person waiting on it (§8.5's
    // exception, for the same reason and in the same actor).
    rereadLabel: { timeoutMs: 120_000, modelBacked: true },
    // One update, no model (F-75).
    confirmItemFields: {},
    // A short text-only answer; nothing like a label read, but a local model
    // on a busy laptop still takes tens of seconds.
    suggestDetails: { timeoutMs: 60_000, modelBacked: true },
    // The same call for a draft that is not an item yet (X07).
    suggestNewItem: { timeoutMs: 60_000, modelBacked: true },
  },
  internalMethods: {
    // A vision call per row, from `OnboardingReprocessJobActor`; "over a
    // few seconds" is the norm here.
    reprocess: { timeoutMs: 90_000 },
  },
};
