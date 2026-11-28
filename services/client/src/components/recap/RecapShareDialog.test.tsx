/**
 * The recap Share dialog stays mounted while the deck moves between cards,
 * so each card's image starts over (F-185, CB-1): card 2 never inherits card
 * 1's failed image, nor its ready one with Share already enabled.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ReactNode } from "react";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "http://localhost/recap?period=2026-10" });
}
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("@/components/app/ResponsiveDialog", () => ({
  ResponsiveDialog: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { RecapShareDialog } = await import("./RecapShareDialog");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const render = (imagePath: string) =>
  act(async () =>
    root.render(
      <RecapShareDialog
        open
        onOpenChange={() => {}}
        imagePath={imagePath}
        fileName="recap.png"
        description="A recap card"
      />,
    ),
  );

const image = () => {
  const found = container.querySelector("img");
  if (found === null) throw new Error("no image");
  return found;
};
const shareDisabled = () =>
  [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Share image",
  )?.disabled;
const fire = (type: "load" | "error") =>
  act(async () => {
    image().dispatchEvent(new Event(type));
  });

describe("RecapShareDialog", () => {
  test("a failed card 1 doesn't make card 2 fail unseen", async () => {
    await render("/recap/card/1");
    await fire("error");
    assert.match(container.textContent ?? "", /Couldn’t make the image/);
    await render("/recap/card/2");
    assert.doesNotMatch(container.textContent ?? "", /Couldn’t make/);
    assert.match(image().getAttribute("src") ?? "", /^\/recap\/card\/2/);
    assert.equal(shareDisabled(), true);
  });

  test("a ready card 1 doesn't let card 2 share before its image loads", async () => {
    await render("/recap/card/1");
    await fire("load");
    assert.equal(shareDisabled(), false);
    await render("/recap/card/2");
    assert.equal(shareDisabled(), true, "card 2 is still loading");
    await fire("load");
    assert.equal(shareDisabled(), false);
  });
});
