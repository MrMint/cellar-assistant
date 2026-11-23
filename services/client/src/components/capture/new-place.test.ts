import { describe, expect, test } from "bun:test";
import {
  categoryFromTypes,
  headerRenameInput,
  headerRenameProposal,
  NEW_PLACE_WITHIN_METERS,
  namePrefill,
  nearbyWithCreated,
  newPlaceInput,
  offerNewPlace,
} from "./new-place";

const HERE = { latitude: 37.7749, longitude: -122.4194 };
/** About 11 m north per 0.0001°. */
const north = (metres: number) => ({
  latitude: HERE.latitude + metres / 111_195,
  longitude: HERE.longitude,
});

describe("L10 · when the new place is offered", () => {
  test("only with a fix, the nearby read settled, and nothing within 50 m", () => {
    expect(
      offerNewPlace({ location: HERE, nearby: [], searching: false }),
    ).toBe(true);
    expect(
      offerNewPlace({
        location: HERE,
        nearby: [{ distanceMeters: NEW_PLACE_WITHIN_METERS + 1 }],
        searching: false,
      }),
    ).toBe(true);
    expect(
      offerNewPlace({
        location: HERE,
        nearby: [{ distanceMeters: 30 }],
        searching: false,
      }),
    ).toBe(false);
    expect(offerNewPlace({ location: HERE, nearby: [], searching: true })).toBe(
      false,
    );
    expect(
      offerNewPlace({ location: null, nearby: [], searching: false }),
    ).toBe(false);
  });
});

describe("L10 · place creation bounds (N09)", () => {
  const ok = {
    name: "Bar Lumen",
    category: "wine_bar",
    location: HERE,
    placeId: "p-1",
  };

  test("a valid place becomes one PENDING-to-be createPlace input, keeping the minted id", () => {
    const result = newPlaceInput({ ...ok, name: "  Bar   Lumen " });
    expect(result).toEqual({
      ok: true,
      input: {
        name: "Bar Lumen",
        categories: ["wine_bar"],
        latitude: HERE.latitude,
        longitude: HERE.longitude,
        placeId: "p-1",
      },
    });
  });

  test("names outside 2–200 characters are refused before a round trip", () => {
    for (const name of ["", " B ", "x".repeat(201)]) {
      const result = newPlaceInput({ ...ok, name });
      expect(result.ok).toBe(false);
    }
    expect(newPlaceInput({ ...ok, name: "x".repeat(200) }).ok).toBe(true);
  });

  test("a category outside the sheet's list, none, or no real fix is refused", () => {
    expect(newPlaceInput({ ...ok, category: null }).ok).toBe(false);
    expect(newPlaceInput({ ...ok, category: "liquor_store" }).ok).toBe(false);
    expect(newPlaceInput({ ...ok, location: null }).ok).toBe(false);
    expect(
      newPlaceInput({ ...ok, location: { latitude: 91, longitude: 0 } }).ok,
    ).toBe(false);
    expect(
      newPlaceInput({
        ...ok,
        location: { latitude: Number.NaN, longitude: 0 },
      }).ok,
    ).toBe(false);
  });

  test("the created place leads `nearby`, at 0 m, so the scan keeps its position", () => {
    const list = nearbyWithCreated(
      [{ id: "far", name: "Far", distanceMeters: 400, category: null }],
      { id: "p-1", name: "Bar Lumen", category: "wine_bar" },
    );
    expect(list.map((place) => [place.id, place.distanceMeters])).toEqual([
      ["p-1", 0],
      ["far", 400],
    ]);
  });
});

describe("L10 · the prefill and the D16 budget", () => {
  test("the nearest listing where the person stands names the place", () => {
    expect(
      namePrefill(HERE, {
        budgetExhausted: false,
        places: [
          { name: "Across town", location: north(900) },
          { name: "Bar Lumen", location: north(12) },
          { name: "Next door", location: north(40) },
        ],
      }),
    ).toEqual({ kind: "listing", name: "Bar Lumen" });
  });

  test("out of budget is 'Details pending', and no name is invented", () => {
    expect(
      namePrefill(HERE, {
        budgetExhausted: true,
        places: [{ name: "Bar Lumen", location: HERE }],
      }),
    ).toEqual({ kind: "pending" });
  });

  test("no listing close enough, or no read, prefills nothing", () => {
    expect(
      namePrefill(HERE, {
        budgetExhausted: false,
        places: [{ name: "Across town", location: north(900) }],
      }),
    ).toEqual({ kind: "none" });
    expect(namePrefill(HERE, null)).toEqual({ kind: "none" });
  });

  test("a listing's types pick the category when the sheet has it", () => {
    expect(categoryFromTypes(["point_of_interest", "bar"])).toBe("bar");
    expect(categoryFromTypes(["point_of_interest"])).toBeNull();
  });
});

describe("L10 · the menu header's rename is only ever a proposal", () => {
  const pending = { name: "Wine bar near me", reviewStatus: "PENDING" };

  test("proposed for the creator's place Under review when the header differs", () => {
    expect(
      headerRenameProposal({ headerName: "Bar Lumen", place: pending }),
    ).toBe("Bar Lumen");
  });

  test("not proposed for a shared place, the same name, or no header", () => {
    expect(
      headerRenameProposal({
        headerName: "Bar Lumen",
        place: { name: "Bar", reviewStatus: "APPROVED" },
      }),
    ).toBeNull();
    expect(
      headerRenameProposal({
        headerName: " bar  LUMEN ",
        place: { ...pending, name: "Bar Lumen" },
      }),
    ).toBeNull();
    expect(
      headerRenameProposal({ headerName: null, place: pending }),
    ).toBeNull();
    expect(
      headerRenameProposal({ headerName: "X", place: pending }),
    ).toBeNull();
    expect(
      headerRenameProposal({ headerName: "Bar Lumen", place: null }),
    ).toBeNull();
  });

  test("applying it needs the confirm, and changes the name alone", () => {
    const place = {
      categories: ["wine_bar"],
      latitude: HERE.latitude,
      longitude: HERE.longitude,
      locality: "San Francisco",
    };
    const proposal = headerRenameProposal({
      headerName: "Bar Lumen",
      place: pending,
    });
    expect(proposal).toBe("Bar Lumen");
    // The proposal is a string: nothing about it is an input. Only a confirm
    // turns it into one, and the type refuses an unconfirmed call.
    expect(
      headerRenameInput(place, { proposal: proposal ?? "", confirmed: true }),
    ).toEqual({ ...place, name: "Bar Lumen" });
    // @ts-expect-error — `confirmed: false` is not a confirm.
    headerRenameInput(place, { proposal: "Bar Lumen", confirmed: false });
  });
});
