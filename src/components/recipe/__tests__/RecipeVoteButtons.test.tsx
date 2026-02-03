/**
 * Tests for RecipeVoteButtons component
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecipeVoteButtons } from "../RecipeVoteButtons";

// Mock server actions
const mockVoteRecipeAction = jest.fn();
const mockRemoveVoteAction = jest.fn();

jest.mock("@/app/actions/recipes", () => ({
  voteRecipeAction: (...args: unknown[]) => mockVoteRecipeAction(...args),
  removeVoteAction: (...args: unknown[]) => mockRemoveVoteAction(...args),
}));

// Mock useMediaQuery hook
jest.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
  breakpointDown: () => "(max-width: 0px)",
}));

describe("RecipeVoteButtons", () => {
  const defaultProps = {
    recipeId: "recipe-123",
    currentVote: null,
    upvotes: 5,
    downvotes: 2,
  };

  beforeEach(() => {
    mockVoteRecipeAction.mockClear();
    mockRemoveVoteAction.mockClear();
    mockVoteRecipeAction.mockResolvedValue({ success: true });
    mockRemoveVoteAction.mockResolvedValue({ success: true });
  });

  it("should render vote buttons with correct counts", () => {
    render(<RecipeVoteButtons {...defaultProps} />);

    expect(screen.getByText("5")).toBeInTheDocument(); // Upvotes
    expect(screen.getByText("2")).toBeInTheDocument(); // Downvotes
    expect(screen.getByText("+3")).toBeInTheDocument(); // Net score
  });

  it("should show active state for current vote", () => {
    render(<RecipeVoteButtons {...defaultProps} currentVote="upvote" />);

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    expect(upvoteButton).toHaveClass("MuiButton-variantSolid");
  });

  it("should handle upvote click", async () => {
    render(<RecipeVoteButtons {...defaultProps} />);

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    fireEvent.click(upvoteButton);

    await waitFor(() => {
      expect(mockVoteRecipeAction).toHaveBeenCalledWith(
        "recipe-123",
        "upvote",
      );
    });
  });

  it("should handle downvote click", async () => {
    render(<RecipeVoteButtons {...defaultProps} />);

    const downvoteButton = screen.getByRole("button", { name: /2/ });
    fireEvent.click(downvoteButton);

    await waitFor(() => {
      expect(mockVoteRecipeAction).toHaveBeenCalledWith(
        "recipe-123",
        "downvote",
      );
    });
  });

  it("should show loading state while voting", async () => {
    mockVoteRecipeAction.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true }), 100),
        ),
    );

    render(<RecipeVoteButtons {...defaultProps} />);

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    fireEvent.click(upvoteButton);

    // Should show loading state
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("should remove vote when clicking same vote type", async () => {
    render(<RecipeVoteButtons {...defaultProps} currentVote="upvote" />);

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    fireEvent.click(upvoteButton);

    await waitFor(() => {
      // Only recipeId is passed - userId is derived from authenticated user on server
      expect(mockRemoveVoteAction).toHaveBeenCalledWith("recipe-123");
    });
  });

  it("should handle vertical orientation", () => {
    const { container } = render(
      <RecipeVoteButtons {...defaultProps} orientation="vertical" />,
    );

    // In vertical orientation, buttons should be in a Stack with column direction
    const stack = container.querySelector(".MuiStack-root");
    expect(stack).toBeInTheDocument();
  });

  it("should hide counts when showCounts is false", () => {
    render(<RecipeVoteButtons {...defaultProps} showCounts={false} />);

    expect(screen.queryByText("5")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.queryByText("+3")).not.toBeInTheDocument();
  });

  it("should handle error state gracefully and revert optimistic update", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    mockVoteRecipeAction.mockResolvedValue({
      success: false,
      error: "Network error",
    });

    render(<RecipeVoteButtons {...defaultProps} />);

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    fireEvent.click(upvoteButton);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error voting:",
        expect.any(Error),
      );
    });

    // Should revert to original count after error
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  it("should prevent multiple simultaneous votes", async () => {
    mockVoteRecipeAction.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true }), 100),
        ),
    );

    render(<RecipeVoteButtons {...defaultProps} />);

    const upvoteButton = screen.getByRole("button", { name: /5/ });

    // Click multiple times rapidly
    fireEvent.click(upvoteButton);
    fireEvent.click(upvoteButton);
    fireEvent.click(upvoteButton);

    // Should only be called once
    await waitFor(() => {
      expect(mockVoteRecipeAction).toHaveBeenCalledTimes(1);
    });
  });

  it("should apply optimistic updates immediately", async () => {
    mockVoteRecipeAction.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true }), 100),
        ),
    );

    render(<RecipeVoteButtons {...defaultProps} />);

    const upvoteButton = screen.getByRole("button", { name: /5/ });
    fireEvent.click(upvoteButton);

    // Should immediately show optimistic update (6 upvotes, +4 net score)
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
  });

  it("should handle changing vote from upvote to downvote", async () => {
    render(<RecipeVoteButtons {...defaultProps} currentVote="upvote" />);

    const downvoteButton = screen.getByRole("button", { name: /2/ });
    fireEvent.click(downvoteButton);

    // Should call voteRecipeAction for the new vote type
    await waitFor(() => {
      expect(mockVoteRecipeAction).toHaveBeenCalledWith(
        "recipe-123",
        "downvote",
      );
    });

    // Should not call removeVoteAction (changing vote, not removing)
    expect(mockRemoveVoteAction).not.toHaveBeenCalled();
  });
});
