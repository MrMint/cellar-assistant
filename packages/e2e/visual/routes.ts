import type { Page } from "@playwright/test";

/**
 * The route table for the 390x844 before/after sweep (migration plan §5.3).
 *
 * Ported from the UX review's capture (`ux-review-capture-routes.mjs`, 75
 * shots on 2026-10-05): the same routes, built from the integration lane's
 * seed instead of that review's ids, each tagged with the conversion slice
 * that owns it (§3.2), so a slice reviews exactly its own rows.
 *
 * Every route is read-only. Nothing here submits a form or creates a place
 * (the stack's 25/day place cap is shared); `states` only open a sheet or
 * dialog and close it again.
 *
 * Against that capture's 63 rows: every route is here except three the lane
 * seed cannot show without writing to the stack — an empty cellar and an
 * empty tier list (the seed's are all populated) and the bottle created by
 * the review's AI onboarding run. Its friend-view rows are kept (a private
 * cellar and a private tier list as the friend, the friend's search home);
 * its m375 and light-scheme modes are not (§5.3 sweeps 390 dark).
 */

export type Slice =
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5"
  | "S6"
  | "S7"
  | "S8"
  | "S9"
  | "S10";

/** Who the route is viewed as: the demo account, its friend, or nobody. */
export type Viewer = "demo" | "friend" | "anon";

/** A sheet or dialog opened on top of the route and captured once (§5.3). */
export type OpenState = {
  name: string;
  open: (page: Page) => Promise<void>;
};

export type VisualRoute = {
  slice: Slice;
  /** Stable, filename-safe; with the slice and viewport it names the PNGs. */
  slug: string;
  path: string;
  as: Viewer;
  note: string;
  /** Also captured at 1440x900 (the desktop rail). */
  desktop?: boolean;
  /** Extra settle time after network idle, ms (the map's tiles, say). */
  settleMs?: number;
  states?: OpenState[];
};

/** The lane seed's shape, as far as the routes need it (`ux-lane-seed.json`). */
export type Seed = {
  items: Record<string, { id: string; type: string; name: string }>;
  cellars: Record<string, { id: string; name: string }>;
  bottles: {
    item: string;
    id: string;
    cellar: string;
    cellarId: string;
    state: string;
  }[];
  tierLists: Record<string, { id: string }>;
  places: Record<string, { id: string }>;
  brands: Record<string, { id: string }>;
  recipes: Record<string, { groupId: string; id: string }>;
};

/** Ids the seed does not carry, looked up from the lane at sign-in. */
export type Discovered = { scanId?: string };

/** Fill a route's `:name` placeholders; null when one is unknown. */
export const resolvePath = (path: string, found: Discovered): string | null => {
  let missing = false;
  const out = path.replace(/:(\w+)/g, (_, key: string) => {
    const value = (found as Record<string, string | undefined>)[key];
    if (value === undefined) missing = true;
    return value ?? "";
  });
  return missing ? null : out;
};

const TYPE_PATH: Record<string, string> = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
};

const clickThenWait = async (page: Page, open: () => Promise<void>) => {
  await open();
  await page
    .getByRole("dialog")
    .or(page.getByRole("alertdialog"))
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(600);
};

export function visualRoutes(seed: Seed): VisualRoute[] {
  const item = (key: string) => {
    const it = seed.items[key];
    if (it === undefined) throw new Error(`seed has no item ${key}`);
    return { ...it, path: TYPE_PATH[it.type] ?? "wines" };
  };
  const bottleOf = (key: string, want: "open" | "sealed" = "open") => {
    const all = seed.bottles.filter((b) => b.item === key);
    const pick =
      all.find((b) => b.state.startsWith(want)) ??
      all.find((b) => b.state !== "empty") ??
      all[0];
    if (pick === undefined) throw new Error(`seed has no bottle of ${key}`);
    return pick;
  };
  const bottlePath = (key: string, want: "open" | "sealed" = "open") => {
    const b = bottleOf(key, want);
    return `/cellars/${b.cellarId}/${item(key).path}/${b.id}`;
  };
  const cellar = (key: string) => seed.cellars[key]?.id ?? "missing";
  const tier = (key: string) => seed.tierLists[key]?.id ?? "missing";
  const place = (key: string) => seed.places[key]?.id ?? "missing";
  const negroni = seed.recipes.negroni ?? Object.values(seed.recipes)[0];
  const ridge = seed.brands["Ridge Vineyards"] ?? Object.values(seed.brands)[0];

  const routes: VisualRoute[] = [
    // S1 — shell, auth and "Me"
    {
      slice: "S1",
      slug: "sign-in",
      path: "/sign-in",
      as: "anon",
      note: "sign-in, signed out",
      desktop: true,
    },
    {
      slice: "S1",
      slug: "sign-up",
      path: "/sign-up",
      as: "anon",
      note: "sign-up, signed out",
    },
    {
      slice: "S1",
      slug: "offline",
      path: "/~offline",
      as: "anon",
      note: "the static offline page",
    },
    {
      slice: "S1",
      slug: "users-edit",
      path: "/users/edit",
      as: "demo",
      note: "profile edit (display name)",
    },
    {
      slice: "S1",
      slug: "favorites",
      path: "/favorites",
      as: "demo",
      note: "Loved (items; the route keeps its old name)",
    },
    {
      slice: "S1",
      slug: "want-to-try",
      path: "/want-to-try",
      as: "demo",
      note: "Want to try (X08): drinks, places, recipes",
    },
    {
      slice: "S1",
      slug: "rankings",
      path: "/rankings",
      as: "demo",
      note: "rankings",
      desktop: true,
    },
    {
      slice: "S1",
      slug: "friends",
      path: "/friends",
      as: "demo",
      note: "friends (one accepted)",
      desktop: true,
    },

    // S3 — search, home landing, brands
    {
      slice: "S3",
      slug: "search",
      path: "/search",
      as: "demo",
      note: "search home, populated",
      desktop: true,
    },
    {
      slice: "S3",
      slug: "search-query",
      path: "/search?q=ridge",
      as: "demo",
      note: "search results for 'ridge'",
    },
    {
      slice: "S3",
      slug: "search-friend",
      path: "/search",
      as: "friend",
      note: "search home as the friend (recent activity from the demo account)",
    },
    {
      slice: "S3",
      slug: "brands",
      path: "/brands",
      as: "demo",
      note: "brands index",
    },
    {
      slice: "S3",
      slug: "brand-detail",
      path: `/brands/${ridge?.id ?? "missing"}`,
      as: "demo",
      note: "brand page: Ridge Vineyards",
    },

    // S4 — cellars
    {
      slice: "S4",
      slug: "cellars",
      path: "/cellars",
      as: "demo",
      note: "cellars list",
      desktop: true,
    },
    {
      slice: "S4",
      slug: "cellars-add",
      path: "/cellars/add",
      as: "demo",
      note: "new cellar form",
    },
    {
      slice: "S4",
      slug: "cellar-overview",
      path: `/cellars/${cellar("home")}`,
      as: "demo",
      note: "cellar overview (check-in surface)",
      desktop: true,
    },
    {
      slice: "S4",
      slug: "cellar-edit",
      path: `/cellars/${cellar("home")}/edit`,
      as: "demo",
      note: "cellar edit form",
    },
    {
      slice: "S4",
      slug: "cellar-items-home",
      path: `/cellars/${cellar("home")}/items`,
      as: "demo",
      note: "Home Cellar items (wines)",
      desktop: true,
    },
    {
      slice: "S4",
      slug: "cellar-items-bar",
      path: `/cellars/${cellar("bar")}/items`,
      as: "demo",
      note: "Bar Cart items (spirits, sake)",
    },
    {
      slice: "S4",
      slug: "cellar-items-fridge",
      path: `/cellars/${cellar("fridge")}/items`,
      as: "demo",
      note: "Kitchen Fridge & Pantry (beer, coffee, tea)",
    },
    {
      slice: "S4",
      slug: "cellar-items-lake",
      path: `/cellars/${cellar("lake")}/items`,
      as: "demo",
      note: "Lake House (a private cellar)",
    },
    {
      slice: "S4",
      slug: "cellar-items-add",
      path: `/cellars/${cellar("home")}/items/add`,
      as: "demo",
      note: "capture surface in a cellar: camera + type picker (X05)",
    },
    {
      slice: "S4",
      slug: "cellar-items-home-friend",
      path: `/cellars/${cellar("home")}/items`,
      as: "friend",
      note: "Home Cellar viewed by the friend",
    },
    {
      slice: "S4",
      slug: "cellar-items-bar-friend",
      path: `/cellars/${cellar("bar")}/items`,
      as: "friend",
      note: "Bar Cart (PRIVATE) viewed by the friend: the denied state",
    },

    // S5 — item and bottle pages
    {
      slice: "S5",
      slug: "bottle-wine",
      path: bottlePath("w1"),
      as: "demo",
      note: "bottle page: an opened wine",
      desktop: true,
      states: [
        {
          name: "add-to-tier-list",
          open: (page) =>
            clickThenWait(page, () =>
              page.getByRole("button", { name: "Add to Tier List" }).click(),
            ),
        },
        {
          // Delete lives behind the AppBar's ⋯ since S5: a menuitem at md+,
          // a sheet button on a phone (the sheet closes before the confirm).
          name: "delete-confirm",
          open: async (page) => {
            await page.getByRole("button", { name: "More actions" }).click();
            await page
              .getByRole("menuitem", { name: "Delete item" })
              .or(
                page
                  .getByRole("dialog")
                  .getByRole("button", { name: "Delete item" }),
              )
              .click();
            await page
              .getByRole("dialog", { name: "Delete this bottle?" })
              .or(
                page.getByRole("alertdialog", { name: "Delete this bottle?" }),
              )
              .first()
              .waitFor({ state: "visible", timeout: 10_000 });
            await page.waitForTimeout(600);
          },
        },
        {
          // The ⋯ itself: a BottomSheet on a phone, a dropdown menu at md+.
          name: "overflow",
          open: async (page) => {
            await page.getByRole("button", { name: "More actions" }).click();
            await page
              .getByRole("menu")
              .or(page.getByRole("dialog"))
              .first()
              .waitFor({ state: "visible", timeout: 10_000 });
            await page.waitForTimeout(600);
          },
        },
      ],
    },
    {
      slice: "S5",
      slug: "bottle-wine-sealed",
      path: bottlePath("w8", "sealed"),
      as: "demo",
      note: "bottle page: a sealed wine (Open it!)",
    },
    {
      slice: "S5",
      slug: "bottle-beer",
      path: bottlePath("b1", "sealed"),
      as: "demo",
      note: "bottle page: beer",
    },
    {
      slice: "S5",
      slug: "bottle-spirit",
      path: bottlePath("s1"),
      as: "demo",
      note: "bottle page: an opened spirit",
    },
    {
      slice: "S5",
      slug: "bottle-coffee",
      path: bottlePath("c1"),
      as: "demo",
      note: "bottle page: an opened coffee",
    },
    {
      slice: "S5",
      slug: "bottle-sake",
      path: bottlePath("k1"),
      as: "demo",
      note: "bottle page: sake",
    },
    {
      slice: "S5",
      slug: "bottle-tea",
      path: bottlePath("t1"),
      as: "demo",
      note: "bottle page: an opened tea",
    },
    {
      slice: "S5",
      slug: "bottle-wine-edit",
      path: `${bottlePath("w1")}/edit`,
      as: "demo",
      note: "bottle edit form",
    },
    {
      slice: "S5",
      slug: "bottle-wine-friend",
      path: bottlePath("w1"),
      as: "friend",
      note: "a bottle viewed by the friend",
    },
    {
      slice: "S5",
      slug: "item-wine",
      path: `/wines/${item("w1").id}`,
      as: "demo",
      note: "item page: wine",
      desktop: true,
    },
    {
      slice: "S5",
      slug: "item-beer",
      path: `/beers/${item("b1").id}`,
      as: "demo",
      note: "item page: beer",
    },
    {
      slice: "S5",
      slug: "item-spirit",
      path: `/spirits/${item("s1").id}`,
      as: "demo",
      note: "item page: spirit",
    },
    {
      slice: "S5",
      slug: "item-coffee",
      path: `/coffees/${item("c1").id}`,
      as: "demo",
      note: "item page: coffee",
    },
    {
      slice: "S5",
      slug: "item-sake",
      path: `/sakes/${item("k1").id}`,
      as: "demo",
      note: "item page: sake",
    },
    {
      slice: "S5",
      slug: "item-tea",
      path: `/teas/${item("t1").id}`,
      as: "demo",
      note: "item page: tea",
    },
    {
      slice: "S5",
      slug: "item-wine-edit",
      path: `/wines/${item("w1").id}/edit`,
      as: "demo",
      note: "item edit form",
    },
    ...(["wines", "beers", "spirits", "coffees", "sakes", "teas"] as const).map(
      (type): VisualRoute => ({
        slice: "S5",
        slug: `type-index-${type}`,
        path: `/${type}`,
        as: "demo",
        note: `/${type} type index (not found on 28e78f47: captures the 404)`,
      }),
    ),

    // S6 — capture and onboarding
    {
      slice: "S6",
      slug: "add",
      path: "/add",
      as: "demo",
      note: "capture surface: modes, type picker, one camera (X05)",
    },
    {
      slice: "S6",
      slug: "add-wines",
      path: "/add/wines",
      as: "demo",
      note: "capture surface, type fixed, outside a cellar",
    },
    {
      slice: "S6",
      slug: "cellar-wines-add",
      path: `/cellars/${cellar("home")}/wines/add`,
      as: "demo",
      note: "capture surface, type fixed, in a cellar",
    },

    // S7 — map shell and menu scanning
    {
      slice: "S7",
      slug: "map",
      path: "/map",
      as: "demo",
      note: "the map (geolocation: Madison)",
      desktop: true,
      settleMs: 3500,
    },
    {
      slice: "S7",
      slug: "map-place-deeplink",
      path: `/map?placeId=${place("corkbarrel")}`,
      as: "demo",
      note: "map deep link, drawer open",
      desktop: true,
      settleMs: 3500,
    },
    {
      slice: "S7",
      slug: "scans",
      path: "/map/scans",
      as: "demo",
      note: "menu scan history",
    },
    // The seed carries no scan: `:scanId` is filled in at run time from the
    // demo account's newest scan (auth.setup.ts), and skipped without one.
    {
      slice: "S7",
      slug: "scan-detail",
      path: "/map/scans/:scanId",
      as: "demo",
      note: "menu scan results",
      desktop: true,
    },

    // S8 — place pages, create-place, discoveries
    {
      slice: "S8",
      slug: "place-corkbarrel",
      path: `/places/${place("corkbarrel")}`,
      as: "demo",
      note: "place page: Cork & Barrel",
      desktop: true,
    },
    {
      slice: "S8",
      slug: "place-oldmill",
      path: `/places/${place("oldmill")}`,
      as: "demo",
      note: "place page: Old Mill",
    },
    {
      slice: "S8",
      slug: "create-place",
      path: "/map/create-place?lat=43.0731&lng=-89.4012",
      as: "demo",
      note: "create-place form (never submitted)",
    },
    {
      slice: "S8",
      slug: "discoveries",
      path: "/discoveries",
      as: "demo",
      note: "discoveries",
    },

    // S9 — recipes
    {
      slice: "S9",
      slug: "recipes",
      path: "/recipes",
      as: "demo",
      note: "the Bar: drafts, your recipes, all recipes",
      desktop: true,
    },
    {
      slice: "S9",
      slug: "recipe-group",
      path: `/recipes/groups/${negroni?.groupId ?? "missing"}`,
      as: "demo",
      note: "recipe group: Negroni",
    },
    {
      slice: "S9",
      slug: "recipe-versions",
      path: `/recipes/groups/${negroni?.groupId ?? "missing"}/versions`,
      as: "demo",
      note: "recipe versions",
    },
    {
      slice: "S9",
      slug: "recipe-detail",
      path: `/recipes/${negroni?.id ?? "missing"}`,
      as: "demo",
      note: "recipe detail",
      desktop: true,
    },
    // X15: the old generator redirects to New recipe › Photo.
    {
      slice: "S9",
      slug: "recipe-new",
      path: "/recipes/new",
      as: "demo",
      note: "New recipe: Photo · Paste · Type",
    },
    {
      slice: "S9",
      slug: "recipe-new-type",
      path: "/recipes/new?from=type",
      as: "demo",
      note: "New recipe › Type: the editor, private first",
    },

    // S10 — tier lists and insights
    {
      slice: "S10",
      slug: "tier-lists",
      path: "/tier-lists",
      as: "demo",
      note: "tier lists index",
      desktop: true,
    },
    {
      slice: "S10",
      slug: "tier-lists-add",
      path: "/tier-lists/add",
      as: "demo",
      note: "new tier list form",
    },
    {
      slice: "S10",
      slug: "tier-list-reds",
      path: `/tier-lists/${tier("reds")}`,
      as: "demo",
      note: "tier list board: wines",
      desktop: true,
      states: [
        {
          name: "add-entry",
          // X23: Add entry lives in the Arrange bar now; the read-only board
          // has none.
          open: (page) =>
            clickThenWait(page, async () => {
              await page
                .getByRole("button", { name: "Arrange", exact: true })
                .click();
              await page
                .getByRole("toolbar", { name: "Arrange" })
                .getByRole("button", { name: "Add entry" })
                .click();
            }),
        },
      ],
    },
    {
      slice: "S10",
      slug: "tier-list-reds-insights",
      path: `/tier-lists/${tier("reds")}?tab=insights`,
      as: "demo",
      note: "tier list insights tab",
    },
    {
      slice: "S10",
      slug: "tier-list-places",
      path: `/tier-lists/${tier("places")}`,
      as: "demo",
      note: "tier list board: places",
    },
    {
      slice: "S10",
      slug: "tier-list-beer",
      path: `/tier-lists/${tier("beer")}`,
      as: "demo",
      note: "tier list board: beer",
    },
    {
      slice: "S10",
      slug: "tier-list-agave",
      path: `/tier-lists/${tier("agave")}`,
      as: "demo",
      note: "tier list board: spirits",
    },
    {
      slice: "S10",
      slug: "tier-list-edit",
      path: `/tier-lists/${tier("reds")}/edit`,
      as: "demo",
      note: "tier list settings",
    },
    {
      slice: "S10",
      slug: "tier-list-reds-friend",
      path: `/tier-lists/${tier("reds")}`,
      as: "friend",
      note: "the board viewed by the friend",
    },
    {
      slice: "S10",
      slug: "tier-list-agave-friend",
      path: `/tier-lists/${tier("agave")}`,
      as: "friend",
      note: "a PRIVATE board viewed by the friend: the denied state",
    },
  ];
  return routes;
}

/** `<slice>__<slug>__<viewport>`: the stable stem every artifact is named by. */
export const stem = (route: VisualRoute, viewport: string): string =>
  `${route.slice}__${route.slug}__${viewport}`;
