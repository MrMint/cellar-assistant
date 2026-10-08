/**
 * SortChip under happy-dom: the chip names the current order, a phone gets
 * a sheet of radio rows and the choice lands once the sheet has closed, and
 * an overriding search makes it say so and stay shut.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars/c1/items" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let viewportWidth = 390;
window.matchMedia = ((query: string) => {
  const min = /min-width:\s*(\d+)px/.exec(query);
  return {
    matches: min !== null && viewportWidth >= Number(min[1]),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}) as typeof window.matchMedia;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { SortChip } = await import("./SortChip");

const OPTIONS = [
  { value: "open", label: "Open first" },
  { value: "recent", label: "Recently added" },
  { value: "a-z", label: "A–Z" },
] as const;
type Sort = (typeof OPTIONS)[number]["value"];

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  viewportWidth = 390;
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const chip = () =>
  container.querySelector<HTMLButtonElement>('[data-slot="sort-chip"]');

describe("SortChip", () => {
  test("names the current order, for sight and for assistive tech", async () => {
    await act(async () =>
      root.render(
        <SortChip options={OPTIONS} value="recent" onValueChange={() => {}} />,
      ),
    );
    assert.equal(chip()?.textContent, "Recently added");
    assert.equal(chip()?.getAttribute("aria-label"), "Sort by: Recently added");
    assert.equal(chip()?.getAttribute("aria-haspopup"), "dialog");
  });

  test("phone: a sheet of radio rows; a tap picks and closes it", async () => {
    const picked: Sort[] = [];
    await act(async () =>
      root.render(
        <SortChip
          options={OPTIONS}
          value="open"
          onValueChange={(next) => picked.push(next)}
        />,
      ),
    );
    await act(async () => chip()?.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const group = document.querySelector('[role="radiogroup"]');
    assert.ok(group, "the sheet holds a radio group");
    const rows = [...(group?.querySelectorAll('[role="radio"]') ?? [])];
    assert.deepEqual(
      rows.map((row) => [row.textContent, row.getAttribute("aria-checked")]),
      [
        ["Open first", "true"],
        ["Recently added", "false"],
        ["A–Z", "false"],
      ],
    );
    await act(async () => (rows[2] as HTMLElement).click());
    assert.deepEqual(picked, ["a-z"]);
    // Re-picking the current order is not a change.
    await act(async () => chip()?.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const again = document.querySelectorAll(
      '[role="radiogroup"] [role="radio"]',
    );
    await act(async () => (again[0] as HTMLElement).click());
    assert.deepEqual(picked, ["a-z"]);
  });

  test("a search overrides the order: the chip says so and is disabled", async () => {
    await act(async () =>
      root.render(
        <SortChip
          options={OPTIONS}
          value="open"
          onValueChange={() => {}}
          overriddenBy="Best match"
        />,
      ),
    );
    assert.equal(chip()?.textContent, "Best match");
    assert.equal(chip()?.disabled, true);
    assert.equal(chip()?.getAttribute("aria-label"), "Sort by: Best match");
  });

  test("from md: a menu button, not a sheet", async () => {
    viewportWidth = 1024;
    await act(async () =>
      root.render(
        <SortChip options={OPTIONS} value="open" onValueChange={() => {}} />,
      ),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.equal(chip()?.getAttribute("aria-haspopup"), "menu");
  });
});
