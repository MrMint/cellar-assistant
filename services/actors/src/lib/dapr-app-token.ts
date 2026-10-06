/**
 * Only this app's own sidecar may call its Dapr routes.
 *
 * Port 3002 carries two surfaces on one Express app: better-auth under
 * `/api/auth/*`, which browsers and `services/api` reach directly, and the
 * Dapr actor host under `/actors/*` and `/dapr/*`, which only the sidecar
 * should ever call. Everything on the second surface trusts the `ctx` it is
 * handed, `kind: "system"` included — so anything that could reach the port
 * could act as the outbox. The edge's prefix match (`VIRTUAL_PATH=^~ /api/auth/`
 * on `actors` in `infra/docker-compose.prod.yml`, served by the host's
 * nginx-proxy) and the unpublished port kept the public internet off it;
 * nothing kept the rest of the compose network off it — nor, since the edge
 * moved behind the shared proxy, the rest of the host's default `bridge`
 * network, which the actor host joins so the proxy can reach it.
 *
 * Dapr's answer is the app API token: daprd started with `APP_API_TOKEN` sends
 * it to its app as `dapr-api-token` on every call, and "from the app side,
 * ensure you are authenticating using the dapr-api-token value" — daprd
 * verifies nothing on the app's behalf. This is that check. Its companion,
 * `DAPR_API_TOKEN`, is enforced by daprd itself on callers of the sidecar's
 * API (`docs/architecture/target-stack.md`, "Dapr API tokens").
 *
 * - **Every path needs the header except better-auth's and `/healthz`** —
 *   {@link requiresAppToken}. It used to be the other way round: `/actors/*`
 *   and `/dapr/*` needed it, spelled case-sensitively, while Express routed
 *   `/ACTORS/…` to the same handlers; any spelling the check did not
 *   recognise walked past it (`./host-app.ts` has the probes). A deny-by-
 *   default list cannot be walked past by a spelling: a path that is not one
 *   of the two public ones needs the token whatever it routes to, so the check
 *   no longer has to agree with the router about what an actor route looks
 *   like. better-auth's routes are public because browsers and `services/api`
 *   call them; `/healthz` (`GET`/`HEAD`) because it discloses nothing — the
 *   sidecar's own probe carries the token anyway.
 * - Constant-time comparison; a refusal is `401` with
 *   `{"code":"UNAUTHENTICATED"}` — not an `ActorErrorCode`, so no caller reads
 *   it as a typed actor failure, and daprd, which always presents the token,
 *   never sees it — and an `actor.app_token_refused` WARN carrying the id-less
 *   route.
 * - An **unset** token disables the check. `infra/docker-compose.prod.yml`
 *   makes it a required secret, the development lanes set a published default,
 *   and the boot log says when it is off.
 */
import { timingSafeEqual } from "node:crypto";
import { DAPR_API_TOKEN_HEADER } from "@cellar-assistant/contracts";
import type { Express, NextFunction, Request, Response } from "express";
import { describeActorRoute } from "./actor-error-envelope.ts";
import { emit } from "./telemetry.ts";

/** What a refusal says. Not an `ActorErrorCode` (`packages/contracts`). */
export const UNAUTHENTICATED_BODY = { code: "UNAUTHENTICATED" } as const;

/**
 * better-auth's mount (`AUTH_BASE_PATH` in `../auth/mount.ts`, pinned equal by
 * `dapr-app-token.test.ts`), spelled here so this module does not load
 * better-auth.
 */
export const PUBLIC_AUTH_PREFIX = "/api/auth/";

/**
 * Whether a request needs the sidecar's token: everything except
 * better-auth's routes and the health check. Case-sensitive on purpose — the
 * host routes case-sensitively (`./host-app.ts`), so `/API/AUTH/…` reaches no
 * better-auth route, and here it needs the token like any other unknown path.
 */
export const requiresAppToken = (method: string, path: string): boolean => {
  if (path.startsWith(PUBLIC_AUTH_PREFIX)) return false;
  if (path === "/healthz" && (method === "GET" || method === "HEAD")) {
    return false;
  }
  return true;
};

const matches = (presented: string, expected: string): boolean => {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const daprAppTokenMiddleware =
  (expected: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (expected === "" || !requiresAppToken(req.method, req.path)) {
      next();
      return;
    }
    const presented = req.get(DAPR_API_TOKEN_HEADER);
    if (presented !== undefined && matches(presented, expected)) {
      next();
      return;
    }
    const route = describeActorRoute(req.method, req.path);
    emit({
      name: "actor.app_token_refused",
      severity: "WARN",
      message: `${req.method} ${route.template}: no valid ${DAPR_API_TOKEN_HEADER}`,
      attributes: {
        "actor.route": route.template,
        "actor.route_kind": route.kind,
        "actor.token_presented": presented !== undefined,
      },
    });
    res.status(401).json(UNAUTHENTICATED_BODY);
  };

/**
 * Install first among the actor host's middlewares — ahead of the method
 * allow-list, the body parsers and the SDK's routes.
 */
export const installDaprAppTokenCheck = (
  app: Express,
  expected: string,
): void => {
  if (expected === "") {
    emit({
      name: "dapr.app_token_unset",
      severity: "WARN",
      message:
        "APP_API_TOKEN is unset: the actor routes accept calls from anything " +
        "that can reach this port, not only this app's sidecar",
      attributes: {},
    });
  }
  app.use(daprAppTokenMiddleware(expected));
};
