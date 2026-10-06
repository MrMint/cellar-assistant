/**
 * The AI seam for `ItemOnboardingActor.start` — B2.
 *
 * This module exists for the same reason `files-binding.ts` does: the thing
 * behind it cannot run in a test, so it is a *type* plus an injectable
 * implementation rather than a direct call. `ItemOnboardingActor` takes the
 * provider as a defaulted constructor parameter, exactly as `FileActor` takes
 * its storage binding and `CellarActor` takes its embedder.
 *
 * ## Why the AI call lives in `ItemOnboardingActor` and nowhere else
 *
 * Dapr is turn-based: one turn at a time per actor id. A 10–30 second vision
 * call inside `UserActor` would stall every other operation for that user, and
 * inside `ItemActor` it would stall every reader of that item — which is why
 * §2.1 says outright, under `UserActor`, "No AI or external call runs inside a
 * `UserActor` turn … Onboarding therefore has its own actor", and why §8.5
 * lists `ItemOnboardingActor.start` as one of only two request-driven long
 * operations in the whole system. The blast radius of a slow model call is one
 * onboarding id.
 *
 * `services/actors/src/lib/no-external-calls.test.ts` enforces the other half of
 * that: `item-actor.ts` and `user-actor.ts` may not import this module, and may
 * not reach an HTTP client by any other route either.
 *
 * ## What is deliberately *not* here
 *
 * A real provider — it lives in `ai/seams.ts`, installed at boot by
 * `installAI()` when `AI_PROVIDER` is set. What stays here is the *contract*:
 * the request and result types, the precondition every implementation owes
 * (`requireExtractableInput`), and `unconfiguredItemDefaults`, which is what a
 * caller reaches when no provider is configured and which fails loudly rather
 * than inventing an answer. Running with no provider is a supported state.
 *
 * (This paragraph used to say no provider existed anywhere. It did — X1
 * delivered `services/actors/src/lib/ai/` and the host logs the model it loaded.
 * `src/lib/dev-checks/capability-claims.test.ts` exists because sentences like
 * that one gated four features dark; it scans `src/`, not this app, so this
 * correction is by hand.)
 */
import {
  ConflictError,
  type Ctx,
  type ItemType,
  ValidationError,
} from "@cellar-assistant/contracts";

/** What the model is given: the type being onboarded, and whatever was scanned. */
export type ItemDefaultsRequest = {
  readonly itemType: ItemType;
  /** `files.id` of the label photos, already verified by `FileActor`. */
  readonly frontLabelImageId: string | null;
  readonly backLabelImageId: string | null;
  readonly barcode: string | null;
  readonly barcodeType: string | null;
};

/**
 * What the model returns. `defaults` is stored verbatim in
 * `item_onboardings.defaults` (`jsonb`) — this actor never interprets it, so
 * changing the prompt does not change any type here.
 */
export type ItemDefaultsResult = {
  readonly defaults: Record<string, unknown>;
  /** The raw completion, kept in `raw_defaults` for debugging a bad extraction. */
  readonly raw: string;
  readonly model: string;
  /** 0–1, stored in `item_onboardings.confidence`. */
  readonly confidence: number;
  /** A brand name for `BrandRegistryActor.resolve`, if the label showed one. */
  readonly brandName?: string | null;
};

export type ItemDefaultsProvider = (
  ctx: Ctx,
  request: ItemDefaultsRequest,
) => Promise<ItemDefaultsResult>;

/* -------------------------------------------------------------------------- */
/* The two gates (E2c, E2g)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Refuse to run a label extraction when there is no label.
 *
 * ## This is half a guard, and the other half is below
 *
 * **It fires, and it cannot reach the failure it was written for.** Read what
 * the next paragraph says the failure is — *a model asked to transcribe
 * nothing answers with a confident invention* — and then notice that this
 * function only ever sees the case where nothing was *attached*. An onboarding
 * whose front label is a photograph of a wall, a table, or the 1×1 grey pixel
 * in `packages/e2e/specs/09-menu-scan.spec.ts` has an image, passes here, and
 * produces exactly the invention described below: measured at `temperature: 0`
 * on that pixel, `{"name": "CHARDONNAY", "confidence": 1.0}`, 3 runs of 3.
 *
 * So the guard was never wrong — it was *narrow*, while its own documentation
 * described the whole class. `requireLegibleLabel` below closes the rest of
 * it, on the answer rather than the request, and the two are one rule in two
 * positions: **do not let a model transcribe a label that is not there,
 * whether or not a file was attached.**
 *
 * ## What this is for
 *
 * E2c, measured against the running Ollama: asked to catalogue a wine with no
 * image and no barcode, `gemma3:4b` answers
 * `{"name":"Château d'Yquem","confidence":0.9}` — a real, famous, entirely
 * invented bottle, at a confidence that tells every downstream consumer to
 * trust it. With a barcode and no label it invents a different wine on each
 * run, at 0.95. The onboarding row is then written `COMPLETED` with a
 * fabrication in `defaults`, and the wizard pre-fills the form with it.
 *
 * ## Why the guard is here and not in the prompt
 *
 * Because a prompt cannot be verified. The prompt already said "Leave a field
 * out entirely rather than guessing a value you cannot support", and the model
 * guessed anyway — the schema's `required` was compelling it to, and no amount
 * of wording outranks a grammar. More importantly, a prompt-only fix leaves no
 * way to tell whether it worked: the next model, or the next temperature, or
 * the next provider invents again and nothing fails.
 *
 * This is a precondition on the *seam*, not on one provider's implementation,
 * because "extract the label from these images" is meaningless with no images
 * whichever model is behind it. Any `ItemDefaultsProvider` should call it
 * first; `providerItemDefaults` does.
 *
 * ## Why a barcode is not enough
 *
 * A barcode is a lookup key, not something a vision model can read a vintage
 * off. `BarcodeActor.ensure` is the path that turns one into a product, and
 * `ItemOnboardingActor.confirm` already calls it. Handing the number to a
 * language model asks it to recall a catalogue it does not have, which is the
 * same failure with a number attached — and that is exactly what it produced.
 *
 * ## What the caller sees
 *
 * `ConflictError`, like `unconfiguredItemDefaults`: a *state* problem, not a
 * bug, so `ItemOnboardingActor.start` marks the row `FAILED` and the API says
 * so. The row still exists and `confirm` still works against it — the wizard
 * has always treated a failed extraction as "you fill it in yourself", which
 * is the correct outcome when nobody supplied a photograph.
 */
export const requireExtractableInput = (request: ItemDefaultsRequest): void => {
  if (request.frontLabelImageId !== null || request.backLabelImageId !== null) {
    return;
  }
  throw new ConflictError(
    "this onboarding has no label photograph, so there is nothing to read. " +
      "Item defaults are a transcription of an image; asked for one without " +
      "an image, a model returns a confident invention rather than an " +
      "abstention (measured: a Château d'Yquem, vintage and all, at " +
      "confidence 0.9). Attach a front or back label image and start again, " +
      "or fill the form in by hand — the onboarding session is open either " +
      "way." +
      (request.barcode === null
        ? ""
        : " The barcode is registered through `BarcodeActor` on confirm; it " +
          "is a lookup key, not something a vision model can read a label off."),
  );
};

/**
 * Refuse to *believe* a label extraction when the model says there was no
 * label — the other half of `requireExtractableInput` (E2g).
 *
 * ## It asked "is there text here", not "is this a label" (E2h)
 *
 * E2g closed the blank-image case and left a narrower one open, and the
 * measurement is unambiguous: a **photograph of a restaurant drinks list** —
 * "THE COPPER LANTERN", three wines by the glass with regions and prices,
 * three draught beers, two spirits — was accepted as a wine label, and
 * `Chateau Margaux 2015` was transcribed off it with `region: "Bordeaux,
 * France"` at `confidence: 1.0`. gemma3:4b, `temperature: 0`, **4 runs of 4,
 * byte-identical**. Nothing about it was ungrounded: the wine is really
 * printed there, the model's own `imageDescription` said "a drinks list for
 * 'The Copper Lantern'", and it answered `labelIsLegible: true` anyway.
 *
 * So this gate was not being evaded — it was being answered correctly to a
 * question that was not the one the seam needs. "Can you read a wine here"
 * is true of a menu, a shelf ticket, a receipt and a review. The thing that
 * makes an answer a *label* is **provenance**: it is printed on the container
 * whose contents it describes. A menu says what a restaurant sells.
 *
 * The fix is in `itemDefaultsSchema`, and it is a port rather than an
 * invention. The recipe seam refuses this same photograph 3/3, and the reason
 * is one sentence in `RECIPE_PHOTO_SCHEMA`'s verdict field: it names the
 * near-miss and says why it is disqualified — *"a photograph of a finished
 * dish or drink … shows you the result, not the method."* Every entry in this
 * schema's false-list was a **non**-document (a wall, a landscape, a person,
 * a glass already poured), so a document densely printed with exactly the
 * right words matched nothing it had been warned about. `labelIsLegible` now
 * names the document-shaped near-misses with their disqualifying reason, and
 * `imageDescription` is asked to say what the text is printed *on* — which is
 * what the verdict is then decided from. Same photograph after: `false`, 4
 * runs of 4, with the genuine label still read correctly 4 of 4.
 *
 * That is also why the refusal below no longer says "could not read a label".
 * It could read it perfectly. What it could not do is find a bottle.
 *
 * ## Why this is a gate on the seam and not one provider's business
 *
 * Same reason as the function above, and it is worth saying twice because the
 * first version of that reasoning only got half the job done: "extract the
 * label from this image" is meaningless when the image holds no label,
 * whichever model is behind it. Any `ItemDefaultsProvider` owes both checks —
 * `requireExtractableInput` on the way in, this on the way out.
 *
 * ## Why it takes three primitives rather than the raw answer
 *
 * So that this module keeps depending on nothing but
 * `@cellar-assistant/contracts`. It is the seam's *contract*; `lib/ai/json.ts`
 * is one implementation's parser, and pulling it in here to re-read two fields
 * would invert that. The caller has already parsed the completion, so it hands
 * over what it read.
 *
 * ## The three outcomes
 *
 * 1. **`labelIsLegible` absent** (`null`) → `ConflictError`. It is one of the
 *    four fields `itemDefaultsSchema` lists in `required`, so its absence
 *    means the provider is not constraining its sampler to the output schema
 *    at all. That is the same judgement `requireInVocabulary` makes, and for
 *    the same reason: a provider ignoring the schema is a fact to raise, not a
 *    field to default. **Reading the absence as `true` would restore E2g
 *    exactly**, silently, the first time a provider changed.
 * 2. **`labelIsLegible: false`** → `ValidationError`, quoting the model's own
 *    description of what it saw. See below for why this code and not
 *    `ConflictError`.
 * 3. **`labelIsLegible: true`** → returns, and the answer is used as before.
 *
 * ## Why `ValidationError`, where `requireExtractableInput` throws `ConflictError`
 *
 * Because of what the two mean to the outbox. `isPermanentFailure` in
 * `../actors/outbox-actor.ts` is `code === "VALIDATION"`, and that actor's own
 * rule is that *a failure retrying cannot clear dies immediately*. A
 * photograph that is not a label will not become one on the second attempt, or
 * the tenth: `ItemOnboardingActor.reprocess` is outbox-driven and would
 * otherwise re-run this model call nine more times against the same stored
 * `front_label_image_id`, burying the real cause under nine identical
 * `outbox.retry` events. It also matches `ItemOnboardingActor`'s and
 * `RecipePhotoJobActor`'s existing use of `ValidationError` for "this
 * extraction cannot produce an item".
 *
 * On the synchronous path the two codes are indistinguishable — `start`
 * catches anything, marks the row `FAILED` and rethrows — so nothing about the
 * wizard changes: a failed extraction has always meant "you fill it in
 * yourself", which is the right outcome for a photograph with no label in it
 * just as it is for no photograph at all. The onboarding row still exists and
 * `confirm` still works against it.
 *
 * `requireExtractableInput` above keeps its `ConflictError` deliberately: it
 * is load-bearing in tests and its own reasoning, and changing an existing
 * guard's code is not this fix's business.
 */
export const requireLegibleLabel = (answer: {
  readonly itemType: ItemType;
  /** `null` when the field was absent — not the same as `false`. */
  readonly labelIsLegible: boolean | null;
  readonly imageDescription: string | null;
}): void => {
  const noun = answer.itemType.toLowerCase();
  if (answer.labelIsLegible === null) {
    throw new ConflictError(
      "the model's item-defaults answer has no `labelIsLegible`, one of the " +
        "four fields `itemDefaultsSchema` requires. Either the provider is " +
        "not constraining its sampler to the output schema, or the schema it " +
        "was given is not the one this seam builds. Reading the absence as " +
        "`true` is how a single grey pixel came back as a CHARDONNAY at " +
        "confidence 1.0, so it is refused instead.",
    );
  }
  if (answer.labelIsLegible) return;
  throw new ValidationError(
    `no ${noun} label was found in this image — nothing here is a ${noun} ` +
      "container showing its own printed label" +
      (answer.imageDescription === null
        ? ""
        : ` (the model describes the image as "${sentence(answer.imageDescription)}")`) +
      `. A label is the one printed on the bottle, can, bag or box itself: a ` +
      `menu, a drinks list, a price tag, a shelf ticket or a review that ` +
      `names a ${noun} is not one, however clearly it is printed, because it ` +
      "says what somebody sells rather than what is in the container. " +
      "Nothing has been stored: a plausible bottle nobody photographed is " +
      `worse than an empty form. Photograph the ${noun}'s own label, or fill ` +
      "the form in by hand — the onboarding session is open either way.",
  );
};

/**
 * The model's description, with any trailing full stop removed so it can be
 * quoted inside a sentence. It is a sentence in its own right roughly half the
 * time ("A solid grey image."), and the alternative is a doubled period in
 * every refusal a person or an operator reads.
 */
const sentence = (text: string): string => text.trim().replace(/\.+$/, "");

/**
 * The default. Fails with a `ConflictError` — a *state* problem, not a bug —
 * so the API surfaces "this cannot be done right now" rather than `INTERNAL`,
 * and an outbox-driven `reprocess` retries rather than dead-letters.
 */
export const unconfiguredItemDefaults: ItemDefaultsProvider = async () => {
  throw new ConflictError(
    "no AI provider is configured for item onboarding. `start` cannot extract " +
      "label defaults until AI_PROVIDER is set — `installAI()` installed nothing " +
      "at boot. Set AI_PROVIDER=ollama for a local model that needs no " +
      `credentials. See services/actors/README.md · Local AI.`,
  );
};

/**
 * Swappable at boot, so `index.ts` can install a provider without every actor
 * construction site having to pass one. Kept module-local rather than global
 * state: it is read once, when an actor is constructed by Dapr.
 */
let provider: ItemDefaultsProvider = unconfiguredItemDefaults;

export const setItemDefaultsProvider = (next: ItemDefaultsProvider): void => {
  provider = next;
};

export const itemDefaultsProvider = (): ItemDefaultsProvider => provider;
