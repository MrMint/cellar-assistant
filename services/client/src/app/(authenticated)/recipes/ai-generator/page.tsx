import { AIRecipeGenerator } from "@/components/recipe/AIRecipeGenerator";

/**
 * `/recipes/ai-generator` — `82450ad1:src/app/(authenticated)/recipes/ai-generator/page.tsx`,
 * restored as `AIRecipeGenerator` (the old page was itself a client component;
 * it moved beside the other recipe components so this route stays a server
 * entry with `dynamic` set).
 */
export const dynamic = "force-dynamic";

export default function AIRecipeGeneratorPage() {
  return <AIRecipeGenerator />;
}
