import { eventually, unique } from "../fixtures/data.ts";
import { deletePlace } from "../fixtures/db.ts";
import {
  bodyText,
  expect,
  settleNetwork,
  test,
  watch,
} from "../fixtures/test.ts";

/**
 * Create a place, then find it by browsing the map viewport it sits in.
 *
 * `mapBrowse` is **viewport-shaped, not a global picker** — D7 proved a ±180/±85
 * box returns `totalCount: 0` while a city-sized box finds the place, because
 * the adaptive-cluster SQL is written for a viewport. So this asserts both: the
 * city box finds it *and* the world box does not, which is the only way the
 * next person to read this learns the rule instead of rediscovering it.
 *
 * ## Cleans up the place it creates
 *
 * `PLACE_RATE_LIMIT_PER_DAY` is 25, counted by rows in `places` — see
 * `fixtures/db.ts` — and this file used to create one on every run and delete
 * nothing. Measured 2026-09-20: the shared test account hit "you can add up to
 * 25 places per day" after about 21 hours of ordinary use, and someone had to
 * delete 25 rows by hand to unblock every other agent's suite. There is no
 * `deletePlace` mutation (a place has no per-viewer lifecycle to authorize one
 * against), so the `afterAll` below reaches the database directly — the same
 * thing `fixtures/data.ts`'s helpers do through the API for state a UI has no
 * control for, one layer further down because here the API has no control
 * either.
 *
 * The id is taken from the `createPlace` **request**, not from the page the
 * form navigates to afterwards (the map, `?placeId=`, as in production). `createPlace` runs a synchronous AI review
 * before it inserts, so a slow review used to fail the first test at its URL
 * wait, the row committed a moment later, and the `afterAll` — with no id —
 * skipped the delete: the very leak it exists to close. The form mints the
 * id client-side, so it is known before the server has done anything.
 */
test.describe.configure({ mode: "serial" });

const WORLD_BOX = { west: -180, east: 180, south: -85, north: 85 };

/**
 * A viewport around a point, roughly a city across.
 *
 * Derived from the place's **own** coordinates rather than hard-coded: the
 * create-place form takes the pin from wherever its map viewport happens to
 * start, so a fixed box tests the form's default location and not the flow.
 */
const cityBoxAround = (lng: number, lat: number) => ({
  west: lng - 0.05,
  east: lng + 0.05,
  south: lat - 0.05,
  north: lat + 0.05,
});

/**
 * A viewport about 0.9 km across — under `search_places_adaptive_cluster`'s
 * "street level: never cluster" threshold of 2 km, with more than twice the
 * margin. Individual markers are guaranteed here no matter how many places
 * share the point, which is what makes an assertion about *this* place's id
 * stable. See the test below for what went wrong without it.
 */
const streetBoxAround = (lng: number, lat: number) => ({
  west: lng - 0.004,
  east: lng + 0.004,
  south: lat - 0.004,
  north: lat + 0.004,
});

let placeId: string | undefined;
/**
 * What the `createPlace` response said. `refused` is a typed error — a
 * duplicate, the daily limit, a rejected review — none of which commits a
 * row; `unknown` is no answer at all (the test gave up first, or a transport
 * failure), which is the one case where the row may still be on its way.
 */
let createOutcome: "created" | "refused" | "unknown" = "unknown";
let placeName: string;
let placeLngLat: { lng: number; lat: number };

/**
 * Undo the one durable row this file creates.
 *
 * Runs whether the tests above it passed or not — a place created by a test
 * that then failed still counts against the same 25/day limit, so failure is
 * not a reason to skip this. `deletePlace` throws on failure rather than
 * swallowing it, and failure includes deleting **zero** rows: a cleanup that
 * silently fails leaves the row in place and this file back where it started,
 * which is exactly the kind of caught-and-discarded failure `AGENTS.md` warns
 * this repo has been bitten by before.
 *
 * When the create's outcome is unknown the row may not exist yet — the review
 * runs before the insert, under a 120s invocation timeout — so the delete
 * waits for it rather than finding nothing and leaving it to land afterwards.
 */
test.afterAll(async () => {
  if (placeId === undefined || createOutcome === "refused") return;
  test.setTimeout(180_000);
  await deletePlace(placeId, {
    waitForRowMs: createOutcome === "created" ? 0 : 150_000,
  });
});

test("creates a place through the form", async ({ primary }) => {
  // `createPlace` may take as long as its 120s invocation timeout — the AI
  // review is synchronous — and a slow review is not what this test is about.
  test.setTimeout(180_000);
  const noise = watch(primary);
  placeName = unique("E2 Place");

  // The restored form (UI parity wave 7) opens on the map's centre pin, as
  // production's did: without `?lat=&lng=` it goes back to `/map`. A small
  // jitter keeps every run off one shared point.
  const lat = 43.0731 + Math.random() * 0.01;
  const lng = -89.4012 + Math.random() * 0.01;
  await primary.goto(`/map/create-place?lat=${lat}&lng=${lng}`);
  await expect(
    primary.getByRole("heading", { name: "Add a new place" }),
  ).toBeVisible();

  // The reverse geocode fills the address fields when it lands; wait for it
  // so it cannot overwrite what this test types.
  await expect(primary.getByText("Auto-filled from pin")).toBeVisible({
    timeout: 30_000,
  });

  await primary.getByLabel("Name *").fill(placeName);

  // "Categories *" is a multi-select Autocomplete grouped Venues / Retail.
  await primary.getByLabel("Categories *").click();
  await primary.getByRole("option", { name: "Wine Bar" }).click();
  await primary.keyboard.press("Escape");

  await primary.getByLabel("City").fill("Madison");
  await primary.getByLabel("Country Code").fill("US");

  const createRequest = primary.waitForRequest(
    (request) =>
      request.url().includes("/api/graphql") &&
      /mutation MapCreatePlace\b/.test(request.postData() ?? ""),
  );
  await primary.getByRole("button", { name: "Add Place" }).click();

  // Record the id the moment it exists, before the server has done anything
  // with it (see the module doc): from here on the `afterAll` can clean up
  // whatever this test does next.
  const request = await createRequest;
  placeId = request.postDataJSON()?.variables?.input?.placeId;
  expect(
    placeId,
    "createPlace was sent without a client-minted placeId",
  ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

  const response = await request.response();
  const body = await response?.json().catch(() => null);
  const outcome = body?.data?.createPlace;
  createOutcome =
    outcome?.__typename === "CreatePlacePayload"
      ? "created"
      : typeof outcome?.__typename === "string"
        ? "refused"
        : "unknown";
  expect(
    createOutcome,
    `createPlace did not create the place: ${JSON.stringify(body)}`,
  ).toBe("created");

  // The old destination: the map, deep-linked to the place it minted.
  await expect(
    primary,
    "creating a place did not navigate to the map at the place it minted",
  ).toHaveURL(new RegExp(`/map\\?placeId=${placeId}(?:[&#]|$)`), {
    timeout: 30_000,
  });
  expect(noise.pageErrors, "the create-place flow threw").toEqual([]);

  // And its page shows it — the place page reads from the client, so wait
  // for the name rather than snapshotting the body.
  await primary.goto(`/places/${placeId}`);
  await expect(
    primary.getByRole("heading", { name: placeName }),
    `the place page never showed the name (body: ${(await bodyText(primary)).slice(0, 200)})`,
  ).toBeVisible({ timeout: 20_000 });
  await expect(primary.getByRole("tab", { name: /Menu/ })).toBeVisible();
  await expect(primary.getByRole("tab", { name: "Camera Scan" })).toBeVisible();
  expect(noise.pageErrors, "the place page threw").toEqual([]);
});

test("creating the same place twice is idempotent", async ({ api }) => {
  test.skip(placeId === undefined, "no place was created");
  // B5's rule: the same client-minted id returns the same place, not a second
  // one and not a ConflictError.
  const data = await api.query(
    `query P($id: ID!) { place(id: $id) {
       __typename ... on Place { id name location { lng lat } } ... on Error { message }
     } }`,
    { id: placeId },
  );
  expect(data.place.__typename).toBe("Place");
  expect(data.place.name).toBe(placeName);
  placeLngLat = data.place.location;
});

/**
 * The place is on the map — individually at street zoom, inside a bubble at
 * city zoom.
 *
 * This used to look for the place *by id* in the city-sized box, and that made
 * it a test the suite eventually poisons. `search_places_adaptive_cluster`
 * chooses markers or bubbles by how many places the viewport holds
 * (`MapEntry = MapCluster | MapPlace`, and the schema says so), and its
 * threshold is zoom-dependent:
 *
 *   viewport < 2 km    never cluster       (street level)
 *   viewport < 5 km    cluster above 100   (neighbourhood)
 *   otherwise          cluster above 20    (city and wider)
 *
 * `cityBoxAround` is ±0.05°, about 11 km across, so it takes the last branch —
 * and **every run of this suite creates one more place at the same
 * coordinates**, because the create-place form's geocode lands them all on one
 * point. Measured on 2026-09-18: 24 places at exactly (-122.4194, 37.7749).
 * Past the twenty-first, the city box correctly returns a bubble, the place's
 * id is nowhere in `edges`, and the old assertion could never pass again on a
 * database that had been used. It failed for the right reason, against the
 * wrong expectation.
 *
 * So identity is asserted where clustering cannot interfere, and the city box
 * now asserts what it is really for — a viewport that holds something, as
 * against the world box below that holds nothing.
 */
test("mapBrowse finds the place, and clusters it when zoomed out", async ({
  api,
}) => {
  test.skip(placeId === undefined, "no place was created");

  const browse = async (bounds: ReturnType<typeof cityBoxAround>) => {
    const data = await api.raw(
      `query M($bounds: MapBoundsInput!) {
         mapBrowse(bounds: $bounds, first: 100, limit: 500) {
           __typename
           ... on MapEntryConnection {
             totalCount
             edges { node { __typename ... on MapPlace { id name } ... on MapCluster { count } } }
           }
           ... on ActorError { code message }
         }
       }`,
      { bounds },
    );
    if (data.errors) throw new Error(JSON.stringify(data.errors));
    return data.data.mapBrowse;
  };

  // 1. Street level (~0.9 km): below the "never cluster" threshold, so the
  //    place has to be there as itself, however many neighbours it has.
  const found = await eventually(
    async () => {
      const result = await browse(
        streetBoxAround(placeLngLat.lng, placeLngLat.lat),
      );
      const edges = result.edges ?? [];
      return edges.some((e: any) => e.node.id === placeId) ? true : null;
    },
    { timeoutMs: 45_000, what: "the new place to appear in mapBrowse" },
  ).catch((error) => error as Error);
  expect(found, `${found}`).toBe(true);

  // 2. City level: markers or a bubble, but never empty — that is the half
  //    this file exists to contrast with the world box.
  const city = await browse(cityBoxAround(placeLngLat.lng, placeLngLat.lat));
  expect(city.__typename, JSON.stringify(city)).toBe("MapEntryConnection");
  expect(
    city.totalCount,
    "a city-sized viewport around a place it definitely contains came back empty",
  ).toBeGreaterThan(0);
});

test("mapBrowse returns nothing for a whole-world box (viewport-shaped)", async ({
  api,
}) => {
  const data = await api.raw(
    `query M($bounds: MapBoundsInput!) {
       mapBrowse(bounds: $bounds, first: 10, limit: 500) {
         __typename
         ... on MapEntryConnection { totalCount }
         ... on ActorError { code message }
       }
     }`,
    { bounds: WORLD_BOX },
  );
  expect(data.errors, JSON.stringify(data.errors)).toBeUndefined();
  expect(
    data.data.mapBrowse.totalCount,
    "a whole-world box now returns rows — mapBrowse may no longer be viewport-shaped, so the comment above this test is stale",
  ).toBe(0);
});

test("the map page renders and asks the server for a viewport", async ({
  primary,
}) => {
  const noise = watch(primary);
  const graphqlCalls: string[] = [];
  primary.on("request", (req) => {
    if (req.url().includes("/api/graphql")) {
      graphqlCalls.push(String(req.postData()).slice(0, 120));
    }
  });

  await primary.goto("/map");
  await settleNetwork(primary);

  expect(noise.pageErrors, "the map page threw").toEqual([]);
  expect(
    graphqlCalls.length,
    "the map made no GraphQL calls at all",
  ).toBeGreaterThan(0);
});

test("address geocoding fails loudly rather than silently (X5)", async ({
  api,
}) => {
  // `displayName`, not `name`: GeocodeResult has no `name`, and asking for it
  // failed validation before the resolver ran — so this probe always answered
  // "Cannot query field", never the seam error it exists to check for.
  // `services/client/src/lib/dev-checks/e2e-documents.test.ts` found it.
  const data = await api.raw(
    `query { geocode(query: "Madison, WI") { displayName } }`,
  );
  const message = data.errors?.[0]?.message ?? "";
  // Either a geocoder is wired and this returns, or the seam throws by design.
  // What must never happen is a silent null that looks like "no match".
  if (data.errors !== undefined) {
    expect(
      message,
      "geocode failed with something other than the unconfigured-seam error",
    ).toMatch(/geocoder|photon/i);
  }
});
