/**
 * The vision seam for `RecipePhotoJobActor` — C4.
 *
 * Same shape and same reason as `item-defaults.ts` (B2), `google-places.ts`
 * (B5) and `menu-ai.ts` (B8): `services/actors` has no AI provider wired and this
 * repository holds no credentials, so what lives here is a *type* plus an
 * injectable implementation whose default **throws loudly rather than faking
 * success**.
 *
 * A stub that returned an empty extraction would be especially bad here: the
 * job's whole output is a recipe, so "succeeded with no recipe" would complete
 * a job, mark it `completed`, and leave the user with nothing and no error.
 * `unconfiguredRecipePhotoExtractor` throws `ConflictError` instead, which the
 * outbox retries and which `services/api` reports as a state problem rather than
 * an `INTERNAL`.
 *
 * ## What the model is asked for
 *
 * One structured answer per photo — `ExtractedRecipe` in
 * `@cellar-assistant/contracts` — replacing `processRecipePhoto`'s
 * `generateFlexibleRecipeSchema`. Two things that schema had are deliberately
 * gone:
 *
 *  - **the `recipes` array.** The old prompt allowed a photo to yield several
 *    recipes and then wrote all of them under one action call. A job is one
 *    photo and one recipe; a menu of many is what `MenuScanActor` is for.
 *  - **the per-ingredient `creation_confidence` / `matching_priority` /
 *    `should_be_specific` triad.** Those drove a create-or-match decision in
 *    the old `_utils/recipe-database`, which this port makes structurally
 *    (see `recipe-photo-matching.ts`): the search decides whether a real item
 *    exists, and everything else becomes a generic item.
 */
import type { Ctx, ExtractedRecipe } from "@cellar-assistant/contracts";
import { ConflictError } from "@cellar-assistant/contracts";

export type RecipePhotoExtractionRequest = {
  readonly jobId: string;
  /** `files.id` of the photo, already verified by `FileActor`. */
  readonly fileId: string;
  readonly additionalFileIds: readonly string[];
  /** Whatever the user typed alongside the photo. Prompt context. */
  readonly notes: string | null;
};

export type RecipePhotoExtraction = {
  readonly recipe: ExtractedRecipe;
  /** Recorded in `jobs.cursor.model`, the way `menu_scans.processing_model` is. */
  readonly model: string;
};

export type RecipePhotoExtractor = (
  ctx: Ctx,
  request: RecipePhotoExtractionRequest,
) => Promise<RecipePhotoExtraction>;

export const unconfiguredRecipePhotoExtractor: RecipePhotoExtractor =
  async () => {
    throw new ConflictError(
      "no AI provider is configured to read a recipe photo. " +
        "`RecipePhotoJobActor` cannot run its `extract` stage until AI_PROVIDER " +
        "is set — `installAI()` installed nothing at boot. Set AI_PROVIDER=ollama " +
        `for a local model that needs no credentials. See services/actors/README.md · Local AI.`,
    );
  };

let extractor: RecipePhotoExtractor = unconfiguredRecipePhotoExtractor;

export const setRecipePhotoExtractor = (next: RecipePhotoExtractor): void => {
  extractor = next;
};

export const recipePhotoExtractor = (): RecipePhotoExtractor => extractor;
