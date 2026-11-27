import type { RecipeVoteType } from "./adapter";

/**
 * The versions page's writes as data (Recipes-Browse 16–20), so the one
 * rule each obeys is tested apart from the buttons: a tap sends the write
 * that puts the viewer's vote where they asked, and Undo sends the write
 * that puts it back where it was — never the other button's vote.
 */
export type VoteWrite =
  | { kind: "vote"; voteType: RecipeVoteType }
  | { kind: "remove" };

/** A tap on Up or Down: the same button again takes the vote back. */
export const voteWrite = (
  current: RecipeVoteType | null,
  clicked: RecipeVoteType,
): VoteWrite =>
  current === clicked
    ? { kind: "remove" }
    : { kind: "vote", voteType: clicked };

/** Undo: back to the vote the viewer had before the tap, or to none. */
export const undoWrite = (before: RecipeVoteType | null): VoteWrite =>
  before === null ? { kind: "remove" } : { kind: "vote", voteType: before };

/**
 * Lead's ruling: authors see no vote buttons on their own version. With no
 * viewer, or an author the API did not name, nobody gets them either.
 */
export const canVote = (
  viewerId: string | null,
  authorId: string | null | undefined,
): boolean =>
  viewerId !== null &&
  authorId !== null &&
  authorId !== undefined &&
  viewerId !== authorId;

/** The toast after a tap. */
export const voteToast = (write: VoteWrite): string =>
  write.kind === "remove"
    ? "Vote taken back"
    : write.voteType === "upvote"
      ? "Voted up"
      : "Voted down";
