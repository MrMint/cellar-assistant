/**
 * The camera never dead-ends — N04.
 *
 * Three ways the viewfinder used to strand someone on their first bottle:
 *
 * 1. **Hard constraints.** `width: { min: 1080 }` (and the barcode scanner's
 *    `min: 640`) make `getUserMedia` reject with `OverconstrainedError` on a
 *    camera that cannot meet them — front cameras, older phones, some iOS
 *    standalone (home-screen) sessions — rather than hand back the best it
 *    has. Every constraint here is `ideal`: a preference, never a refusal.
 * 2. **No error path.** `react-webcam`'s `onUserMediaError` was not wired, so
 *    a denied permission left a spinner turning forever.
 * 3. **No answer at all.** iOS in standalone mode can leave the permission
 *    request unanswered, so neither callback ever fires. After
 *    {@link CAMERA_START_TIMEOUT_MS} the camera is treated as unavailable.
 *
 * In every failed state the page offers "Try again" and the photo library, so
 * there is always a way forward. Plain module: the state rule and the words
 * are tested here (`camera-status.test.ts`); the markup that draws them is
 * replaced in the shadcn migration (D20).
 */

/** How long a camera may take to start before it is called unavailable. */
export const CAMERA_START_TIMEOUT_MS = 5000;

/** The label camera: square, high resolution, the back camera — all preferred. */
export const CAMERA_CAPTURE_CONSTRAINTS = {
  width: { ideal: 1920 },
  height: { ideal: 1920 },
  aspectRatio: { ideal: 1 },
  facingMode: { ideal: "environment" },
} as const satisfies MediaTrackConstraints;

/** The barcode scanner: a wide frame from the back camera — all preferred. */
export const BARCODE_SCAN_CONSTRAINTS = {
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: { ideal: "environment" },
  },
} as const satisfies MediaStreamConstraints;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The paths of every constraint that can make `getUserMedia` refuse
 * (`min`, `max`, `exact`). Bare values are `ideal` by the spec, so only these
 * three keys count. Empty for the constraints this module ships.
 */
export const hardConstraintPaths = (
  constraints: unknown,
  prefix = "",
): string[] => {
  if (!isRecord(constraints)) return [];
  const found: string[] = [];
  for (const [key, value] of Object.entries(constraints)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (key === "min" || key === "max" || key === "exact") found.push(path);
    found.push(...hardConstraintPaths(value, path));
  }
  return found;
};

/** Why the camera is not showing a picture. */
export type CameraFailure =
  | "blocked"
  | "missing"
  | "busy"
  | "unsupported"
  | "timeout"
  | "unknown";

export type CameraStatus =
  | { kind: "starting" }
  | { kind: "ready" }
  | { kind: "failed"; reason: CameraFailure; message: string };

export type CameraEvent =
  | { type: "stream" }
  | { type: "error"; error: unknown }
  | { type: "timeout" }
  | { type: "retry" };

const errorName = (error: unknown): string | undefined => {
  if (isRecord(error) && typeof error.name === "string") return error.name;
  if (error instanceof Error) return error.name;
  return undefined;
};

/** A `getUserMedia` failure, in words a person can act on. */
export const describeCameraError = (
  error: unknown,
): { reason: CameraFailure; message: string } => {
  switch (errorName(error)) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return {
        reason: "blocked",
        message:
          "Camera access is blocked. Allow it in your browser's settings, or choose a photo from your library.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return {
        reason: "missing",
        message:
          "No camera is available here. Choose a photo from your library instead.",
      };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return {
        reason: "busy",
        message:
          "The camera is in use by another app. Close it and try again, or choose a photo from your library.",
      };
    case "TypeError":
      return {
        reason: "unsupported",
        message:
          "This browser can't open the camera here. Choose a photo from your library instead.",
      };
    default:
      return {
        reason: "unknown",
        message:
          "The camera didn't start. Try again, or choose a photo from your library.",
      };
  }
};

const TIMEOUT_MESSAGE =
  "The camera is taking too long to start. Try again, or choose a photo from your library.";

/**
 * The camera's state. A stream always wins — even one that arrives after the
 * timeout fired, since a late camera is still a camera — and the timeout only
 * counts while the camera is starting.
 */
export const cameraStatusReducer = (
  status: CameraStatus,
  event: CameraEvent,
): CameraStatus => {
  switch (event.type) {
    case "stream":
      return { kind: "ready" };
    case "error":
      return { kind: "failed", ...describeCameraError(event.error) };
    case "timeout":
      return status.kind === "starting"
        ? { kind: "failed", reason: "timeout", message: TIMEOUT_MESSAGE }
        : status;
    case "retry":
      return { kind: "starting" };
  }
};

export const initialCameraStatus: CameraStatus = { kind: "starting" };
