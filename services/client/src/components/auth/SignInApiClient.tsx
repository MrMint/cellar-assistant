"use client";

/**
 * Sign-in against **better-auth** (`services/actors`), through D1's client.
 *
 * Laid out per Shell-Entry: the kinds and the app's name, the providers
 * first, "or", then email and password, and a way to make an account. No
 * "forgot password": there is no reset flow behind it (owner question).
 *
 * Nothing here is a server action. `authClient` is a same-origin `fetch` into
 * `/api/auth/*`, which the Next route handler proxies to the actors app, so the
 * session cookie is set by the response the browser itself received — a server
 * action would have to forward `Set-Cookie` by hand.
 */

import { type FormEvent, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Spinner } from "@/components/ui/spinner";
import { PressLink } from "@/components/user/PressLink";
import { usePurgeUserCachesOnMount } from "@/hooks/usePurgeUserCachesOnMount";
import { authClient, useAuthAction } from "@/lib/api/auth-client";
import type { PasswordMode } from "@/lib/auth/password-mode";
import { cn } from "@/lib/utils";
import { HOME_PATH, withReturnTo } from "@/utilities/sanitize-return-to";
import {
  AuthBrand,
  AuthField,
  AuthPage,
  AuthPanel,
  WordDivider,
} from "./AuthCard";
import {
  FORMER_PASSWORD_USER_NOTE,
  SocialButtons,
  useSocialSignIn,
} from "./SocialButtons";
import { useLanding } from "./useLanding";

/**
 * `passwordMode` comes from the page's server component
 * (`@/lib/auth/password-mode`), never from the browser's environment:
 *
 *   - `enabled` — the production page's layout exactly: social buttons, an
 *     "or" divider, the email/password form.
 *   - `signin-only` — social buttons first, then the password form folded
 *     behind "Sign in with your password", for the existing password users
 *     who have no social login. No new password accounts exist in this mode,
 *     so the form is for a minority and is not the first thing on the page.
 *   - `disabled` — social buttons and the note for former password users.
 */
export function SignInApiClient({
  returnTo,
  passwordMode = "enabled",
}: {
  returnTo?: string;
  passwordMode?: PasswordMode;
}) {
  usePurgeUserCachesOnMount();
  const { run, pending, error } = useAuthAction(authClient.signIn.email);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const destination = returnTo ?? HOME_PATH;
  const { land, landing } = useLanding(destination);
  const { ssoError, redirectingTo, start } = useSocialSignIn(destination);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      // `land` starts the navigation in the same tick `pending` clears, so
      // the spinner never drops before the next page commits (X01).
      await run(
        {
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          rememberMe: true,
        },
        land,
      );
    },
    [run, land],
  );

  const submitting = pending || landing;
  const busy = submitting || redirectingTo !== null;
  const formError = error?.message ?? null;

  const passwordForm = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <AuthField
        id="sign-in-email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        required
        invalid={formError !== null}
        disabled={busy}
      />
      <AuthField
        id="sign-in-password"
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        invalid={formError !== null}
        message={formError}
        disabled={busy}
      />
      <Button type="submit" disabled={busy} aria-busy={submitting || undefined}>
        {submitting && <Spinner aria-hidden />}
        Sign in
      </Button>
    </form>
  );

  return (
    <AuthPage>
      <AuthPanel>
        <AuthBrand line="Sign in to your cellars" />
        <div className="flex flex-col gap-2">
          <SocialButtons
            busy={busy}
            redirectingTo={redirectingTo}
            ssoError={ssoError}
            onSelect={(provider) => void start(provider)}
          />
        </div>
        {passwordMode === "disabled" && (
          <p className="t-cap m-0 text-ink-2">{FORMER_PASSWORD_USER_NOTE}</p>
        )}
        {passwordMode === "enabled" && (
          <>
            <WordDivider>or</WordDivider>
            {passwordForm}
          </>
        )}
        {passwordMode === "signin-only" && (
          <>
            <WordDivider />
            <Button
              type="button"
              variant="quiet"
              size="sm"
              aria-expanded={passwordOpen}
              aria-controls="password-sign-in"
              onClick={() => setPasswordOpen((open) => !open)}
              className="self-center"
            >
              Sign in with your password
            </Button>
            {passwordOpen && <div id="password-sign-in">{passwordForm}</div>}
          </>
        )}
        <WordDivider />
        <PressLink
          href={withReturnTo("/sign-up", returnTo)}
          underline="none"
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          Create an account
        </PressLink>
      </AuthPanel>
    </AuthPage>
  );
}
