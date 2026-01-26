import { createAIProvider } from "./factory";
import type { ModelQuality } from "./types";

export async function generateWithAI(
  prompt: string,
  quality: ModelQuality = "low",
): Promise<string> {
  const provider = await createAIProvider();

  const response = await provider.generateContent(
    {
      prompt,
    },
    quality,
  );

  return response.content;
}
