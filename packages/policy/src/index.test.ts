/**
 * ux-c L08 (L6, L28): a "Made it" log — a check-in naming a recipe — is
 * visible only to a viewer who may see both the log (`canSeeCheckIn`) and the
 * recipe (`canSeeRecipe`). A recipe the reader could not load answers exactly
 * like one the viewer may not see.
 */
import type { Ctx } from "@cellar-assistant/contracts/ctx";
import {
  adminCtx,
  anonymousCtx,
  userCtx,
} from "@cellar-assistant/contracts/ctx";
import { describe, expect, it } from "vitest";
import {
  canSeeRecipeLog,
  type Privacy,
  type RecipeLogVisibility,
  type RecipeVisibility,
} from "./index.ts";

const DRINKER = "00000000-0000-4000-8000-000000000001";
const FRIEND = "00000000-0000-4000-8000-000000000002";
const STRANGER = "00000000-0000-4000-8000-000000000003";
const AUTHOR = "00000000-0000-4000-8000-000000000004";

const drinker = userCtx(DRINKER, "req-drinker");
const friend = userCtx(FRIEND, "req-friend");
const stranger = userCtx(STRANGER, "req-stranger");
const author = userCtx(AUTHOR, "req-author");
const anonymous = anonymousCtx("req-anon");
const admin = adminCtx(STRANGER, "req-admin");

/** The recipe as `viewer` sees it: FRIENDS admits the drinker's friend only. */
const recipe = (
  viewer: Ctx,
  privacy: Privacy,
  isDraft = false,
): RecipeVisibility => ({
  createdById: AUTHOR,
  privacy,
  isDraft,
  viewerIsFriendOfCreator: viewer.viewerId === FRIEND,
});

/** A bottle-less log by DRINKER, seen by `viewer`. */
const log = (
  viewer: Ctx,
  recipeOf: RecipeVisibility | null,
): RecipeLogVisibility => ({
  userId: DRINKER,
  cellar: null,
  viewerIsFriendOfCheckInUser: viewer.viewerId === FRIEND,
  recipe: recipeOf,
});

describe("canSeeRecipeLog (ux-c L08)", () => {
  it("shows a log on a PUBLIC recipe to the drinker and their friend", () => {
    for (const viewer of [drinker, friend]) {
      expect(
        canSeeRecipeLog(viewer, log(viewer, recipe(viewer, "PUBLIC"))),
      ).toBe(true);
    }
  });

  it("hides a friend's log on a recipe the friend may not see (PRIVATE)", () => {
    // The friend may see the log (friend branch) but not the author's
    // private recipe, so the log is hidden: it would name the recipe.
    expect(
      canSeeRecipeLog(friend, log(friend, recipe(friend, "PRIVATE"))),
    ).toBe(false);
    // A draft is its creator's alone, whatever its privacy.
    expect(
      canSeeRecipeLog(friend, log(friend, recipe(friend, "PUBLIC", true))),
    ).toBe(false);
    // The author of the recipe sees their recipe, but not a stranger's log.
    expect(
      canSeeRecipeLog(author, log(author, recipe(author, "PRIVATE"))),
    ).toBe(false);
  });

  it("hides a friend-only log from a stranger even on a PUBLIC recipe", () => {
    expect(
      canSeeRecipeLog(stranger, log(stranger, recipe(stranger, "PUBLIC"))),
    ).toBe(false);
    expect(
      canSeeRecipeLog(anonymous, log(anonymous, recipe(anonymous, "PUBLIC"))),
    ).toBe(false);
  });

  it("answers a missing recipe exactly like a forbidden one", () => {
    const missing = canSeeRecipeLog(friend, log(friend, null));
    const forbidden = canSeeRecipeLog(
      friend,
      log(friend, recipe(friend, "PRIVATE")),
    );
    expect(missing).toBe(false);
    expect(missing).toBe(forbidden);
    // Even the drinker: a recipe they cannot load names nothing to show.
    expect(canSeeRecipeLog(drinker, log(drinker, null))).toBe(false);
  });

  it("needs both: a FRIENDS recipe admits the author's friend, not the drinker", () => {
    expect(
      canSeeRecipeLog(drinker, log(drinker, recipe(drinker, "FRIENDS"))),
    ).toBe(false);
    expect(
      canSeeRecipeLog(friend, log(friend, recipe(friend, "FRIENDS"))),
    ).toBe(true);
  });

  it("admin sees everything", () => {
    expect(canSeeRecipeLog(admin, log(admin, null))).toBe(true);
  });
});
