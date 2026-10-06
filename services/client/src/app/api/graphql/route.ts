import { proxyGraphqlRequest } from "../../../lib/api/graphql-proxy.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request): Promise<Response> =>
  proxyGraphqlRequest(request);
