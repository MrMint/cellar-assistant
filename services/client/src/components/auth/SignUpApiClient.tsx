"use client";

/**
 * Sign-up against **better-auth**. See `SignInApiClient` for the mechanism —
 * this is the same shape with one call.
 *
 * better-auth signs the new user in as part of `sign-up/email`, so there is no
 * second call and no "check your email" state to model here — A6 leaves email
 * verification off in development.
 */

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useState } from "react";
import { Link } from "@/components/app/Link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { usePurgeUserCachesOnMount } from "@/hooks/usePurgeUserCachesOnMount";
import { authClient, useAuthAction } from "@/lib/api/auth-client";
import type { PasswordMode } from "@/lib/auth/password-mode";
import { withReturnTo } from "@/utilities/sanitize-return-to";
import { AuthField, AuthPage, AuthPanel, WordDivider } from "./AuthCard";
import { SocialButtons, useSocialSignIn } from "./SocialButtons";

/** "Already have an account? Sign in", under both versions of the form. */
function SignInInstead({ returnTo }: { returnTo?: string }) {
  return (
    <p className="type-callout text-ink-2">
      Already have an account?{" "}
      <Link
        href={withReturnTo("/sign-in", returnTo)}
        underline="always"
        className="text-ink-1"
      >
        Sign in
      </Link>
    </p>
  );
}

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
  const { ssoError, redirectingTo, start } = useSocialSignIn(
    returnTo ?? "/cellars",
  );
  return (
    <AuthPage>
      <AuthPanel>
        <div className="flex flex-col gap-4">
          <h1 className="type-title-2">Sign up for Cellar Assistant</h1>
          <div className="flex flex-col gap-2">
            <SocialButtons
              busy={redirectingTo !== null}
              redirectingTo={redirectingTo}
              ssoError={ssoError}
              onSelect={(provider) => void start(provider)}
            />
          </div>
          <WordDivider />
          <SignInInstead returnTo={returnTo} />
        </div>
      </AuthPanel>
    </AuthPage>
  );
}

function PasswordSignUp({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const destination = returnTo ?? "/cellars";
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
      router.replace(destination);
      router.refresh();
    },
    [run, router, destination],
  );

  const formError = localError ?? error?.message ?? null;

  return (
    <AuthPage>
      <AuthPanel>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h1 className="type-title-2">Sign up for Cellar Assistant</h1>
          <AuthField
            id="sign-up-name"
            label="Display name"
            name="name"
            autoComplete="nickname"
            placeholder="Optional"
            disabled={pending}
            description="Shown to other users. Leave it blank and you'll get a neutral handle you can change later — your email is never shown."
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
            disabled={pending}
          />
          <Button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className="mt-2"
          >
            {pending && <Spinner aria-hidden />}
            Sign up
          </Button>
          <WordDivider />
          <SignInInstead returnTo={returnTo} />
        </form>
      </AuthPanel>
    </AuthPage>
  );
}
