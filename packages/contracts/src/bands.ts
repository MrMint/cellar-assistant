/**
 * The tier bands' one shared rule, in a module with no imports so the client
 * can bundle it (`@cellar-assistant/contracts/bands`) without dragging the
 * actor contracts — and their runtime imports — into its image.
 */

/** `tier_list_items_band_check`: `band between 0 and 5`. */
const UNRATED = 0;

/**
 * X23 / X16: "band defaults from your verdict" — a rating, in half stars (an
 * item review) or whole ones (a place rating), to the band whose word matches
 * it: 4.5 and 5 are Outstanding, 4 Very Good, 3 Good, 2 Mediocre, 1 Bad (a
 * half step rounds up into the band above, as 4.5 reads "outstanding" and not
 * "very good"). No rating is Unrated (0).
 *
 * One rule for the server's pre-banded templates and the client's Add entry,
 * so a template and a hand-picked add of the same bottle land in one band.
 */
export const bandForScore = (score: number | null | undefined): number => {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return UNRATED;
  }
  if (score >= 4.5) return 5;
  if (score >= 3.5) return 4;
  if (score >= 2.5) return 3;
  if (score >= 1.5) return 2;
  if (score > 0) return 1;
  return UNRATED;
};
