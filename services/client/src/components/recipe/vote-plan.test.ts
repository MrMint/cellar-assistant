import { describe, expect, test } from "bun:test";
import { canVote, undoWrite, voteToast, voteWrite } from "./vote-plan";

/**
 * The versions page's two writes (Recipes-Browse 16–20): a tap on Up or Down,
 * and the toast's Undo. Each must send exactly the write that puts the
 * viewer's vote where it belongs, never the other button's.
 */
describe("voteWrite — what a tap sends", () => {
  test("a first vote casts that vote", () => {
    expect(voteWrite(null, "upvote")).toEqual({
      kind: "vote",
      voteType: "upvote",
    });
  });
  test("tapping your own vote again takes it back, never casts the other", () => {
    expect(voteWrite("upvote", "upvote")).toEqual({ kind: "remove" });
    expect(voteWrite("downvote", "downvote")).toEqual({ kind: "remove" });
  });
  test("tapping the other button switches the vote", () => {
    expect(voteWrite("upvote", "downvote")).toEqual({
      kind: "vote",
      voteType: "downvote",
    });
  });
});

describe("undoWrite — what Undo sends", () => {
  test("undoing a first vote removes it, never votes the other way", () => {
    expect(undoWrite(null)).toEqual({ kind: "remove" });
  });
  test("undoing a switch puts the earlier vote back", () => {
    expect(undoWrite("downvote")).toEqual({
      kind: "vote",
      voteType: "downvote",
    });
  });
  test("undoing a taken-back vote casts it again", () => {
    expect(undoWrite("upvote")).toEqual({ kind: "vote", voteType: "upvote" });
  });
});

describe("canVote — the author never votes on their own version", () => {
  test("the author sees no buttons", () => {
    expect(canVote("u1", "u1")).toBe(false);
  });
  test("someone else can vote", () => {
    expect(canVote("u2", "u1")).toBe(true);
  });
  test("with no viewer, or an unknown author, nobody votes", () => {
    expect(canVote(null, "u1")).toBe(false);
    expect(canVote("u2", null)).toBe(false);
  });
});

describe("voteToast", () => {
  test("names what happened", () => {
    expect(voteToast({ kind: "vote", voteType: "upvote" })).toBe("Voted up");
    expect(voteToast({ kind: "vote", voteType: "downvote" })).toBe(
      "Voted down",
    );
    expect(voteToast({ kind: "remove" })).toBe("Vote taken back");
  });
});
