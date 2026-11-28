/**
 * N04 in the markup: the shutter has the photo library beside it, and the
 * viewfinder starts as "starting" (spinner, shutter held) rather than
 * pretending a stream exists.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { isDisabled, LOADING, openTag } from "@/test-support/markup";
import { CameraCapture } from "./CameraCapture";

describe("CameraCapture (N04)", () => {
  const html = renderToStaticMarkup(<CameraCapture onCapture={() => {}} />);

  test("a library button sits beside the shutter", () => {
    assert.match(html, /aria-label="Take photo"/);
    assert.match(html, /aria-label="Choose from library"/);
    assert.match(html, /<input[^>]*type="file"[^>]*accept="image\/\*"/);
  });

  test("the shutter waits for a stream", () => {
    assert.match(html, LOADING);
    assert.equal(isDisabled(openTag(html, 'aria-label="Take photo"')), true);
  });

  test("a host with its own picker can leave the shutter's out", () => {
    const own = renderToStaticMarkup(
      <CameraCapture onCapture={() => {}} showLibrary={false} />,
    );
    assert.doesNotMatch(own, /aria-label="Choose from library"/);
  });
});
