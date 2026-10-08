/**
 * `viewer.aiCapabilities` (N07, D25): what this deployment's AI can do, so a
 * surface hides a feature the configured provider genuinely cannot serve
 * instead of offering it and refusing. Read through `lib/ai/capabilities.ts`.
 */
import { graphql } from "./graphql.ts";

export const AiCapabilitiesQuery = graphql(`
  query AiCapabilities {
    me {
      id
      aiCapabilities {
        semanticSearch
        imageSearch
        labelRead
        menuScan
        recipePhoto
        tierListInsights
      }
    }
  }
`);
