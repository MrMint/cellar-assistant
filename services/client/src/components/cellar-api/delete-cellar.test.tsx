/**
 * Delete cellar (lot-cellars-shelves-02, -09): refused while the cellar
 * holds bottles; an empty one goes at once, back to the index, with an Undo
 * toast that makes it again as it was.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars/c1/edit" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const pushed: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => pushed.push(href),
    replace: () => {},
    refresh: () => {},
    back: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/cellars/c1/edit",
  useSearchParams: () => new URLSearchParams(),
}));

const calls: { op: string; vars: unknown }[] = [];
mock.module("urql", () => ({
  useMutation: (doc: { definitions?: { name?: { value: string } }[] }) => {
    const op = doc.definitions?.[0]?.name?.value ?? "?";
    return [
      { fetching: false },
      async (vars: unknown) => {
        calls.push({ op, vars });
        return op === "DeleteCellar"
          ? {
              data: {
                deleteCellar: { __typename: "DeletedCellar", id: "c1" },
              },
            }
          : {
              data: {
                createCellar: { __typename: "Cellar", id: "c9" },
              },
            };
      },
    ];
  },
}));

const toasts: { message: string; undo?: () => void }[] = [];
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options: { undo?: () => void } = {}) => {
    toasts.push({ message, undo: options.undo });
    return toasts.length;
  },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { DeleteCellarButton } = await import("./DeleteCellarButton");

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  pushed.length = 0;
  calls.length = 0;
  toasts.length = 0;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const mount = (itemCount: number) =>
  act(async () =>
    root.render(
      <DeleteCellarButton
        cellarId="c1"
        cellarName="Home"
        itemCount={itemCount}
        privacy="PRIVATE"
        coOwnerIds={["u2"]}
      />,
    ),
  );

const button = () =>
  [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Delete cellar"),
  );

describe("delete cellar", () => {
  test("holding bottles: refused, with the reason", async () => {
    await mount(240);
    assert.equal(button()?.disabled, true);
    assert.match(
      container.textContent ?? "",
      /Holds 240 bottles\. Empty it first\./,
    );
  });

  test("empty: deletes at once, then Undo makes it again", async () => {
    await mount(0);
    assert.equal(button()?.disabled, false);
    await act(async () => button()?.click());
    assert.deepEqual(
      calls.map((c) => c.op),
      ["DeleteCellar"],
    );
    assert.deepEqual(pushed, ["/cellars"]);
    assert.equal(toasts[0]?.message, "Deleted Home");

    await act(async () => toasts[0]?.undo?.());
    assert.deepEqual(calls[1], {
      op: "CreateCellar",
      vars: {
        input: { name: "Home", privacy: "PRIVATE", coOwnerIds: ["u2"] },
      },
    });
  });
});
