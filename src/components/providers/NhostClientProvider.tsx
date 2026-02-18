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

  const nhost = useMemo(() => {
    const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "local";
    const region = process.env.NEXT_PUBLIC_NHOST_REGION;

    // For local development (no region), provide explicit URLs
    // The SDK's fallback URL pattern is broken for local dev
    const isLocal = !region;
    const baseConfig = isLocal
      ? {
          authUrl: `https://${subdomain}.auth.nhost.run/v1`,
          storageUrl: `https://${subdomain}.storage.nhost.run/v1`,
          graphqlUrl: `https://${subdomain}.graphql.nhost.run/v1`,
          functionsUrl: `https://${subdomain}.functions.nhost.run/v1`,
        }
      : {
          subdomain,
          region,
        };

    return createClient({
      ...baseConfig,
      storage: new CookieStorage({
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      }),
    });
  }, []);

  useEffect(() => {
    const initializeAuth = () => {
      setIsLoading(true);

      // Get initial session from SDK's CookieStorage
      const currentSession = nhost.getUserSession();
      setUser(currentSession?.user ?? null);
      setSession(currentSession);
      setIsAuthenticated(!!currentSession);
      lastRefreshTokenIdRef.current = currentSession?.refreshTokenId ?? null;
      setIsLoading(false);
    };

    initializeAuth();

    // Subscribe to session changes using SDK's storage onChange
    const unsubscribe = nhost.sessionStorage?.onChange?.(
      (newSession: Session | null) => {
        setUser(newSession?.user ?? null);
        setSession(newSession);
        setIsAuthenticated(!!newSession);

        if (newSession?.refreshTokenId !== lastRefreshTokenIdRef.current) {
          lastRefreshTokenIdRef.current = newSession?.refreshTokenId ?? null;
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
      <UrqlProvider>
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

// Default export with renamed component
export default function NhostClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}
