/**
 * The overlay primitives' own rules: QR is real encoding on the white plate
 * (L14), Esc and back close what is on top and only that (KIT § 4), the
 * app's keys, and a toast that pauses under a quick look and resumes with
 * the time it had left (KIT § 2).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Raised = { message: string; duration?: number; id?: string | number };
const raised: Raised[] = [];
const sonnerToast = Object.assign(
  (message: string, options: { duration?: number; id?: string | number }) => {
    raised.push({ message, duration: options.duration, id: options.id });
    return options.id ?? "t";
  },
  {
    success: (m: string, o: { duration?: number; id?: string }) =>
      sonnerToast(m, o),
    error: (m: string, o: { duration?: number; id?: string }) =>
      sonnerToast(m, o),
    loading: (m: string, o: { duration?: number; id?: string }) =>
      sonnerToast(m, o),
    dismiss: () => {},
  },
);
mock.module("sonner", () => ({ toast: sonnerToast, Toaster: () => null }));

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { encode } = await import("uqr");
const { QrCode, qrMatrix, qrPath } = await import("./QrCode");
const { closeTopOnEscape, openLayers, resetLayers, useOverlayLayer } =
  await import("./layers");
const { handleAppKey, KEY_ROWS } = await import("./app-keys");
const { ShareSheetBody } = await import("./ShareSheet");
const { notify, pauseToasts, dismissNotification } = await import("../notify");
const { tallSheetOpen } = await import("../Toaster");
const { SHEET_INSET_PROPERTY, SHEET_OPEN_ATTRIBUTE } = await import(
  "../BottomSheet"
);

describe("QR code", () => {
  const url = "https://cellar.example/lists/demo-reds";

  test("the matrix is uqr's own encoding of the input", () => {
    const expected = encode(url, { ecc: "M", border: 0 }).data;
    assert.deepEqual(qrMatrix(url), expected);
    // Version 3 at M holds this URL: 29 modules square.
    assert.equal(qrMatrix(url).length, 29);
  });

  test("the path draws exactly the dark modules", () => {
    const matrix = qrMatrix(url);
    const dark = matrix.flat().filter(Boolean).length;
    assert.equal(qrPath(matrix).match(/M/g)?.length, dark);
    assert.equal(qrPath([[true, false]]), "M0 0h1v1h-1z");
  });

  test("the SVG renders on the white plate in black", () => {
    const html = renderToStaticMarkup(
      <QrCode value={url} label="QR code for this list" />,
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    const plate = host.querySelector('[data-slot="qr-plate"]');
    assert.ok(plate);
    assert.match(plate.className, /\bbg-white\b/);
    assert.match(plate.className, /\btext-black\b/);
    const svg = plate.querySelector("svg");
    assert.equal(svg?.getAttribute("role"), "img");
    assert.equal(svg?.getAttribute("aria-label"), "QR code for this list");
    assert.equal(svg?.getAttribute("viewBox"), "0 0 29 29");
    assert.equal(
      svg?.querySelector("path")?.getAttribute("d"),
      qrPath(qrMatrix(url)),
    );
  });
});

describe("overlay layers", () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  const closed: string[] = [];

  function Layer({
    name,
    open,
    escape: esc,
  }: {
    name: string;
    open: boolean;
    escape?: boolean;
  }) {
    useOverlayLayer(open, () => closed.push(name), { escape: esc });
    return null;
  }

  beforeEach(() => {
    resetLayers();
    closed.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  test("Esc closes only the top layer, and only one that answers Esc", async () => {
    await act(async () =>
      root.render(
        <>
          <Layer name="pane" open escape />
          <Layer name="look" open escape />
        </>,
      ),
    );
    assert.equal(openLayers(), 2);
    assert.equal(closeTopOnEscape(), true);
    assert.deepEqual(closed, ["look"]);

    // A Radix layer on top answers its own Esc: nothing here closes.
    await act(async () =>
      root.render(
        <>
          <Layer name="pane" open escape />
          <Layer name="look" open escape />
          <Layer name="sheet" open />
        </>,
      ),
    );
    closed.length = 0;
    assert.equal(closeTopOnEscape(), false);
    assert.deepEqual(closed, []);
  });

  test("back closes the top layer", async () => {
    await act(async () =>
      root.render(
        <>
          <Layer name="pane" open escape />
          <Layer name="sheet" open />
        </>,
      ),
    );
    assert.ok(
      (window.history.state as Record<string, unknown>)?.caOverlay,
      "opening pushed an entry",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    assert.deepEqual(closed, ["sheet"]);
  });

  test("closing by other means takes our entry back off, and that pop closes nothing", async () => {
    await act(async () => root.render(<Layer name="sheet" open />));
    const before = window.history.length;
    let backs = 0;
    const realBack = window.history.back.bind(window.history);
    window.history.back = () => {
      backs += 1;
      realBack();
    };
    await act(async () => root.render(<Layer name="sheet" open={false} />));
    window.history.back = realBack;
    assert.equal(backs, 1);
    assert.equal(openLayers(), 0);
    window.dispatchEvent(new PopStateEvent("popstate"));
    assert.deepEqual(closed, []);
    assert.ok(window.history.length >= before - 1);
  });
});

describe("app keys", () => {
  const calls: string[] = [];
  const actions = {
    navigate: (href: string) => calls.push(`go ${href}`),
    openKeys: () => calls.push("keys"),
    openMore: () => calls.push("more"),
    focusSearch: () => false,
  };
  const key = (k: string, target: EventTarget | null = document.body) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target,
    preventDefault: () => {},
  });

  beforeEach(() => {
    calls.length = 0;
    resetLayers();
  });

  test("G chords go to their tab, G O opens More", () => {
    const chord = { armed: false };
    assert.equal(handleAppKey(key("g"), actions, chord), true);
    assert.equal(handleAppKey(key("l"), actions, chord), true);
    handleAppKey(key("G"), actions, chord);
    handleAppKey(key("c"), actions, chord);
    handleAppKey(key("g"), actions, chord);
    handleAppKey(key("o"), actions, chord);
    assert.deepEqual(calls, ["go /tier-lists", "go /cellars", "more"]);
  });

  test("single keys: / search, ? keys, N add, M map", () => {
    const chord = { armed: false };
    for (const k of ["/", "?", "n", "M"]) handleAppKey(key(k), actions, chord);
    assert.deepEqual(calls, ["go /search", "keys", "go /add", "go /map"]);
  });

  test("keys typed into a field or a dialog are left alone", () => {
    const chord = { armed: false };
    const input = document.createElement("input");
    document.body.appendChild(input);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inside = document.createElement("button");
    dialog.appendChild(inside);
    document.body.appendChild(dialog);
    assert.equal(handleAppKey(key("n", input), actions, chord), false);
    assert.equal(handleAppKey(key("?", inside), actions, chord), false);
    assert.deepEqual(calls, []);
    document.body.innerHTML = "";
  });

  test("a modified key is the browser's", () => {
    const chord = { armed: false };
    assert.equal(
      handleAppKey({ ...key("n"), metaKey: true }, actions, chord),
      false,
    );
  });
});

describe("toasts", () => {
  beforeEach(() => {
    raised.length = 0;
  });

  test("a quick look pauses the toast and hands back the time it had left", async () => {
    const id = notify("Removed from Home Cellar", { undo: () => {} });
    const shown = raised.at(-1)?.duration ?? 0;
    assert.ok(shown > 0);
    await new Promise((r) => setTimeout(r, 30));
    const resume = pauseToasts();
    assert.equal(raised.at(-1)?.duration, Number.POSITIVE_INFINITY);
    assert.equal(raised.at(-1)?.id, id);
    // Time spent paused does not count.
    await new Promise((r) => setTimeout(r, 30));
    resume();
    const left = raised.at(-1)?.duration ?? 0;
    assert.ok(left < shown && left > shown - 1000, `left ${left} of ${shown}`);
    // Resuming twice does nothing more.
    const count = raised.length;
    resume();
    assert.equal(raised.length, count);
    dismissNotification(id);
  });

  test("pauses nest: the toast resumes after the last one ends", () => {
    const id = notify("Saved", { undo: () => {} });
    const a = pauseToasts();
    const b = pauseToasts();
    const count = raised.length;
    a();
    assert.equal(raised.length, count, "still paused");
    b();
    assert.equal(raised.length, count + 1);
    dismissNotification(id);
  });

  test("a sheet past 70% of the screen sends the toast to the top", () => {
    const root = document.createElement("div");
    assert.equal(tallSheetOpen(root, 800), false);
    root.setAttribute(SHEET_OPEN_ATTRIBUTE, "");
    root.style.setProperty(SHEET_INSET_PROPERTY, "400px");
    assert.equal(tallSheetOpen(root, 800), false);
    root.style.setProperty(SHEET_INSET_PROPERTY, "600px");
    assert.equal(tallSheetOpen(root, 800), true);
  });
});

describe("fix-b23 rows", () => {
  test("H-92: the kit switch starts from the theme on screen", async () => {
    const { onScreenKitTheme } = await import("../kit-gallery");
    document.documentElement.dataset.theme = "light";
    assert.equal(onScreenKitTheme(), "light");
    document.documentElement.dataset.theme = "dark";
    assert.equal(onScreenKitTheme(), "dark");
    delete document.documentElement.dataset.theme;
  });

  test("F-169: the ⌫ row says what Backspace does on the cellar list", () => {
    const row = KEY_ROWS.find((r) => r.keys === "⌫");
    assert.equal(row?.does, "Clear the selection");
  });

  test("F-8: a sheet open but not yet measured sends the toast to the top", () => {
    const root = document.createElement("div");
    root.setAttribute(SHEET_OPEN_ATTRIBUTE, "");
    assert.equal(tallSheetOpen(root, 800), true);
  });

  test("F-174 / H-104: ShareSheetBody draws an optional preview and footer", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareSheetBody, {
        title: "Spring",
        url: "https://example.test/x",
        preview: React.createElement("p", null, "PREVIEW-SLOT"),
        footer: React.createElement("li", null, "FOOTER-SLOT"),
      }),
    );
    assert.ok(html.indexOf("PREVIEW-SLOT") < html.indexOf("Copy link"));
    assert.ok(html.indexOf("FOOTER-SLOT") > html.indexOf("Copy link"));
    const bare = renderToStaticMarkup(
      React.createElement(ShareSheetBody, {
        title: "Spring",
        url: "https://example.test/x",
      }),
    );
    assert.doesNotMatch(bare, /SLOT/);
  });
});

describe("F-173: the glyphs the later rows swap in", () => {
  test("icons exports them", async () => {
    const icons = await import("../icons");
    for (const name of [
      "Unlink",
      "Keyboard",
      "Flashlight",
      "ArrowUp",
      "ArrowDown",
      "Download",
      "CalendarDays",
    ]) {
      assert.ok(name in icons, name);
    }
  });
});

describe("F-47: the photo-tone AppBar", () => {
  test("the title is sr-only inside a flex-1 spacer, so ⋯ stays right", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../AppBar.tsx", import.meta.url), "utf8");
    assert.match(
      src,
      /<div className="min-w-0 flex-1">\s*<div className=\{cn\(photo && "sr-only"\)\}>/,
    );
  });
});

describe("fix-b29: desktop pane and kit parts", () => {
  test("H-116: the pane's chevrons point left and right", async () => {
    const { DesktopPane } = await import("./DesktopPane");
    const markup = renderToStaticMarkup(
      <DesktopPane open onClose={() => {}} title="Pane" onNext={() => {}}>
        <p>body</p>
      </DesktopPane>,
    );
    assert.match(markup, /lucide-chevron-left/);
    assert.match(markup, /lucide-chevron-right/);
    assert.doesNotMatch(markup, /lucide-chevron-(up|down)/);
  });

  test("H-117: a count cell draws its glyph", async () => {
    const { CountFilters } = await import("../parts/CountStrip");
    const { WineGlyph } = await import("../parts/glyphs");
    const markup = renderToStaticMarkup(
      <CountFilters
        aria-label="Show only"
        cells={[
          { value: "WINE", label: "Wine", count: 3, glyph: WineGlyph },
          { value: "BEER", label: "Beer", count: 2 },
        ]}
        value={null}
        onValueChange={() => {}}
      />,
    );
    assert.equal(markup.match(/<svg/g)?.length, 1);
  });
});
