/**
 * L10 · the menu header's rename is only ever applied from a confirm. The
 * offer is rendered against a stubbed API: showing it sends no write, Keep
 * sends none, and only Rename sends a resubmit — with the name changed and
 * every other field the place's own.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/scans/s1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Sent = { operationName: string; variables: Record<string, unknown> };
const sent: Sent[] = [];
let reviewStatus = "PENDING";

const PLACE = {
  __typename: "Place",
  id: "p-1",
  name: "Wine bar near me",
  categories: ["wine_bar"],
  reviewStatus: "PENDING",
  location: { lng: -122.4194, lat: 37.7749 },
  streetAddress: null,
  locality: "San Francisco",
  region: null,
  postcode: null,
  countryCode: "US",
  phone: null,
  website: null,
  description: null,
};

globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    query?: string;
    operationName?: string;
    variables?: Record<string, unknown>;
  };
  const operationName =
    body.operationName ??
    /(?:mutation|query)\s+(\w+)/.exec(body.query ?? "")?.[1] ??
    "";
  sent.push({ operationName, variables: body.variables ?? {} });
  const data =
    operationName === "ScanHeaderRename"
      ? {
          menuScan: {
            __typename: "MenuScan",
            id: "s1",
            headerName: "Bar Lumen",
            place: { ...PLACE, reviewStatus },
          },
        }
      : operationName === "ResubmitPlace"
        ? {
            resubmitPlace: {
              __typename: "Place",
              id: "p-1",
              name: "Bar Lumen",
              reviewStatus: "PENDING",
              rejectionReason: null,
            },
          }
        : {};
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, fetchExchange, Provider } = await import("urql");
const { HeaderRenameOffer } = await import("./HeaderRenameOffer");

const client = new Client({
  url: "http://localhost/api/graphql",
  exchanges: [fetchExchange],
  requestPolicy: "network-only",
  preferGetMethod: false,
});

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const render = async () => {
  await act(async () =>
    root.render(
      <Provider value={client}>
        <HeaderRenameOffer scanId="s1" />
      </Provider>,
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
};
const button = (prefix: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.trim().startsWith(prefix),
  );
const click = async (el: Element | undefined) => {
  assert.ok(el, "element to click exists");
  await act(async () => {
    (el as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
  });
};
const resubmits = () => sent.filter((s) => s.operationName === "ResubmitPlace");
const offer = () => document.querySelector('[data-slot="header-rename"]');

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  sent.length = 0;
  reviewStatus = "PENDING";
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("HeaderRenameOffer (L10)", () => {
  test("offered, and showing it writes nothing", async () => {
    await render();
    assert.match(offer()?.textContent ?? "", /This menu says “Bar Lumen”/);
    assert.equal(resubmits().length, 0);
  });

  test("Keep dismisses it and writes nothing", async () => {
    await render();
    await click(button("Keep"));
    assert.equal(offer(), null);
    assert.equal(resubmits().length, 0);
  });

  test("only Rename resubmits, changing the name alone", async () => {
    await render();
    await click(button("Rename"));
    const [call] = resubmits();
    assert.ok(call);
    assert.equal(call.variables.placeId, "p-1");
    const input = call.variables.input as Record<string, unknown>;
    assert.equal(input.name, "Bar Lumen");
    assert.deepEqual(input.categories, ["wine_bar"]);
    assert.equal(input.locality, "San Francisco");
    assert.equal(offer(), null);
  });

  test("never offered for an approved, shared place", async () => {
    reviewStatus = "APPROVED";
    await render();
    assert.equal(offer(), null);
    assert.equal(resubmits().length, 0);
  });
});
