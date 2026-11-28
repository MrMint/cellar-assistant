import { describe, expect, test } from "bun:test";
import {
  type SeenAtRow,
  seenAtDistance,
  seenAtRows,
  seenAtView,
  seenAtWhy,
} from "./seen-at";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const row = (over: Partial<SeenAtRow>): SeenAtRow => ({
  place: { id: "p" },
  placeName: "Bar",
  kind: "MENU",
  at: null,
  friendName: null,
  distanceMeters: null,
  ...over,
});

describe("L10 · Seen at wording", () => {
  test("a menu says when it was scanned", () => {
    expect(seenAtWhy(row({ at: "2026-11-18T12:00:00Z" }), NOW)).toBe(
      "On the menu · scanned 4 days ago",
    );
    expect(seenAtWhy(row({ at: "2026-11-18T12:00:00Z" }), null)).toBe(
      "On the menu",
    );
  });

  test("a log says whose and which month, a friend by first name", () => {
    expect(
      seenAtWhy(row({ kind: "OWN_LOG", at: "2026-08-03T00:00:00Z" }), NOW),
    ).toBe("You had it here · Aug");
    expect(
      seenAtWhy(
        row({
          kind: "FRIEND_LOG",
          friendName: "Maya Lind",
          at: "2025-10-03T00:00:00Z",
        }),
        NOW,
      ),
    ).toBe("Maya had it here · Oct 2025");
    expect(seenAtWhy(row({ kind: "FRIEND_LOG" }), NOW)).toBe(
      "A friend had it here",
    );
  });

  test("distance reads in metres, then tenths of a km, then km", () => {
    expect(seenAtDistance(null)).toBeNull();
    expect(seenAtDistance(3)).toBe("10 m");
    expect(seenAtDistance(84)).toBe("80 m");
    // E-9: a short walk reads in metres, not "0.1 km"; the board's 620 m
    // is still "0.6 km".
    expect(seenAtDistance(111)).toBe("110 m");
    expect(seenAtDistance(484)).toBe("480 m");
    expect(seenAtDistance(620)).toBe("0.6 km");
    expect(seenAtDistance(6240)).toBe("6.2 km");
    expect(seenAtDistance(12_400)).toBe("12 km");
  });

  test("anything but a success is nothing to show", () => {
    expect(seenAtRows(undefined)).toEqual([]);
    expect(
      seenAtRows({ item: { __typename: "NotFoundError" } } as never),
    ).toEqual([]);
  });
});

describe("W-15 · what the Seen at slot shows", () => {
  const answer = (rows: SeenAtRow[]) =>
    ({
      item: {
        __typename: "QueryItemSuccess",
        data: {
          __typename: "Wine",
          id: "i",
          seenAt: {
            totalCount: rows.length,
            edges: rows.map((node) => ({ node })),
          },
        },
      },
    }) as unknown as Parameters<typeof seenAtView>[0];

  test("places: the list (and its prompt)", () => {
    expect(seenAtView(answer([row({})]), true)).toBe("list");
    expect(seenAtView(answer([row({})]), false)).toBe("list");
  });
  test("no places, menu scanning offered: the prompt alone", () => {
    expect(seenAtView(answer([]), true)).toBe("prompt");
  });
  test("nothing to show and nothing the viewer can do: nothing (M4)", () => {
    expect(seenAtView(answer([]), false)).toBe("none");
  });
  test("no answer yet, or a refusal: nothing", () => {
    expect(seenAtView(undefined, true)).toBe("none");
    expect(
      seenAtView(
        {
          item: { __typename: "NotFoundError" },
        } as unknown as Parameters<typeof seenAtView>[0],
        true,
      ),
    ).toBe("none");
  });
});
