import { proxyAuthRequest } from "../../../../lib/api/auth-proxy.ts";

/** Auth responses are per-session by construction; never cache or prerender. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request): Promise<Response> =>
  proxyAuthRequest(request);

export const POST = (request: Request): Promise<Response> =>
  proxyAuthRequest(request);
