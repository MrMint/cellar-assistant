/**
 * FS-2 / F-190: on desktop, picking a place opens the pane and puts its
 * `?placeId=` in the URL, and closing it takes both away.
 *
 * Reproduced on the container (3003) at 1280: a row's click selected the
 * place, the pane's overlay layer pushed its Back entry at once, and nuqs —
 * which queues a URL write for a tick and re-reads the URL on a push that is
 * not its own — dropped the queued `?placeId=` and fell back to none. That
 * read as "the URL took the place away" (Back), so the pane closed in the
 * same moment it opened: the map re-centred, the URL stayed /map.
 *
 * The URL adapter here is a stand-in with that one documented behaviour (a
 * queued write, dropped by a foreign push); the overlay layer is the real
 * one the desktop pane uses.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/map" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Place = { id: string; name: string };

// ── The URL adapter stand-in (nuqs's queue) ─────────────────────────────
const FLUSH_MS = 50;
const urlPlaceId = () =>
  new URL(window.location.href).searchParams.get("placeId");
let statePlaceId: string | null = null;
let pending: { value: string | null; history: "push" | "replace" } | null =
  null;
let writingOwn = false;
const urlListeners = new Set<() => void>();
const notifyUrl = () => {
  for (const listener of urlListeners) listener();
};
const nativePush = window.history.pushState.bind(window.history);
window.history.pushState = (data, unused, url) => {
  if (!writingOwn) {
    // A push that is not ours: drop the queue and re-read the URL.
    pending = null;
    queueMicrotask(() => {
      statePlaceId = urlPlaceId();
      notifyUrl();
    });
  }
  nativePush(data, unused, url);
};
const setPlaceId = (
  value: string | null,
  options?: { history?: "push" | "replace" },
): Promise<URLSearchParams> => {
  statePlaceId = value;
  notifyUrl();
  const write = { value, history: options?.history ?? "replace" };
  pending = write;
  return new Promise((resolve) => {
    setTimeout(() => {
      if (pending === write) {
        pending = null;
        const next = new URL(window.location.href);
        if (value === null) next.searchParams.delete("placeId");
        else next.searchParams.set("placeId", value);
        writingOwn = true;
        try {
          (write.history === "push"
            ? window.history.pushState
            : window.history.replaceState
          ).call(window.history, window.history.state, "", next.toString());
        } finally {
          writingOwn = false;
        }
      }
      resolve(new URL(window.location.href).searchParams);
    }, FLUSH_MS);
  });
};

// ── The map machine stand-in (selection only) ───────────────────────────
let selected: Place | null = null;
const machineListeners = new Set<() => void>();
const setSelected = (place: Place | null) => {
  selected = place;
  for (const listener of machineListeners) listener();
};
const mapActions = {
  selectPlace: (place: Place) => setSelected(place),
  closeDrawer: () => setSelected(null),
};

mock.module("./useMapMachine", () => ({
  useMapActions: () => mapActions,
  useMapUI: () => {
    const place = React.useSyncExternalStore(
      (listener) => {
        machineListeners.add(listener);
        return () => machineListeners.delete(listener);
      },
      () => selected,
    );
    return { isDrawerOpen: place !== null, selectedPlace: place };
  },
}));
mock.module("./useMapSearchParams", () => ({
  useMapSearchParams: () => {
    const placeId = React.useSyncExternalStore(
      (listener) => {
        urlListeners.add(listener);
        return () => urlListeners.delete(listener);
      },
      () => statePlaceId,
    );
    return { placeId, setPlaceId };
  },
}));

const React = await import("react");
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useOverlayLayer, resetLayers } = await import(
  "@/components/app/overlays/layers"
);
const { useMapPlaceSelection } = await import("./useMapPlaceSelection");

type Selection = ReturnType<typeof useMapPlaceSelection>;
let selection: Selection | null = null;

/** The renderer's desktop wiring: the hook, and the pane's overlay layer. */
function DesktopMap() {
  const detailDrawerRef = React.useRef(null);
  const sel = useMapPlaceSelection({ isDesktop: true, detailDrawerRef });
  selection = sel;
  const open =
    React.useSyncExternalStore(
      (listener) => {
        machineListeners.add(listener);
        return () => machineListeners.delete(listener);
      },
      () => selected,
    ) !== null;
  // The pane registers while open (DesktopPane → useOverlayLayer).
  useOverlayLayer(open, sel.handleCloseDrawer, { escape: true });
  return null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const place: Place = { id: "p-sakura", name: "Sakura Izakaya" };

let root: ReturnType<typeof createRoot> | null = null;

beforeEach(async () => {
  resetLayers();
  window.history.replaceState(null, "", "/map");
  statePlaceId = null;
  pending = null;
  selected = null;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<DesktopMap />));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
});

describe("a desktop pick opens the place pane (FS-2)", () => {
  test("the pane stays open and the URL carries ?placeId=", async () => {
    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the stand-in Place
      selection?.handleSelectPlace(place as any);
      await wait(FLUSH_MS * 4);
    });
    assert.equal(selected?.id, place.id, "the pane closed as it opened");
    assert.equal(urlPlaceId(), place.id, "the URL never got ?placeId=");
  });

  test("closing the pane takes the place and ?placeId= away", async () => {
    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: the stand-in Place
      selection?.handleSelectPlace(place as any);
      await wait(FLUSH_MS * 4);
    });
    await act(async () => {
      selection?.handleCloseDrawer();
      await wait(FLUSH_MS * 4 + 450);
    });
    assert.equal(selected, null);
    assert.equal(urlPlaceId(), null, "?placeId= outlived the pane");
  });
});
