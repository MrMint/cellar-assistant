/**
 * X06's capture surface under happy-dom: the mode row (last used, explicit
 * asks, a resumed draft), a photo carried in through the hand-off, and Menu
 * mode settling the menu's place — "At Cork & Barrel?" from the person's
 * position, one tap to send the held photo, or the picker — over a stubbed
 * `fetch` and a stubbed `navigator.geolocation`.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/add" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const pushed: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => pushed.push(href),
    replace: () => {},
    back: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/add",
  useSearchParams: () => new URLSearchParams(),
}));

window.matchMedia = ((query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList) as typeof window.matchMedia;

// Madison, a few steps from Cork & Barrel.
const HERE = { latitude: 43.0747, longitude: -89.3842 };
Object.defineProperty(navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition: (ok: PositionCallback) =>
      ok({ coords: HERE } as unknown as GeolocationPosition),
    watchPosition: (ok: PositionCallback) => {
      ok({ coords: HERE } as unknown as GeolocationPosition);
      return 1;
    },
    clearWatch: () => {},
  },
});
Object.defineProperty(navigator, "permissions", {
  configurable: true,
  value: { query: async () => ({ state: "granted", onchange: null }) },
});

type Sent = { operationName: string; variables: Record<string, unknown> };
const sent: Sent[] = [];
const place = (id: string, name: string, distanceMeters: number) => ({
  __typename: "NearbyPlace",
  distanceMeters,
  place: { __typename: "Place", id, name, primaryCategory: "wine_bar" },
});
const answers: Record<string, (variables: Record<string, unknown>) => unknown> =
  {
    AiCapabilities: () => ({
      me: {
        __typename: "Viewer",
        id: "me",
        aiCapabilities: {
          __typename: "AiCapabilities",
          semanticSearch: true,
          imageSearch: true,
          labelRead: true,
          menuScan: true,
          recipePhoto: true,
          tierListInsights: true,
          detailSuggestions: true,
        },
      },
    }),
    CaptureNearbyPlaces: () => ({
      me: {
        __typename: "Viewer",
        id: "me",
        nearbyPlaces: {
          __typename: "NearbyPlaceConnection",
          edges: [
            {
              __typename: "NearbyPlaceEdge",
              node: place("mill", "Old Mill", 900),
            },
            {
              __typename: "NearbyPlaceEdge",
              node: place("cork", "Cork & Barrel", 40),
            },
            {
              __typename: "NearbyPlaceEdge",
              node: place("ember", "Ember", 160),
            },
          ],
        },
      },
    }),
    CreateUploadTarget: () => ({
      createUploadTarget: {
        __typename: "UploadTarget",
        fileId: "file-menu",
        bucket: "b",
        key: "menu-scan/file-menu",
        uploadUrl: "http://localhost/upload/file-menu",
        expiresAt: "2030-01-01T00:00:00Z",
      },
    }),
    VerifyUpload: () => ({
      verifyUpload: {
        __typename: "File",
        id: "file-menu",
        bucket: "b",
        key: "menu-scan/file-menu",
        size: 3,
        mimeType: "image/jpeg",
        verifiedAt: "2030-01-01T00:00:00Z",
      },
    }),
    MapCreateMenuScan: (variables) => ({
      createMenuScan: {
        __typename: "MenuScan",
        id: variables.menuScanId,
        processingStatus: "pending",
        matchStatus: "waiting",
        processingError: null,
        itemsDetected: 0,
        itemsMatched: 0,
        confidenceScore: null,
        placeId: "cork",
      },
    }),
  };

globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
  if (String(url).includes("/upload/")) {
    return new Response(null, { status: 200 });
  }
  // Anything else that is not the API (the barcode reader's wasm) is absent.
  if (!String(url).includes("/api/graphql")) {
    return new Response(null, { status: 404 });
  }
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    query?: string;
    operationName?: string;
    variables?: Record<string, unknown>;
  };
  const operationName =
    body.operationName ??
    /(?:mutation|query)\s+(\w+)/.exec(body.query ?? "")?.[1] ??
    "";
  const variables = body.variables ?? {};
  sent.push({ operationName, variables });
  const data = answers[operationName]?.(variables) ?? {};
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const React = await import("react");
const { act } = React;
type ReactNode = import("react").ReactNode;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { CaptureSurface } = await import("./CaptureSurface");
const { MenuCapture } = await import("./MenuCapture");
const { photoHandoff } = await import("@/lib/capture/photo-handoff");
const { CAPTURE_PREFS_KEY, readCapturePrefs } = await import(
  "@/lib/capture/capture-prefs"
);

const PHOTO = "data:image/jpeg;base64,/9j/AA==";

let client: InstanceType<typeof Client>;
let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const render = async (node: ReactNode) => {
  await act(async () =>
    root.render(<Provider value={client}>{node}</Provider>),
  );
};
const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};
const button = (name: string | RegExp) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => {
    const label = b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "";
    return typeof name === "string" ? label === name : name.test(label);
  });
const click = async (el: Element | null | undefined) => {
  assert.ok(el, "element to click exists");
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const heading = () => document.querySelector("h1")?.textContent ?? "";
const checkedMode = () =>
  document
    .querySelector(
      '[aria-label="What are you capturing?"] [aria-checked="true"]',
    )
    ?.textContent?.trim();
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await flush(5);
};

beforeEach(() => {
  client = new Client({
    url: "http://localhost/api/graphql",
    exchanges: [fetchExchange],
    requestPolicy: "network-only",
    // Queries as POST bodies, so the stub reads every operation one way.
    preferGetMethod: false,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  sent.length = 0;
  pushed.length = 0;
  window.localStorage.clear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("CaptureSurface (X06): the mode row", () => {
  test("opens on the last mode used, and a switch is remembered", async () => {
    window.localStorage.setItem(
      CAPTURE_PREFS_KEY,
      JSON.stringify({ mode: "recipe" }),
    );
    await render(<CaptureSurface type="WINE" />);
    await settle();
    assert.equal(heading(), "Snap a recipe");
    assert.equal(checkedMode(), "Recipe");
    assert.ok(button("Close"), "Close is the way out");

    await click(
      [...document.querySelectorAll('[role="radio"]')].find(
        (el) => el.textContent?.trim() === "Menu",
      ),
    );
    await settle();
    assert.equal(heading(), "Scan a menu");
    assert.equal(readCapturePrefs().mode, "menu");
  });

  test("an explicit ?mode= wins over the last used", async () => {
    window.localStorage.setItem(
      CAPTURE_PREFS_KEY,
      JSON.stringify({ mode: "recipe" }),
    );
    await render(<CaptureSurface type="WINE" mode="bottle" />);
    await settle();
    assert.equal(checkedMode(), "Bottle");
    assert.equal(heading(), "Add a bottle");
  });

  test("a photo carried in opens in its mode's preview, once", async () => {
    const token = photoHandoff.put(PHOTO);
    await render(
      <CaptureSurface type="WINE" mode="bottle" photoToken={token} />,
    );
    await settle();
    assert.ok(document.querySelector('[data-slot="capture-preview"]'));
    assert.equal(
      document
        .querySelector('[data-slot="capture-preview"] img')
        ?.getAttribute("src"),
      PHOTO,
    );
    assert.ok(button(/Read this label/));
    assert.equal(photoHandoff.has(token), false, "the token is spent");
  });
});

describe("MenuCapture (X06): a menu from anywhere", () => {
  test("asks 'At Cork & Barrel?'; Yes sends the held photo filed there", async () => {
    await render(<MenuCapture initialPhoto={PHOTO} />);
    await settle();
    const card = document.querySelector('[data-slot="menu-place"]');
    assert.match(card?.textContent ?? "", /At Cork & Barrel\?/);
    assert.match(card?.textContent ?? "", /40 m away/);

    await click(button(/^Yes, I.m here$/));
    await settle();
    const created = sent.find((s) => s.operationName === "MapCreateMenuScan");
    assert.ok(created, "the scan was created");
    const input = created.variables.input as {
      originalImageId: string;
      placeHint: Record<string, unknown>;
    };
    assert.equal(input.originalImageId, "file-menu");
    assert.deepEqual(input.placeHint, {
      placeId: "cork",
      latitude: HERE.latitude,
      longitude: HERE.longitude,
    });
    assert.match(pushed.at(-1) ?? "", /^\/map\/scans\//);
  });

  test("Somewhere else: the others nearest first; the guess rides along as the estimate", async () => {
    await render(<MenuCapture initialPhoto={PHOTO} />);
    await settle();
    await click(button("Somewhere else"));
    await settle();
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, "the picker is open");
    const names = [...dialog.querySelectorAll("li button")].map(
      (b) => b.textContent ?? "",
    );
    assert.equal(names.length, 2);
    assert.match(names[0] ?? "", /^Ember/);
    assert.match(names[1] ?? "", /^Old Mill/);
    await click(dialog.querySelector("li button"));
    await settle();
    const created = sent.find((s) => s.operationName === "MapCreateMenuScan");
    const hint = (created?.variables.input as { placeHint: unknown })
      ?.placeHint;
    assert.deepEqual(hint, {
      placeId: "ember",
      estimatedPlaceId: "cork",
      latitude: HERE.latitude,
      longitude: HERE.longitude,
    });
  });

  test("a place confirmed first: the card says so, and nothing is sent without a photo", async () => {
    await render(<MenuCapture />);
    await settle();
    await click(button(/^Yes, I.m here$/));
    await settle();
    assert.match(
      document.querySelector('[data-slot="menu-place"]')?.textContent ?? "",
      /At Cork & Barrel/,
    );
    assert.ok(button("Change"));
    assert.equal(
      sent.some((s) => s.operationName === "MapCreateMenuScan"),
      false,
    );
  });
});
