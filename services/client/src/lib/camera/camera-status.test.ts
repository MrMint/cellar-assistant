import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BARCODE_SCAN_CONSTRAINTS,
  CAMERA_CAPTURE_CONSTRAINTS,
  type CameraStatus,
  cameraKeepsListening,
  cameraStatusReducer,
  describeCameraError,
  hardConstraintPaths,
  initialCameraStatus,
} from "./camera-status.ts";
import { fitWithin } from "./library-image.ts";

describe("N04: constraints are preferences, never refusals", () => {
  test("neither camera asks for min, max or exact", () => {
    assert.deepEqual(hardConstraintPaths(CAMERA_CAPTURE_CONSTRAINTS), []);
    assert.deepEqual(hardConstraintPaths(BARCODE_SCAN_CONSTRAINTS), []);
  });

  test("the check finds the constraint that used to strand people", () => {
    assert.deepEqual(
      hardConstraintPaths({
        width: { ideal: 1920, min: 1080 },
        facingMode: { exact: "environment" },
      }),
      ["width.min", "facingMode.exact"],
    );
  });
});

describe("cameraStatusReducer", () => {
  const failed = (status: CameraStatus) =>
    status.kind === "failed" ? status.reason : null;

  test("starting → ready on a stream", () => {
    assert.deepEqual(
      cameraStatusReducer(initialCameraStatus, { type: "stream" }),
      { kind: "ready" },
    );
  });

  test("a denied permission is a failure with a way forward", () => {
    const status = cameraStatusReducer(initialCameraStatus, {
      type: "error",
      error: new DOMException("denied", "NotAllowedError"),
    });
    assert.equal(failed(status), "blocked");
    assert.match(status.kind === "failed" ? status.message : "", /library/);
  });

  test("no answer at all: the timeout fails a starting camera only", () => {
    assert.equal(
      failed(cameraStatusReducer(initialCameraStatus, { type: "timeout" })),
      "timeout",
    );
    assert.deepEqual(
      cameraStatusReducer({ kind: "ready" }, { type: "timeout" }),
      { kind: "ready" },
    );
  });

  test("a late stream after the timeout still wins", () => {
    const timedOut = cameraStatusReducer(initialCameraStatus, {
      type: "timeout",
    });
    assert.deepEqual(cameraStatusReducer(timedOut, { type: "stream" }), {
      kind: "ready",
    });
  });

  test("a timed-out camera keeps its request open; a refused one does not", () => {
    // The UI half of "a late stream still wins": unmounting the camera on the
    // timeout would discard the stream a slow "Allow" delivers.
    const timedOut = cameraStatusReducer(initialCameraStatus, {
      type: "timeout",
    });
    assert.equal(cameraKeepsListening(timedOut), true);
    assert.equal(cameraKeepsListening(initialCameraStatus), true);
    assert.equal(cameraKeepsListening({ kind: "ready" }), true);
    assert.equal(
      cameraKeepsListening(
        cameraStatusReducer(initialCameraStatus, {
          type: "error",
          error: new DOMException("denied", "NotAllowedError"),
        }),
      ),
      false,
    );
  });

  test("retry starts again", () => {
    const timedOut = cameraStatusReducer(initialCameraStatus, {
      type: "timeout",
    });
    assert.deepEqual(cameraStatusReducer(timedOut, { type: "retry" }), {
      kind: "starting",
    });
  });
});

describe("describeCameraError", () => {
  test("each getUserMedia failure gets its own reason", () => {
    const reason = (name: string) =>
      describeCameraError({ name, message: "" }).reason;
    assert.equal(reason("NotAllowedError"), "blocked");
    assert.equal(reason("NotFoundError"), "missing");
    assert.equal(reason("OverconstrainedError"), "missing");
    assert.equal(reason("NotReadableError"), "busy");
    assert.equal(reason("TypeError"), "unsupported");
    assert.equal(describeCameraError("weird").reason, "unknown");
    assert.equal(describeCameraError(new Error("x")).reason, "unknown");
  });

  test("every message offers the library", () => {
    for (const name of ["NotAllowedError", "NotFoundError", "x"]) {
      assert.match(describeCameraError({ name }).message, /library/);
    }
  });
});

describe("fitWithin (library photos are capture-sized)", () => {
  test("scales the longest side down to the max, never up", () => {
    assert.deepEqual(fitWithin(4032, 3024, 1920), {
      width: 1920,
      height: 1440,
    });
    assert.deepEqual(fitWithin(3024, 4032, 1920), {
      width: 1440,
      height: 1920,
    });
    assert.deepEqual(fitWithin(800, 600, 1920), { width: 800, height: 600 });
    assert.deepEqual(fitWithin(0, 600), { width: 0, height: 0 });
  });
});
