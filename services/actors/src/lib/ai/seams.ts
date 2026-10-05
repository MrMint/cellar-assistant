/**
 * The seams, resolved against a real provider — X1's actual deliverable.
 *
 * Each of these is the production implementation of an injectable seam that
 * six separate workstreams left throwing:
 *
 * | seam | left by | module |
 * |---|---|---|
 * | `Embedder` | C1 | `../embeddings.ts` |
 * | `InsightsGenerator` | B7 | `../../actors/tier-list-actor.ts` |
 * | `ItemDefaultsProvider` | B2 | `../item-defaults.ts` |
 * | `MenuExtractionProvider` + `MenuMatchVerifier` | B8 | `../menu-ai.ts` |
 * | `RecipePhotoExtractor` | C4 | `../recipe-photo-ai.ts` |
 * | `PlaceReviewer` | B5 | `../../actors/place-creation-actor.ts` |
 *
 * **Nothing here replaces a seam's `unconfigured*` default.** Those stay
 * exactly as their authors wrote them and remain what every one of these
 * modules exports and every test asserts against. `installAI()` swaps in a
 * real implementation only when a provider is actually configured; with
 * `AI_PROVIDER` unset the defaults are still what a caller reaches, and they
 * still throw with their own message. That is the whole design: configured or
 * loudly broken, never quietly plausible.
 *
 * ## Each of these takes a `ProviderFor`, not an `AIProvider` (X1c)
 *
 * `provider(ctx).generateContent(…)` rather than `provider.generateContent(…)`.
 * The call is metered — every one of the seven model calls below charges
 * `BudgetActor` before it runs — and both halves of a charge live on the ctx:
 * who is spending, and whether they may. Binding the ctx one level up keeps it
 * off `AIProvider`, which is a wire contract four transports implement and
 * none of them has any business knowing about viewers.
 *
 * It also means a seam **cannot** reach an unmetered provider: `installSeams`
 * hands out nothing else. That matters because the alternative — an optional
 * meter with a no-op default — is the shape of the B5b defect recorded in
 * `install.ts`, where a seam, a registry and a constructor default all existed
 * and none of them was filled.
 */
import type {
  ExtractedRecipe,
  ExtractedRecipeIngredient,
  ExtractedRecipeInstruction,
  PlaceReview,
  RecipeType,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  isRecipeType,
  RECIPE_TYPES,
  ValidationError,
} from "@cellar-assistant/contracts";
import type { PlaceReviewer } from "../../actors/place-creation-actor.ts";
import { requirePlaceReviewSubject } from "../../actors/place-creation-actor.ts";
import type { InsightsGenerator } from "../../actors/tier-list-actor.ts";
import type { Embedder } from "../embeddings.ts";
import type {
  ItemDefaultsProvider,
  ItemDefaultsResult,
} from "../item-defaults.ts";
import {
  requireExtractableInput,
  requireLegibleLabel,
} from "../item-defaults.ts";
import type {
  ExtractedMenuLine,
  MenuExtractionProvider,
  MenuMatchVerifier,
} from "../menu-ai.ts";
import type { RecipePhotoExtractor } from "../recipe-photo-ai.ts";
import { requireGroundedEntries } from "../tier-list-entries.ts";
import type { ImageLoader } from "./images.ts";
import { presentIds } from "./images.ts";
import {
  arr,
  bool,
  confidence,
  num,
  parseModelJson,
  record,
  requireStr,
  str,
} from "./json.ts";
import {
  buildInsightsPrompt,
  buildItemDefaultsPrompt,
  buildMenuExtractionPrompt,
  buildMenuMatchPrompt,
  buildPlaceReviewPrompt,
  buildRecipePhotoPrompt,
  INSIGHTS_FIELDS,
  INSIGHTS_REQUIRED_FIELDS,
  INSIGHTS_SCHEMA,
  isScannedType,
  itemDefaultsSchema,
  MENU_EXTRACTION_SCHEMA,
  MENU_MATCH_SCHEMA,
  PLACE_REVIEW_SCHEMA,
  RECIPE_PHOTO_SCHEMA,
} from "./prompts.ts";
import type { ProviderFor } from "./types.ts";
import {
  itemVocabulary,
  normaliseUnconstrainedAttributes,
  requireInVocabulary,
} from "./vocabulary.ts";

/* -------------------------------------------------------------------------- */
/* C1 · EmbeddingActor                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A search phrase is embedded as `RETRIEVAL_QUERY` and a stored item or recipe
 * as `RETRIEVAL_DOCUMENT` — the asymmetric pair legacy production used
 * (`getVectorForString` / `generateItemVector`, `82450ad1`), and the pair a
 * retrieval model is trained on. Both come through `EmbeddingActor`
 * (`embed` / `embedDocument`), so one model makes both sides. Ollama ignores
 * the task; `openai-compatible` and `gemini-embedding-2` write it into the
 * text.
 *
 * A document's images — its label and display photos, which legacy embedded
 * with the text into one vector — are loaded here, through the same
 * `ImageLoader` the vision seams use, and only when the caller names some.
 * Which files, and whether the model takes any, is the caller's decision
 * (`ItemActor.#embeddingImageIds`, gated on `embeddingModel().acceptsImages`);
 * a provider handed images it cannot embed refuses rather than dropping them.
 */
export const providerEmbedder =
  (provider: ProviderFor, loadImages: ImageLoader): Embedder =>
  async ({ text, purpose, imageFileIds }, ctx) => {
    const ids = imageFileIds ?? [];
    const images = ids.length === 0 ? [] : await loadImages(ctx, ids);
    const { embeddings } = await provider(ctx).generateEmbeddings({
      content: text,
      type: "text",
      taskType:
        purpose === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      ...(images.length === 0 ? {} : { images }),
    });
    return embeddings;
  };

/* -------------------------------------------------------------------------- */
/* B7 · TierListActor.generateInsights                                         */
/* -------------------------------------------------------------------------- */

/**
 * **The gate runs here, and it did not before (B7b).**
 *
 * B7b widened this seam's input from type-and-id to resolved entries and wrote
 * `requireGroundedEntries` as the abstention gate for it — but nothing ever
 * called it. `tier-list-entries.ts` documented it as the gate, `tier-list-
 * actor.ts` said *"`requireGroundedEntries` in the seam decides whether what
 * survived is enough"*, and `prompts.ts` justified dropping four fields from
 * `INSIGHTS_SCHEMA.required` on the grounds that the two that stay are
 * *"answerable from any list the `requireGroundedEntries` gate lets through"*.
 * Three modules describing a guard that was not wired.
 *
 * It is wired now, in the same position and for the same reason as the other
 * two seams that have one: `providerItemDefaults` opens with
 * `requireExtractableInput`, `providerPlaceReviewer` with
 * `requirePlaceReviewSubject`. All six fields this prompt asks for are claims
 * about *what was ranked*, and a model asked for a confident personality read
 * with the entries stripped out invents the list it wishes it had been given
 * — `item-defaults.ts` measured that failure on the running Ollama. The
 * refusal has to happen before the call, because a `required` field compiles
 * into the sampler's grammar and "I could not tell" is not a completion it can
 * reach.
 */
export const providerInsightsGenerator =
  (provider: ProviderFor): InsightsGenerator =>
  async (ctx, input) => {
    requireGroundedEntries(input.entries);
    const { content, metadata } = await provider(ctx).generateContent(
      { prompt: buildInsightsPrompt(input), schema: INSIGHTS_SCHEMA },
      "medium",
    );
    const parsed = parseModelJson(content, "tier-list insights");

    /*
     * Two fields are demanded, not six — the two `INSIGHTS_SCHEMA.required`
     * names, and for the same reason.
     *
     * This loop used to require all six, which contradicted the schema beside
     * it and, measured on the running Ollama against a three-wine list, meant
     * **no insights were ever written**: gemma3:4b answered five of six,
     * omitted `blindSpots`, and the whole generation failed into the outbox to
     * be retried forever. The `required` list was deliberately cut to two
     * (`prompts.ts`) precisely so a model *can* decline the four that a narrow
     * list makes unanswerable; refusing that answer here threw the concession
     * away at the last step.
     *
     * "A partial answer would render as blank panels" — the old justification
     * — is not what the frontend does, re-checked rather than taken on trust:
     * `TierListInsights.tsx` builds its sections with
     * `.filter((section) => section.text !== null)` and renders `archetype`
     * behind its own null check, so a missing field is a section that does not
     * appear. An *empty* one would be a blank panel, which is why a blank
     * string is still dropped rather than stored.
     */
    const insights: Record<string, unknown> = {};
    for (const field of INSIGHTS_FIELDS) {
      const value = str(parsed[field]);
      if (value !== null) insights[field] = value;
    }
    for (const field of INSIGHTS_REQUIRED_FIELDS) {
      if (insights[field] === undefined) {
        throw new ConflictError(
          `the model's tier-list insights answer has no \`${field}\`. The ` +
            "insight card is built around the archetype chip and the palate " +
            "paragraph, and both are answerable from any list the grounding " +
            "gate lets through, so an answer missing one is an answer to a " +
            "different question. The other four may be omitted.",
        );
      }
    }
    // The Nhost function stamped these two into `ai_insights` itself; the
    // column is opaque `jsonb`, and the frontend reads `generatedAt`.
    insights.generatedAt = new Date().toISOString();
    insights.model = metadata.model;
    return insights;
  };

/* -------------------------------------------------------------------------- */
/* B2 · ItemOnboardingActor.start                                              */
/* -------------------------------------------------------------------------- */

/**
 * The two fields `itemDefaultsSchema` puts in front of the answer to ground
 * it. They are the model's working, not the item's attributes, so they never
 * reach `item_onboardings.defaults`.
 */
const ANSWER_GROUNDING = new Set(["imageDescription", "labelIsLegible"]);

/**
 * Four things happen here that did not before E2c/E2g, in this order and for
 * these reasons:
 *
 * 1. **`requireExtractableInput` first**, before an image is loaded or a prompt
 *    is built. With no label there is nothing to transcribe, and a model asked
 *    to transcribe nothing answers with a confident invention — see that
 *    function for the measurement.
 * 2. **The schema is built from the live reference vocabulary** (X1b), so the
 *    constrained columns are `enum`s the sampler is held to rather than free
 *    text that fails as a foreign-key violation inside the outbox.
 * 3. **`requireLegibleLabel` reads the model's own verdict before any of the
 *    rest of the answer is believed** (E2g). That check is new and it is the
 *    one that catches the case (1) cannot: an onboarding whose label
 *    photograph *exists* and holds no label. Sent the 1×1 grey pixel from
 *    `packages/e2e/specs/09-menu-scan.spec.ts`, gemma3:4b answered
 *    `{"name": "CHARDONNAY", "confidence": 1.0}` 3 runs of 3 at
 *    `temperature: 0` — an invented grape at the maximum confidence the
 *    column holds, bound for `item_onboardings.defaults` and the wizard's
 *    pre-filled form. The fix is mostly in `itemDefaultsSchema`, which had no
 *    field an abstention could be expressed in at all; what is here is the
 *    other half, reading it first.
 * 4. **The answer is checked back against that vocabulary.** A provider that
 *    ignores the output schema is a fact worth raising, not a field to drop.
 *
 * Note what is **not** here: nothing looks at the image's dimensions, byte
 * count or aspect. A 1×1 pixel is only the cheapest instance of the class — a
 * blank white page, a photograph of a wall and an out-of-focus shot are the
 * same defect at resolutions no size check could separate from a real label.
 */
export const providerItemDefaults =
  (provider: ProviderFor, loadImages: ImageLoader): ItemDefaultsProvider =>
  async (ctx, request) => {
    requireExtractableInput(request);

    // Read once per process, then cached — not a sidecar hop, so §8.5's rule
    // about `ItemOnboardingActor.start`'s turn is untouched.
    const vocabulary = await itemVocabulary();
    const images = await loadImages(
      ctx,
      presentIds(request.frontLabelImageId, request.backLabelImageId),
    );
    const { content, metadata } = await provider(ctx).generateContent(
      {
        prompt: buildItemDefaultsPrompt({
          itemType: request.itemType,
          hasFront: request.frontLabelImageId !== null,
          hasBack: request.backLabelImageId !== null,
          barcode: request.barcode,
          barcodeType: request.barcodeType,
        }),
        images,
        schema: itemDefaultsSchema(request.itemType, vocabulary),
      },
      // "high" for a label: the whole onboarding hangs off reading it right,
      // and §8.5 already sanctions this actor holding a slow call.
      "high",
    );
    const answer = parseModelJson(content, "item defaults");
    requireLegibleLabel({
      itemType: request.itemType,
      // The model is asked the *positive* question, because a negatively-named
      // verdict was measured inverting on the menu seam (see
      // `MENU_EXTRACTION_SCHEMA` §3). Nothing inverts it back here: unlike
      // `MenuExtractionResult`, `ItemDefaultsResult` has no negative field to
      // keep in step, so the one polarity is the only one.
      labelIsLegible: bool(answer.labelIsLegible),
      imageDescription: str(answer.imageDescription),
    });

    /*
     * The two grounding fields are stripped before storage, and are not simply
     * left in.
     *
     * `defaults` goes verbatim into `item_onboardings.defaults` and the wizard
     * pre-fills its form from it, so every key in it is read as a proposed
     * *value for the item*. `imageDescription` is not one — it is the model's
     * account of the photograph, which is why it earns its place in the schema
     * (`itemDefaultsSchema`: it grounds the verdict that follows it) and not
     * in the column. `labelIsLegible` is already spent by the time it gets
     * here. `raw` keeps the whole completion, both fields included, which is
     * exactly what `item_onboardings.raw_defaults` is for.
     */
    // Vocabularies too large for an `enum` went out as text; map them back
    // here, before anything is stored, so nothing outside the vocabulary can
    // reach `item_onboardings.defaults` (`normaliseUnconstrainedAttributes`).
    const defaults = normaliseUnconstrainedAttributes(
      request.itemType,
      Object.fromEntries(
        Object.entries(answer).filter(([key]) => !ANSWER_GROUNDING.has(key)),
      ),
      vocabulary,
    );
    requireInVocabulary(request.itemType, defaults, vocabulary);
    const result: ItemDefaultsResult = {
      defaults,
      raw: content,
      model: metadata.model,
      confidence: confidence(defaults.confidence, 0.5),
      brandName: str(defaults.brandName),
    };
    return result;
  };

/* -------------------------------------------------------------------------- */
/* B8 · MenuScanActor.process                                                  */
/* -------------------------------------------------------------------------- */

/**
 * **Where the invented menu was caught (B8c), and the order it is caught in.**
 *
 * A 1×1 grey pixel produced eighteen items and a page of British pub prices,
 * `completed`, indistinguishable in the row from a real scan. The cause was in
 * `MENU_EXTRACTION_SCHEMA` — `required: ["rawText", "items", "confidence"]`
 * compiled into the sampler's grammar and made "there is nothing here" an
 * unsayable answer — so the fix is mostly there, not here. What is here is the
 * other half of the same rule: the schema lets the model abstain, and this
 * reads the abstention *first*, before any of the rest of the answer is
 * believed.
 *
 * Three outcomes, in this order:
 *
 * 1. **No `menuIsLegible` at all** → throw. It is one of two `required`
 *    fields, so its absence means the provider ignored the output schema. That
 *    is the same judgement `requireInVocabulary` makes for
 *    `providerItemDefaults`: a provider that is not honouring the schema is a
 *    fact to raise, not a field to default. Defaulting it to `true` would
 *    restore the defect exactly, quietly, the first time a provider stopped
 *    constraining its sampler.
 * 2. **`menuIsLegible: false`** → an empty extraction, and *the items are
 *    dropped even if the model also returned some*. The two answers
 *    contradict, and the contradiction is resolved towards abstention because
 *    the costs are not symmetric: a missed menu is a re-shoot, a fabricated
 *    one is a wine list the person is told they photographed. The model has
 *    said in its own answer that nothing on the page is real; there is no
 *    reading of that on which the items should be filed.
 * 3. **`menuIsLegible: true`** → the lines, as before — but a non-empty
 *    `items` with an empty `rawText` throws. `rawText` is defined as the
 *    verbatim transcription of the page the items were read off, so items
 *    without it are items with no page behind them. This is the narrow,
 *    content-free groundedness check the seam can make without guessing at a
 *    real menu's wording; it deliberately does not try to match each `name`
 *    back into `rawText`, because a model that normalises a line it really did
 *    read would fail that and a model that invents both together would pass
 *    it. The discriminator is what does the work; this only catches the answer
 *    that is internally impossible.
 *
 * Note what is **not** here: nothing looks at the image's dimensions, byte
 * count or aspect. A 1×1 pixel is only the cheapest instance of the class — a
 * blank white page, a photograph of a wall and an out-of-focus shot are the
 * same defect at resolutions no size check could ever separate from a real
 * menu.
 */
export const providerMenuExtraction =
  (provider: ProviderFor, loadImages: ImageLoader): MenuExtractionProvider =>
  async (ctx, request) => {
    const started = Date.now();
    // The processed image when there is one — it is the deskewed/cropped
    // version — otherwise the original.
    const imageId = request.processedImageId ?? request.originalImageId;
    const images = await loadImages(ctx, [imageId]);

    const { content, metadata } = await provider(ctx).generateContent(
      {
        prompt: buildMenuExtractionPrompt(request.placeId !== null),
        images,
        schema: MENU_EXTRACTION_SCHEMA,
      },
      "high",
    );
    const parsed = parseModelJson(content, "menu extraction");

    const imageDescription = str(parsed.imageDescription);
    // The model is asked the *positive* question and the domain keeps the
    // negative one; `MENU_EXTRACTION_SCHEMA` §3 has the measurement that made
    // that necessary. This line is the only place the two meet.
    const menuIsLegible = bool(parsed.menuIsLegible);
    if (menuIsLegible === null) {
      throw new ConflictError(
        "the model's menu extraction answer has no `menuIsLegible`, one of " +
          "the two fields `MENU_EXTRACTION_SCHEMA` requires. Either the " +
          "provider is not constraining its sampler to the output schema, or " +
          "the schema it was given is not the one this seam builds. Reading " +
          "the absence as `true` is how a single grey pixel came back as an " +
          "eighteen-item menu, so it is refused instead.",
      );
    }

    if (!menuIsLegible) {
      return {
        lines: [],
        rawText: "",
        model: metadata.model,
        // Not `confidence(parsed.confidence, …)`: the page's legibility is no
        // longer the question once the model has said there is no page.
        confidence: 0,
        durationMs: Date.now() - started,
        noMenuDetected: true,
        imageDescription,
      };
    }

    const rawText = str(parsed.rawText) ?? "";
    const lines: ExtractedMenuLine[] = [];
    for (const entry of arr(parsed.items)) {
      const line = record(entry);
      if (line === null) continue;
      const name = str(line.name);
      if (name === null) continue;
      lines.push({
        name,
        description: str(line.description),
        price: num(line.price),
        menuCategory: str(line.menuCategory),
        itemType: isScannedType(line.itemType) ? line.itemType : "unknown",
        searchName: str(line.searchName),
        confidence: num(line.confidence),
        attributes: null,
      });
    }

    if (lines.length > 0 && rawText === "") {
      throw new ConflictError(
        `the model returned ${lines.length} menu line(s) for scan ` +
          `${request.menuScanId} while transcribing the page as empty, and ` +
          "said `menuIsLegible` was true. `rawText` is the verbatim text " +
          "those lines are supposed to have been read out of, so an answer " +
          "with lines and no text did not read them off this image. Failing " +
          "rather than filing them: an invented menu is the one outcome this " +
          "pipeline must never reach.",
      );
    }

    return {
      lines,
      rawText,
      model: metadata.model,
      confidence: confidence(parsed.confidence, lines.length > 0 ? 0.5 : 0),
      durationMs: Date.now() - started,
      noMenuDetected: false,
      imageDescription,
    };
  };

/* -------------------------------------------------------------------------- */
/* B8 · MenuMatchJobActor.processBatch                                         */
/* -------------------------------------------------------------------------- */

/** The model says "none" for "no candidate matches"; the seam wants `null`. */
const NONE = "none";

export const providerMenuMatchVerifier =
  (provider: ProviderFor): MenuMatchVerifier =>
  async (ctx, request) => {
    const { content, metadata } = await provider(ctx).generateContent(
      { prompt: buildMenuMatchPrompt(request), schema: MENU_MATCH_SCHEMA },
      "medium",
    );
    const parsed = parseModelJson(content, "menu match verification");
    const accepted = str(parsed.acceptedKey);
    const known = new Set(request.candidates.map((candidate) => candidate.key));

    // A key the model invented is not a match — but it is also not a silent
    // "none": treating a hallucinated id as a rejection would hide a prompt
    // regression behind plausible-looking output.
    if (accepted !== null && accepted !== NONE && !known.has(accepted)) {
      throw new ConflictError(
        `the model accepted candidate key "${accepted}", which was not one of ` +
          `the ${request.candidates.length} offered for menu item ` +
          `${request.placeMenuItemId}`,
      );
    }

    return {
      acceptedKey: accepted === null || accepted === NONE ? null : accepted,
      confidence: confidence(parsed.confidence, 0.5),
      reasoning: str(parsed.reasoning) ?? "",
      model: metadata.model,
    };
  };

/* -------------------------------------------------------------------------- */
/* C4 · RecipePhotoJobActor.extract                                            */
/* -------------------------------------------------------------------------- */

/**
 * The model's own account of the image, parenthesised for quoting inside a
 * refusal — with any trailing full stop removed, because it is a sentence in
 * its own right about half the time ("A solid grey image.") and the
 * alternative is a doubled period in every message an operator reads.
 */
const describedAs = (description: string | null): string =>
  description === null
    ? ""
    : ` (the model describes it as "${description.trim().replace(/\.+$/, "")}")`;

/**
 * The model's `type`, or a refusal — never `cocktail` by default (C4d).
 *
 * This line used to read `str(parsed.type) ?? "cocktail"`, against a schema
 * where `type` was an unconstrained string, and the measurement is that the
 * fallback was not a rare safety net but **the only path anything ever took**:
 * gemma3:4b answered `"recipe"` before C4c and `"groupName"` after, on real
 * cards at `temperature: 0`, 4 runs of 4 — both illegal, both silently
 * becoming `cocktail`, so a photographed roast chicken was filed as a drink
 * and nothing anywhere said so.
 *
 * `RECIPE_PHOTO_SCHEMA` now carries `RECIPE_TYPES` as an `enum`, which puts
 * the two legal values into the sampler's grammar and makes the illegal answer
 * unsayable — for a provider that honours the output schema. This is the other
 * half, and it exists for the reason `requireLegibleLabel` and
 * `requireInVocabulary` exist: **a provider that is not honouring the schema
 * is a fact to raise, not a field to default.** Ollama compiles the enum;
 * Vertex and the OpenAI-compatible port may not, now or after a version bump,
 * and a silent default is exactly how that change would fail to be noticed.
 *
 * `ValidationError`, matching this seam's two other refusals: the outbox
 * treats it as permanent (`isPermanentFailure` is `code === "VALIDATION"`),
 * and a model that cannot name one of two values will not name it on the
 * tenth delivery either.
 */
const requireRecipeType = (value: unknown, jobId: string): RecipeType => {
  const declared = str(value);
  if (declared !== null && isRecipeType(declared)) return declared;
  throw new ValidationError(
    `the model answered \`type\`: ${JSON.stringify(declared)} for job ` +
      `${jobId}, which is not one of the ${RECIPE_TYPES.length} values ` +
      `\`recipes_type_check\` accepts (${RECIPE_TYPES.join(", ")}). ` +
      "`RECIPE_PHOTO_SCHEMA` declares those as an `enum`, so a provider " +
      "constraining its sampler to the output schema cannot produce this; " +
      "reaching here means the provider is not. Defaulting it to `cocktail` " +
      "is what filed every photographed food recipe as a drink, so it is " +
      "refused instead.",
  );
};

/**
 * **Where the invented recipe was caught (C4c), and why the guard that was
 * already here could never have caught it.**
 *
 * The 1×1 grey pixel from `packages/e2e/specs/09-menu-scan.spec.ts` produced a
 * complete "Chocolate Chip Cookies" — nine ingredients, `1 cup butter` through
 * `2 cups chocolate chips`, and `Preheat oven to 375 degrees F (190 degrees
 * C).` — **3 runs of 3 at `temperature: 0`, byte-identical**. The job would
 * have created that recipe, resolved nine ingredients against the catalogue
 * and reported itself `completed`.
 *
 * The `ingredients.length === 0` throw at the bottom of this function was
 * written for exactly that and **sat downstream of it**: by the time it ran
 * the model had already filled the array, so it could not fire, on this input
 * or on any other blank one. It read as protection and was none. It is still
 * here, and it is live now — but only because the verdict is decoded ahead of
 * it, and only for the answer it can honestly refuse (see its own note).
 *
 * Three outcomes, in this order:
 *
 * 1. **No `recipeIsLegible` at all** → `ConflictError`. It is one of six
 *    fields `RECIPE_PHOTO_SCHEMA` lists in `required`, so its absence means
 *    the provider is not honouring the output schema — a fact to raise, not a
 *    field to default. Defaulting it to `true` restores the defect exactly.
 * 2. **`recipeIsLegible: false`** → `ValidationError`, quoting the model's own
 *    description, and *whatever it returned alongside its own abstention is
 *    discarded*. The two answers contradict and the contradiction resolves
 *    towards abstention, because the costs are not symmetric: a missed recipe
 *    is a re-shoot, an invented one is a drink the person is told they
 *    photographed.
 * 3. **`recipeIsLegible: true`** → the recipe, as before.
 *
 * ## Why this fails rather than completing with nothing
 *
 * The menu seam has a third answer — `processing_status = completed`,
 * `items_detected = 0`, `processing_error = null` — and it is right there,
 * because `menu_scans` is a **row that persists either way**: the scan
 * happened, and "we found no menu" is something it can hold and the page can
 * render.
 *
 * A recipe-photo job has no such row. Its entire deliverable is one recipe,
 * and `RecipePhotoResult.recipeId` is not nullable, so "completed, nothing
 * found" would be a job the page reports as done pointing at a recipe id that
 * was never created. The honest outcome here is a failure, which is what
 * `recipe-photo-ai.ts` has said since C4: *"a stub that returned an empty
 * extraction would be especially bad here … 'succeeded with no recipe' would
 * complete a job, mark it `completed`, and leave the user with nothing and no
 * error."* So the domain distinction is real and it is the menu seam's, not
 * this one's.
 *
 * `ValidationError` and not `ConflictError`, which is what this function threw
 * before: `isPermanentFailure` in `../../actors/outbox-actor.ts` is
 * `code === "VALIDATION"`, and a photograph with no recipe in it will not
 * acquire one on the tenth delivery. A `ConflictError` here would re-run a
 * vision call nine more times over seventeen minutes and then dead-letter
 * anyway, and would tell the person "that attempt did not complete and is
 * being retried automatically" about an image that is simply not a recipe.
 * `RecipePhotoJobActor.#runStage` already uses `ValidationError` for the
 * neighbouring "there is nothing to create" case.
 */
export const providerRecipePhotoExtractor =
  (provider: ProviderFor, loadImages: ImageLoader): RecipePhotoExtractor =>
  async (ctx, request) => {
    const images = await loadImages(ctx, [
      request.fileId,
      ...request.additionalFileIds,
    ]);
    const { content, metadata } = await provider(ctx).generateContent(
      {
        prompt: buildRecipePhotoPrompt(request.notes),
        images,
        schema: RECIPE_PHOTO_SCHEMA,
      },
      "high",
    );
    const parsed = parseModelJson(content, "recipe photo");

    const imageDescription = str(parsed.imageDescription);
    const recipeIsLegible = bool(parsed.recipeIsLegible);
    if (recipeIsLegible === null) {
      throw new ConflictError(
        "the model's recipe-photo answer has no `recipeIsLegible`, one of " +
          "the six fields `RECIPE_PHOTO_SCHEMA` requires. Either the " +
          "provider is not constraining its sampler to the output schema, or " +
          "the schema it was given is not the one this seam builds. Reading " +
          "the absence as `true` is how a single grey pixel came back as a " +
          "nine-ingredient cookie recipe, so it is refused instead.",
      );
    }
    if (!recipeIsLegible) {
      throw new ValidationError(
        `no recipe could be read from the photo for job ${request.jobId}` +
          describedAs(imageDescription) +
          ". Nothing has been created: a plausible recipe nobody " +
          "photographed is worse than no recipe at all. Retake the photo so " +
          "the written ingredients and method are legible, and start again.",
      );
    }

    const ingredients: ExtractedRecipeIngredient[] = [];
    for (const entry of arr(parsed.ingredients)) {
      const row = record(entry);
      const name = row === null ? null : str(row.name);
      if (row === null || name === null) continue;
      ingredients.push({
        name,
        quantity: num(row.quantity),
        unit: str(row.unit),
        isOptional: bool(row.isOptional),
        substitutionNotes: str(row.substitutionNotes),
        itemType: str(row.itemType),
        brandName: str(row.brandName),
        category: str(row.category),
      });
    }

    const instructions: ExtractedRecipeInstruction[] = [];
    for (const entry of arr(parsed.instructions)) {
      const row = record(entry);
      const text = row === null ? null : str(row.instructionText);
      if (row === null || text === null) continue;
      instructions.push({
        instructionText: text,
        instructionType: str(row.instructionType),
        equipmentNeeded: str(row.equipmentNeeded),
        timeMinutes: num(row.timeMinutes),
      });
    }

    /*
     * **This guard is unchanged in intent and was dead until the verdict
     * above was decoded in front of it (C4c).**
     *
     * A recipe with no ingredients is the "succeeded with nothing" outcome
     * `recipe-photo-ai.ts` exists to prevent: the job would complete, the row
     * would be written, and the user would get an empty recipe and no error.
     * That is still exactly right. What was wrong is that it could not
     * happen — `ingredients` was `required` in a schema with nowhere to
     * abstain, so a model handed a blank image filled the array rather than
     * leaving it empty, and this line was never reached by the input it was
     * written for. Eight guards in this repository were found this week
     * sitting downstream of the thing they described; this was one.
     *
     * Its job is narrower now, and worth naming: the case above handles "the
     * model says there is no recipe here". This handles the one that is
     * internally impossible — **the model said the recipe was legible and
     * then read nothing off it**. Both are refusals, which is why they share
     * an error code; they are not the same claim, which is why they are
     * separate messages. It deliberately does not try to match ingredient
     * names back into anything: a model that normalises a line it really did
     * read would fail that, and a model that invents the whole answer
     * consistently would pass it. The verdict is what does the work here.
     */
    if (ingredients.length === 0) {
      throw new ValidationError(
        `the model answered \`recipeIsLegible: true\` for job ${request.jobId}` +
          describedAs(imageDescription) +
          " and then read no ingredients off it. A recipe is its " +
          "ingredients, so an answer with none did not read one off this " +
          "image. Failing rather than writing an empty recipe — see " +
          "services/actors/src/lib/recipe-photo-ai.ts.",
      );
    }

    const recipe: ExtractedRecipe = {
      name: requireStr(parsed.name, "name", "recipe photo"),
      type: requireRecipeType(parsed.type, request.jobId),
      description: str(parsed.description),
      difficultyLevel: num(parsed.difficultyLevel),
      prepTimeMinutes: num(parsed.prepTimeMinutes),
      servingSize: num(parsed.servingSize),
      ingredients,
      instructions,
      groupName: str(parsed.groupName),
      groupCategory: str(parsed.groupCategory),
      confidence: num(parsed.confidence),
    };
    return { recipe, model: metadata.model };
  };

/* -------------------------------------------------------------------------- */
/* B5 · PlaceCreationActor.createPlace                                         */
/* -------------------------------------------------------------------------- */

/** The string members of a model's array, in order. Non-strings are not values. */
const strings = (value: unknown): readonly string[] => {
  const out: string[] = [];
  for (const entry of arr(value)) {
    const text = str(entry);
    if (text !== null) out.push(text);
  }
  return out;
};

/**
 * The port of `functions/reviewUserPlace` — B5b.
 *
 * ## What came across unchanged
 *
 * The prompt's job, its voice, its five review criteria, its approve/reject
 * bias ("approve anything that looks like a genuine venue, even when the
 * details are sparse") and the `-0.3 … +0.3` confidence band are the old
 * function's, and `"low"` is the quality tier it asked for — the user is
 * waiting on this call in-turn (§8.5), and a verdict over ten short fields is
 * not the place to spend the 120s budget.
 *
 * ## What did not, and why
 *
 * 1. **The `required` list went from five fields to one.** The Nhost schema
 *    required `approved`, `confidence_adjustment`, `enriched_description`,
 *    `suggested_categories` and `flags`; a provider compiles `required` into
 *    the sampler's grammar, so "I have nothing to add here" was literally
 *    undecodable. The old handler's own workaround is the evidence — it
 *    rewrote a `null` `enriched_description` to `""` before validating,
 *    commenting that the model "sometimes returns null for required string
 *    fields". See `PLACE_REVIEW_SCHEMA` for the whole argument; the field that
 *    made it urgent is `enrichedDescription`, because `createPlace` writes it
 *    into `places.description` whenever the submitter left theirs blank. A
 *    required description is a compelled description of a venue the model has
 *    never heard of, persisted as the place's own words.
 * 2. **The fallback is gone.** `FALLBACK_RESULT` was
 *    `{approved: true, confidence_adjustment: 0, flags: []}`, returned with a
 *    200 on *any* failure — a bad completion, a schema violation, a dead
 *    provider. That is an approval nobody made, and it is indistinguishable at
 *    the call site from one a model reasoned its way to. Every failure here
 *    throws instead. `PlaceCreationActor.#reviewOrNull` catches it, logs it and
 *    records `review: null`, so the place is still created at the neutral
 *    confidence and the result says plainly that no review happened.
 * 3. **The categories are slugs, not labels.** `formatAllCategories()` printed
 *    Title Case ("Coffee Shop") while the column and the form both hold
 *    `coffee_shop`, so a model that obeyed the prompt suggested categories the
 *    form could never match.
 *
 * ## Why there is no vocabulary check on the way back
 *
 * `requireInVocabulary` exists because an out-of-vocabulary item attribute is a
 * foreign-key violation raised inside the outbox where nobody sees it. Nothing
 * in a `PlaceReview` reaches a constrained column: `suggestedCategories` and
 * `flags` are advisory, returned to the caller and written nowhere, and
 * `places.categories` is `text[]` with no key behind it. Throwing over an
 * advisory field would trade a real verdict for `review: null` — it would lose
 * the approval to protect a chip label.
 */
export const providerPlaceReviewer =
  (provider: ProviderFor): PlaceReviewer =>
  async (ctx, subject) => {
    // Before the model, not after: a review of nothing is not a hard question,
    // it is an empty one, and an empty question is answered with an invention.
    requirePlaceReviewSubject(subject);

    const { content } = await provider(ctx).generateContent(
      { prompt: buildPlaceReviewPrompt(subject), schema: PLACE_REVIEW_SCHEMA },
      "low",
    );
    const parsed = parseModelJson(content, "place review");

    const approved = bool(parsed.approved);
    if (approved === null) {
      throw new ConflictError(
        "the model's place review answer has no `approved`, which is the one " +
          "field this seam cannot fill in for it. Reading an absent verdict as " +
          "approval is the silent approval the whole seam exists to refuse; " +
          "reading it as a rejection turns a decoding glitch into a refused " +
          "submission the person cannot appeal. PlaceCreationActor records " +
          "`review: null` for this — the same outcome as no provider at all.",
      );
    }

    const review: PlaceReview = {
      approved,
      // Not clamped here. `PlaceReview.confidenceAdjustment`'s contract puts
      // the `±0.3` bound on the actor (`confidenceFromReview`), and two copies
      // of a bound drift. An omitted adjustment is a real answer: no movement
      // from the 0.5 base.
      confidenceAdjustment: num(parsed.confidenceAdjustment) ?? 0,
      enrichedDescription: str(parsed.enrichedDescription),
      suggestedCategories: strings(parsed.suggestedCategories),
      rejectionReason: str(parsed.rejectionReason),
      flags: strings(parsed.flags),
    };
    return review;
  };
