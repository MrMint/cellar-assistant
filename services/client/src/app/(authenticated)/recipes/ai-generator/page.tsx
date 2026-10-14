import { redirect } from "next/navigation";

/**
 * `/recipes/ai-generator` — the old orphaned generator. Its job is now New
 * recipe › Photo (X15), which starts reading the moment a photo is chosen;
 * old links land there.
 */
export default function AIRecipeGeneratorPage(): never {
  redirect("/recipes/new?from=photo");
}
