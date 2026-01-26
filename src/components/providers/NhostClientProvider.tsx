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
          secure: false, // Fixed: Never use secure in development
          sameSite: "lax",
        }),
      }),
    [],
  );

  useEffect(() => {
    setIsLoading(true);

    // Get initial session from SDK
    const currentSession = nhost.getUserSession();
    setUser(currentSession?.user || null);
    setSession(currentSession);
    setIsAuthenticated(!!currentSession);
    lastRefreshTokenIdRef.current = currentSession?.refreshTokenId || null;
    setIsLoading(false);

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
