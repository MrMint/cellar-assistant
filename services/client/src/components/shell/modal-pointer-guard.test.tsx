/**
 * The shell's stopgap for a stuck `body { pointer-events: none }` after a
 * Radix modal opened from another one's item (`ModalPointerGuard`).
 */
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { isStalePointerLock, ModalPointerGuard } = await import(
  "./ModalPointerGuard"
);

const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.removeProperty("pointer-events");
});

describe("isStalePointerLock", () => {
  test("no lock: nothing to clear", () => {
    assert.equal(isStalePointerLock(document), false);
  });

  test("a lock an open sheet holds is not stale", () => {
    document.body.style.pointerEvents = "none";
    const sheet = document.createElement("div");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("data-state", "open");
    document.body.append(sheet);
    assert.equal(isStalePointerLock(document), false);
  });

  test("an open menu or confirm holds it too", () => {
    document.body.style.pointerEvents = "none";
    const confirm = document.createElement("div");
    confirm.setAttribute("role", "alertdialog");
    confirm.setAttribute("data-state", "open");
    document.body.append(confirm);
    assert.equal(isStalePointerLock(document), false);
  });

  test("a lock with every modal gone (or closed) is stale", () => {
    document.body.style.pointerEvents = "none";
    const closed = document.createElement("div");
    closed.setAttribute("role", "dialog");
    closed.setAttribute("data-state", "closed");
    document.body.append(closed);
    assert.equal(isStalePointerLock(document), true);
  });
});

describe("ModalPointerGuard", () => {
  test("clears a stale lock, and leaves a held one alone", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ModalPointerGuard />));

    // Held: an open dialog is up.
    const sheet = document.createElement("div");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("data-state", "open");
    document.body.append(sheet);
    document.body.style.pointerEvents = "none";
    await frames();
    await frames();
    assert.equal(document.body.style.pointerEvents, "none");

    // The dialog goes, the lock stays behind: cleared.
    sheet.remove();
    await frames();
    await frames();
    assert.equal(document.body.style.pointerEvents, "");

    await act(async () => root.unmount());
  });
});
