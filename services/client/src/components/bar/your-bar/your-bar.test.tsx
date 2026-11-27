/**
 * Your bar (Recipes-Make board): a swap is never Make now (CROSS-LOT), the
 * row lines name what a drink pours, swaps or needs, and "Have it" writes
 * only the viewer's own pantry, only for a pantry kind.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { PANTRY_KINDS } from "@cellar-assistant/contracts/bar";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/recipes/bar" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let refreshes = 0;
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {
      refreshes += 1;
    },
    prefetch: () => {},
  }),
  usePathname: () => "/recipes/bar",
  useSearchParams: () => new URLSearchParams(),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { Client, Provider, fetchExchange } = await import("urql");
const { splitBar, readinessLine, countText } = await import("./sections");
const { barRowDetail } = await import("./detail");
const { WorthPickingUp, canHaveIt } = await import("./WorthPickingUp");
const { BarRecipeRow } = await import("../BarRecipeRow");

type Status = "MAKE_NOW" | "ONE_AWAY" | "MISSING";
const row = (id: string, status: Status, substituteCount = 0) => ({
  id,
  makeability: { status, missing: [] as string[], substituteCount },
});

describe("splitBar: a swap is never Make now (CROSS-LOT)", () => {
  test("a swap moves to One bottle away, first, and the counts follow", () => {
    const bar = splitBar({
      makeNow: [row("ready", "MAKE_NOW"), row("swap", "MAKE_NOW", 1)],
      oneBottleAway: [row("away", "ONE_AWAY")],
      makeNowCount: 2,
      oneBottleAwayCount: 1,
    });
    assert.deepEqual(
      bar.ready.map((r) => r.id),
      ["ready"],
    );
    assert.deepEqual(
      bar.away.map((r) => r.id),
      ["swap", "away"],
    );
    assert.equal(
      readinessLine(bar.readyCount, bar.awayCount),
      "1 ready · 2 one away",
    );
  });

  test("a cut-off Make now never shows its limit as a total", () => {
    const bar = splitBar({
      makeNow: [row("a", "MAKE_NOW"), row("b", "MAKE_NOW", 2)],
      oneBottleAway: [],
      makeNowCount: 140,
      oneBottleAwayCount: 7,
    });
    assert.equal(countText(bar.readyCount), "1+");
    assert.equal(countText(bar.awayCount), "8+");
  });
});

describe("barRowDetail", () => {
  const ing = (
    kindLabel: string,
    status: string,
    source: string | null,
    label: string | null,
  ) => ({
    isOptional: false,
    role: "base",
    kindLabel,
    availability: { status, source, label },
  });

  test("ready names the bottles it pours", () => {
    assert.equal(
      barRowDetail({ status: "MAKE_NOW", missing: [], substituteCount: 0 }, [
        ing("Vodka", "HAVE", "BOTTLE", "Demo Vodka"),
        ing("Coffee liqueur", "HAVE", "BOTTLE", "Demo Liqueur"),
        ing("Simple syrup", "HAVE", "PANTRY", "Simple syrup"),
      ]),
      "Demo Vodka +1",
    );
    assert.equal(
      barRowDetail({ status: "MAKE_NOW", missing: [], substituteCount: 0 }, [
        ing("Lime", "HAVE", "PANTRY", "Limes"),
      ]),
      "From your pantry",
    );
  });

  test("a swap says what stands in for what", () => {
    assert.equal(
      barRowDetail({ status: "MAKE_NOW", missing: [], substituteCount: 1 }, [
        ing("White rum", "SUBSTITUTE", "BOTTLE", "Demo Spiced Rum"),
        ing("Lime", "HAVE", "PANTRY", "Limes"),
      ]),
      "Swap: Demo Spiced Rum for white rum",
    );
  });

  test("one away says what it needs", () => {
    assert.equal(
      barRowDetail(
        { status: "ONE_AWAY", missing: ["Orange liqueur"], substituteCount: 0 },
        [],
      ),
      "Needs Orange liqueur",
    );
  });
});

describe("BarRecipeRow", () => {
  test("a makeable row, swaps included, carries an outlined Make into Make mode", () => {
    const swap = renderToStaticMarkup(
      <BarRecipeRow
        recipeId="r9"
        name="Daiquiri"
        makeability={{ status: "MAKE_NOW", missing: [], substituteCount: 1 }}
        detail="Swap: Demo Spiced Rum for white rum"
      />,
    );
    assert.match(swap, /href="\/recipes\/r9\/make"/);
    assert.match(swap, /aria-label="Make Daiquiri"/);
    assert.match(swap, /data-variant="outline"/);
    const away = renderToStaticMarkup(
      <BarRecipeRow
        recipeId="r8"
        name="Margarita"
        makeability={{
          status: "ONE_AWAY",
          missing: ["Orange liqueur"],
          substituteCount: 0,
        }}
      />,
    );
    assert.doesNotMatch(away, /\/make"/);
    assert.match(away, /Needs Orange liqueur/);
  });
});

describe("Have it writes only your own pantry", () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  let bodies: { query: string; variables: Record<string, unknown> }[];

  beforeEach(() => {
    bodies = [];
    refreshes = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  const client = () =>
    new Client({
      url: "http://localhost/api/graphql",
      exchanges: [fetchExchange],
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        return new Response(
          JSON.stringify({
            data: {
              setBarPantryItem: {
                __typename: "BarPantryEntry",
                kind: body.variables.kind,
                have: body.variables.have,
              },
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });

  const pantryKind = PANTRY_KINDS[0];

  test("only a pantry kind offers Have it; a cellar bottle never does", () => {
    assert.equal(canHaveIt(pantryKind), true);
    assert.equal(
      (PANTRY_KINDS as readonly string[]).includes("gin"),
      false,
      "gin is a cellar bottle",
    );
    assert.equal(canHaveIt("gin"), false);
    assert.equal(canHaveIt(null), false);
  });

  test("Have it sends the kind and nothing that names a person", async () => {
    await act(async () => {
      root.render(
        <Provider value={client()}>
          <WorthPickingUp
            bottles={[
              { name: "Pantry thing", unlocks: 4, kind: pantryKind },
              { name: "Gin", unlocks: 2, kind: "gin" },
            ]}
          />
        </Provider>,
      );
    });
    const buttons = [...container.querySelectorAll("button")].filter((b) =>
      /Have it/.test(b.textContent ?? ""),
    );
    assert.equal(buttons.length, 1, "Gin has no Have it");
    await act(async () => {
      buttons[0]?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(bodies.length, 1);
    assert.match(bodies[0]?.query ?? "", /setBarPantryItem/);
    assert.deepEqual(bodies[0]?.variables, { kind: pantryKind, have: true });
    assert.equal(refreshes, 1);
  });
});
