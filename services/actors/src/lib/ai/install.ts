/**
 * Boot: install a real provider behind the seams, or refuse to pretend.
 *
 * Called once from `boot()` (`src/boot.ts`), before any actor is registered or
 * the server starts. Three outcomes, and
 * the middle one is the whole point of X1:
 *
 * | `AI_PROVIDER` | what happens |
 * |---|---|
 * | unset | nothing is installed. Every seam keeps its `unconfigured*` default and throws on use, naming itself. The host starts; non-AI features work. |
 * | set, and complete | every implementation in `SEAMS` installed. One log line naming the provider and its models. |
 * | set, but incomplete | **this throws, and the host does not start.** |
 *
 * Whatever `AI_PROVIDER` says, a malformed `AI_MODEL_PRICES`,
 * `AI_BUDGET_MAX_REQUESTS` or `OPENAI_COMPAT_FREE` also throws here. Empty is
 * not malformed: it means no overrides.
 *
 * The third row is the one the old stack got wrong. `functions/refreshPlaces/
 * _services/factory.ts` answered "credentials missing" with a `console.warn`
 * and a mock service reading `wisconsin-places.json`, in production, and
 * everything downstream carried on. An operator who sets `AI_PROVIDER` has said
 * what they want; the only honest response to "…but the key is missing" is to
 * stop. `no-silent-fallback.test.ts` holds all three rows.
 */

import type { ModelSeam } from "../../actors/budget-actor.ts";
import {
  MODEL_SEAMS,
  readModelBudgetPolicy,
} from "../../actors/budget-actor.ts";
import { setPlaceReviewer } from "../../actors/place-creation-actor.ts";
import { setInsightsGenerator } from "../../actors/tier-list-actor.ts";
import { EMBEDDING_DIMENSIONS, setEmbedder } from "../embeddings.ts";
import {
  setDocumentImageEmbedder,
  setQueryImageEmbedder,
} from "../image-embeddings.ts";
import { setItemDefaultsProvider } from "../item-defaults.ts";
import { setMenuExtractionProvider, setMenuMatchVerifier } from "../menu-ai.ts";
import { setRecipePhotoExtractor } from "../recipe-photo-ai.ts";
import type { EmbeddingModelIdentity } from "../vectors.ts";
import { embeddingModelKey, setEmbeddingModel } from "../vectors.ts";
import type { ModelBudget, SeamModels } from "./budget.ts";
import { meteredProviderFor } from "./budget.ts";
import type { EmbeddingInputDialect, Env } from "./config.ts";
import { readAIProviderConfig, selectProvider } from "./config.ts";
import { createAIProvider } from "./factory.ts";
import { isGeminiEmbedding2 } from "./gemini.ts";
import type { ImageLoader } from "./images.ts";
import { daprImageLoader } from "./images.ts";
import { LLAMACPP_EMBEDDING_VARIANT } from "./openai-compatible.ts";
import {
  providerEmbedder,
  providerImageEmbedder,
  providerInsightsGenerator,
  providerItemDefaults,
  providerMenuExtraction,
  providerMenuMatchVerifier,
  providerPlaceReviewer,
  providerRecipePhotoExtractor,
} from "./seams.ts";
import type { AIProvider, ProviderFor } from "./types.ts";

export type InstallResult =
  | { readonly installed: false; readonly reason: string }
  | {
      readonly installed: true;
      readonly provider: string;
      readonly models: readonly string[];
    };

export type InstallOptions = {
  readonly env?: Env;
  readonly provider?: AIProvider;
  readonly loadImages?: ImageLoader;
  /** Injected by `install.test.ts`; production always gets the sidecar hop. */
  readonly budget?: ModelBudget;
};

/**
 * One model seam, as installed: which kind of entity its spend is attributed
 * to (`api_usage_log.entity_type`), and how to put its implementation behind
 * a metered provider.
 */
export type SeamSpec = {
  readonly entityType?: string;
  readonly install: (provider: ProviderFor, loadImages: ImageLoader) => void;
};

/**
 * Every model seam, keyed by its budget name.
 *
 * `satisfies Record<ModelSeam, SeamSpec>` is the point of this being a table
 * rather than seven statements. `installSeams` used to make seven hand calls,
 * and one of them — `setPlaceReviewer` — was missing for as long as AI place
 * review was dark in production: the seam, the registry and the constructor
 * default all existed, and nothing filled them, behind a green suite (B5b). A
 * seam added to `MODEL_SEAMS` without a row here is now a compile error, and
 * so is a row for a seam the budget does not know.
 */
export const SEAMS = {
  embedding: {
    install: (provider, loadImages) =>
      setEmbedder(providerEmbedder(provider, loadImages)),
  },
  // G32: the same implementation in two slots, each charged to its own seam
  // (`../image-embeddings.ts` says why).
  image_embedding: {
    entityType: "item_image",
    install: (provider, loadImages) =>
      setDocumentImageEmbedder(providerImageEmbedder(provider, loadImages)),
  },
  image_search: {
    install: (provider, loadImages) =>
      setQueryImageEmbedder(providerImageEmbedder(provider, loadImages)),
  },
  item_defaults: {
    entityType: "item_onboarding",
    install: (provider, loadImages) =>
      setItemDefaultsProvider(providerItemDefaults(provider, loadImages)),
  },
  menu_extraction: {
    entityType: "menu_scan",
    install: (provider, loadImages) =>
      setMenuExtractionProvider(providerMenuExtraction(provider, loadImages)),
  },
  menu_match: {
    entityType: "place_menu_item",
    install: (provider) =>
      setMenuMatchVerifier(providerMenuMatchVerifier(provider)),
  },
  place_review: {
    entityType: "place",
    install: (provider) => setPlaceReviewer(providerPlaceReviewer(provider)),
  },
  recipe_photo: {
    entityType: "recipe",
    install: (provider, loadImages) =>
      setRecipePhotoExtractor(
        providerRecipePhotoExtractor(provider, loadImages),
      ),
  },
  tier_list_insights: {
    entityType: "tier_list",
    install: (provider) =>
      setInsightsGenerator(providerInsightsGenerator(provider)),
  },
} satisfies Record<ModelSeam, SeamSpec>;

/**
 * The identity `embedding_model` records for this provider and model.
 *
 * The width is `EMBEDDING_DIMENSIONS`, not the configured
 * `AI_EMBEDDING_DIMENSIONS`: `EmbeddingActor` refuses any other, so no vector
 * of another width is ever stored. Images are embedded by
 * `gemini-embedding-2` on the two Google providers (`./gemini.ts`), and by
 * `openai-compatible` under the llama.cpp multimodal dialect
 * (`./openai-compatible.ts`, `createLlamacppEmbedder`).
 *
 * Under that dialect the model is written with a suffix —
 * `Qwen/Qwen3-VL-Embedding-2B#llamacpp-qwen3vl.v1-576` — naming the prompt
 * template's version and the image budget. Both change the vectors as surely
 * as the model does (the template moved a text vector to cosine 0.894; the
 * image budget moved an image vector to 0.962), so either change has to read
 * as a new model, which is what makes the re-embed job walk every row again.
 * The same model under the default `openai` dialect keeps its old key: its
 * vectors are text-only and untemplated, a different space.
 */
export const embeddingModelIdentity = (
  provider: AIProvider["name"],
  model: string,
  embeddingInput: EmbeddingInputDialect = "openai",
): EmbeddingModelIdentity => {
  const llamacpp =
    provider === "openai-compatible" &&
    embeddingInput === "llamacpp-multimodal";
  return {
    key: embeddingModelKey({
      provider,
      model: llamacpp ? `${model}#${LLAMACPP_EMBEDDING_VARIANT}` : model,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
    acceptsImages:
      llamacpp ||
      ((provider === "vertex-ai" || provider === "google-ai") &&
        isGeminiEmbedding2(model)),
  };
};

/**
 * Wire every seam in {@link SEAMS} onto an already-built provider.
 *
 * **Every seam gets its own metered binding** (X1c). `meteredProviderFor`
 * charges `BudgetActor` before the call and settles the measurement after, so
 * the table's rows are also the places model spend is accounted for — there
 * is no other path to a provider, because a seam factory takes a
 * `ProviderFor` and this function is the only thing that builds one.
 *
 * The seam name is the `api_budget_config.endpoint`, so the caps are
 * per-seam: an operator can raise menu extraction without raising embeddings,
 * and a loop in one seam cannot spend another's allowance.
 */
export const installSeams = (
  provider: AIProvider,
  loadImages: ImageLoader = daprImageLoader,
  models: SeamModels = modelsFor(provider),
  budget?: ModelBudget,
  embeddingInput: EmbeddingInputDialect = "openai",
): void => {
  // Not a seam, but installed with the embedder and from the same answer:
  // which embedding every vector this process writes is recorded as, and what
  // `regenerateVector` compares a stored vector's `embedding_model` against.
  setEmbeddingModel(
    embeddingModelIdentity(provider.name, models.embedding, embeddingInput),
  );
  for (const seam of MODEL_SEAMS) {
    const spec: SeamSpec = SEAMS[seam];
    spec.install(
      meteredProviderFor(provider, seam, models, {
        ...(budget === undefined ? {} : { budget }),
        ...(spec.entityType === undefined
          ? {}
          : { entityType: spec.entityType }),
      }),
      loadImages,
    );
  }
};

/**
 * The model ids a price is quoted against, when the caller passed a provider
 * instead of an environment (`installSeams` called directly, and the tests).
 *
 * A provider does not expose the models it resolved — `AIProvider` is three
 * methods and a name — so this cannot be read off it. The names only reach the
 * ledger's `metadata` and the rate table's prefix match, so an unknown name
 * prices at `UNKNOWN_PAID_RATE` for a paid provider and at zero for a free
 * one, which is the safe pair of answers. `installAI` passes the real ones.
 */
const modelsFor = (provider: AIProvider): SeamModels => ({
  low: `${provider.name}:unknown`,
  medium: `${provider.name}:unknown`,
  high: `${provider.name}:unknown`,
  embedding: `${provider.name}:unknown`,
});

export const installAI = (options: InstallOptions = {}): InstallResult => {
  const env = options.env ?? process.env;

  // The budget's own overrides, validated before anything else and whether or
  // not a provider is configured: `BudgetActor` reads them on every
  // activation, and it meters Google Places too, so a typo here used to boot a
  // healthy-looking host whose every budget call — autocomplete included —
  // then threw. Not caught, for the same reason the provider config below is
  // not: it must stop the boot. See `readModelBudgetPolicy`.
  readModelBudgetPolicy(env);

  // Throws on a value that is not one of the three — a typo is a
  // misconfiguration, not a request to run without a model.
  const selected = selectProvider(env);
  if (selected === null && options.provider === undefined) {
    const reason =
      "AI_PROVIDER is unset, so no AI provider is wired. Semantic search, " +
      "menu scanning, recipe photos, item onboarding, tier-list insights and " +
      "user place review will each fail with their own error naming this. Set " +
      "AI_PROVIDER=ollama for a local model with no credentials — see " +
      "services/actors/README.md.";
    console.warn(`[ai] ${reason}`);
    return { installed: false, reason };
  }

  // Throws if a required value for the selected provider is missing. Not
  // caught: an incomplete configuration must stop the boot.
  const config = readAIProviderConfig(env);
  const provider = options.provider ?? createAIProvider({ env });
  installSeams(
    provider,
    options.loadImages,
    { ...config.models, embedding: config.embeddingModel },
    options.budget,
    config.provider === "openai-compatible" ? config.embeddingInput : "openai",
  );

  const models = [
    `embed=${config.embeddingModel}@${config.embeddingDimensions}`,
    ...(config.provider === "openai-compatible" &&
    config.embeddingInput === "llamacpp-multimodal"
      ? [`embed-input=llamacpp-multimodal#${LLAMACPP_EMBEDDING_VARIANT}`]
      : []),
    `low=${config.models.low}`,
    `medium=${config.models.medium}`,
    `high=${config.models.high}`,
  ];
  console.log(`[ai] provider ${provider.name}; ${models.join(" ")}`);
  return { installed: true, provider: provider.name, models };
};
