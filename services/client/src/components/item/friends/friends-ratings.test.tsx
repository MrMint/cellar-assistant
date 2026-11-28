/**
 * F-154 (Cellars-Pour "Friends' ratings"): the taste header's Friends cell
 * opens a sheet of each friend's score, rather than linking down the page.
 *
 * urql is stood in for: `Item.friendsReviews` answers your two friends'
 * reviews (H-127: the server picks the friends, so the sheet makes one read
 * and joins nothing).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/beers/i-1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const review = (id: string, userId: string, name: string, score: number) => ({
  node: {
    __typename: "ItemReview",
    id,
    score,
    userId,
    user: {
      __typename: "UserProfile",
      id: userId,
      displayName: name,
      avatarUrl: null,
    },
  },
});
const queried: string[] = [];
mock.module("urql", () => ({
  useQuery: ({
    query,
    pause,
  }: {
    query: { definitions: { name?: { value: string } }[] };
    pause?: boolean;
  }) => {
    const name = query.definitions[0]?.name?.value ?? "";
    if (!pause) queried.push(name);
    const data =
      pause === true
        ? undefined
        : {
            item: {
              __typename: "QueryItemSuccess",
              data: {
                __typename: "Beer",
                id: "i-1",
                friendsReviews: {
                  totalCount: 2,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  edges: [
                    review("r-1", "u-ana", "Ana", 3.5),
                    review("r-3", "u-ben", "Ben", 4.5),
                  ],
                },
              },
            },
          };
    return [{ data, fetching: false }, () => {}];
  },
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
  }),
  usePathname: () => "/beers/i-1",
  useSearchParams: () => new URLSearchParams(),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { TasteHeader } = await import("../TasteHeader");
const { friendRatingRows } = await import("./friends-ratings");

let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  queried.length = 0;
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const cells = [
  {
    key: "you",
    label: "You",
    value: 4,
    note: "your rating",
    href: "#your-review",
  },
  {
    key: "friends",
    label: "Friends",
    value: 4,
    note: "2 friends",
    href: "#reviews",
  },
  {
    key: "everyone",
    label: "Everyone",
    value: 4.3,
    note: "3 ratings",
    href: "#reviews",
  },
] as const;

describe("friendRatingRows", () => {
  test("best first, then by name, each to the friend's profile", () => {
    const rows = friendRatingRows([
      review("r-1", "u-ana", "Ana", 3.5).node,
      review("r-2", "u-cat", "Cat", 4.5).node,
      review("r-3", "u-ben", "Ben", 4.5).node,
    ]);
    assert.deepEqual(
      rows.map((row) => [row.name, row.score, row.href]),
      [
        ["Ben", 4.5, "/users/u-ben"],
        ["Cat", 4.5, "/users/u-cat"],
        ["Ana", 3.5, "/users/u-ana"],
      ],
    );
  });

  test("a review whose author the read could not show is left out", () => {
    assert.deepEqual(
      friendRatingRows([
        { ...review("r-1", "u-ana", "Ana", 3.5).node, user: null },
      ]),
      [],
    );
  });
});

describe("the Friends cell (F-154)", () => {
  test("opens the Friends' ratings sheet with each friend's score", async () => {
    await act(async () => {
      root.render(<TasteHeader cells={cells} itemId="i-1" itemType="BEER" />);
      await settle();
    });
    // Nothing is read until the sheet is asked for.
    assert.deepEqual(queried, []);
    const cell = document.querySelector<HTMLElement>('[data-cell="friends"]');
    assert.ok(cell, "no Friends cell");
    assert.equal(cell.tagName, "BUTTON");
    await act(async () => {
      cell.click();
      await settle();
    });
    const sheet = [...document.querySelectorAll('[role="dialog"]')].find((el) =>
      /Friends’ ratings/.test(el.textContent ?? ""),
    );
    assert.ok(sheet, "no Friends’ ratings sheet");
    const rows = [...sheet.querySelectorAll("a")].map((a) => [
      a.textContent
        ?.match(/(Ana|Ben|Zed)(\d\.\d)$/)
        ?.slice(1)
        .join(" "),
      a.getAttribute("href"),
    ]);
    assert.deepEqual(rows, [
      ["Ben 4.5", "/users/u-ben"],
      ["Ana 3.5", "/users/u-ana"],
    ]);
    // H-127: one read, `Item.friendsReviews`, not a join of two capped ones.
    assert.deepEqual([...new Set(queried)], ["ItemFriendsRatings"]);
  });

  test("with no friends' ratings the cell stays a quiet dash, not a button", async () => {
    await act(async () => {
      root.render(
        <TasteHeader
          cells={[
            cells[0],
            { ...cells[1], value: null, note: "No friends' ratings" },
            cells[2],
          ]}
          itemId="i-1"
          itemType="BEER"
        />,
      );
      await settle();
    });
    assert.notEqual(
      document.querySelector('[data-cell="friends"]')?.tagName,
      "BUTTON",
    );
  });
});
