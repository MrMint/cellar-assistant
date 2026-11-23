/**
 * L10 (wave C seenat) · the menu header's rename offer on a scan's results.
 *
 * The extraction may read the venue name a menu prints (`MenuScan.headerName`,
 * an abstaining field: null unless the name is printed and in the read text).
 * It never renames anything by itself. This reads the scan's header and its
 * place, and `renameFromHeader` turns them into the resubmit input only from
 * the person's confirm (`headerRenameInput` refuses anything else by type).
 */
import { headerRenameInput } from "@/components/capture/new-place";
import type { CreatePlaceInput } from "@/components/map/actions";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** The scan's header and enough of its place to resubmit it renamed. */
export const ScanHeaderRenameQuery = graphql(
  `
  query ScanHeaderRename($id: ID!) {
    menuScan(id: $id) {
      __typename
      ... on MenuScan {
        id
        headerName
        place {
          id
          name
          categories
          reviewStatus
          location {
            lng
            lat
          }
          streetAddress
          locality
          region
          postcode
          countryCode
          phone
          website
          description
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export type RenamablePlace = {
  name: string;
  categories: readonly string[];
  reviewStatus: string;
  location: { lng: number; lat: number } | null;
  streetAddress?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  website?: string | null;
  description?: string | null;
};

const optional = (value: string | null | undefined): string | undefined =>
  value == null || value === "" ? undefined : value;

/**
 * The resubmit input that renames `place` to the confirmed proposal, every
 * other field kept as the place has it. Null when the place has no position
 * (a resubmit needs one).
 */
export const renameFromHeader = (
  place: RenamablePlace,
  confirmed: { proposal: string; confirmed: true },
): CreatePlaceInput | null => {
  if (place.location === null) return null;
  return headerRenameInput(
    {
      categories: [...place.categories],
      latitude: place.location.lat,
      longitude: place.location.lng,
      street_address: optional(place.streetAddress),
      locality: optional(place.locality),
      region: optional(place.region),
      postcode: optional(place.postcode),
      country_code: optional(place.countryCode),
      phone: optional(place.phone),
      website: optional(place.website),
      description: optional(place.description),
    },
    confirmed,
  );
};
