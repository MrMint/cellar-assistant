/**
 * The bottle page's "Set a new display image" dialog mounts the live camera
 * again, as `82450ad1:src/components/item/AddPhoto.tsx` did (parity gap #1),
 * with a file input kept beside it, and a capture reaches the upload as a
 * `File` decoded in the browser.
 *
 * Joy's `Modal` renders through a portal, which a static render never mounts,
 * so the test swaps it for its children; `CameraCapture` (react-webcam) is
 * stubbed to a marker that hands its `onCapture` back to the test.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const realJoy = { ...(await import("@mui/joy")) };
mock.module("@mui/joy", () => ({
  ...realJoy,
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? children : null,
}));

let lastOnCapture: ((dataUrl: string) => void) | null = null;
mock.module("../common/CameraCapture", () => ({
  CameraCapture: ({ onCapture }: { onCapture: (dataUrl: string) => void }) => {
    lastOnCapture = onCapture;
    return <div data-testid="camera-capture" />;
  },
}));

const { AddPhotoModal } = await import("./AddPhoto");

const render = (node: ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

describe("AddPhotoModal (restored, live camera)", () => {
  test("the old title over the live viewfinder, with a file input as fallback", () => {
    const html = render(
      <AddPhotoModal open onClose={() => {}} onCapture={async () => {}} />,
    );
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
      <AddPhotoModal
        open
        onClose={() => {}}
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
      <AddPhotoModal
        open
        onClose={() => {}}
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
