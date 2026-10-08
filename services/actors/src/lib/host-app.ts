/**
 * The actor host's Express app: routing that means exactly what the gates in
 * front of it read.
 *
 * ## The bypass this exists for
 *
 * Express routes **case-insensitively** and ignores **one trailing slash**
 * unless told otherwise (4 and 5 alike), and every gate on this host read the
 * path case-sensitively. So, against the shared stack, 2026-09-28:
 *
 * ```
 * PUT /actors/PingActor/x/method/ping        → 401  (no dapr-api-token)
 * PUT /ACTORS/PingActor/x/method/ping        → 200  (no token)
 * PUT /Actors/PingActor/x/method/getActorId  → 200  (undeclared method)
 * ```
 *
 * The SDK's `PUT /actors/:actorTypeName/…` answered all three, the token check
 * (`./dapr-app-token.ts`) and the allow-list (`./actor-method-allowlist.ts`)
 * saw none of them as an actor route, and a forged `ctx` then read another
 * user's private cellar. A trailing slash (`…/method/tx/`) got a token holder
 * past the allow-list the same way.
 *
 * ## What this does
 *
 * 1. **{@link hardenRouting}** — `case sensitive routing` and `strict routing`.
 *    Express reads both **once, when it creates the app's router**, which is
 *    the first read of `app.router` — the app's first `use`/`all`/`get`/…;
 *    set after that they are silently ignored. So they are set here, on a fresh app, before anything is
 *    registered on it, and {@link assertHardenedRouting} refuses to boot a
 *    host whose router — or any route on it — was built without them.
 * 2. **{@link canonicalPathGate}** — first middleware of all: a path with an
 *    empty segment (`//`, a trailing `/`), a `.` or `..` segment, a backslash
 *    or malformed percent-encoding is answered `400` before any other layer
 *    reads it. None of those is something daprd, better-auth's clients or a
 *    health probe sends, and each is a place where two parsers could disagree
 *    about what the path names.
 *
 * Neither is the only thing in the way: the token check refuses every path
 * but better-auth's and `/healthz`, and the allow-list is enforced both on the
 * raw path and on the parameters the router actually extracted. This file is
 * what makes those readings agree with the router in the first place.
 *
 * Percent-encoded characters inside a segment (`%2F` included) are left alone
 * on purpose. Express never splits a path on them — the router's own
 * patterns match the raw path — and an actor id is free text for two actors
 * (`BarcodeActor`, `BrandRegistryActor`), so a `/` in a barcode is data. The
 * allow-list decodes each segment exactly as the router does, and
 * `host-app.test.ts` proves an encoded separator never reaches another route.
 */
import express, { type Express, type RequestHandler } from "express";

/** A refusal body that is not an `ActorErrorCode`, so no caller reads it as one. */
export const NON_CANONICAL_PATH_BODY = { code: "NON_CANONICAL_PATH" } as const;

export type NonCanonical =
  | "empty-segment"
  | "dot-segment"
  | "backslash"
  | "malformed-encoding";

/**
 * Why `path` (a request's pathname, still percent-encoded, no query) is not
 * canonical, or `null` when it is. `/` alone is canonical.
 */
export const nonCanonicalPath = (path: string): NonCanonical | null => {
  if (path === "/") return null;
  if (!path.startsWith("/")) return "empty-segment";
  if (path.includes("\\")) return "backslash";
  for (const segment of path.slice(1).split("/")) {
    if (segment === "") return "empty-segment";
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return "malformed-encoding";
    }
    // Raw or encoded (`%2e`): a URL parser downstream would resolve either.
    if (decoded === "." || decoded === "..") return "dot-segment";
  }
  return null;
};

export const canonicalPathGate: RequestHandler = (req, res, next) => {
  if (nonCanonicalPath(req.path) === null) {
    next();
    return;
  }
  res.status(400).json(NON_CANONICAL_PATH_BODY);
};

/**
 * Case-sensitive, strict routing. Throws if the app's router already exists,
 * because Express would silently keep the old settings.
 */
export const hardenRouting = (app: Express): void => {
  // Express 5 creates the router on the first read of `app.router`, and
  // there is no asking whether that has happened without reading it. So the
  // settings go in first and the read creates the router here, on purpose: a
  // router that comes back without them is one that already existed.
  app.set("case sensitive routing", true);
  app.set("strict routing", true);
  const router = routerOf(app);
  if (router.caseSensitive !== true || router.strict !== true) {
    throw new Error(
      "hardenRouting: the app's router already exists, so Express would " +
        "ignore these settings. Call it before anything is registered.",
    );
  }
};

/**
 * The actor host's app, before anything else is registered on it: hardened
 * routing, then the canonical-path gate as its first layer.
 */
export const createHostApp = (): Express => {
  const app = express();
  hardenRouting(app);
  app.use(canonicalPathGate);
  return app;
};

/* -------------------------------------------------------------------------- */
/* The boot-time check                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A `router` 2 layer. Its matchers are opaque path-to-regexp 8 functions, so
 * what a route accepts is learned by asking it (`match`), not by reading a
 * regexp as Express 4's path-to-regexp 0.1 allowed. `match` records what it
 * matched on the layer; {@link probe} puts that back.
 */
type RouteLayer = {
  readonly route?: { readonly path?: unknown };
  readonly handle?: { readonly stack?: unknown };
  match?: (path: string) => boolean;
  params?: unknown;
  path?: unknown;
  keys?: unknown;
};

type RouterShape = {
  readonly caseSensitive?: unknown;
  readonly strict?: unknown;
  readonly stack?: readonly RouteLayer[];
};

/** Express 5's router. Reading it creates it, with the app's settings then. */
const routerOf = (app: Express): RouterShape =>
  (app as unknown as { router: RouterShape }).router;

/**
 * A concrete path the route `path` names: every `:param` and `*wildcard` a
 * lower-case `x`, optional-group braces dropped.
 */
const samplePath = (path: string): string =>
  path.replace(/[:*][A-Za-z_$][\w$]*/g, "x").replace(/[{}]/g, "");

const probe = (layer: RouteLayer, path: string): boolean => {
  const { params, path: matched, keys } = layer;
  try {
    return layer.match?.(path) === true;
  } finally {
    layer.params = params;
    layer.path = matched;
    layer.keys = keys;
  }
};

/**
 * Every route on `app` that would match case-insensitively or with a trailing
 * slash — as path strings — plus a line for the router itself. Empty when the
 * app is hardened.
 */
export const unhardenedRoutes = (app: Express): string[] => {
  const router = routerOf(app);
  const stack = router.stack ?? [];
  if (stack.length === 0) return ["(empty router: nothing is registered)"];
  const problems: string[] = [];
  if (router.caseSensitive !== true) problems.push("(router) case-insensitive");
  if (router.strict !== true) problems.push("(router) not strict");
  for (const layer of stack) {
    if (layer.route === undefined) {
      // Plain middleware (`app.use(fn)`) routes nothing and is fine. A nested
      // router mounted with `app.use` is not: it is built with its own
      // settings (case-insensitive by default) and its routes are not on
      // this stack, so nothing here has checked them.
      if (Array.isArray(layer.handle?.stack)) {
        problems.push("(nested router) its routes cannot be checked");
      }
      continue;
    }
    const path = layer.route.path;
    // A RegExp or array path has no sample this can build — and a RegExp
    // carries its own flags whatever the router says — so it fails closed.
    if (typeof path !== "string") {
      problems.push(
        `${String(path)} is not a string path and cannot be probed`,
      );
      continue;
    }
    const sample = samplePath(path);
    // Fail closed on a route this cannot turn into a path it matches: a
    // syntax the sample does not understand is a route nobody has checked.
    if (!probe(layer, sample)) {
      problems.push(`${path} could not be probed`);
      continue;
    }
    // Both directions: an all-caps literal (`/ADMIN`) has no upper-case
    // variant to try, only a lower-case one.
    const variants = [sample.toUpperCase(), sample.toLowerCase()];
    if (variants.some((v) => v !== sample && probe(layer, v))) {
      problems.push(`${path} case-insensitive`);
    }
    // A wildcard takes a trailing `/` into its value whether or not the
    // router is strict, as Express 4's `*` did; `canonicalPathGate` refuses
    // that path before any route sees it.
    if (!path.includes("*") && probe(layer, `${sample}/`)) {
      problems.push(`${path} accepts a trailing slash`);
    }
  }
  return problems;
};

/**
 * Throw unless every route on `app` is case-sensitive and strict. Called by
 * `src/index.ts` after the SDK has registered its routes, so a change that
 * builds the host app some other way fails at boot rather than in the wild.
 */
export const assertHardenedRouting = (app: Express): void => {
  const problems = unhardenedRoutes(app);
  if (problems.length > 0) {
    throw new Error(
      `the actor host's routing is not hardened (src/lib/host-app.ts): ${problems.join("; ")}`,
    );
  }
};
