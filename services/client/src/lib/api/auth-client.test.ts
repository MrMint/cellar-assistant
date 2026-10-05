import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { authClient } from "./auth-client.ts";

/**
 * W4 security F2: a sign-up with no display name sent the email address as
 * the name, and a display name is shown to every signed-in user.
 */
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const captureSignUpBody = async (
  input: Parameters<typeof authClient.signUp.email>[0],
): Promise<Record<string, unknown>> => {
  let body: unknown;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ token: "t", user: {} });
  }) as typeof fetch;
  await authClient.signUp.email(input);
  return body as Record<string, unknown>;
};

test("sign-up without a name sends an empty name, never the email", async () => {
  const body = await captureSignUpBody({
    email: "jane@example.com",
    password: "123456789",
  });
  assert.equal(body.name, "");
  assert.ok(!JSON.stringify(body.name).includes("@"));
});

test("sign-up with a name sends that name", async () => {
  const body = await captureSignUpBody({
    email: "jane@example.com",
    password: "123456789",
    name: "Jane",
  });
  assert.equal(body.name, "Jane");
});
