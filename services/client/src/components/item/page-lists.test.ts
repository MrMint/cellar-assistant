/**
 * The item and bottle pages' lists are read to the end, as the old pages'
 * unbounded Hasura relationships were (parity gap #8): the follow-up reads
 * page with `after`, merge in order, and a failed follow-up keeps the rows
 * already read.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { DocumentNode } from "graphql";
import {
  allAddableCellars,
  allFriends,
  allItemBrands,
  allItemCellars,
  type PageQuery,
} from "./page-lists";

type Call = { operation: string; variables: Record<string, unknown> };

/** A fake `apiServerQuery`: answers by operation name, records each call. */
const fakeQuery = (
  answer: (call: Call) => unknown,
): { query: PageQuery; calls: Call[] } => {
  const calls: Call[] = [];
  const query = (async (document: DocumentNode, variables = {}) => {
    const definition = document.definitions.find(
      (node) => node.kind === "OperationDefinition",
    );
    const operation =
      definition !== undefined && "name" in definition
        ? (definition.name?.value ?? "")
        : "";
    const call = { operation, variables: variables as Record<string, unknown> };
    calls.push(call);
    return answer(call);
  }) as unknown as PageQuery;
  return { query, calls };
};

const brandEdge = (id: string) => ({
  node: {
    __typename: "ItemBrand",
    id: `ib-${id}`,
    isPrimary: id === "1",
    brand: {
      __typename: "Brand",
      id,
      name: `Brand ${id}`,
      brandType: "winery",
      logoUrl: null,
    },
  },
});

const profile = (id: string) => ({
  __typename: "UserProfile",
  id,
  displayName: `User ${id}`,
  avatarUrl: null,
});

describe("allItemBrands", () => {
  test("pages past the first 100 with after, in order", async () => {
    const { query, calls } = fakeQuery(({ variables }) => ({
      item: {
        __typename: "QueryItemSuccess",
        data: {
          __typename: "Wine",
          id: "w",
          brands:
            variables.after === "c1"
              ? {
                  pageInfo: { hasNextPage: true, endCursor: "c2" },
                  edges: [brandEdge("2")],
                }
              : {
                  pageInfo: { hasNextPage: false, endCursor: "c3" },
                  edges: [brandEdge("3")],
                },
        },
      },
    }));
    const data = {
      brands: {
        pageInfo: { hasNextPage: true, endCursor: "c1" },
        edges: [brandEdge("1")],
      },
    };
    const brands = await allItemBrands(query, data as never, {
      itemId: "w",
      type: "WINE",
    });
    assert.deepEqual(
      brands.map((brand) => brand.brand.name),
      ["Brand 1", "Brand 2", "Brand 3"],
    );
    assert.equal(brands[0]?.is_primary, true);
    assert.deepEqual(
      calls.map((call) => [call.operation, call.variables.after]),
      [
        ["ItemBrandsPage", "c1"],
        ["ItemBrandsPage", "c2"],
      ],
    );
    assert.deepEqual(calls[0]?.variables, {
      itemId: "w",
      type: "WINE",
      after: "c1",
    });
  });

  test("a whole first page makes no follow-up read", async () => {
    const { query, calls } = fakeQuery(() => {
      throw new Error("should not be called");
    });
    const brands = await allItemBrands(
      query,
      {
        brands: {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [brandEdge("1")],
        },
      } as never,
      { itemId: "w", type: "WINE" },
    );
    assert.equal(brands.length, 1);
    assert.equal(calls.length, 0);
  });

  test("a typed error on a follow-up keeps the brands already read", async () => {
    const { query } = fakeQuery(() => ({
      item: { __typename: "NotFoundError", code: "NOT_FOUND", message: "x" },
    }));
    const brands = await allItemBrands(
      query,
      {
        brands: {
          pageInfo: { hasNextPage: true, endCursor: "c1" },
          edges: [brandEdge("1")],
        },
      } as never,
      { itemId: "w", type: "WINE" },
    );
    assert.deepEqual(
      brands.map((brand) => brand.brand.id),
      ["1"],
    );
  });
});

describe("allItemCellars", () => {
  test("a cellar with more than 20 co-owners reads the rest; others do not", async () => {
    const { query, calls } = fakeQuery(({ variables }) => ({
      cellar: {
        __typename: "Cellar",
        id: variables.cellarId,
        coOwners: {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [{ node: profile("late") }],
        },
      },
    }));
    const data = {
      cellars: {
        totalCount: 2,
        edges: [
          {
            node: {
              id: "c-big",
              name: "Big",
              createdById: "me",
              createdBy: profile("me"),
              coOwners: {
                pageInfo: { hasNextPage: true, endCursor: "k20" },
                edges: [{ node: profile("early") }],
              },
            },
          },
          {
            node: {
              id: "c-small",
              name: "Small",
              createdById: "me",
              createdBy: profile("me"),
              coOwners: {
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: [],
              },
            },
          },
        ],
      },
      tierListEntries: { totalCount: 0, edges: [] },
    };
    const { cellars, total } = await allItemCellars(query, data as never);
    assert.equal(total, 2);
    assert.deepEqual(
      cellars.map((cellar) => [
        cellar.name,
        cellar.co_owners.map((user) => user.id),
      ]),
      [
        ["Big", ["early", "late"]],
        ["Small", []],
      ],
    );
    assert.deepEqual(
      calls.map((call) => [call.operation, call.variables]),
      [["CellarCoOwnersPage", { cellarId: "c-big", after: "k20" }]],
    );
  });
});

describe("allAddableCellars and allFriends", () => {
  test("the viewer's cellars past 100, still filtered to ones they may add to", async () => {
    const { query } = fakeQuery(() => ({
      myCellars: {
        __typename: "CellarConnection",
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [
          {
            node: {
              id: "c101",
              name: "Co-owned",
              createdById: "someone",
              coOwnerIds: ["me"],
            },
          },
          {
            node: {
              id: "c102",
              name: "Just visible",
              createdById: "someone",
              coOwnerIds: [],
            },
          },
        ],
      },
    }));
    const cellars = await allAddableCellars(
      query,
      {
        pageInfo: { hasNextPage: true, endCursor: "m100" },
        edges: [
          {
            node: { id: "c1", name: "Mine", createdById: "me", coOwnerIds: [] },
          },
        ],
      },
      "me",
    );
    assert.deepEqual(
      cellars.map((cellar) => cellar.id),
      ["c1", "c101"],
    );
  });

  test("every friend for the bulk check-in picker", async () => {
    const { query, calls } = fakeQuery(() => ({
      myFriends: {
        __typename: "FriendConnection",
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [{ node: { user: profile("f101") } }],
      },
    }));
    const friends = await allFriends(query, {
      pageInfo: { hasNextPage: true, endCursor: "f100" },
      edges: [{ node: { user: profile("f1") } }],
    });
    assert.deepEqual(
      friends.map((friend) => [friend.id, friend.avatarUrl]),
      [
        ["f1", ""],
        ["f101", ""],
      ],
    );
    assert.deepEqual(calls[0], {
      operation: "BottleFriendsPage",
      variables: { after: "f100" },
    });
  });
});
