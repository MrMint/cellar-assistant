/**
 * The judgements the mobile specs (`specs/mobile/`) make, as pure functions.
 *
 * Each spec measures the page in the browser and hands the raw numbers here,
 * so the rule ("16 pt gutter", "above the tab bar", "this camera cannot meet
 * that constraint") is one function with its own unit test
 * (`mobile-rules.test.ts`, `bun run --filter @cellar-assistant/e2e test:unit`)
 * rather than an expression buried in a `page.evaluate` callback. The specs
 * then fail with a list of named offenders, not a bare `false`.
 *
 * Nothing in this file may import anything: `demandsMoreThan` is also injected
 * into the page by source (`fixtures/mobile.ts#stubCamera`), so it has to be
 * self-contained, and the unit test runs it under plain `node --test`.
 */

/** A `DOMRect` reduced to the four edges, in CSS px. */
export type Edges = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** One measured element: a human-readable label and where it sits. */
export type Probe = {
  /** e.g. `button "Add item"`, so a failure names what to fix. */
  label: string;
  edges: Edges;
};

/**
 * Sub-pixel slack. Layout produces fractional edges (a 16px gutter can
 * measure 15.999…), and none of these rules is about a fraction of a pixel.
 */
export const TOLERANCE_PX = 0.5;

/**
 * Elements that sit inside the gutter on either side of a `viewportWidth`
 * screen — content closer than `gutter` to an edge, or past it entirely.
 *
 * Returns one line per offender, `label: left 0 / right 300 (needs 16..359)`,
 * so `expect(…).toEqual([])` prints exactly what to fix.
 */
export function gutterOffenders(
  probes: readonly Probe[],
  viewportWidth: number,
  gutter: number,
  tolerance: number = TOLERANCE_PX,
): string[] {
  const offenders: string[] = [];
  for (const { label, edges } of probes) {
    const leftOk = edges.left >= gutter - tolerance;
    const rightOk = edges.right <= viewportWidth - gutter + tolerance;
    if (leftOk && rightOk) continue;
    offenders.push(
      `${label}: left ${round(edges.left)} / right ${round(edges.right)} ` +
        `(needs ${gutter}..${viewportWidth - gutter})`,
    );
  }
  return offenders;
}

/** Does `upper` end at or above the point where `lower` starts? */
export function sitsAbove(
  upper: Edges,
  lower: Edges,
  tolerance: number = TOLERANCE_PX,
): boolean {
  return upper.bottom <= lower.top + tolerance;
}

/**
 * Horizontal overflow of a scroll container, in px (0 when it fits).
 * `scrollWidth` and `clientWidth` are integers in every engine, so a
 * single pixel is already real overflow.
 */
export function horizontalOverflow(box: {
  scrollWidth: number;
  clientWidth: number;
}): number {
  return Math.max(0, box.scrollWidth - box.clientWidth);
}

/**
 * Which video constraint, if any, a camera of `camera` size cannot satisfy.
 *
 * Mirrors what `getUserMedia` does with a `MediaTrackConstraints` object:
 * a bare number, or `{ ideal }`, is a preference the browser satisfies as
 * best it can; `min` and `exact` are requirements, and an unmet requirement
 * rejects the whole call with an `OverconstrainedError` naming it. That is
 * observation 25: `CameraCapture` asked for `width: { ideal: 1920, min: 1080 }`,
 * so a 640x480 camera produced a rejection the component never handled, and
 * the viewfinder spun forever.
 *
 * Self-contained on purpose — it is serialised into the page by
 * `stubCamera`, where no import can reach it.
 */
export function demandsMoreThan(
  video: unknown,
  camera: { width: number; height: number },
): "width" | "height" | null {
  if (typeof video !== "object" || video === null) return null;
  const dims: Array<"width" | "height"> = ["width", "height"];
  for (const dim of dims) {
    const value = (video as Record<string, unknown>)[dim];
    if (typeof value !== "object" || value === null) continue;
    const { min, exact } = value as { min?: unknown; exact?: unknown };
    if (typeof min === "number" && min > camera[dim]) return dim;
    if (typeof exact === "number" && exact !== camera[dim]) return dim;
  }
  return null;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
