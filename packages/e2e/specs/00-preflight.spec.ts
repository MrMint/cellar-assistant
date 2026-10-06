import { expect, test } from "@playwright/test";
import { ACCOUNTS, BASE_URL } from "../fixtures/accounts.ts";
import { deleteCellars } from "../fixtures/data.ts";

/**
 * Is the environment the rest of the suite assumes actually there?
 *
 * Run this first and read it first. Every other browser spec depends on a
 * served client, `services/api`, `services/actors` and a database holding the
 * two test accounts; when one of those is missing, twelve specs fail with twelve
 * different-looking errors and none of them says why. These four say why.
 */

test("the client is serving", async ({ request }) => {
  const res = await request.get("/sign-in");
  expect(
    res.status(),
    "nothing is serving the client on 3000 — bring up the containerized `client` service (`bun run stack:up`), or run `bun run dev` yourself",
  ).toBe(200);
});

test("services/api answers GraphQL", async ({ request }) => {
  const res = await request.post("/api/graphql", {
    headers: { origin: BASE_URL, "content-type": "application/json" },
    data: { query: "{ __typename }" },
  });
  expect(
    res.status(),
    "the /api/graphql proxy is not reaching services/api",
  ).toBe(200);
  expect(await res.json()).toMatchObject({ data: { __typename: "Query" } });
});

test("both test accounts can sign in", async ({ request }) => {
  for (const account of Object.values(ACCOUNTS)) {
    const res = await request.post("/api/auth/sign-in/email", {
      headers: { origin: BASE_URL, "content-type": "application/json" },
      data: { email: account.email, password: account.password },
    });
    expect(
      res.status(),
      `${account.email} cannot sign in: ${(await res.text()).slice(0, 200)}`,
    ).toBe(200);
  }
});

/**
 * The accounts must exist on **both** sides of the identity split.
 *
 * better-auth authenticates against its own tables; the domain schema's foreign
 * keys point at the identity table in the domain database. While X2 is only
 * half-applied those can be two different places, and the symptom is brutal:
 * sign-in and every read work perfectly, and every *write* fails inside its
 * actor with a foreign-key violation that never reaches the browser as anything
 * but "Unexpected error".
 */
test("the signed-in viewer can be written as an owner", async ({ request }) => {
  const signIn = await request.post("/api/auth/sign-in/email", {
    headers: { origin: BASE_URL, "content-type": "application/json" },
    data: {
      email: ACCOUNTS.primary.email,
      password: ACCOUNTS.primary.password,
    },
  });
  expect(signIn.status()).toBe(200);

  const res = await request.post("/api/graphql", {
    headers: { origin: BASE_URL, "content-type": "application/json" },
    data: {
      query: `mutation Probe($input: CreateCellarInput!) {
        createCellar(input: $input) {
          __typename
          ... on Cellar { id }
          ... on Error { message }
        }
      }`,
      variables: {
        input: { name: `E2 preflight ${Date.now()}`, privacy: "PRIVATE" },
      },
    },
  });
  const body = await res.json();
  expect(
    body.errors,
    "createCellar raised a top-level error — check the actor host log for a foreign-key violation against the identity table",
  ).toBeUndefined();
  expect(body.data.createCellar.__typename, JSON.stringify(body.data)).toBe(
    "Cellar",
  );
  // A probe, not a fixture: remove it, or every run adds one more cellar to
  // the account's `myCellars` fan-out (`deleteCellars`' doc).
  await deleteCellars("primary", [body.data.createCellar.id]);
});
