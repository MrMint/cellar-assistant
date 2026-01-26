/**
 * Tests for RecipeVoteButtons component
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { RecipeVoteButtons } from "../RecipeVoteButtons";

// Mock URQL
const mockMutation = jest.fn();
jest.mock("urql", () => ({
  ...jest.requireActual("urql"),
  useMutation: () => [
    { data: null, error: null, fetching: false },
    mockMutation,
  ],
}));

// Mock URQL Provider
const MockUrqlProvider = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid="mock-provider">{children}</div>;
};

describe("RecipeVoteButtons", () => {
  const defaultProps = {
    recipeId: "recipe-123",
    currentVote: null,
    upvotes: 5,
    downvotes: 2,
    userId: "user-456",
  };

  beforeEach(() => {
    mockMutation.mockClear();
  });

  it("should render vote buttons with correct counts", () => {
    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} />
      </MockUrqlProvider>,
    );

    expect(screen.getByText("5")).toBeInTheDocument(); // Upvotes
    expect(screen.getByText("2")).toBeInTheDocument(); // Downvotes
    expect(screen.getByText("+3")).toBeInTheDocument(); // Net score
  });

  it("should show active state for current vote", () => {
    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} currentVote="upvote" />
      </MockUrqlProvider>,
    );

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    expect(upvoteButton).toHaveAttribute("data-variant", "solid");
  });

  it("should handle upvote click", async () => {
    mockMutation.mockResolvedValue({
      data: { insert_recipe_votes_one: { id: "vote-1", vote_type: "upvote" } },
      error: null,
    });

    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} />
      </MockUrqlProvider>,
    );

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    fireEvent.click(upvoteButton);

    await waitFor(() => {
      expect(mockMutation).toHaveBeenCalledWith({
        recipeId: "recipe-123",
        voteType: "upvote",
      });
    });
  });

  it("should handle downvote click", async () => {
    mockMutation.mockResolvedValue({
      data: {
        insert_recipe_votes_one: { id: "vote-1", vote_type: "downvote" },
      },
      error: null,
    });

    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} />
      </MockUrqlProvider>,
    );

    const downvoteButton = screen.getByRole("button", { name: /2/ });
    fireEvent.click(downvoteButton);

    await waitFor(() => {
      expect(mockMutation).toHaveBeenCalledWith({
        recipeId: "recipe-123",
        voteType: "downvote",
      });
    });
  });

  it("should show loading state while voting", async () => {
    mockMutation.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: null, error: null }), 100),
        ),
    );

    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} />
      </MockUrqlProvider>,
    );

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    fireEvent.click(upvoteButton);

    // Should show loading state
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("should remove vote when clicking same vote type", async () => {
    mockMutation.mockResolvedValue({
      data: { delete_recipe_votes: { affected_rows: 1 } },
      error: null,
    });

    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} currentVote="upvote" />
      </MockUrqlProvider>,
    );

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    fireEvent.click(upvoteButton);

    await waitFor(() => {
      expect(mockMutation).toHaveBeenCalledWith({
        recipeId: "recipe-123",
        userId: "user-456",
      });
    });
  });

  it("should handle vertical orientation", () => {
    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} orientation="vertical" />
      </MockUrqlProvider>,
    );

    // Should render in vertical layout
    const container = screen.getByText("+3").closest("[data-testid]");
    expect(container).toHaveStyle({ flexDirection: "column" });
  });

  it("should hide counts when showCounts is false", () => {
    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} showCounts={false} />
      </MockUrqlProvider>,
    );

    expect(screen.queryByText("5")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.queryByText("+3")).not.toBeInTheDocument();
  });

  it("should handle error state gracefully", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    mockMutation.mockRejectedValue(new Error("Network error"));

    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} />
      </MockUrqlProvider>,
    );

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    fireEvent.click(upvoteButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error voting:",
        expect.any(Error),
      );
    });

    consoleSpy.mockRestore();
  });

  it("should prevent multiple simultaneous votes", async () => {
    mockMutation.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: null, error: null }), 100),
        ),
    );

    render(
      <MockUrqlProvider>
        <RecipeVoteButtons {...defaultProps} />
      </MockUrqlProvider>,
    );

    const upvoteButton = screen.getByRole("button", { name: /5/ });

    // Click multiple times rapidly
    fireEvent.click(upvoteButton);
    fireEvent.click(upvoteButton);
    fireEvent.click(upvoteButton);

    // Should only be called once
    await waitFor(() => {
      expect(mockMutation).toHaveBeenCalledTimes(1);
    });
  });
});
