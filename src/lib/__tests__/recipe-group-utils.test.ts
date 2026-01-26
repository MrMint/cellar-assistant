/**
 * Tests for recipe group utility functions
 */

import {
  calculateGroupVotingStats,
  calculateNetScore,
  formatVoteCount,
  generateGroupName,
  getCanonicalRecipe,
  getConfidenceLevel,
  getSimilarityAction,
  rankRecipes,
  validateRecipeGroup,
} from "../recipe-group-utils";

describe("Recipe Group Utils", () => {
  describe("calculateNetScore", () => {
    it("should calculate net score correctly", () => {
      expect(calculateNetScore(5, 2)).toBe(3);
      expect(calculateNetScore(0, 0)).toBe(0);
      expect(calculateNetScore(1, 3)).toBe(-2);
    });
  });

  describe("formatVoteCount", () => {
    it("should format positive counts with +", () => {
      expect(formatVoteCount(5)).toBe("+5");
      expect(formatVoteCount(1)).toBe("+1");
    });

    it("should format zero without +", () => {
      expect(formatVoteCount(0)).toBe("0");
    });

    it("should format negative counts as-is", () => {
      expect(formatVoteCount(-3)).toBe("-3");
      expect(formatVoteCount(-1)).toBe("-1");
    });
  });

  describe("getCanonicalRecipe", () => {
    const mockRecipes = [
      {
        id: "1",
        name: "Recipe A",
        created_at: "2023-01-01T00:00:00Z",
        upvotes: 5,
        downvotes: 1,
      },
      {
        id: "2",
        name: "Recipe B",
        created_at: "2023-01-02T00:00:00Z",
        upvotes: 4,
        downvotes: 0,
      },
      {
        id: "3",
        name: "Recipe C",
        created_at: "2022-12-31T00:00:00Z",
        upvotes: 4,
        downvotes: 0,
      },
    ];

    it("should return recipe with highest net score", () => {
      const canonical = getCanonicalRecipe(mockRecipes);
      expect(canonical?.id).toBe("1"); // 5-1=4, highest score
    });

    it("should use creation date as tiebreaker (oldest wins)", () => {
      const tiedRecipes = [
        {
          id: "1",
          name: "Recipe A",
          created_at: "2023-01-02T00:00:00Z",
          upvotes: 4,
          downvotes: 0,
        },
        {
          id: "2",
          name: "Recipe B",
          created_at: "2023-01-01T00:00:00Z",
          upvotes: 4,
          downvotes: 0,
        },
      ];

      const canonical = getCanonicalRecipe(tiedRecipes);
      expect(canonical?.id).toBe("2"); // Older recipe wins tie
    });

    it("should return null for empty array", () => {
      expect(getCanonicalRecipe([])).toBeNull();
    });
  });

  describe("rankRecipes", () => {
    const mockRecipes = [
      {
        id: "1",
        name: "Recipe A",
        created_at: "2023-01-01T00:00:00Z",
        upvotes: 5,
        downvotes: 1,
      },
      {
        id: "2",
        name: "Recipe B",
        created_at: "2023-01-02T00:00:00Z",
        upvotes: 4,
        downvotes: 0,
      },
      {
        id: "3",
        name: "Recipe C",
        created_at: "2023-01-03T00:00:00Z",
        upvotes: 4,
        downvotes: 0,
      },
    ];

    it("should rank recipes by net score and creation date", () => {
      const ranked = rankRecipes(mockRecipes);

      expect(ranked[0].id).toBe("1"); // Net score 4, rank 1
      expect(ranked[0].rank).toBe(1);

      expect(ranked[1].id).toBe("2"); // Net score 4, older than recipe 3
      expect(ranked[1].rank).toBe(2);

      expect(ranked[2].id).toBe("3"); // Net score 4, newest
      expect(ranked[2].rank).toBe(2); // Same rank as recipe 2 due to tie
    });
  });

  describe("calculateGroupVotingStats", () => {
    const mockRecipes = [
      {
        id: "1",
        name: "Recipe A",
        created_at: "2023-01-01T00:00:00Z",
        upvotes: 5,
        downvotes: 1,
      },
      {
        id: "2",
        name: "Recipe B",
        created_at: "2023-01-02T00:00:00Z",
        upvotes: 0,
        downvotes: 0,
      },
      {
        id: "3",
        name: "Recipe C",
        created_at: "2023-01-03T00:00:00Z",
        upvotes: 2,
        downvotes: 1,
      },
    ];

    it("should calculate group statistics correctly", () => {
      const stats = calculateGroupVotingStats(mockRecipes);

      expect(stats.totalRecipes).toBe(3);
      expect(stats.totalUpvotes).toBe(7);
      expect(stats.totalDownvotes).toBe(2);
      expect(stats.totalVotes).toBe(9);
      expect(stats.netScore).toBe(5);
      expect(stats.averageScore).toBe(5 / 3);
      expect(stats.recipesWithVotes).toBe(2);
      expect(stats.engagement).toBe((2 / 3) * 100);
    });
  });

  describe("getSimilarityAction", () => {
    it("should return auto-match for high similarity", () => {
      expect(getSimilarityAction(0.9)).toBe("auto-match");
      expect(getSimilarityAction(0.85)).toBe("auto-match");
    });

    it("should return confirm for medium similarity", () => {
      expect(getSimilarityAction(0.75)).toBe("confirm");
      expect(getSimilarityAction(0.6)).toBe("confirm");
    });

    it("should return create-new for low similarity", () => {
      expect(getSimilarityAction(0.5)).toBe("create-new");
      expect(getSimilarityAction(0.2)).toBe("create-new");
    });
  });

  describe("getConfidenceLevel", () => {
    it("should return high confidence for high similarity", () => {
      expect(getConfidenceLevel(0.9)).toBe("high");
      expect(getConfidenceLevel(0.85)).toBe("high");
    });

    it("should return medium confidence for medium-high similarity", () => {
      expect(getConfidenceLevel(0.8)).toBe("medium");
      expect(getConfidenceLevel(0.75)).toBe("medium");
    });

    it("should return low confidence for lower similarity", () => {
      expect(getConfidenceLevel(0.7)).toBe("low");
      expect(getConfidenceLevel(0.5)).toBe("low");
    });
  });

  describe("generateGroupName", () => {
    it("should remove version indicators", () => {
      expect(generateGroupName("Classic Martini v2")).toBe("Classic Martini");
      expect(generateGroupName("Negroni Version 1")).toBe("Negroni");
    });

    it("should remove parenthetical info", () => {
      expect(generateGroupName("Manhattan (Classic)")).toBe("Manhattan");
      expect(generateGroupName("Old Fashioned (Bourbon)")).toBe(
        "Old Fashioned",
      );
    });

    it("should handle clean names", () => {
      expect(generateGroupName("Whiskey Sour")).toBe("Whiskey Sour");
      expect(generateGroupName("Margarita")).toBe("Margarita");
    });
  });

  describe("validateRecipeGroup", () => {
    it("should validate correct recipe group", () => {
      const validGroup = {
        name: "Martini",
        category: "cocktail",
        recipes: [
          {
            id: "1",
            name: "Classic Martini",
            created_at: "2023-01-01T00:00:00Z",
            upvotes: 5,
            downvotes: 1,
          },
        ],
      };

      const result = validateRecipeGroup(validGroup);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing name", () => {
      const invalidGroup = {
        name: "",
        category: "cocktail",
        recipes: [
          {
            id: "1",
            name: "Classic Martini",
            created_at: "2023-01-01T00:00:00Z",
            upvotes: 5,
            downvotes: 1,
          },
        ],
      };

      const result = validateRecipeGroup(invalidGroup);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Recipe group name is required");
    });

    it("should detect missing recipes", () => {
      const invalidGroup = {
        name: "Martini",
        category: "cocktail",
        recipes: [],
      };

      const result = validateRecipeGroup(invalidGroup);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("At least one recipe is required");
    });
  });
});
