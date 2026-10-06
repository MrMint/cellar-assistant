/**
 * `AUTH_PASSWORD_MODE` — which sign-in controls `/sign-in` and `/sign-up`
 * render. The authority is the actor host, which reads the same variable
 * (`services/actors/src/auth/config.ts`) and refuses whatever its mode does
 * not allow; this only decides what the page offers, so a mismatch fails
 * closed rather than open.
 *
 *   - `enabled` — email/password sign-up and sign-in beside the social
 *     buttons. The default when unset, so the development lanes need nothing.
 *   - `signin-only` — social buttons first; a collapsed password form for
 *     existing password users on `/sign-in`; social only on `/sign-up`.
 *   - `disabled` — social buttons only, plus a line telling former password
 *     users how to keep their account.
 *
 * SERVER-ONLY. Not `NEXT_PUBLIC_*`, on purpose: it is read per request by the
 * page server components and handed down as a prop, so changing it on Vercel
 * takes a redeploy of nothing but the environment, and the actor host and this
 * app are configured by one name. In a client component `process.env` would
 * not carry it and this would always say `enabled`.
 */
export const PASSWORD_MODES = ["enabled", "signin-only", "disabled"] as const;

export type PasswordMode = (typeof PASSWORD_MODES)[number];

/**
 * Unset or empty means `enabled`. An unrecognised value — which the actor host
 * refuses to boot on — renders as `disabled`, the mode that offers the least,
 * and says so in the server log.
 */
export const readPasswordMode = (
  environment: Record<string, string | undefined> = process.env,
): PasswordMode => {
  const raw = environment.AUTH_PASSWORD_MODE;
  if (raw === undefined || raw === "") return "enabled";
  const mode = PASSWORD_MODES.find((m) => m === raw);
  if (mode !== undefined) return mode;
  console.error(
    `[auth] AUTH_PASSWORD_MODE=${JSON.stringify(raw)} is not one of ${PASSWORD_MODES.join(", ")}; rendering sign-in as "disabled".`,
  );
  return "disabled";
};
