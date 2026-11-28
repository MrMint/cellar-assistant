/**
 * The photo the New recipe sheet's Photo row was just handed, on its way to
 * `/recipes/new?from=photo` (X15: "the generator auto-starts").
 *
 * A `File` cannot ride a URL, and the composer page should not ask for the
 * same photo twice — so the sheet parks it here, navigates, and the page
 * takes it on mount and starts reading at once. Module state, in this tab
 * only, taken exactly once: a reload or a cold link finds nothing and the
 * page simply asks for a photo.
 */
let pending: File | null = null;

export const holdRecipePhoto = (file: File): void => {
  pending = file;
};

export const takeRecipePhoto = (): File | null => {
  const file = pending;
  pending = null;
  return file;
};
