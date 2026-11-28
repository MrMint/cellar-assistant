/**
 * Where the last tap landed, so a sheet can rise from it (SPEC movement 9:
 * "from 100 % and .94 at the tap's x"). One capture listener on the document
 * records the x of every pointerdown; a sheet reads it the moment it opens.
 */
let lastX: number | null = null;
let listening = false;

const onPointerDown = (event: PointerEvent): void => {
  lastX = event.clientX;
};

/** Start recording taps (idempotent; a no-op on the server). */
export function watchTaps(): void {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("pointerdown", onPointerDown, {
    capture: true,
    passive: true,
  });
}

/**
 * The CSS `transform-origin` for a surface `width` wide whose left edge is
 * at `left`: the tap's x within it (clamped to the surface), at its foot.
 * With no tap recorded (a key opened it) the centre.
 */
export function tapOrigin(
  left: number,
  width: number,
  x: number | null = lastX,
): string {
  if (x === null || width <= 0) return "50% 100%";
  const within = Math.min(Math.max(x - left, 0), width);
  return `${Math.round(within)}px 100%`;
}

/** For tests: forget the last tap. */
export function resetTaps(x: number | null = null): void {
  lastX = x;
}
