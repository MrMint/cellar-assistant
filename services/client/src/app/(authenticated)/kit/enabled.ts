/**
 * The kit page is a build tool, not a screen: it exists only where
 * `CELLAR_KIT_PAGE=1` is set (a dev or preview deploy), and is a 404
 * everywhere else, production included.
 */
export function kitPageEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.CELLAR_KIT_PAGE === "1";
}
