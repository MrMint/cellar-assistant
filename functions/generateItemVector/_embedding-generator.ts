/**
 * Schema-driven embedding text generator
 * Uses GraphQL types and configuration to generate rich, searchable embedding text
 */

import type { Beers, Coffees, Spirits, Wines } from "@cellar-assistant/shared";
import {
  formatBeerStyle,
  formatCountry,
  formatEnum,
  formatSpiritType,
  formatWineStyle,
  formatWineVariety,
} from "@cellar-assistant/shared/utility/index.js";
import {
  DESCRIPTION_KEYWORDS,
  EMBEDDING_CONFIGS,
  type ItemTypeKey,
} from "./_embedding-config";

// Type-safe item union
type AnyItem = Beers | Wines | Spirits | Coffees;

/**
 * Generate rich, searchable embedding text from any item using schema-driven configuration
 */
export function generateEmbeddingText(
  itemType: ItemTypeKey,
  item: AnyItem,
): string {
  const config = EMBEDDING_CONFIGS[itemType];
  const parts: string[] = [];

  // Add base category terms
  parts.push(...config.baseTerms);

  // Process primary fields (highest importance)
  for (const fieldConfig of config.primaryFields) {
    const value = item[fieldConfig.field as keyof typeof item];
    if (value != null) {
      // Add the formatted value
      if (
        "formatter" in fieldConfig &&
        fieldConfig.formatter &&
        typeof value === "number"
      ) {
        parts.push(...fieldConfig.formatter(value));
      } else {
        // Use appropriate formatter based on field name
        const formattedValue = formatFieldValue(
          String(fieldConfig.field),
          value,
        );
        parts.push(formattedValue);
      }

      // Add synonyms
      if ("synonyms" in fieldConfig && fieldConfig.synonyms) {
        parts.push(...fieldConfig.synonyms);
      }
    }
  }

  // Process enhancing fields (additional searchable content)
  for (const fieldConfig of config.enhancingFields) {
    const value = item[fieldConfig.field as keyof typeof item];
    if (value != null) {
      if (
        "formatter" in fieldConfig &&
        fieldConfig.formatter &&
        typeof value === "number"
      ) {
        parts.push(...fieldConfig.formatter(value));
      } else {
        const formattedValue = formatFieldValue(
          String(fieldConfig.field),
          value,
        );
        parts.push(formattedValue);
      }

      if ("synonyms" in fieldConfig && fieldConfig.synonyms) {
        parts.push(...fieldConfig.synonyms);
      }
    }
  }

  // Add type-specific keywords based on enum values
  addTypeSpecificKeywords(itemType, item, parts);

  // Add description-based keywords
  addDescriptionKeywords(itemType, item, parts);

  // Clean up: remove duplicates, empty values, and normalize
  return cleanupEmbeddingText(parts);
}

/**
 * Format a field value using the appropriate formatter
 */
function formatFieldValue(fieldName: string, value: unknown): string {
  const stringValue = value as string | null | undefined;

  switch (true) {
    case fieldName.includes("beer") && fieldName.includes("style"):
      return formatBeerStyle(stringValue) ?? String(value);
    case fieldName.includes("wine") && fieldName.includes("style"):
      return formatWineStyle(stringValue) ?? String(value);
    case fieldName.includes("variety"):
      return formatWineVariety(stringValue) ?? String(value);
    case fieldName.includes("spirit") && fieldName.includes("type"):
      return formatSpiritType(stringValue) ?? String(value);
    case fieldName.includes("country"):
      return formatCountry(stringValue) ?? String(value);
    case fieldName.includes("roast_level"):
      return formatEnum(stringValue) ?? String(value);
    default:
      return String(value);
  }
}

/**
 * Add type-specific keywords based on enum values
 */
function addTypeSpecificKeywords(
  itemType: ItemTypeKey,
  item: AnyItem,
  parts: string[],
): void {
  const config = EMBEDDING_CONFIGS[itemType];

  switch (itemType) {
    case "beers": {
      const beer = item as Beers;
      const beerConfig = config as typeof EMBEDDING_CONFIGS.beers;
      if (beer.style && "styleKeywords" in beerConfig) {
        const styleKey = String(
          beer.style,
        ) as keyof typeof beerConfig.styleKeywords;
        const keywords = beerConfig.styleKeywords[styleKey];
        if (keywords) {
          parts.push(...keywords);
        }
      }
      break;
    }

    case "wines": {
      const wine = item as Wines;
      const wineConfig = config as typeof EMBEDDING_CONFIGS.wines;
      if (wine.variety && "varietyKeywords" in wineConfig) {
        const varietyKey = String(
          wine.variety,
        ) as keyof typeof wineConfig.varietyKeywords;
        const keywords = wineConfig.varietyKeywords[varietyKey];
        if (keywords) {
          parts.push(...keywords);
        }
      }
      if (wine.style && "styleKeywords" in wineConfig) {
        const styleKey = String(
          wine.style,
        ) as keyof typeof wineConfig.styleKeywords;
        const keywords = wineConfig.styleKeywords[styleKey];
        if (keywords) {
          parts.push(...keywords);
        }
      }
      break;
    }

    case "spirits": {
      const spirit = item as Spirits;
      const spiritConfig = config as typeof EMBEDDING_CONFIGS.spirits;
      if (spirit.type && "typeKeywords" in spiritConfig) {
        const typeKey = String(
          spirit.type,
        ) as keyof typeof spiritConfig.typeKeywords;
        const keywords = spiritConfig.typeKeywords[typeKey];
        if (keywords) {
          parts.push(...keywords);
        }
      }
      break;
    }

    case "coffees": {
      const coffee = item as Coffees;
      const coffeeConfig = config as typeof EMBEDDING_CONFIGS.coffees;
      if (coffee.roast_level && "roastKeywords" in coffeeConfig) {
        const roastKey = String(
          coffee.roast_level,
        ) as keyof typeof coffeeConfig.roastKeywords;
        const keywords = coffeeConfig.roastKeywords[roastKey];
        if (keywords) {
          parts.push(...keywords);
        }
      }
      break;
    }
  }
}

/**
 * Add keywords based on description content using configurable patterns
 */
function addDescriptionKeywords(
  itemType: ItemTypeKey,
  item: AnyItem,
  parts: string[],
): void {
  if (item.description && typeof item.description === "string") {
    const description = item.description.toLowerCase();

    // Add description text directly
    parts.push(item.description);

    // Process universal patterns (apply to all items)
    processPatternGroup(DESCRIPTION_KEYWORDS.universal, description, parts);

    // Process item-type specific patterns
    if (itemType === "coffees") {
      processPatternGroup(DESCRIPTION_KEYWORDS.coffee, description, parts);
    } else {
      // All other types are alcoholic beverages
      processPatternGroup(DESCRIPTION_KEYWORDS.alcoholic, description, parts);
    }
  }
}

/**
 * Helper function to process a group of keyword patterns
 */
function processPatternGroup(
  patterns: readonly {
    triggers: readonly string[];
    keywords: readonly string[];
  }[],
  description: string,
  parts: string[],
): void {
  for (const pattern of patterns) {
    const hasMatch = pattern.triggers.some((trigger: string) =>
      description.includes(trigger.toLowerCase()),
    );

    if (hasMatch) {
      parts.push(...pattern.keywords);
    }
  }
}

/**
 * Clean up the embedding text by removing duplicates and normalizing
 */
function cleanupEmbeddingText(parts: string[]): string {
  // Filter out empty/null values
  const filteredParts = parts
    .filter(Boolean)
    .map((part) => String(part).trim());

  // Remove duplicates (case-insensitive)
  const uniqueParts: string[] = [];
  const seen = new Set<string>();

  for (const part of filteredParts) {
    const lowerPart = part.toLowerCase();
    if (!seen.has(lowerPart)) {
      seen.add(lowerPart);
      uniqueParts.push(part);
    }
  }

  // Join and normalize whitespace
  return uniqueParts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Get schema-aware field weight for prioritizing search results
 */
export function getFieldWeight(
  itemType: ItemTypeKey,
  fieldName: string,
): number {
  const config = EMBEDDING_CONFIGS[itemType];

  // Check primary fields first
  for (const field of config.primaryFields) {
    if (field.field === fieldName) {
      return field.weight || 5;
    }
  }

  // Check enhancing fields
  for (const field of config.enhancingFields) {
    if (field.field === fieldName) {
      return field.weight || 3;
    }
  }

  return 1; // Default weight
}
