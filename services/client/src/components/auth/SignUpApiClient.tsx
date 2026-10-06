"use client";

/**
 * Sign-up against **better-auth**. See `SignInApiClient` for the mechanism —
 * this is the same shape with one call.
 *
 * better-auth signs the new user in as part of `sign-up/email`, so there is no
 * second call and no "check your email" state to model here — A6 leaves email
 * verification off in development.
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
import { authClient, useAuthAction } from "@/lib/api/auth-client";
import type { PasswordMode } from "@/lib/auth/password-mode";
import { SocialButtons, useSocialSignIn } from "./SocialButtons";

/**
 * The actor host's floor — `minPasswordLength: 9` in
 * `services/actors/src/auth/auth.ts`, matching the outgoing stack's
 * `passwordMinLength`. Saying so beats a round trip that fails. It said 8
 * (better-auth's own default), so an eight-character password passed here and
 * was refused there.
 */
const MIN_PASSWORD_LENGTH = 9;

/**
 * The same shape the actor host refuses (`isEmailShaped` in
 * `services/actors/src/auth/display-name.ts`), checked here only so the form
 * can say why. The server does not depend on it: an address submitted anyway
 * is stored as a neutral handle.
 */
const EMAIL_SHAPED = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * With `AUTH_PASSWORD_MODE` anything but `enabled`, the actor host refuses
 * `/sign-up/email`, so the page offers the social buttons instead: better-auth
 * creates the account on a new user's first social sign-in.
 */
export function SignUpApiClient({
  passwordMode = "enabled",
}: {
  passwordMode?: PasswordMode;
}) {
  if (passwordMode !== "enabled") return <SocialSignUp />;
  return <PasswordSignUp />;
}

function SocialSignUp() {
  const { ssoError, redirectingTo, start } = useSocialSignIn("/cellars");
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexGrow: 1,
      }}
    >
      <Sheet
        variant="outlined"
        sx={{
          width: { xs: "100%", sm: "400px" },
          maxWidth: "400px",
          display: "flex",
          flexDirection: "column",
          padding: 3,
          margin: 2,
          borderRadius: "lg",
        }}
      >
        <Stack gap={2}>
          <Typography level="h3">Sign up for Cellar Assistant</Typography>
          <Stack gap={1}>
            <SocialButtons
              busy={redirectingTo !== null}
              redirectingTo={redirectingTo}
              ssoError={ssoError}
              onSelect={(provider) => void start(provider)}
            />
          </Stack>
          <Divider />
          <Typography level="body-sm">
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </Typography>
        </Stack>
      </Sheet>
    </Box>
  );
}

function PasswordSignUp() {
  const router = useRouter();
  const [localError, setLocalError] = useState<string | null>(null);
  const { run, pending, error } = useAuthAction(authClient.signUp.email);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLocalError(null);
      const form = new FormData(event.currentTarget);
      const password = String(form.get("password") ?? "");
      if (password.length < MIN_PASSWORD_LENGTH) {
        setLocalError(
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        );
        return;
      }
      const email = String(form.get("email") ?? "");
      const name = String(form.get("name") ?? "").trim();
      if (EMAIL_SHAPED.test(name)) {
        setLocalError(
          "Your display name is shown to other users, so it can't be an email address.",
        );
        return;
      }
      // Blank stays blank: the server gives a neutral handle. It used to send
      // the email here, which made every such address public (W4 security F2).
      const ok = await run({ email, password, name });
      if (!ok) return;
      router.replace("/cellars");
      router.refresh();
    },
    [run, router],
  );

  const formError = localError ?? error?.message ?? null;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexGrow: 1,
      }}
    >
      <Sheet
        variant="outlined"
        sx={{
          width: { xs: "100%", sm: "400px" },
          maxWidth: "400px",
          display: "flex",
          flexDirection: "column",
          padding: 3,
          margin: 2,
          borderRadius: "lg",
        }}
      >
        <form onSubmit={handleSubmit}>
          <Stack gap={2}>
            <Typography level="h3">Sign up for Cellar Assistant</Typography>
            <FormControl>
              <FormLabel>Display name</FormLabel>
              <Input
                name="name"
                autoComplete="nickname"
                placeholder="Optional"
                disabled={pending}
              />
              <FormHelperText>
                Shown to other users. Leave it blank and you'll get a neutral
                handle you can change later — your email is never shown.
              </FormHelperText>
            </FormControl>
            <FormControl required error={formError !== null}>
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                required
                disabled={pending}
              />
            </FormControl>
            <FormControl required error={formError !== null}>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                name="password"
                autoComplete="new-password"
                required
                disabled={pending}
              />
              {formError !== null && (
                <FormHelperText>{formError}</FormHelperText>
              )}
            </FormControl>
            <Button loading={pending} type="submit" sx={{ mt: 1 }}>
              Sign up
            </Button>
            <Divider />
            <Typography level="body-sm">
              Already have an account? <Link href="/sign-in">Sign in</Link>
            </Typography>
          </Stack>
        </form>
      </Sheet>
    </Box>
  );
}
