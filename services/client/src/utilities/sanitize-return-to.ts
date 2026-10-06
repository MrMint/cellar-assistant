/**
 * Sanitise a `returnTo` value into a path this app may redirect to, or
 * `undefined`.
 *
 * ## Why this is not a string check any more
 *
 * It used to be `startsWith("/") && !startsWith("//")`, which reads like it
 * covers the case and does not. A URL is not a string with a prefix rule — it
 * is whatever the WHATWG URL parser says it is, and that parser rewrites the
 * input before it looks at it. Three families got through, all verified against
 * the running client and against a real parser:
 *
 * | `returnTo`            | old check | `new URL(…, origin)` resolves to |
 * | --------------------- | --------- | -------------------------------- |
 * | `/\evil.example`      | allowed   | `http://evil.example/`           |
 * | `/\\evil.example`     | allowed   | `http://evil.example/`           |
 * | `/<TAB>/evil.example` | allowed   | `http://evil.example/`           |
 *
 * The first two are the backslash case: for a *special* scheme (`http`,
 * `https`) the parser treats `\` as `/`, so `/\` is `//` and `//host` is
 * protocol-relative. The third is nastier and is the reason the fix below
 * parses rather than pattern-matches — the parser **strips** ASCII tab, CR and
 * LF from a URL before parsing it, so `/<TAB>/evil.example` *becomes*
 * `//evil.example`. That string starts with exactly one `/` and does not start
 * with `//`, so it satisfies the old rule on its face, and it would also
 * survive the obvious patch of banning backslashes.
 *
 * Enumerating the rewrite rules is a losing game. So this asks the parser the
 * question directly: resolve the candidate against a base, and keep it only if
 * it did not leave that base's origin.
 *
 * ## Two properties worth keeping
 *
 * - **The base is a sentinel, not the real origin.** This runs in a server
 *   component that has no request origin to hand, and it does not need one:
 *   any candidate that escapes to *some other* origin escapes the sentinel too,
 *   whatever the real one is. `.invalid` is reserved by RFC 2606 and can never
 *   be a real host.
 * - **What comes back is rebuilt from the parse, never echoed.** The return
 *   value is always `pathname + search + hash` of a URL that was proved
 *   same-origin, so it is always a relative path — the raw candidate never
 *   reaches a `Location` header, and the parser's own normalisation (the tab
 *   is gone, `\` is already `/`) is what gets emitted.
 */

/**
 * A base to resolve against. Reserved by RFC 2606, so no real deployment can
 * collide with it — and if a candidate somehow named it, the value returned
 * would still be a bare path, because that is all this function ever returns.
 */
const SENTINEL_ORIGIN = "http://return-to.invalid";

export function sanitizeReturnTo(
  returnTo: string | undefined | null,
): string | undefined {
  if (!returnTo || typeof returnTo !== "string") return undefined;

  // Keep the documented contract — a relative path — rather than quietly
  // widening it to bare words like `cellars`. It is not what stops the attack
  // (`/\evil.example` starts with `/` too); the origin check below is.
  if (!returnTo.startsWith("/")) return undefined;

  let resolved: URL;
  try {
    resolved = new URL(returnTo, SENTINEL_ORIGIN);
  } catch {
    // Not a URL the parser can make sense of relative to a base at all.
    return undefined;
  }

  // The whole check. An absolute URL brings its own origin; a
  // protocol-relative one (however it was spelled) takes the host from the
  // candidate; `javascript:` and friends parse to the opaque origin "null".
  // Only a genuinely relative path keeps the sentinel's origin.
  if (resolved.origin !== SENTINEL_ORIGIN) return undefined;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
