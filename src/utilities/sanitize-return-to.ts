/**
 * Sanitize a returnTo URL to prevent open redirect attacks.
 * Only allows relative paths starting with "/" (no protocol-relative or absolute URLs).
 * Returns undefined if the value is invalid or not provided.
 */
export function sanitizeReturnTo(
  returnTo: string | undefined | null,
): string | undefined {
  if (!returnTo || typeof returnTo !== "string") return undefined;

  // Must start with "/" and must NOT start with "//" (protocol-relative)
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return undefined;

  return returnTo;
}
