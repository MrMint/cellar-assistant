import { convert } from "convert";

/**
 * Unit mappings for convert.js compatibility
 * Maps recipe units to convert.js unit names
 */
const UNIT_MAPPINGS = {
  // Volume units
  oz: "fl oz",
  "fl oz": "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  cup: "cup",
  cups: "cup",
  pint: "pint",
  pints: "pint",
  quart: "quart",
  quarts: "quart",
  gallon: "gallon",
  gallons: "gallon",
  liter: "liter",
  liters: "liter",
  l: "liter",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tablespoon",
  tablespoons: "tablespoon",

  // Weight units
  lb: "lb",
  lbs: "lb",
  pound: "pound",
  pounds: "pound",
  kg: "kg",
  kilogram: "kilogram",
  kilograms: "kilogram",
  g: "g",
  gram: "gram",
  grams: "gram",
  mg: "mg",
  milligram: "milligram",
  milligrams: "milligram",
} as const;

/**
 * Custom conversions for units not supported by convert.js
 */
const CUSTOM_CONVERSIONS = {
  dash: { value: 0.6, unit: "ml" },
  dashes: { value: 0.6, unit: "ml" },
  splash: { value: 5, unit: "ml" },
  drop: { value: 0.05, unit: "ml" },
  drops: { value: 0.05, unit: "ml" },
} as const;

/**
 * Convert quantity and unit to metric standard using convert.js
 */
export function standardizeUnit(
  quantity: number,
  unit: string,
): { quantity: number; unit: string } {
  const normalizedUnit = unit.toLowerCase().trim();

  // Handle special cases that don't convert
  const nonConvertibleUnits = [
    "piece",
    "pieces",
    "pc",
    "pcs",
    "slice",
    "slices",
    "wheel",
    "wheels",
    "twist",
    "twists",
    "sprig",
    "sprigs",
    "leaf",
    "leaves",
    "layer",
    "layers",
    "garnish",
    "garnishes",
    "pinch",
    "pinches",
    "each",
    "whole",
    "dollop",
    "dollops",
    "sprinkle",
    "sprinkles",
    "dropper",
    "droppers",
  ];

  if (nonConvertibleUnits.includes(normalizedUnit)) {
    return { quantity, unit: normalizedUnit };
  }

  // Handle custom conversions first
  const customConversion =
    CUSTOM_CONVERSIONS[normalizedUnit as keyof typeof CUSTOM_CONVERSIONS];
  if (customConversion) {
    return {
      quantity: Math.round(quantity * customConversion.value * 100) / 100,
      unit: customConversion.unit,
    };
  }

  // Try convert.js for standard units
  const convertUnit =
    UNIT_MAPPINGS[normalizedUnit as keyof typeof UNIT_MAPPINGS];
  if (convertUnit) {
    try {
      // Determine target unit based on whether it's volume or mass
      const volumeUnits = [
        "fl oz",
        "cup",
        "pint",
        "quart",
        "gallon",
        "liter",
        "ml",
        "tsp",
        "tbsp",
        "tablespoon",
      ];
      const isVolume = volumeUnits.includes(convertUnit);
      const targetUnit = isVolume ? "ml" : "g";

      const convertedQuantity = convert(quantity, convertUnit).to(targetUnit);

      return {
        quantity: Math.round(convertedQuantity * 100) / 100, // Round to 2 decimal places
        unit: targetUnit,
      };
    } catch (error) {
      console.warn(
        `Failed to convert ${quantity} ${unit} using convert.js:`,
        error,
      );
    }
  }

  // Return original if no conversion found
  console.warn(`No conversion found for unit: ${unit}`);
  return { quantity, unit: normalizedUnit };
}

/**
 * Convert between any two compatible units using convert.js
 * @param quantity - The numeric value to convert
 * @param fromUnit - The source unit
 * @param toUnit - The target unit
 * @returns The converted quantity, or null if conversion is not possible
 */
export function convertUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const normalizedFromUnit = fromUnit.toLowerCase().trim();
  const normalizedToUnit = toUnit.toLowerCase().trim();

  // Handle custom conversions
  const customFrom =
    CUSTOM_CONVERSIONS[normalizedFromUnit as keyof typeof CUSTOM_CONVERSIONS];
  const customTo =
    CUSTOM_CONVERSIONS[normalizedToUnit as keyof typeof CUSTOM_CONVERSIONS];

  if (customFrom || customTo) {
    // If either unit is custom, convert through ml first
    if (customFrom && normalizedToUnit === "ml") {
      return Math.round(quantity * customFrom.value * 100) / 100;
    }
    if (customTo && normalizedFromUnit === "ml") {
      return Math.round((quantity / customTo.value) * 100) / 100;
    }
    if (customFrom && customTo) {
      // Both are custom, convert through ml
      const mlValue = quantity * customFrom.value;
      return Math.round((mlValue / customTo.value) * 100) / 100;
    }
  }

  // Try convert.js for standard units
  const convertFromUnit =
    UNIT_MAPPINGS[normalizedFromUnit as keyof typeof UNIT_MAPPINGS];
  const convertToUnit =
    UNIT_MAPPINGS[normalizedToUnit as keyof typeof UNIT_MAPPINGS];

  if (convertFromUnit && convertToUnit) {
    try {
      const convertedQuantity = convert(quantity, convertFromUnit).to(
        convertToUnit,
      );
      return Math.round(convertedQuantity * 100) / 100;
    } catch (error) {
      console.warn(
        `Failed to convert ${quantity} ${fromUnit} to ${toUnit}:`,
        error,
      );
    }
  }

  return null;
}

/**
 * Check if two units are compatible for conversion
 * @param unit1 - First unit
 * @param unit2 - Second unit
 * @returns True if units can be converted between each other
 */
export function areUnitsCompatible(unit1: string, unit2: string): boolean {
  const result = convertUnit(1, unit1, unit2);
  return result !== null;
}

/**
 * Get the standard unit for a given unit (ml for volume, g for weight)
 * @param unit - The unit to check
 * @returns The standard unit ('ml', 'g', or the original unit if not convertible)
 */
export function getStandardUnit(unit: string): string {
  const result = standardizeUnit(1, unit);
  return result.unit;
}
