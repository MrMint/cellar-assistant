import { apiServerQuery } from "@/lib/api/urql-server";
import { getGeolocationFromCookie } from "@/lib/geo-cookie/server";
import { SearchSections } from "./SearchSections";
import {
  boundsAround,
  buildSections,
  SEARCH_SECTIONS,
  SECTION_LIMITS,
  SearchBottlesQuery,
  SearchBrandsSectionQuery,
  SearchItemsSectionQuery,
  SearchPeopleSectionQuery,
  SearchPlacesSectionQuery,
  SearchRecipesSectionQuery,
  type SearchSection,
  searchUnanswered,
  sectionAnswered,
  semanticSearchFrom,
} from "./universal-search";

/**
 * A section's read, or `undefined` when it failed: logged, and then simply
 * not a section — the other five are still the answer.
 */
const settle = <T,>(section: string, pending: Promise<T>) =>
  pending.catch((error: unknown): undefined => {
    console.error(`[search] the ${section} section failed:`, error);
    return undefined;
  });

/**
 * `/search?q=` (X12): the six sections' searches side by side, then one
 * render, so the page settles once instead of six times under the reader's
 * thumb. With `?in=` only that section is read (plus the bottles read, which
 * carries the AI capability line, when it is the one opened).
 *
 * Places are searched around the viewer's last known position (the
 * geolocation cookie the map and Home write) when there is one; without it
 * the section keeps name matches only (`placeRows`).
 */
export async function UniversalSearchResults({
  query,
  focus,
}: {
  query: string;
  focus: SearchSection | null;
}) {
  const location = await getGeolocationFromCookie();
  const bounds = location === null ? null : boundsAround(location);
  const wants = (section: SearchSection) => focus === null || focus === section;
  const term = query;

  const [bottles, items, places, recipes, people, brands] = await Promise.all([
    wants("bottles")
      ? settle(
          "bottles",
          apiServerQuery(SearchBottlesQuery, {
            term,
            limit: SECTION_LIMITS.bottles,
          }),
        )
      : undefined,
    wants("items")
      ? settle(
          "items",
          apiServerQuery(SearchItemsSectionQuery, {
            term,
            limit: SECTION_LIMITS.items,
          }),
        )
      : undefined,
    wants("places")
      ? settle(
          "places",
          apiServerQuery(SearchPlacesSectionQuery, {
            term,
            limit: SECTION_LIMITS.places,
            bounds,
          }),
        )
      : undefined,
    wants("recipes")
      ? settle(
          "recipes",
          apiServerQuery(SearchRecipesSectionQuery, {
            term,
            limit: SECTION_LIMITS.recipes,
          }),
        )
      : undefined,
    wants("people")
      ? settle(
          "people",
          apiServerQuery(SearchPeopleSectionQuery, {
            term,
            limit: SECTION_LIMITS.people,
          }),
        )
      : undefined,
    wants("brands")
      ? settle(
          "brands",
          apiServerQuery(SearchBrandsSectionQuery, {
            term,
            limit: SECTION_LIMITS.brands,
          }),
        )
      : undefined,
  ]);

  const data = { bottles, items, places, recipes, people, brands };
  const asked = SEARCH_SECTIONS.filter(wants);
  return (
    <SearchSections
      query={query}
      focus={focus}
      semanticSearch={semanticSearchFrom(bottles)}
      unanswered={searchUnanswered(asked, data)}
      failed={asked.filter((section) => !sectionAnswered(section, data))}
      sections={buildSections(data, {
        bounded: bounds !== null,
        origin: location,
      })}
    />
  );
}
