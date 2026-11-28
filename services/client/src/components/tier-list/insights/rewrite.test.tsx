/**
 * F-182: a READY Insights card carries "Rewrite" (F-86,
 * `rewriteTierListInsights`) for the list's owner. It asks once per tap,
 * shows the working card, and a refusal (the AI allowance) reads "Limit
 * reached" rather than nothing. A visitor, or a card that is not READY,
 * offers no Rewrite, so the wrong write cannot be sent.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/tier-lists/tl-1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const calls: string[] = [];
type Answer =
  | { success: true; status: string }
  | {
      success: false;
      failure: { code: string; reason: string | null; retryAt: string | null };
    };
let answer: Answer = { success: true, status: "PENDING" };

mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => calls.push("refresh"),
    replace: () => {},
    push: () => {},
  }),
  usePathname: () => "/tier-lists/tl-1",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("@/lib/feedback", () => ({
  feedback: (kind: string) => calls.push(`feedback ${kind}`),
}));
mock.module("@/components/tier-list/insights/useRewriteInsights", () => ({
  useRewriteInsights: () => async (id: string) => {
    calls.push(`rewrite ${id}`);
    return answer;
  },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider } = await import("urql");
const { TooltipProvider } = await import("@/components/ui/tooltip");
const { TierListInsightsPanel } = await import("./TierListInsightsPanel");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const entries = ["Barolo", "Rioja", "Chianti"].map((name, i) => ({
  id: `row-${i}`,
  band: 4,
  name,
  countryCode: null,
  region: null,
  primaryCategory: null,
}));
const ready = {
  items: entries,
  aiInsights: {
    palateProfile: "Firm reds.",
    archetype: "The Traditionalist",
    generatedAt: "2026-11-01T10:00:00.000Z",
  },
  contentUpdatedAt: null,
  status: "READY" as const,
  failureReason: null,
  retryAt: null,
  showPlaceStats: false,
};

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  calls.length = 0;
  answer = { success: true, status: "PENDING" };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const renderPanel = async (
  over: Partial<typeof ready> | Record<string, unknown> = {},
  isOwner = true,
) => {
  await act(async () =>
    root.render(
      <Provider value={client}>
        <TooltipProvider>
          <TierListInsightsPanel
            insights={{ ...ready, ...over } as never}
            grounded={{ tierListId: "tl-1", isOwner }}
            noun="wines"
          />
        </TooltipProvider>
      </Provider>,
    ),
  );
  await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const rewriteButton = () =>
  Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Rewrite",
  );
const tap = async (button: HTMLButtonElement) => {
  await act(async () => button.click());
  await act(async () => new Promise((r) => setTimeout(r, 0)));
};

describe("F-182: Rewrite on a READY Insights card", () => {
  test("the owner's READY card rewrites once, with feedback, and shows the working card", async () => {
    await renderPanel();
    const button = rewriteButton();
    assert.ok(button, "no Rewrite on the owner's READY card");
    await tap(button);
    assert.deepEqual(
      calls.filter((c) => c.startsWith("rewrite")),
      ["rewrite tl-1"],
    );
    assert.ok(calls.some((c) => c.startsWith("feedback")));
    assert.ok(calls.includes("refresh"));
    assert.ok(document.querySelector('[aria-label="Writing insights"]'));
  });

  test("a refusal from the AI allowance reads Limit reached", async () => {
    answer = {
      success: false,
      failure: {
        code: "BUDGET_EXCEEDED",
        reason: "USER_CAP",
        retryAt: "2026-12-01T00:00:00.000Z",
      },
    };
    await renderPanel();
    const button = rewriteButton();
    assert.ok(button);
    await tap(button);
    assert.match(document.body.textContent ?? "", /Limit reached/);
    assert.equal(
      document.querySelector('[aria-label="Writing insights"]'),
      null,
    );
  });

  test("a visitor, or a card that is not READY, offers no Rewrite", async () => {
    await renderPanel({}, false);
    assert.equal(rewriteButton(), undefined);
    for (const status of ["PENDING", "FAILED", "IDLE"]) {
      await renderPanel({ status });
      assert.equal(rewriteButton(), undefined, `Rewrite shown while ${status}`);
    }
    assert.deepEqual(
      calls.filter((c) => c.startsWith("rewrite")),
      [],
    );
  });
});
