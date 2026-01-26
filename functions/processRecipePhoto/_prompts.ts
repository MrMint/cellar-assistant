import type { AllEnumValues } from "../_utils/shared-enums";

/**
 * Core extraction rules and methodology
 */
function getCoreExtractionRules(): string {
  return `
## 🎯 CORE EXTRACTION RULES

1. **Extract EVERY recipe** you can identify in the image
2. **Be thorough and complete** - include all ingredients with quantities and full instructions
3. **Use professional cocktail/culinary terminology** and proper technique names
4. **Separate brand names from product names** for better inventory matching
5. **Convert measurements to metric** when possible (ml, g)
6. **Provide realistic confidence scores** based on clarity and completeness`;
}

/**
 * Ingredient classification guidance
 */
function getIngredientClassificationGuidance(): string {
  return `
## 🏷️ INGREDIENT CLASSIFICATION (CRITICAL)

**Primary Categories:**
- **wine**: Sake, wine varietals, champagne, prosecco, vermouth, sherry, port
- **beer**: All beer styles, lagers, ales, ciders (if alcoholic)
- **spirit**: Whiskey, gin, vodka, rum, tequila, brandy, liqueurs, amaro, aperitifs
- **coffee**: Coffee beans, espresso, cold brew, coffee liqueurs
- **ingredient**: Everything else (mixers, garnishes, spices, syrups, citrus, etc.)

**Database Categorization (detailed values provided in schema):**

Use our established database categories when possible - specific enum options are detailed in the JSON schema field descriptions. If you encounter categories not listed in our database, suggest them in the "suggested_" fields.

**⚠️ FLEXIBILITY NOTE**: If you encounter spirit types, wine styles, beer styles, or other categories NOT in the above lists, still include them in the "suggested_" fields. We may be missing enum values and want to discover gaps in our database.`;
}

/**
 * Item classification guidance for database matching
 */
function getItemClassificationGuidance(): string {
  return `
## 🎯 ITEM CLASSIFICATION FOR DATABASE MATCHING (CRITICAL)

For EVERY ingredient, determine if it should be a SPECIFIC item or GENERIC item:

**SPECIFIC ITEMS** (create specific wine/beer/spirit/coffee records):
- Have clear brand identification ("Hendrick's Gin", "Macallan 18", "Dom Pérignon")
- Specific product names that matter for the recipe
- Detailed characteristics that affect taste/quality
- Premium or craft products where brand matters
- Vintage wines where the year is important
- Examples: "Nikka Coffey Malt Whisky", "Lagavulin 16", "Champagne Dom Pérignon"

**GENERIC ITEMS** (use generic_items table):
- Category-level ingredients without specific brand importance
- Common mixers, syrups, and basic components
- Ingredients where any brand would work equally
- Simple garnishes and basic ingredients
- House-made ingredients that can't be purchased
- Examples: "Simple Syrup", "Lime Juice", "Club Soda", "Salt", "Egg White"

**OUTPUT REQUIREMENTS FOR EVERY INGREDIENT:**
- Add 'should_be_specific' boolean field
- Add 'database_item_type' field: 'wine'|'beer'|'spirit'|'coffee'|'generic'
- Add 'matching_priority' field: 'exact_brand'|'category_match'|'generic_fallback'
- Add 'creation_confidence' field: 0.0-1.0 (how confident you are about creating this item)
- Add 'brand_importance' field: 'critical'|'preferred'|'optional'
- Add 'substitution_flexibility' field: 'none'|'similar_brand'|'any_category'

**CLASSIFICATION EXAMPLES:**
✅ "Hendrick's Gin" → should_be_specific: true, database_item_type: 'spirit', creation_confidence: 0.95
✅ "Simple Syrup" → should_be_specific: false, database_item_type: 'generic', creation_confidence: 1.0
✅ "Macallan 18" → should_be_specific: true, database_item_type: 'spirit', creation_confidence: 0.9
✅ "Lime Juice" → should_be_specific: false, database_item_type: 'generic', creation_confidence: 1.0
✅ "Dom Pérignon 2012" → should_be_specific: true, database_item_type: 'wine', creation_confidence: 0.85

**BRAND IMPORTANCE LEVELS:**
- 'critical': Brand is essential to the recipe (premium spirits, specific wine producers)
- 'preferred': Brand matters but substitutions possible (craft beer, mid-tier spirits)  
- 'optional': Brand doesn't significantly impact the recipe (basic mixers with brands)

**SUBSTITUTION FLEXIBILITY:**
- 'none': No substitutions acceptable (vintage wines, signature spirits)
- 'similar_brand': Same category/style from different brands (London Dry Gin varieties)
- 'any_category': Any item in the broader category works (any white wine, any vodka)`;
}

/**
 * Advanced cocktail and culinary technique recognition
 */
function getAdvancedTechniqueRecognition(): string {
  return `
## 🔬 ADVANCED TECHNIQUE RECOGNITION

Identify and properly describe these professional techniques:

**Clarification Techniques:**
- Milk washing/clarification 
- Gelatin clarification
- Cold filtration
- Centrifuge clarification

**Smoking & Aromatics:**
- Smoking gun with wood chips
- Smoked glassware
- Aromatic garnishes
- Essential oil expressions

**Molecular/Modern Techniques:**
- Foams and airs (lecithin, cream whipper)
- Spherification
- Gelification
- Liquid nitrogen (if mentioned)

**Classic Cocktail Techniques:**
- Dry shake → Wet shake (for egg whites/aquafaba)
- Double straining
- Building vs. stirring vs. shaking
- Muddling
- Fat washing
- Infusions and tinctures`;
}

/**
 * Measurement standardization rules
 */
function getMeasurementStandardization(): string {
  return `
## 📏 MEASUREMENT STANDARDIZATION

**Convert to Metric When Possible:**
- 1 oz = 30ml
- 1 dash = 0.6ml
- 1 splash = 5ml
- 1 tsp = 5ml
- 1 tbsp = 15ml
- 1 cup = 240ml

**Preserve Original Units:**
- Include both original and converted measurements
- Keep original for reference/authenticity

**Non-Convertible Units (keep as-is):**
- piece, slice, wheel, twist, sprig, leaf, layer, garnish, pinch, dollop`;
}

/**
 * Difficulty calibration guidelines
 */
function getDifficultyCalibration(): string {
  return `
## 🎚️ DIFFICULTY CALIBRATION (1-5 Scale)

**Level 1 - Simple:** Spirit + mixer + garnish (Highball, G&T)
**Level 2 - Basic Cocktail:** 3-4 ingredients, shake or stir (Manhattan, Daiquiri)
**Level 3 - Complex Cocktail:** 5+ ingredients, multiple steps (Ramos Gin Fizz, Paper Plane)
**Level 4 - Advanced Techniques:** Clarification, smoking, infusions, specialty equipment
**Level 5 - Professional/Molecular:** Multiple advanced techniques, specialized equipment, lengthy prep`;
}

/**
 * Confidence scoring criteria
 */
function getConfidenceScoring(): string {
  return `
## 📊 CONFIDENCE SCORING (0.5-1.0)

**Recipe-Level Confidence:**
**0.9-1.0:** Crystal clear recipe, all details visible, professional menu presentation
**0.8-0.89:** Most details clear, minor assumptions on quantities or techniques
**0.7-0.79:** Some details unclear, reasonable assumptions made, partial visibility
**0.6-0.69:** Significant assumptions, missing some ingredients or steps
**0.5-0.59:** High uncertainty, major elements unclear but still extractable

**Ingredient Creation Confidence:**
**0.9-1.0:** Very confident, clear brand/product identification or obvious generic items
**0.8-0.89:** Confident, good brand recognition with minor uncertainty
**0.7-0.79:** Moderate confidence, some ambiguity in product details
**0.6-0.69:** Low confidence, unclear or generic product name
**0.5-0.59:** Very uncertain, should probably be generic item

**Remember:** Confidence reflects your certainty about the extraction, not perfection of the image.`;
}

/**
 * Brand and product separation guidelines
 */
function getBrandProductSeparation(): string {
  return `
## 🏢 BRAND/PRODUCT SEPARATION

**Examples:**
✅ "Nikka Coffey Malt Whisky" → brand_name: "Nikka", product_name: "Coffey Malt Whisky", generic_name: "Japanese Whisky"
✅ "Tanteo Blanco Tequila" → brand_name: "Tanteo", product_name: "Blanco", generic_name: "Blanco Tequila"
✅ "Giffard Orgeat" → brand_name: "Giffard", product_name: "Orgeat", generic_name: "Almond Syrup"
✅ "Moon on the Water Sake" → brand_name: "Moon on the Water", wine_style: "SAKE", generic_name: "Junmai Sake"`;
}

/**
 * Instruction quality standards
 */
function getInstructionQualityStandards(): string {
  return `
## 📝 INSTRUCTION QUALITY STANDARDS

**Use Proper Technique Terms:**
- "Dry shake for 15 seconds, then add ice and wet shake"
- "Stir with ice for 20-25 seconds until properly diluted"
- "Double strain through fine mesh to remove ice shards"
- "Express lemon oils over the drink and discard peel"
- "Smoke glass with apple wood, then build cocktail over ice"

**Include Timing and Temperature:**
- Specific shake/stir times
- Temperature requirements ("well-chilled", "room temperature")
- Prep time for complex elements`;
}

/**
 * Enhanced flavor profile extraction guidance
 */
function getFlavorProfileGuidance(): string {
  return `
## 🎨 FLAVOR PROFILE EXTRACTION (CRITICAL REQUIREMENT)

For EVERY ingredient, provide 2-4 flavor descriptors from this vocabulary:
**Primary Flavors:** sweet, bitter, sour, salty, umami
**Style Descriptors:** smoky, citrus, floral, herbal, spicy, nutty, fruity, earthy, creamy, crisp, rich, light, bold, tropical, vegetal, toasted, mineral

**Examples:**
- Nikka Coffey Malt Whisky → ["malty", "nutty", "rich"]
- Roku Gin → ["botanical", "citrus", "floral"] 
- Cynar Amaro → ["bitter", "herbal", "vegetal"]
- Lime Juice → ["sour", "citrus"]
- Fish Sauce Air → ["umami", "savory", "salty"]`;
}

/**
 * Instruction timing and equipment guidance
 */
function getInstructionTimingGuidance(): string {
  return `
## ⏱️ INSTRUCTION TIMING & EQUIPMENT (UPGRADED)

**Enhanced Instruction Requirements:**
- Include SPECIFIC timing (e.g., "15 seconds", "20-25 seconds")
- Specify equipment when needed ("mixing glass", "shaker tin", "smoking gun")
- Use EXACT instruction_type enums: "PREPARE", "MIX", "SHAKE", "STIR", "STRAIN", "FINISH", "GARNISH"

**Professional Timing Standards:**
- Dry shake: 15 seconds
- Wet shake: 12-15 seconds  
- Stirring: 20-25 seconds
- Clarification prep: Note as batch technique`;
}

/**
 * Quantity precision requirements
 */
function getQuantityPrecisionRules(): string {
  return `
## 📐 QUANTITY PRECISION (CRITICAL)

**Measurement Requirements:**
- ALWAYS include quantity + unit for every ingredient
- Convert to ml when possible (1 oz = 30ml)
- For non-measurable items: use "piece", "layer", "dash", "splash"
- Include original measurements in original_quantity/original_unit

**Examples:**
- "1.5 oz" → quantity: 45, unit: "ml", original_quantity: 1.5, original_unit: "oz"
- "2 dashes" → quantity: 2, unit: "dash"
- "1 layer" → quantity: 1, unit: "layer"`;
}

/**
 * Equipment specification guidelines
 */
function getEquipmentSpecification(): string {
  return `
## 🎯 EQUIPMENT SPECIFICATION

**Equipment Categories:**
- **Mixing:** shaker tin, mixing glass, bar spoon
- **Straining:** Hawthorne strainer, fine mesh, double strain
- **Glassware:** coupe, rocks glass, highball, martini glass, teacup
- **Advanced:** smoking gun, immersion blender, cream whipper, centrifuge
- **Garnish:** channel knife, muddler, peeler`;
}

/**
 * Perfect extraction examples for few-shot learning
 */
function getPerfectExtractionExamples(): string {
  return `
## 📚 PERFECT EXTRACTION EXAMPLES

**Example 1 - Complete TCMM Recipe (ai-pro-2.json quality):**
\`\`\`json
{
  "name": "TCMM",
  "description": "Margarita based in Traditional Chinese Medicine. Flavor profile: Fruity, Refreshing, Salty.",
  "type": "COCKTAIL",
  "difficulty_level": 3,
  "prep_time_minutes": 3,
  "serving_size": 1,
  "instructions": [
    {
      "instruction_type": "PREPARE",
      "technique_notes": "Chill a rocks glass."
    },
    {
      "instruction_type": "MIX", 
      "technique_notes": "Combine all ingredients except the ginger tincture in a shaker with ice."
    },
    {
      "instruction_type": "SHAKE",
      "technique_notes": "Shake vigorously for 12-15 seconds until well-chilled."
    },
    {
      "instruction_type": "STRAIN",
      "technique_notes": "Strain into the chilled rocks glass over fresh ice."
    },
    {
      "instruction_type": "FINISH",
      "technique_notes": "Garnish with a lime wheel and a few drops of House Ginger Tincture."
    }
  ],
  "ingredients": [
    {
      "name": "Tanteo Blanco",
      "brand_name": "Tanteo",
      "product_name": "Blanco", 
      "generic_name": "Blanco Tequila",
      "quantity": 45,
      "unit": "ml",
      "item_type": "spirit",
      "spirit_type": "TEQUILA",
      "country": "MEXICO",
      "flavor_profile": ["agave", "spicy"]
    },
    {
      "name": "Moon on the Water Sake",
      "brand_name": "Moon on the Water",
      "product_name": "Sake",
      "generic_name": "Junmai Sake",
      "quantity": 15,
      "unit": "ml",
      "item_type": "wine",
      "wine_style": "SAKE",
      "country": "JAPAN",
      "flavor_profile": ["rice", "fruity"]
    },
    {
      "name": "Apricot Liqueur",
      "brand_name": null,
      "product_name": "Apricot Liqueur",
      "generic_name": "Apricot Liqueur",
      "quantity": 15,
      "unit": "ml",
      "item_type": "spirit",
      "spirit_type": "LIQUEURS",
      "category": "Liqueur",
      "subcategory": "Fruit Liqueur",
      "flavor_profile": ["apricot", "sweet"]
    },
    {
      "name": "Cynar Amaro",
      "brand_name": "Cynar",
      "product_name": "Amaro",
      "generic_name": "Artichoke Amaro",
      "quantity": 7.5,
      "unit": "ml",
      "item_type": "spirit",
      "spirit_type": "AMARO_APERITIF_VERMOUTH",
      "country": "ITALY",
      "flavor_profile": ["bitter", "herbal", "vegetal"]
    },
    {
      "name": "Agave",
      "brand_name": null,
      "product_name": "Agave Nectar",
      "generic_name": "Agave Syrup",
      "quantity": 10,
      "unit": "ml",
      "item_type": "ingredient",
      "category": "Syrup",
      "flavor_profile": ["sweet"]
    },
    {
      "name": "Lime",
      "brand_name": null,
      "product_name": "Lime Juice",
      "generic_name": "Lime Juice",
      "quantity": 22.5,
      "unit": "ml",
      "item_type": "ingredient",
      "category": "Mixer",
      "subcategory": "Citrus",
      "flavor_profile": ["sour", "citrus"]
    },
    {
      "name": "House Ginger Tincture",
      "brand_name": null,
      "product_name": "House Ginger Tincture",
      "generic_name": "Ginger Tincture",
      "quantity": 2,
      "unit": "dash",
      "item_type": "ingredient",
      "category": "Tincture",
      "flavor_profile": ["spicy", "ginger"]
    }
  ],
  "confidence": 0.9
}
\`\`\`


**Example 2 - Complete Shanghai Fog Recipe (advanced techniques):**
\`\`\`json
{
  "name": "SHANGHAI FOG",
  "description": "THE Shanghai MKE Concoction. Flavor profile: Floral, Sweet, Creamy.",
  "type": "COCKTAIL",
  "difficulty_level": 4,
  "prep_time_minutes": 5,
  "serving_size": 1,
  "instructions": [
    {
      "instruction_type": "PREPARE",
      "technique_notes": "Chill a teacup or coupe glass."
    },
    {
      "instruction_type": "MIX",
      "technique_notes": "Combine all ingredients in a shaker tin without ice."
    },
    {
      "instruction_type": "SHAKE", 
      "technique_notes": "Dry shake vigorously for 15 seconds to emulsify the egg white."
    },
    {
      "instruction_type": "SHAKE",
      "technique_notes": "Add ice to the shaker and perform a wet shake for another 12-15 seconds until well-chilled."
    },
    {
      "instruction_type": "STRAIN",
      "technique_notes": "Double strain into the chilled teacup."
    },
    {
      "instruction_type": "GARNISH",
      "technique_notes": "Garnish with a few drops of Lavender Bitters on top of the foam."
    }
  ],
  "ingredients": [
    {
      "name": "Rishi Earl Grey-infused Gin",
      "brand_name": "Rishi",
      "product_name": "Earl Grey Infused Gin",
      "generic_name": "Infused Gin",
      "quantity": 45,
      "unit": "ml",
      "item_type": "spirit",
      "spirit_type": "GIN",
      "flavor_profile": ["earl grey", "bergamot", "botanical"]
    },
    {
      "name": "Mesh & Bone Shochu",
      "brand_name": "Mesh & Bone",
      "product_name": "Shochu",
      "generic_name": "Shochu",
      "quantity": 15,
      "unit": "ml",
      "item_type": "spirit",
      "suggested_spirit_type": "SHOCHU",
      "country": "JAPAN",
      "flavor_profile": ["earthy", "nutty", "smooth"]
    },
    {
      "name": "Giffard Orgeat",
      "brand_name": "Giffard",
      "product_name": "Orgeat",
      "generic_name": "Almond Syrup",
      "quantity": 15,
      "unit": "ml",
      "item_type": "ingredient",
      "category": "Syrup",
      "flavor_profile": ["almond", "sweet", "floral"]
    },
    {
      "name": "Oat Milk",
      "brand_name": null,
      "product_name": "Oat Milk",
      "generic_name": "Oat Milk",
      "quantity": 22.5,
      "unit": "ml",
      "item_type": "ingredient",
      "category": "Mixer",
      "flavor_profile": ["creamy", "oat", "nutty"]
    },
    {
      "name": "Egg Whites",
      "brand_name": null,
      "product_name": "Egg White",
      "generic_name": "Egg White",
      "quantity": 1,
      "unit": "piece",
      "item_type": "ingredient",
      "category": "Emulsifier",
      "flavor_profile": ["neutral"]
    },
    {
      "name": "Lemon",
      "brand_name": null,
      "product_name": "Lemon Juice",
      "generic_name": "Lemon Juice",
      "quantity": 22.5,
      "unit": "ml",
      "item_type": "ingredient",
      "category": "Mixer",
      "subcategory": "Citrus",
      "flavor_profile": ["sour", "citrus"]
    },
    {
      "name": "Lavender Bitters",
      "brand_name": null,
      "product_name": "Lavender Bitters",
      "generic_name": "Floral Bitters",
      "quantity": 2,
      "unit": "dash",
      "item_type": "ingredient",
      "category": "Bitters",
      "flavor_profile": ["lavender", "floral", "aromatic"]
    }
  ],
  "confidence": 0.9
}
\`\`\`


**Key Pattern Recognition from These Perfect Examples:**
- **Complete ingredient lists**: TCMM has 7 ingredients, Shanghai Fog has 7 ingredients (never just 1-2)
- **Every ingredient has quantity + unit**: From 45ml spirits to 2 dash bitters to 1 piece egg white
- **Every ingredient has flavor_profile**: Even simple ones like ["sweet"] for agave syrup
- **Brand separation**: "Tanteo Blanco" → brand_name: "Tanteo", product_name: "Blanco"
- **Proper null handling**: brand_name: null when no brand (like "Lime" or "Egg Whites")
- **instruction_type uses EXACT enum values**: PREPARE, MIX, SHAKE, STRAIN, FINISH, GARNISH
- **Specific timing in technique_notes**: "12-15 seconds", "15 seconds" (not vague)
- **Professional terminology**: "Double strain", "dry shake", "wet shake", "emulsify"
- **Realistic confidence**: 0.9 (not 1.0 or 0.0)
- **Complete instruction sequences**: 5-6 steps for complex cocktails
- **Proper item_type classification**: spirit vs wine vs ingredient correctly assigned`;
}

/**
 * Quality validation checklist
 */
function getQualityValidationChecklist(): string {
  return `
## ✅ MANDATORY QUALITY CHECKLIST

Before finalizing your extraction, verify EVERY recipe meets these requirements:

**🎯 Completeness Requirements:**
- [ ] EVERY ingredient has quantity + unit (no exceptions)
- [ ] EVERY ingredient has flavor_profile array (2-4 descriptors)
- [ ] EVERY instruction has instruction_type from allowed enum
- [ ] ALL brand names separated from product names
- [ ] Confidence score reflects actual clarity (0.75-0.95 range)

**📊 Data Quality Requirements:**
- [ ] Quantities are logical (45ml not 450ml for a cocktail spirit)
- [ ] Units are appropriate (ml for liquids, piece for garnish, dash for bitters)
- [ ] instruction_type matches actual action (SHAKE for shaking, not MIX)
- [ ] spirit_type/wine_style uses database enums when possible
- [ ] Countries use proper enum values (JAPAN not Japan)

**🔍 Professional Standards:**
- [ ] Technique notes include specific timing when relevant
- [ ] Equipment specified for advanced techniques
- [ ] Flavor profiles are accurate and diverse
- [ ] Difficulty level matches complexity (clarification = 4+, simple = 1-2)
- [ ] Brand recognition is accurate (don't invent brands)

**❌ Common Mistakes to Avoid:**
- Don't use "mix" for everything - be specific (SHAKE, STIR, BUILD)
- Don't skip flavor profiles - every ingredient needs them
- Don't approximate quantities - be precise with conversions
- Don't merge brand+product into single field
- Don't set confidence to 1.0 unless absolutely perfect

**🎯 TARGET QUALITY LEVEL:**
Your output should match or exceed the quality of expensive AI models. Focus on:
1. Complete data (no missing fields)
2. Professional terminology
3. Accurate categorization  
4. Realistic confidence assessment
5. Rich metadata for matching`;
}

/**
 * Final instructions and output requirements
 */
function getFinalInstructions(): string {
  return `
## 🚀 FINAL INSTRUCTION

Extract recipes with the quality and completeness demonstrated in the examples above. Your output should be indistinguishable from premium AI model results - complete, accurate, and professionally detailed.

Focus on these priority improvements:
1. **Flavor Profiles**: Every ingredient gets 2-4 descriptors
2. **Precise Timing**: Include seconds for techniques  
3. **Complete Quantities**: No ingredient without measurement
4. **Professional Instructions**: Use exact enum types
5. **Rich Metadata**: Brand separation, countries, categories
6. **Realistic Confidence**: Use the 0.5-1.0 scale appropriately

Return valid JSON matching the schema exactly.`;
}

/**
 * Contextual analysis guidelines
 */
function getContextualAnalysis(): string {
  return `
## 🍽️ CONTEXTUAL ANALYSIS

Consider the venue type for accuracy:
- **Craft Cocktail Bar:** Complex techniques, premium spirits, house-made ingredients
- **Restaurant:** Simpler preparations, wine pairings, food-focused
- **Casual Bar:** Standard recipes, common spirits, straightforward techniques

## 🎯 OUTPUT REQUIREMENTS

Return valid JSON with:
- Complete ingredient lists with proper categorization
- Step-by-step instructions with technique notes
- Accurate difficulty ratings and confidence scores
- Brand/product separation for inventory matching
- Metric conversions with original preservation
- Enum gap suggestions for database improvement

Focus on completeness, accuracy, and professional quality that matches or exceeds expensive AI model results.`;
}

/**
 * Build comprehensive recipe extraction prompt with database enum guidance
 */
export function buildEnhancedRecipeExtractionPrompt(
  placeContext: string,
  _enumValues: AllEnumValues,
): string {
  const sections = [
    // Header and context with confidence emphasis
    `You are an expert recipe extraction AI with deep knowledge of cocktails, cooking, and beverage classification. 
Analyze this menu/recipe photo and extract ALL visible recipes with complete, professional-quality details.

${placeContext ? `VENUE CONTEXT: ${placeContext}` : ""}`,

    // Core methodology sections
    getCoreExtractionRules(),
    getIngredientClassificationGuidance(),
    getItemClassificationGuidance(),
    getAdvancedTechniqueRecognition(),
    getMeasurementStandardization(),
    getDifficultyCalibration(),
    getConfidenceScoring(),
    getBrandProductSeparation(),
    getInstructionQualityStandards(),

    // Enhanced requirement sections
    getFlavorProfileGuidance(),
    getInstructionTimingGuidance(),
    getQuantityPrecisionRules(),
    getEquipmentSpecification(),

    // Examples and validation
    getPerfectExtractionExamples(),
    getQualityValidationChecklist(),
    getConfidenceScoring(),
    getContextualAnalysis(),
    getFinalInstructions(),
  ];

  return sections.join("\n");
}

/**
 * Generate contextual examples based on venue type
 */
export function getVenueSpecificGuidance(placeContext: string): string {
  const context = placeContext.toLowerCase();

  if (
    context.includes("craft") ||
    context.includes("cocktail") ||
    context.includes("mixology")
  ) {
    return `
This appears to be a CRAFT COCKTAIL establishment. Expect:
- Advanced techniques (clarification, smoking, molecular)
- House-made ingredients (tinctures, syrups, bitters)
- Premium and artisanal spirits
- Complex flavor profiles and unusual ingredients
- Higher difficulty ratings (3-5) are appropriate
`;
  }

  if (context.includes("restaurant") || context.includes("dining")) {
    return `
This appears to be a RESTAURANT. Expect:
- Wine-focused beverage program
- Food-pairing considerations
- Moderate complexity cocktails (2-4 difficulty)
- Classic preparations with culinary twists
`;
  }

  if (
    context.includes("bar") ||
    context.includes("pub") ||
    context.includes("tavern")
  ) {
    return `
This appears to be a CASUAL BAR/PUB. Expect:
- Classic cocktail preparations
- Standard spirit brands
- Straightforward techniques (1-3 difficulty)
- Beer-focused selections
`;
  }

  return `
GENERAL ESTABLISHMENT. Analyze the visual complexity and presentation to determine:
- Sophistication level from menu design
- Ingredient complexity and presentation style
- Pricing indicators of quality level
`;
}

/**
 * Build place-specific context for more accurate extraction
 */
export function buildPlaceContext(placeData?: {
  name?: string;
  place_type?: string;
  cuisine_style?: string;
  description?: string;
  city?: string;
  state?: string;
}): string {
  if (!placeData) return "";

  const { name, place_type, cuisine_style, description, city, state } =
    placeData;

  let context = "";
  if (name) context += `${name}`;
  if (place_type) context += ` (${place_type})`;
  if (city && state) context += ` in ${city}, ${state}`;
  if (cuisine_style) context += `. Cuisine: ${cuisine_style}`;
  if (description) context += `. ${description}`;

  // Add venue-specific guidance
  if (context) {
    context += `\n\n${getVenueSpecificGuidance(context)}`;
  }

  return context;
}
