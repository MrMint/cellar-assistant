import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyJWT } from "@/utilities/jwt";

// Only log auth details in development to avoid exposing sensitive info in production
const isDev = process.env.NODE_ENV === "development";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    // Get the Nhost session cookie (new format)
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

    // Verify JWT with signature validation
    const payload = await verifyJWT(accessToken);

    if (!payload) {
      if (isDev) console.log("🔑 [GraphQL Proxy] JWT verification failed");
      return NextResponse.json(
        { errors: [{ message: "Invalid or expired token" }] },
        { status: 401 },
      );
    }

    if (isDev) {
      console.log(
        `🔑 [GraphQL Proxy] JWT verified for user: ${payload.sub || payload["https://hasura.io/jwt/claims"]?.["x-hasura-user-id"] || "unknown"}`,
      );
    }

    // Get the GraphQL query/variables from the request
    const { query, variables, operationName } = await request.json();

    // Forward request to Hasura with authentication headers
    const graphqlUrl =
      process.env.NHOST_GRAPHQL_URL ||
      process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL ||
      `https://local.graphql.nhost.run/v1`;

    const hasuraResponse = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        // Add Hasura-specific headers for better permissions
        "X-Hasura-User-Id":
          payload.sub ||
          payload["https://hasura.io/jwt/claims"]?.["x-hasura-user-id"] ||
          "",
        "X-Hasura-Role": "user",
      },
      body: JSON.stringify({
        query,
        variables,
        operationName,
      }),
    });

    const data = await hasuraResponse.json();

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
