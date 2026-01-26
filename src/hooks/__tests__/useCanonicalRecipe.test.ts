/**
 * Tests for useCanonicalRecipe hook
 */

import { renderHook } from "@testing-library/react";
import {
  calculateNetScore,
  formatVoteCount,
  useCanonicalRecipe,
} from "../useCanonicalRecipe";

describe("useCanonicalRecipe", () => {
  const mockRecipes = [
    {
      id: "1",
      name: "Recipe A",
      created_at: "2023-01-01T00:00:00Z",
      votes_aggregate: { aggregate: { count: 5 } },
      upvotes: 5,
      downvotes: 1,
    },
    {
      id: "2",
      name: "Recipe B",
      created_at: "2023-01-02T00:00:00Z",
      votes_aggregate: { aggregate: { count: 4 } },
      upvotes: 4,
      downvotes: 0,
    },
    {
      id: "3",
      name: "Recipe C",
      created_at: "2022-12-31T00:00:00Z",
      votes_aggregate: { aggregate: { count: 4 } },
      upvotes: 4,
      downvotes: 0,
    },
  ];

  it("should determine canonical recipe based on net score", () => {
    const { result } = renderHook(() => useCanonicalRecipe(mockRecipes));

    expect(result.current.canonicalRecipe?.id).toBe("1"); // Highest net score (4)
    expect(result.current.canonicalRecipe?.isCanonical).toBe(true);
  });

  it("should use creation date as tiebreaker", () => {
    const tiedRecipes = [
      {
        id: "1",
        name: "Recipe A",
        created_at: "2023-01-02T00:00:00Z",
        votes_aggregate: { aggregate: { count: 4 } },
        upvotes: 4,
        downvotes: 0,
      },
      {
        id: "2",
        name: "Recipe B",
        created_at: "2023-01-01T00:00:00Z",
        votes_aggregate: { aggregate: { count: 4 } },
        upvotes: 4,
        downvotes: 0,
      },
    ];

    const { result } = renderHook(() => useCanonicalRecipe(tiedRecipes));

    expect(result.current.canonicalRecipe?.id).toBe("2"); // Older recipe wins
  });

  it("should respect explicit canonical ID", () => {
    const { result } = renderHook(() => useCanonicalRecipe(mockRecipes, "2"));

    expect(result.current.canonicalRecipe?.id).toBe("2"); // Explicitly set
    expect(result.current.canonicalRecipe?.isCanonical).toBe(true);
  });

  it("should sort recipes correctly", () => {
    const { result } = renderHook(() => useCanonicalRecipe(mockRecipes));

    const sorted = result.current.sortedRecipes;
    expect(sorted[0].id).toBe("1"); // Highest score
    expect(sorted[1].id).toBe("2"); // Second highest, newer
    expect(sorted[2].id).toBe("3"); // Same score as B, but older
  });

  it("should assign ranks correctly", () => {
    const { result } = renderHook(() => useCanonicalRecipe(mockRecipes));

    const sorted = result.current.sortedRecipes;
    expect(sorted[0].rank).toBe(1);
    expect(sorted[1].rank).toBe(2);
    expect(sorted[2].rank).toBe(2); // Tied with recipe B
  });

  it("should create vote counts lookup", () => {
    const { result } = renderHook(() => useCanonicalRecipe(mockRecipes));

    const voteCounts = result.current.voteCounts;
    expect(voteCounts["1"].netScore).toBe(4);
    expect(voteCounts["2"].netScore).toBe(4);
    expect(voteCounts["3"].netScore).toBe(4);
  });

  it("should handle empty recipes array", () => {
    const { result } = renderHook(() => useCanonicalRecipe([]));

    expect(result.current.canonicalRecipe).toBeNull();
    expect(result.current.sortedRecipes).toEqual([]);
    expect(result.current.voteCounts).toEqual({});
  });

  it("should recalculate when recipes change", () => {
    const { result, rerender } = renderHook(
      ({ recipes }) => useCanonicalRecipe(recipes),
      { initialProps: { recipes: mockRecipes } },
    );

    expect(result.current.canonicalRecipe?.id).toBe("1");

    // Update recipes with different votes
    const updatedRecipes = [
      ...mockRecipes.slice(1), // Remove recipe 1
      {
        ...mockRecipes[1],
        upvotes: 10,
        downvotes: 0,
      },
    ];

    rerender({ recipes: updatedRecipes });
    expect(result.current.canonicalRecipe?.id).toBe("2"); // Now highest score
  });
});

describe("calculateNetScore", () => {
  it("should calculate net score correctly", () => {
    expect(calculateNetScore(5, 2)).toBe(3);
    expect(calculateNetScore(0, 0)).toBe(0);
    expect(calculateNetScore(1, 3)).toBe(-2);
  });
});

describe("formatVoteCount", () => {
  it("should format vote counts for display", () => {
    expect(formatVoteCount(5)).toBe("+5");
    expect(formatVoteCount(0)).toBe("0");
    expect(formatVoteCount(-3)).toBe("-3");
  });
});
