/**
 * Where `/brands` goes now (L37, 40f): `/search` with the Brands section,
 * carrying the old `?q=` term.
 */
export const brandsRedirectHref = (q: string | string[] | undefined) => {
  const term = ((Array.isArray(q) ? q[0] : q) ?? "").trim();
  const params = new URLSearchParams({ in: "brands" });
  if (term !== "") params.set("q", term);
  return `/search?${params.toString()}`;
};
