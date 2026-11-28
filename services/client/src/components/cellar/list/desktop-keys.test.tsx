/**
 * The desktop cellar, mounted (desktop-cellar-04 to -07): the keys reach the
 * list through the app element's dispatcher (`handleAppKey`), never the
 * document. Arrows select, Enter opens the pane with C2's `ItemPane`, Esc
 * closes it, Backspace clears the selection; a click on a tile opens the
 * pane instead of leaving for the page.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars/c1/items" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
// Desktop: every `min-width` query matches.
window.matchMedia = ((query: string) => ({
  matches: query.includes("min-width"),
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
Element.prototype.scrollIntoView = () => {};

const pushed: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => pushed.push(href),
    replace: () => {},
    refresh: () => {},
    back: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/cellars/c1/items",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("next/image", () => ({
  default: (props: { alt: string }) => <span data-alt={props.alt} />,
}));
/** The writes the keys send, by operation name (F-144). */
const sent: { op: string; vars: Record<string, unknown> }[] = [];
const opName = (doc: unknown): string =>
  (doc as { definitions?: { name?: { value?: string } }[] }).definitions?.[0]
    ?.name?.value ?? "";
mock.module("urql", () => ({
  useQuery: () => [{ data: undefined, fetching: false }, () => {}],
  useMutation: (doc: unknown) => [
    {},
    async (vars: Record<string, unknown>) => {
      sent.push({ op: opName(doc), vars });
      return { data: undefined };
    },
  ],
  useClient: () => ({
    query: (doc: unknown, vars: Record<string, unknown>) => ({
      toPromise: async () => {
        sent.push({ op: opName(doc), vars });
        return {
          data: {
            item: {
              __typename: "QueryItemSuccess",
              data: { __typename: "Beer", id: vars.itemId, myReview: null },
            },
          },
        };
      },
    }),
  }),
}));
// C2's pane, as a stand-in: this test is about the list's keys, not its body.
mock.module("@/components/item/ItemPane", () => ({
  ItemPane: ({ itemId }: { itemId: string }) => (
    <div data-testid="item-pane" data-item={itemId} />
  ),
}));

// happy-dom's Web Animations reject on cancel: motion jumps to its end.
const { MotionGlobalConfig } = await import("motion/react");
MotionGlobalConfig.skipAnimations = true;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { NuqsTestingAdapter } = await import("nuqs/adapters/testing");
const { handleAppKey } = await import("@/components/app/overlays/app-keys");
const { TooltipProvider } = await import("@/components/ui/tooltip");
const { CellarList } = await import("./CellarList");
type Bottle = Parameters<typeof CellarList>[0]["bottles"][number];

const bottle = (i: number): Bottle => ({
  key: `b${i}`,
  itemId: `i${i}`,
  type: "BEER",
  name: `Demo Ale ${i}`,
  maker: "Demo Brewing",
  style: "Pale ale",
  photoUrl: null,
  plate: null,
  rating: null,
  publicScore: null,
  publicCount: null,
  favorite: false,
  open: false,
  percent: 100,
  count: 1,
  match: null,
  note: null,
  noteDate: null,
  addedAt: null,
  href: `/cellars/c1/beers/b${i}`,
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <TooltipProvider>
        <NuqsTestingAdapter>
          <CellarList
            cellarId="c1"
            cellarName="Home"
            bottles={[1, 2, 3].map(bottle)}
            bottleCount={3}
            capped={false}
            search=""
            status="in-cellar"
            statusCounts={{ "in-cellar": 3, finished: 0, all: 3 }}
            needsDetails={0}
            canEdit
          />
        </NuqsTestingAdapter>
      </TooltipProvider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const press = async (key: string) => {
  await act(async () => {
    handleAppKey(
      {
        key,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        target: document.body,
        preventDefault: () => {},
      },
      {
        navigate: () => {},
        openKeys: () => {},
        openMore: () => {},
        focusSearch: () => false,
      },
      { armed: false },
    );
  });
};

const selected = () =>
  container.querySelector("[data-selected]")?.getAttribute("data-key") ?? null;
const pane = () => container.querySelector('[data-slot="desktop-pane"]');

describe("desktop cellar keys", () => {
  test("arrows select, Enter opens the pane, Esc closes it, Backspace clears", async () => {
    assert.equal(selected(), null);
    await press("ArrowRight");
    assert.equal(selected(), "b1");
    assert.equal(
      container.querySelector("[data-selected]")?.getAttribute("data-selected"),
      "keyboard",
    );
    await press("ArrowRight");
    assert.equal(selected(), "b2");
    await press("k");
    assert.equal(selected(), "b1");
    assert.equal(pane(), null, "moving only selects");

    await press("Enter");
    assert.ok(pane(), "Enter opens the pane");
    assert.ok(container.querySelector('[data-testid="item-pane"]'));
    assert.equal(pane()?.getAttribute("aria-label"), "Demo Ale 1");

    await press("Escape");
    assert.equal(pane(), null, "Esc closes the pane");
    assert.equal(selected(), "b1", "the selection stays");

    await press("Backspace");
    assert.equal(selected(), null);
  });

  test("F favourites the selected bottle, 1 to 5 rate it (F-144)", async () => {
    sent.length = 0;
    await press("f");
    assert.deepEqual(sent, [], "nothing selected: nothing sent");
    await press("ArrowRight");
    await press("f");
    assert.deepEqual(sent.at(-1), {
      op: "SetItemFavorite",
      vars: { itemId: "i1", type: "BEER", favorited: true },
    });
    await press("4");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const rated = sent.at(-1);
    assert.equal(rated?.op, "AddItemReview");
    assert.equal(rated?.vars.itemId, "i1");
    assert.equal(
      (rated?.vars.input as { score?: number } | undefined)?.score,
      4,
    );
  });

  test("a click on a tile opens the pane, not the page", async () => {
    const link = container.querySelector<HTMLAnchorElement>(
      '[data-key="b2"] a[data-slot="link"]',
    );
    assert.ok(link);
    await act(async () => link.click());
    assert.equal(selected(), "b2");
    assert.ok(pane());
    assert.deepEqual(pushed, []);
  });
});
