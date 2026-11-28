/**
 * `/users/<id>/compare` (F-56, FR-7, L11): a friend gets the compare view; a
 * non-friend gets the locked state, with no "You and …", no kind chips and
 * no agreement read at all; an id that names nobody is a 404.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

const asked: string[] = [];
let friend = true;
let exists = true;

const operation = (document: {
  definitions?: { kind?: string; name?: { value?: string } }[];
}) =>
  document.definitions?.find((d) => d.kind === "OperationDefinition")?.name
    ?.value ?? "";

const user = {
  __typename: "UserProfile",
  id: "u-2",
  displayName: "Test Two",
  avatarUrl: null,
};
const notFoundError = {
  __typename: "NotFoundError",
  code: "NOT_FOUND",
  message: "not shared",
};

mock.module("@/lib/api/urql-server", () => ({
  apiServerQuery: async (document: Parameters<typeof operation>[0]) => {
    const name = operation(document);
    asked.push(name);
    if (name === "Friendship") {
      return {
        friendProfile: friend
          ? { __typename: "FriendProfile", id: "f-1", user }
          : notFoundError,
      };
    }
    if (name === "Person") return { user: exists ? user : notFoundError };
    throw new Error(`unexpected ${name}`);
  },
}));
mock.module("@/utilities/auth-server", () => ({
  getServerUser: async () => ({ id: "u-1" }),
}));
mock.module("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (href: string) => {
    throw new Error(`REDIRECT ${href}`);
  },
  useRouter: () => ({ push: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => "/users/u-2/compare",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("@/components/taste/compare/CompareView", () => ({
  CompareView: ({ name }: { name: string }) => (
    <div data-test="compare-view">{name}</div>
  ),
}));
mock.module("@/components/profile/LockedProfile", () => ({
  LockedProfile: ({ person }: { person: { name: string } }) => (
    <div data-test="locked">{person.name}</div>
  ),
}));
mock.module("@/components/app/AppBar", () => ({
  AppBar: ({ title }: { title?: string }) => <h1>{title}</h1>,
}));

const { default: ComparePage } = await import("./page");

const render = async () =>
  renderToStaticMarkup(
    await ComparePage({ params: Promise.resolve({ userId: "u-2" }) }),
  );

beforeEach(() => {
  asked.length = 0;
  friend = true;
  exists = true;
});

describe("/users/<id>/compare", () => {
  test("a friend gets You and … over the compare view", async () => {
    const html = await render();
    assert.match(html, /You and Test/);
    assert.match(html, /data-test="compare-view"/);
    assert.doesNotMatch(html, /data-test="locked"/);
    assert.deepEqual(asked, ["Friendship"]);
  });

  test("a non-friend gets the locked state and nothing of the compare", async () => {
    friend = false;
    const html = await render();
    assert.match(html, /data-test="locked"/);
    assert.doesNotMatch(html, /compare-view/);
    assert.doesNotMatch(html, /You and/);
    assert.deepEqual(asked, ["Friendship", "Person"]);
  });

  test("an id that names nobody is a 404", async () => {
    friend = false;
    exists = false;
    await assert.rejects(render(), /NOT_FOUND/);
  });
});
