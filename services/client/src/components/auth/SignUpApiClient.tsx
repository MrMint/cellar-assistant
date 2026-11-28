"use client";

/**
 * Sign-up against **better-auth**. See `SignInApiClient` for the mechanism —
 * this is the same shape with one call.
 *
 * better-auth signs the new user in as part of `sign-up/email`, so there is no
 * second call and no "check your email" state to model here — A6 leaves email
 * verification off in development.
 */

import { type FormEvent, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PressLink } from "@/components/user/PressLink";
import { usePurgeUserCachesOnMount } from "@/hooks/usePurgeUserCachesOnMount";
import { authClient, useAuthAction } from "@/lib/api/auth-client";
import type { PasswordMode } from "@/lib/auth/password-mode";
import { feedback } from "@/lib/feedback";
import { HOME_PATH, withReturnTo } from "@/utilities/sanitize-return-to";
import {
  AuthBack,
  AuthField,
  AuthPage,
  AuthPanel,
  WordDivider,
} from "./AuthCard";
import { SocialButtons, useSocialSignIn } from "./SocialButtons";
import { useLanding } from "./useLanding";

/** "Have an account? Sign in", under both versions of the form. */
function SignInInstead({ returnTo }: { returnTo?: string }) {
  return (
    <p className="t-body m-0 text-center text-ink-2">
      Have an account?{" "}
      <PressLink
        href={withReturnTo("/sign-in", returnTo)}
        underline="always"
        className="font-semibold text-act-ink"
      >
        Sign in
      </PressLink>
    </p>
  );
}

/** Back, the title, then the providers: the head of both versions. */
function SignUpHead({ returnTo, busy }: { returnTo?: string; busy?: boolean }) {
  const { ssoError, redirectingTo, start } = useSocialSignIn(
    returnTo ?? HOME_PATH,
  );
  return (
    <>
      <AuthBack
        href={withReturnTo("/sign-in", returnTo)}
        title="Create an account"
      />
      <div className="flex flex-col gap-2">
        <SocialButtons
          busy={busy === true || redirectingTo !== null}
          redirectingTo={redirectingTo}
          ssoError={ssoError}
          onSelect={(provider) => void start(provider)}
        />
      </div>
    </>
  );
}

/**
 * The actor host's floor — `minPasswordLength: 9` in
 * `services/actors/src/auth/auth.ts`. Saying so beats a round trip that fails. It said 8
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
  returnTo,
  passwordMode = "enabled",
}: {
  /** Already sanitised by the page; where the viewer was going (D19). */
  returnTo?: string;
  passwordMode?: PasswordMode;
}) {
  usePurgeUserCachesOnMount();
  if (passwordMode !== "enabled") return <SocialSignUp returnTo={returnTo} />;
  return <PasswordSignUp returnTo={returnTo} />;
}

function SocialSignUp({ returnTo }: { returnTo?: string }) {
  return (
    <AuthPage>
      <AuthPanel>
        <SignUpHead returnTo={returnTo} />
        <WordDivider />
        <SignInInstead returnTo={returnTo} />
      </AuthPanel>
    </AuthPage>
  );
}

function PasswordSignUp({ returnTo }: { returnTo?: string }) {
  const destination = returnTo ?? HOME_PATH;
  const { land, landing } = useLanding(destination);
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    run,
    pending: requesting,
    error,
  } = useAuthAction(authClient.signUp.email);
  // Through the request and on until the next page commits (X01).
  const pending = requesting || landing;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLocalError(null);
      const form = new FormData(event.currentTarget);
      const password = String(form.get("password") ?? "");
      if (password.length < MIN_PASSWORD_LENGTH) {
        feedback("refuse");
        setLocalError(`Needs ${MIN_PASSWORD_LENGTH} or more characters`);
        return;
      }
      const email = String(form.get("email") ?? "");
      const name = String(form.get("name") ?? "").trim();
      if (EMAIL_SHAPED.test(name)) {
        feedback("refuse");
        setLocalError("Friends see your name, so it can't be an email");
        return;
      }
      // Blank stays blank: the server gives a neutral handle. It used to send
      // the email here, which made every such address public (W4 security F2).
      await run({ email, password, name }, land);
    },
    [run, land],
  );

  const formError = localError ?? error?.message ?? null;

  return (
    <AuthPage>
      <AuthPanel>
        <SignUpHead returnTo={returnTo} busy={pending} />
        <WordDivider>or</WordDivider>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <AuthField
            id="sign-up-name"
            label="Name"
            optional
            name="name"
            autoComplete="nickname"
            disabled={pending}
            description="Friends see this, never your email"
          />
          <AuthField
            id="sign-up-email"
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            invalid={formError !== null}
            disabled={pending}
          />
          <AuthField
            id="sign-up-password"
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            invalid={formError !== null}
            message={formError}
            description={`${MIN_PASSWORD_LENGTH} or more characters`}
            disabled={pending}
          />
          <Button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className="mt-1"
          >
            {pending && <Spinner aria-hidden />}
            Create account
          </Button>
        </form>
        <SignInInstead returnTo={returnTo} />
      </AuthPanel>
    </AuthPage>
  );
}
