import { authExchange } from "@urql/exchange-auth";

/**
 * Custom auth exchange that works with our cookie-based auth system
 * Handles token refresh by triggering a page refresh when tokens expire
 */
export function createCookieAuthExchange() {
  return authExchange(async (_utils) => {
    return {
      addAuthToOperation: (operation) => {
        // No need to add auth headers - /api/graphql handles this via cookies
        return operation;
      },
      didAuthError: (error) => {
        // Check if we got a 401 from our GraphQL proxy
        return (
          error.response?.status === 401 ||
          error.graphQLErrors?.some(
            (e) =>
              e.message === "Authentication required" ||
              e.message === "Token expired",
          )
        );
      },
      willAuthError: () => {
        // We can't easily check token expiry on client side with HttpOnly cookies
        // Let the server decide
        return false;
      },
      refreshAuth: async () => {
        console.log(
          "[Auth Exchange] Token expired, triggering page refresh for middleware handling",
        );

        // Instead of trying to refresh on client-side, let middleware handle it
        // This avoids potential race conditions and keeps the logic centralized
        window.location.reload();
      },
    };
  });
}
