/**
 * The bottle page's "Set a new display image" dialog mounts the live camera
 * again, as `82450ad1:src/components/item/AddPhoto.tsx` did (parity gap #1),
 * with a file input kept beside it, and a capture reaches the upload as a
 * `File` decoded in the browser.
 *
 * A modal renders through a portal, which a static render never mounts, so the
 * open dialog is tested through `AddPhotoBody` (its title and body) and only
 * the closed one through `AddPhotoModal`; `CameraCapture` (react-webcam) is
 * stubbed to a marker that hands its `onCapture` back to the test.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let lastOnCapture: ((dataUrl: string) => void) | null = null;
mock.module("../common/CameraCapture", () => ({
  CameraCapture: ({ onCapture }: { onCapture: (dataUrl: string) => void }) => {
    lastOnCapture = onCapture;
    return <div data-testid="camera-capture" />;
  },
}));

const { AddPhotoBody, AddPhotoModal } = await import("./AddPhoto");

const render = (node: ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

describe("AddPhotoModal (restored, live camera)", () => {
  test("the old title over the live viewfinder, with a file input as fallback", () => {
    const html = render(<AddPhotoBody onCapture={async () => {}} />);
    assert.match(html, />Set a new display image</);
    assert.match(html, /data-testid="camera-capture"/);
    assert.match(html, />Choose a photo</);
    assert.match(html, /<input[^>]*type="file"[^>]*accept="image\/\*"/);
    // The viewfinder comes first, as it was the whole of the old dialog.
    assert.ok(
      html.indexOf("camera-capture") < html.indexOf("Choose a photo"),
      "the camera should sit above the file input",
    );
  });

  test("closed: nothing mounted, so the camera stream is not held open", () => {
    lastOnCapture = null;
    const html = render(
      <AddPhotoModal
        open={false}
        onClose={() => {}}
        onCapture={async () => {}}
      />,
    );
    assert.equal(html, "");
    assert.equal(lastOnCapture, null);
  });

  test("a capture is decoded to a JPEG File and handed to the upload", async () => {
    const uploads: File[] = [];
    render(
      <AddPhotoBody
        onCapture={async (file) => {
          uploads.push(file);
        }}
      />,
    );
    const onCapture = lastOnCapture;
    assert.ok(onCapture !== null, "CameraCapture was not given onCapture");
    // "hello" as a base64 JPEG data URL — the shape getScreenshot() returns.
    onCapture("data:image/jpeg;base64,aGVsbG8=");
    await Promise.resolve();
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0]?.type, "image/jpeg");
    assert.equal(await uploads[0]?.text(), "hello");
    assert.match(uploads[0]?.name ?? "", /^display-\d+\.jpg$/);
  });

  test("a capture that is not a data URL is not uploaded", async () => {
    const uploads: File[] = [];
    render(
      <AddPhotoBody
        onCapture={async (file) => {
          uploads.push(file);
        }}
      />,
    );
    lastOnCapture?.("not a data url");
    await Promise.resolve();
    assert.equal(uploads.length, 0);
  });
});

describe("re-buy photo (L02)", () => {
  test("another bottle of something you have had is offered a photo", async () => {
    const { rebuyOffer } = await import("./add-to-cellar");
    // Two bottles in all after adding one: you had one before.
    assert.deepEqual(
      rebuyOffer({ bottlesOfItem: 2, added: 1, name: "Barolo" }),
      { title: "Another Barolo added" },
    );
    // A first bottle (or a first case): nothing to tell apart yet.
    assert.equal(rebuyOffer({ bottlesOfItem: 1, added: 1, name: "x" }), null);
    assert.equal(rebuyOffer({ bottlesOfItem: 3, added: 3, name: "x" }), null);
  });

  test("the card: its line, Add photo and Not now", async () => {
    const { RebuyPhotoOffer } = await import("./AddPhoto");
    const calls: string[] = [];
    const html = renderToStaticMarkup(
      <RebuyPhotoOffer
        title="Another Barolo added"
        onAddPhoto={() => calls.push("add")}
        onDismiss={() => calls.push("dismiss")}
      />,
    );
    assert.match(html, /data-slot="rebuy-photo"/);
    assert.match(html, /Another Barolo added/);
    assert.match(html, /label or receipt/);
    // CR-8: it keeps a photo, and promises nothing it does not keep.
    assert.doesNotMatch(html, /price|date/);
    assert.match(html, />Add photo</);
    assert.match(html, />Not now</);
  });
});
