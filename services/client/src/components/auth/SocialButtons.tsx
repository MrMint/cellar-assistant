"use client";

/**
 * The three social sign-in buttons, shared by `/sign-in` and `/sign-up`.
 *
 * The markup is the production sign-in page's, unchanged
 * (`82450ad1:src/components/auth/SignInClient.tsx`): soft, neutral,
 * full-width, icon as the start decorator, "Continue with …". It moved here
 * from `SignInApiClient` only so `/sign-up` can offer the same buttons when
 * password sign-up is off (`AUTH_PASSWORD_MODE`). better-auth signs a new user
 * up implicitly on their first social sign-in, so the buttons mean the same
 * thing on both pages.
 */

import { Button, Typography } from "@mui/joy";
import { useCallback, useState } from "react";
import { BsDiscord, BsFacebook } from "react-icons/bs";
import { FcGoogle } from "react-icons/fc";
import { startSocialSignIn } from "@/lib/api/auth-client";
import type { SocialProvider } from "@/lib/api/endpoints";

const PROVIDERS: {
  id: SocialProvider;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "google", label: "Continue with Google", icon: <FcGoogle /> },
  { id: "discord", label: "Continue with Discord", icon: <BsDiscord /> },
  { id: "facebook", label: "Continue with Facebook", icon: <BsFacebook /> },
];

/** The redirect state, kept by the page so it can disable its own form too. */
export function useSocialSignIn(destination: string) {
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [redirectingTo, setRedirectingTo] = useState<SocialProvider | null>(
    null,
  );

  const start = useCallback(
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

  return { ssoError, redirectingTo, start };
}

export function SocialButtons({
  busy,
  redirectingTo,
  ssoError,
  onSelect,
}: {
  busy: boolean;
  redirectingTo: SocialProvider | null;
  ssoError: string | null;
  onSelect: (provider: SocialProvider) => void;
}) {
  return (
    <>
      {PROVIDERS.map((provider) => (
        <Button
          key={provider.id}
          onClick={() => onSelect(provider.id)}
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
    </>
  );
}

/**
 * Shown where password sign-in used to be, when it no longer is. Google and
 * Discord only: better-auth 1.7.3 reports every Facebook email as unverified,
 * so Facebook never links into an existing account by email
 * (`services/actors/src/auth/credential-linking.test.ts`).
 */
export const FORMER_PASSWORD_USER_NOTE =
  "Used a password before? Sign in with Google or Discord using the same email to keep your account.";
