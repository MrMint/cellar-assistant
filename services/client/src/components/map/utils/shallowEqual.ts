/**
 * Shallow comparison for use with XState's useSelector.
 * Prevents re-renders when selector returns a new object
 * with identical primitive values.
 */
export function shallowEqual<T extends Record<string, unknown>>(
  a: T,
  b: T,
): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.is(a[key], b[key])) return false;
  }

  return true;
}
