"use client";

/**
 * Sign-in against **better-auth** (`services/actors`), through D1's client.
 *
 * Built beside the Nhost sign-in form D9 deleted, with deliberately identical
 * markup so the swap was invisible to anyone using the app.
 *
 * Nothing here is a server action. `authClient` is a same-origin `fetch` into
 * `/api/auth/*`, which the Next route handler proxies to the actors app, so the
 * session cookie is set by the response the browser itself received — a server
 * action would have to forward `Set-Cookie` by hand.
 */

import {
  Box,
  Button,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Sheet,
  Stack,
  Typography,
} from "@mui/joy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useState } from "react";
import { BsDiscord, BsFacebook } from "react-icons/bs";
import { FcGoogle } from "react-icons/fc";
import {
  authClient,
  startSocialSignIn,
  useAuthAction,
} from "@/lib/api/auth-client";
import type { SocialProvider } from "@/lib/api/endpoints";
import { LiquidBackground } from "./LiquidBackground";

const PROVIDERS: {
  id: SocialProvider;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "google", label: "Continue with Google", icon: <FcGoogle /> },
  { id: "discord", label: "Continue with Discord", icon: <BsDiscord /> },
  { id: "facebook", label: "Continue with Facebook", icon: <BsFacebook /> },
];

export function SignInApiClient({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [redirectingTo, setRedirectingTo] = useState<SocialProvider | null>(
    null,
  );
  const { run, pending, error } = useAuthAction(authClient.signIn.email);

  const destination = returnTo ?? "/cellars";

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const ok = await run({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        rememberMe: true,
      });
      if (!ok) return;
      // `replace`, so Back does not walk into the sign-in page behind a live
      // session and bounce straight forward again.
      router.replace(destination);
      // The `(authenticated)` layout is a server component; without this it
      // would re-render from the router cache, before the cookie existed.
      router.refresh();
    },
    [run, router, destination],
  );

  const handleSocial = useCallback(
    async (provider: SocialProvider) => {
      setSsoError(null);
      setRedirectingTo(provider);
      const failure = await startSocialSignIn(provider, destination);
      if (failure !== null) {
        setSsoError(failure.message);
        setRedirectingTo(null);
      }
    },
    [destination],
  );

  const busy = pending || redirectingTo !== null;
  const formError = error?.message ?? null;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexGrow: 1,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <LiquidBackground />
      <Sheet
        variant="outlined"
        sx={{
          maxWidth: { xs: "400px" },
          width: { xs: "100%", sm: "400px" },
          flexGrow: { xs: 1, sm: 0 },
          display: "flex",
          flexDirection: "column",
          padding: 3,
          margin: 2,
          position: "relative",
          zIndex: 1,
          borderRadius: "lg",
          backgroundColor: "rgba(17, 16, 21, 0.65)",
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          borderColor: "rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <Stack gap={1} sx={{ marginBottom: 2 }}>
          <Stack gap={1} marginBottom={2}>
            <Typography level="h3">Sign in</Typography>
            <Typography level="body-sm">
              New to Cellar Assistant? <Link href="/sign-up">Sign up!</Link>
            </Typography>
          </Stack>

          {PROVIDERS.map((provider) => (
            <Button
              key={provider.id}
              onClick={() => void handleSocial(provider.id)}
              variant="soft"
              color="neutral"
              fullWidth
              disabled={busy}
              loading={redirectingTo === provider.id}
              startDecorator={provider.icon}
            >
              {provider.label}
            </Button>
          ))}
          {ssoError !== null && (
            <Typography level="body-sm" color="danger">
              {ssoError}
            </Typography>
          )}
        </Stack>
        <Divider>or</Divider>
        <form onSubmit={handleSubmit}>
          <Stack gap={2} sx={{ mt: 2 }}>
            <FormControl required error={formError !== null}>
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                required
                disabled={busy}
              />
            </FormControl>
            <FormControl required error={formError !== null}>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                disabled={busy}
              />
              {formError !== null && (
                <FormHelperText>{formError}</FormHelperText>
              )}
            </FormControl>
            <Button loading={pending} type="submit" disabled={busy}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Sheet>
    </Box>
  );
}
