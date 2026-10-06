/**
 * `/sign-in` and `/sign-up` in each `AUTH_PASSWORD_MODE`. The social buttons
 * keep the production markup (`82450ad1:src/components/auth/SignInClient.tsx`)
 * in every mode; what changes is whether a password form is offered.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/sign-in",
  useSearchParams: () => new URLSearchParams(),
}));

const { SignInApiClient } = await import("./SignInApiClient");
const { SignUpApiClient } = await import("./SignUpApiClient");
const { FORMER_PASSWORD_USER_NOTE } = await import("./SocialButtons");
const { readPasswordMode } = await import("@/lib/auth/password-mode");

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

const SOCIAL = [
  "Continue with Google",
  "Continue with Discord",
  "Continue with Facebook",
];

const assertSocialButtons = (html: string) => {
  for (const label of SOCIAL) assert.ok(html.includes(label), label);
  // The production button: soft, neutral, full width.
  const buttons = html.match(/<button[^>]*>/g) ?? [];
  const social = buttons.filter((b) => b.includes("MuiButton-variantSoft"));
  assert.equal(social.length, 3);
  for (const b of social) {
    assert.ok(b.includes("MuiButton-colorNeutral"), b);
    assert.ok(b.includes("MuiButton-fullWidth"), b);
  }
};

const hasPasswordInput = (html: string) => html.includes('type="password"');
const note = FORMER_PASSWORD_USER_NOTE;

describe("readPasswordMode", () => {
  test("unset or empty is enabled, so dev needs no change", () => {
    assert.equal(readPasswordMode({}), "enabled");
    assert.equal(readPasswordMode({ AUTH_PASSWORD_MODE: "" }), "enabled");
  });
  test("reads each mode", () => {
    for (const mode of ["enabled", "signin-only", "disabled"] as const) {
      assert.equal(readPasswordMode({ AUTH_PASSWORD_MODE: mode }), mode);
    }
  });
  test("an unknown value renders as disabled — the mode that offers least", () => {
    const original = console.error;
    console.error = () => {};
    try {
      assert.equal(
        readPasswordMode({ AUTH_PASSWORD_MODE: "false" }),
        "disabled",
      );
    } finally {
      console.error = original;
    }
  });
});

describe("sign-in page", () => {
  test("enabled (default): social buttons, an 'or' divider, the password form", () => {
    const html = render(<SignInApiClient />);
    assertSocialButtons(html);
    assert.ok(html.includes(">or<"));
    assert.ok(hasPasswordInput(html));
    assert.ok(html.includes('type="email"'));
    assert.ok(html.includes("New to Cellar Assistant?"));
    assert.ok(html.includes('href="/sign-up"'));
    assert.ok(!html.includes(note));
    assert.ok(!html.includes("Sign in with your password"));
  });

  test("signin-only: social buttons first, password form collapsed behind a toggle", () => {
    const html = render(<SignInApiClient passwordMode="signin-only" />);
    assertSocialButtons(html);
    assert.ok(!hasPasswordInput(html), "the form starts collapsed");
    const toggle = html.indexOf("Sign in with your password");
    assert.ok(toggle > html.indexOf("Continue with Facebook"));
    assert.match(
      html,
      /aria-expanded="false"[^>]*>Sign in with your password</,
    );
    assert.ok(!html.includes(note));
  });

  test("disabled: social buttons and the note for former password users, no form", () => {
    const html = render(<SignInApiClient passwordMode="disabled" />);
    assertSocialButtons(html);
    assert.ok(!hasPasswordInput(html));
    assert.ok(!html.includes('type="email"'));
    assert.ok(!html.includes(">or<"));
    assert.ok(!html.includes("Sign in with your password"));
    assert.ok(html.includes(note));
    assert.ok(!/forgot/i.test(html));
  });
});

describe("sign-up page", () => {
  test("enabled (default): the password sign-up form, no social buttons", () => {
    const html = render(<SignUpApiClient />);
    assert.ok(html.includes("Sign up for Cellar Assistant"));
    assert.ok(hasPasswordInput(html));
    assert.ok(html.includes("Display name"));
    for (const label of SOCIAL) assert.ok(!html.includes(label));
  });

  for (const mode of ["signin-only", "disabled"] as const) {
    test(`${mode}: social buttons only`, () => {
      const html = render(<SignUpApiClient passwordMode={mode} />);
      assert.ok(html.includes("Sign up for Cellar Assistant"));
      assertSocialButtons(html);
      assert.ok(!hasPasswordInput(html));
      assert.ok(!html.includes('type="email"'));
      assert.ok(!html.includes("Display name"));
      assert.ok(html.includes('href="/sign-in"'));
    });
  }
});
