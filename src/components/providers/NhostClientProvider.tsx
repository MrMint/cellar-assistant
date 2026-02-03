"use client";

import { createClient, type NhostClient } from "@nhost/nhost-js";
import type { Session } from "@nhost/nhost-js/auth";
import { CookieStorage } from "@nhost/nhost-js/session";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconContext } from "react-icons";
import ThemeRegistry from "./ThemeRegistry";
import { UrqlProvider } from "./UrqlProvider";

interface AuthContextType {
  user: Session["user"] | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  nhost: NhostClient;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<Session["user"] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const lastRefreshTokenIdRef = useRef<string | null>(null);
  const router = useRouter();

  const nhost = useMemo(
    () =>
      createClient({
        region: process.env.NEXT_PUBLIC_NHOST_REGION || "local",
        subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "local",
        storage: new CookieStorage({
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
        }),
      }),
    [],
  );

  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);

      // Check for OAuth callback - refreshToken in URL from SSO redirect
      const urlParams = new URLSearchParams(window.location.search);
      const refreshTokenFromUrl = urlParams.get("refreshToken");

      if (refreshTokenFromUrl) {
        try {
          // Exchange the refresh token for a full session
          const result = await nhost.auth.refreshToken({
            refreshToken: refreshTokenFromUrl,
          });

          if (result.body && result.status === 200) {
            // Store the session using the SDK's storage
            nhost.sessionStorage.set(result.body);

            // Clean up the URL by removing the refreshToken param
            const url = new URL(window.location.href);
            url.searchParams.delete("refreshToken");
            window.history.replaceState({}, "", url.toString());

            setUser(result.body.user || null);
            setSession(result.body);
            setIsAuthenticated(true);
            lastRefreshTokenIdRef.current = result.body.refreshTokenId || null;
            setIsLoading(false);
            router.refresh();
            return;
          }
        } catch (error) {
          console.error("Failed to exchange OAuth refresh token:", error);
          // Clean up the URL even on error
          const url = new URL(window.location.href);
          url.searchParams.delete("refreshToken");
          window.history.replaceState({}, "", url.toString());
        }
      }

      // Get initial session from SDK
      const currentSession = nhost.getUserSession();
      setUser(currentSession?.user || null);
      setSession(currentSession);
      setIsAuthenticated(!!currentSession);
      lastRefreshTokenIdRef.current = currentSession?.refreshTokenId || null;
      setIsLoading(false);
    };

    initializeAuth();

    // Subscribe to session changes using SDK's storage onChange
    const unsubscribe = nhost.sessionStorage?.onChange?.(
      (newSession: Session | null) => {
        setUser(newSession?.user || null);
        setSession(newSession);
        setIsAuthenticated(!!newSession);

        if (newSession?.refreshTokenId !== lastRefreshTokenIdRef.current) {
          lastRefreshTokenIdRef.current = newSession?.refreshTokenId || null;
          router.refresh();
        }
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [nhost, router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated,
        isLoading,
        nhost,
      }}
    >
      <UrqlProvider nhost={nhost}>
        <IconContext.Provider
          value={{
            color: "var(--Icon-color)",
            style: {
              margin: "var(--Icon-margin)",
              fontSize: "var(--Icon-fontSize, 20px)",
              width: "0.75em",
              height: "0.75em",
            },
          }}
        >
          <ThemeRegistry>{children}</ThemeRegistry>
        </IconContext.Provider>
      </UrqlProvider>
    </AuthContext.Provider>
  );
};

// Hook to use authentication context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Legacy hook for backward compatibility
export const useNhostClient = (): NhostClient => {
  const { nhost } = useAuth();
  return nhost;
};

// Legacy hook for backward compatibility
export const useAuthenticationStatus = () => {
  const { user, session, isAuthenticated, isLoading } = useAuth();
  return { user, session, isAuthenticated, isLoading };
};

// Default export with renamed component
export default function NhostClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}
