import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Only log auth details in development to avoid exposing sensitive info in production
const isDev = process.env.NODE_ENV === "development";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    // Get the Nhost session cookie
    const nhostSessionCookie = cookieStore.get("nhostSession")?.value;

    if (!nhostSessionCookie) {
      if (isDev) console.log("🔑 [GraphQL Proxy] No nhostSession cookie found");
      return NextResponse.json(
        { errors: [{ message: "Authentication required" }] },
        { status: 401 },
      );
    }

    // biome-ignore lint/suspicious/noImplicitAnyLet: Session data from cookies is dynamically typed
    let sessionData;
    try {
      sessionData = JSON.parse(nhostSessionCookie);
    } catch (_error) {
      if (isDev)
        console.log("🔑 [GraphQL Proxy] Failed to parse nhostSession cookie");
      return NextResponse.json(
        { errors: [{ message: "Invalid session data" }] },
        { status: 401 },
      );
    }

    const accessToken = sessionData.accessToken;
    if (!accessToken) {
      if (isDev)
        console.log("🔑 [GraphQL Proxy] No access token in session data");
      return NextResponse.json(
        { errors: [{ message: "No access token found" }] },
        { status: 401 },
      );
    }

    // Get the GraphQL query/variables from the request
    const { query, variables, operationName } = await request.json();

    // Construct GraphQL URL based on subdomain and region (Nhost Cloud pattern)
    const subdomain =
      process.env.NHOST_SUBDOMAIN || process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
    const region =
      process.env.NHOST_REGION || process.env.NEXT_PUBLIC_NHOST_REGION;

    let graphqlUrl: string;
    if (process.env.NHOST_GRAPHQL_URL) {
      graphqlUrl = process.env.NHOST_GRAPHQL_URL;
    } else if (process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL) {
      graphqlUrl = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL;
    } else if (subdomain === "local" || !region) {
      // Local development
      graphqlUrl = "https://local.graphql.nhost.run/v1";
    } else {
      // Nhost Cloud: https://{subdomain}.graphql.{region}.nhost.run/v1
      graphqlUrl = `https://${subdomain}.graphql.${region}.nhost.run/v1`;
    }

    if (isDev) {
      console.log(`🔑 [GraphQL Proxy] Forwarding to ${graphqlUrl}`);
    }

    // Forward request to Hasura with the access token
    // Hasura will verify the JWT using its configured secret
    const hasuraResponse = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query,
        variables,
        operationName,
      }),
    });

    const data = await hasuraResponse.json();

    // Check if Hasura returned an auth error
    if (
      hasuraResponse.status === 401 ||
      data.errors?.some(
        (e: { extensions?: { code?: string } }) =>
          e.extensions?.code === "invalid-jwt" ||
          e.extensions?.code === "access-denied",
      )
    ) {
      if (isDev) console.log("🔑 [GraphQL Proxy] Hasura rejected the token");
      return NextResponse.json(
        { errors: [{ message: "Invalid or expired token" }] },
        { status: 401 },
      );
    }

    if (isDev) console.log(`🔑 [GraphQL Proxy] Request forwarded successfully`);
    return NextResponse.json(data);
  } catch (error) {
    if (isDev) console.error("🔑 [GraphQL Proxy] Error:", error);
    return NextResponse.json(
      { errors: [{ message: "Internal server error" }] },
      { status: 500 },
    );
  }
}
