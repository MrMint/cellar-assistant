import { authExchange } from "@urql/exchange-auth";

/**
 * Custom auth exchange that works with our cookie-based auth system.
 *
 * The /api/graphql proxy handles token refresh transparently — if an access
 * token is expiring, the proxy refreshes it and retries the Hasura request.
 *
 * This exchange only triggers when the proxy itself returns 401, which means
 * the session is truly expired (refresh token invalid). In that case we
 * redirect to sign-in rather than attempting a client-side refresh.
 */
export function createCookieAuthExchange() {
  return authExchange(async (_utils) => {
    return {
      addAuthToOperation: (operation) => {
        // No need to add auth headers - /api/graphql handles this via cookies
        return operation;
      },
      didAuthError: (error) => {
        return (
          error.response?.status === 401 ||
          error.graphQLErrors?.some(
            (e) =>
              e.message === "Authentication required" ||
              e.message === "Token expired" ||
              e.message === "Invalid or expired token",
          )
        );
      },
      willAuthError: () => {
        return false;
      },
      refreshAuth: async () => {
        // The proxy already attempted to refresh the token and failed.
        // The session is truly expired — redirect to sign-in.
        // Using replace() so the back button doesn't loop back here.
        window.location.replace("/sign-in");
      },
    };
  });
}
