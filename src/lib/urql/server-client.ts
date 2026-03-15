import { cacheExchange, createClient, fetchExchange } from "@urql/core";
import { registerUrql } from "@urql/next/rsc";

/**
 * Creates a URQL client for server components with authentication
 * This is used with registerUrql for RSC support
 * Authentication headers are added by serverQuery() function
 */
export const makeServerClient = () => {
  // Use environment variables to get GraphQL URL directly
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  if (!subdomain) {
    throw new Error(
      "NEXT_PUBLIC_NHOST_SUBDOMAIN environment variable is required",
    );
  }
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;

  // Construct GraphQL URL based on Nhost configuration
  const graphqlUrl =
    region && region !== "local"
      ? `https://${subdomain}.graphql.${region}.nhost.run/v1`
      : `https://local.graphql.nhost.run/v1`;

  return createClient({
    url: graphqlUrl,
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: () => ({
      cache: "no-store", // Disable Next.js fetch caching for fresh auth headers
      method: "POST", // Force POST to avoid persisted query issues
    }),
    preferGetMethod: false, // Explicitly disable GET method
  });
};

// Register the server client for RSC usage
export const { getClient } = registerUrql(makeServerClient);
