/**
 * Integration tests for recipe group creation
 */

import {
  determineGroupingAction,
  type RecipeGroupCandidate,
} from "../recipe-group-creation";

describe("Recipe Group Creation", () => {
  describe("determineGroupingAction", () => {
    const mockCandidates: RecipeGroupCandidate[] = [
      {
        id: "1",
        name: "Classic Martini",
        description: "A classic gin martini",
        category: "cocktail",
        base_spirit: "GIN",
        canonical_recipe_id: "recipe-1",
        recipes_aggregate: {
          aggregate: { count: 3 },
        },
        similarity_score: 0.9,
        confidence: "high",
      },
      {
        id: "2",
        name: "Dry Martini",
        description: "A dry gin martini",
        category: "cocktail",
        base_spirit: "GIN",
        canonical_recipe_id: "recipe-2",
        recipes_aggregate: {
          aggregate: { count: 2 },
        },
        similarity_score: 0.7,
        confidence: "medium",
      },
    ];

    it("should auto-group for high similarity (>=85%)", () => {
      const result = determineGroupingAction(mockCandidates);

      expect(result.action).toBe("auto-group");
      expect(result.groupId).toBe("1");
      expect(result.groupName).toBe("Classic Martini");
      expect(result.bestMatch?.id).toBe("1");
      expect(result.suggestions).toHaveLength(2);
    });

    it("should request confirmation for medium similarity (60-84%)", () => {
      const mediumSimilarityCandidates = [
        {
          ...mockCandidates[0],
          similarity_score: 0.75,
          confidence: "medium" as const,
        },
        ...mockCandidates.slice(1),
      ];

      const result = determineGroupingAction(mediumSimilarityCandidates);

      expect(result.action).toBe("confirm");
      expect(result.groupId).toBeUndefined();
      expect(result.bestMatch?.id).toBe("1");
      expect(result.suggestions).toHaveLength(2);
    });

    it("should create new group for low similarity (<60%)", () => {
      const lowSimilarityCandidates = [
        {
          ...mockCandidates[0],
          similarity_score: 0.5,
          confidence: "low" as const,
        },
        {
          ...mockCandidates[1],
          similarity_score: 0.3,
          confidence: "low" as const,
        },
      ];

      const result = determineGroupingAction(lowSimilarityCandidates);

      expect(result.action).toBe("create-new");
      expect(result.groupId).toBeUndefined();
      expect(result.suggestions).toHaveLength(2);
    });

    it("should create new group when no candidates", () => {
      const result = determineGroupingAction([]);

      expect(result.action).toBe("create-new");
      expect(result.groupId).toBeUndefined();
      expect(result.suggestions).toHaveLength(0);
      expect(result.bestMatch).toBeUndefined();
    });

    it("should handle edge case at exact thresholds", () => {
      // Test exactly at 85% threshold
      const exactHighThreshold = [
        {
          ...mockCandidates[0],
          similarity_score: 0.85,
        },
      ];

      const highResult = determineGroupingAction(exactHighThreshold);
      expect(highResult.action).toBe("auto-group");

      // Test exactly at 60% threshold
      const exactMediumThreshold = [
        {
          ...mockCandidates[0],
          similarity_score: 0.6,
        },
      ];

      const mediumResult = determineGroupingAction(exactMediumThreshold);
      expect(mediumResult.action).toBe("confirm");

      // Test just below 60% threshold
      const belowMediumThreshold = [
        {
          ...mockCandidates[0],
          similarity_score: 0.59,
        },
      ];

      const lowResult = determineGroupingAction(belowMediumThreshold);
      expect(lowResult.action).toBe("create-new");
    });
  });
});
