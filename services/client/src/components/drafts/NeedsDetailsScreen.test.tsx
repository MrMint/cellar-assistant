/**
 * K2 · `/needs-details`: the rows and chips, the finish-one sheet, and the
 * writes it sends. Drafts are the demo seed's two wines (`DRAFTS` in
 * `services/actors/scripts/demo-seed-data.ts`) plus a made-up coffee.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/needs-details" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/needs-details",
  useSearchParams: () => new URLSearchParams(),
}));

type Toast = {
  message: string;
  undo?: () => void;
  onAutoClose?: () => void;
  tone?: string;
};
const toasts: Toast[] = [];
mock.module("@/components/app/notify", () => ({
  UNDO_TOAST_MS: 5000,
  notify: (message: string, options: Omit<Toast, "message"> = {}) => {
    toasts.push({ message, ...options });
    return toasts.length;
  },
}));

window.matchMedia = ((query: string) => {
  const min = /min-width:\s*(\d+)px/.exec(query);
  return {
    matches: min !== null && 390 >= Number(min[1]),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}) as typeof window.matchMedia;

type Sent = { operationName: string; variables: Record<string, unknown> };
const sent: Sent[] = [];
/** The server's answer to a save: the draft, or not found (not yours). */
let saveAnswer: "ok" | "not-found" = "ok";

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
  const variables = body.variables ?? {};
  sent.push({ operationName, variables });
  const input = variables.input as
    | {
        onboardingId: string;
        cellarId: string | null;
        fields: Record<string, unknown>;
        confirmedFields: string[];
        vintageAnswer: string;
      }
    | undefined;
  const data =
    operationName === "SaveNeedsDetailsDraft"
      ? {
          saveDraft:
            saveAnswer === "not-found"
              ? {
                  __typename: "NotFoundError",
                  code: "NOT_FOUND",
                  message: "no such onboarding",
                  reason: null,
                  retryAt: null,
                }
              : {
                  __typename: "ItemOnboarding",
                  id: input?.onboardingId,
                  itemType:
                    input?.onboardingId === COFFEE_ID ? "COFFEE" : "WINE",
                  status: "NEEDS_DETAILS",
                  cellarId: input?.cellarId,
                  displayName: input?.fields.name ?? null,
                  displayMaker: input?.fields.brandName ?? null,
                  draftFields: input?.fields,
                  confirmedFields: input?.confirmedFields,
                  vintageAnswer: input?.vintageAnswer,
                  imageId: null,
                  updatedAt: "2026-11-27T00:00:00Z",
                },
        }
      : operationName === "ConfirmNeedsDetailsDraft"
        ? {
            confirmItemOnboarding: {
              __typename: "ConfirmedItemOnboarding",
              onboardingId: variables.onboardingId,
              itemId: "i-1",
              itemType: "COFFEE",
              cellarItemId: "ci-1",
            },
          }
        : operationName === "NeedsDetails"
          ? {
              needsDetailsCount: 4,
              needsDetails: {
                __typename: "ItemOnboardingConnection",
                // The first page's last draft again, then one new one.
                edges: [MORE_DUPLICATE, MORE_NEW].map((node) => ({
                  node: { __typename: "ItemOnboarding", ...node },
                })),
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            }
          : {};
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const GARNACHA_ID = "11111111-1111-4111-8111-111111111111";
const ROSE_ID = "22222222-2222-4222-8222-222222222222";
const COFFEE_ID = "33333333-3333-4333-8333-333333333333";

const MORE_DUPLICATE = {
  id: COFFEE_ID,
  itemType: "COFFEE",
  status: "NEEDS_DETAILS",
  cellarId: "c-home",
  displayName: "Morning Field",
  displayMaker: null,
  draftFields: { name: "Morning Field" },
  confirmedFields: ["name"],
  vintageAnswer: "UNANSWERED",
  imageId: null,
  updatedAt: "2026-11-27T00:00:00Z",
};
const MORE_NEW = {
  ...MORE_DUPLICATE,
  id: "44444444-4444-4444-8444-444444444444",
  itemType: "BEER",
  displayName: "Harbour Pale",
  draftFields: { name: "Harbour Pale" },
};

const DRAFTS = [
  {
    id: GARNACHA_ID,
    itemType: "WINE" as const,
    cellarId: "c-home",
    displayName: "Hillside Garnacha",
    displayMaker: "Demo Valley Cellars",
    draftFields: {
      name: "Hillside Garnacha",
      brandName: "Demo Valley Cellars",
      country: "SPAIN",
    },
    confirmedFields: ["name", "brandName"],
    vintageAnswer: "UNANSWERED" as const,
    imageId: null,
    imageUrl: null,
  },
  {
    id: ROSE_ID,
    itemType: "WINE" as const,
    cellarId: "c-lake",
    displayName: "Dockside Rosé",
    displayMaker: null,
    draftFields: { name: "Dockside Rosé", attributes: { style: "ROSE" } },
    confirmedFields: ["name"],
    vintageAnswer: "UNANSWERED" as const,
    imageId: null,
    imageUrl: null,
  },
  {
    id: COFFEE_ID,
    itemType: "COFFEE" as const,
    cellarId: "c-home",
    displayName: "Morning Field",
    displayMaker: "Demo Roasters",
    draftFields: {
      name: "Morning Field",
      brandName: "Demo Roasters",
      attributes: { roastLevel: "MEDIUM" },
    },
    confirmedFields: [],
    vintageAnswer: "UNANSWERED" as const,
    imageId: null,
    imageUrl: null,
  },
];

const React = await import("react");
const { act } = React;
type ReactNode = import("react").ReactNode;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { NeedsDetailsScreen } = await import("./NeedsDetailsScreen");

const client = new Client({
  url: "http://localhost/api/graphql",
  exchanges: [fetchExchange],
  requestPolicy: "network-only",
  preferGetMethod: false,
});

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
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) =>
      b.textContent?.trim() === name || b.getAttribute("aria-label") === name,
  );
const click = async (el: Element | null | undefined) => {
  assert.ok(el, "element to click exists");
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const rowTitles = () =>
  [...document.querySelectorAll('[data-slot="draft-row"] .t-head')].map(
    (el) => el.textContent,
  );
const select = async (label: string, value: string) => {
  const target = [
    ...document.querySelectorAll<HTMLSelectElement>(
      '[data-slot="finish-one"] select',
    ),
  ].find(
    (el) =>
      document.querySelector(`label[for="${el.id}"]`)?.textContent === label,
  );
  assert.ok(target, `a ${label} select`);
  await act(async () => {
    const option = document.createElement("option");
    option.value = value;
    target.appendChild(option);
    target.value = value;
    target.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const screen = (cellar: { id: string; name: string } | null = null) => (
  <NeedsDetailsScreen
    cellar={cellar}
    count={DRAFTS.length}
    drafts={DRAFTS}
    endCursor={null}
    failed={false}
  />
);

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  sent.length = 0;
  toasts.length = 0;
  saveAnswer = "ok";
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("NeedsDetailsScreen", () => {
  test("every kind is listed with its need line; chips filter by what is missing", async () => {
    await render(screen());
    assert.deepEqual(rowTitles(), [
      "Hillside Garnacha",
      "Dockside Rosé",
      "Morning Field",
    ]);
    const text = document.body.textContent ?? "";
    assert.match(text, /3 bottles/);
    assert.match(text, /Needs style, strength and vintage/);
    assert.match(text, /Needs origin/);
    await click(
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.startsWith("Origin"),
      ),
    );
    assert.deepEqual(rowTitles(), ["Morning Field"]);
  });

  test("Save writes the draft's own id and cellar, never the page's ?cellar=", async () => {
    await render(screen({ id: "c-other", name: "Elsewhere" }));
    await click(
      [...document.querySelectorAll('[data-slot="draft-row"]')].find((b) =>
        b.textContent?.includes("Morning Field"),
      ),
    );
    assert.match(document.body.textContent ?? "", /3 left/);
    await select("Origin", "COLOMBIA");
    await click(button("Save"));
    await flush(20);
    const saves = sent.filter(
      (s) => s.operationName === "SaveNeedsDetailsDraft",
    );
    assert.equal(saves.length, 1);
    const input = saves[0]?.variables.input as {
      onboardingId: string;
      cellarId: string;
    };
    assert.equal(input.onboardingId, COFFEE_ID);
    assert.equal(input.cellarId, "c-home");
    // Nothing left: the row goes, and nothing is filed until Undo runs out.
    assert.deepEqual(rowTitles(), ["Hillside Garnacha", "Dockside Rosé"]);
    assert.equal(
      sent.filter((s) => s.operationName === "ConfirmNeedsDetailsDraft").length,
      0,
    );
    assert.equal(toasts.at(-1)?.message, "Saved");

    await act(async () => toasts.at(-1)?.onAutoClose?.());
    await flush(20);
    const confirms = sent.filter(
      (s) => s.operationName === "ConfirmNeedsDetailsDraft",
    );
    assert.equal(confirms.length, 1);
    assert.equal(confirms[0]?.variables.onboardingId, COFFEE_ID);
    const confirmInput = confirms[0]?.variables.input as Record<
      string,
      unknown
    >;
    assert.equal("cellarId" in confirmInput, false, "the draft's own cellar");
    assert.equal(confirmInput.country, "COLOMBIA");
  });

  test("Undo files nothing and puts the draft back as it was", async () => {
    await render(screen());
    await click(
      [...document.querySelectorAll('[data-slot="draft-row"]')].find((b) =>
        b.textContent?.includes("Morning Field"),
      ),
    );
    await select("Origin", "COLOMBIA");
    await click(button("Save"));
    await flush(20);
    await act(async () => toasts.at(-1)?.undo?.());
    await flush(20);
    assert.deepEqual(rowTitles(), [
      "Hillside Garnacha",
      "Dockside Rosé",
      "Morning Field",
    ]);
    const saves = sent.filter(
      (s) => s.operationName === "SaveNeedsDetailsDraft",
    );
    assert.equal(saves.length, 2);
    const restored = saves[1]?.variables.input as {
      fields: Record<string, unknown>;
    };
    assert.equal("country" in restored.fields, false);
    // Leaving the page later files nothing.
    await act(async () => root.unmount());
    root = createRoot(container);
    await flush(20);
    assert.equal(
      sent.filter((s) => s.operationName === "ConfirmNeedsDetailsDraft").length,
      0,
    );
  });

  test("a draft that is not yours (not found) is refused and stays listed", async () => {
    saveAnswer = "not-found";
    await render(screen());
    await click(
      [...document.querySelectorAll('[data-slot="draft-row"]')].find((b) =>
        b.textContent?.includes("Morning Field"),
      ),
    );
    await select("Origin", "COLOMBIA");
    await click(button("Save"));
    await flush(20);
    assert.match(
      document.querySelector('[data-slot="finish-one"] [role="alert"]')
        ?.textContent ?? "",
      /Not saved/,
    );
    assert.equal(rowTitles().length, 3);
    assert.equal(toasts.length, 0);
  });

  test("an untouched Save sends nothing", async () => {
    await render(screen());
    await click(document.querySelector('[data-slot="draft-row"]'));
    await click(button("Save"));
    await flush(10);
    assert.equal(
      sent.filter((s) => s.operationName === "SaveNeedsDetailsDraft").length,
      0,
    );
  });

  test("leaving the page files a saved draft whose Undo has not run out", async () => {
    await render(screen());
    await click(
      [...document.querySelectorAll('[data-slot="draft-row"]')].find((b) =>
        b.textContent?.includes("Morning Field"),
      ),
    );
    await select("Origin", "COLOMBIA");
    await click(button("Save"));
    await flush(20);
    await act(async () => root.unmount());
    root = createRoot(container);
    await flush(20);
    assert.equal(
      sent.filter((s) => s.operationName === "ConfirmNeedsDetailsDraft").length,
      1,
    );
  });

  test("nothing saved: the empty state", async () => {
    await render(
      <NeedsDetailsScreen
        cellar={null}
        count={0}
        drafts={[]}
        endCursor={null}
        failed={false}
      />,
    );
    assert.match(document.body.textContent ?? "", /Nothing needs details/);
  });
  test("Show more asks for the page after the cursor once, and lists each draft once", async () => {
    await render(
      <NeedsDetailsScreen
        cellar={null}
        count={4}
        drafts={DRAFTS}
        endCursor="cursor-1"
        failed={false}
      />,
    );
    const more = () =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Show more",
      );
    await click(more());
    await flush(30);
    const pages = sent.filter((s) => s.operationName === "NeedsDetails");
    assert.equal(pages.length, 1);
    assert.equal(pages[0]?.variables.after, "cursor-1");
    assert.deepEqual(rowTitles(), [
      "Hillside Garnacha",
      "Dockside Rosé",
      "Morning Field",
      "Harbour Pale",
    ]);
    assert.equal(more(), undefined, "no further page");
  });
});
