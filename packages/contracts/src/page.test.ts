import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors.ts";
import {
  DEFAULT_PAGE_SIZE,
  emptyPage,
  keysetPage,
  MAX_PAGE_SIZE,
  mapPage,
  offsetCursor,
  offsetPage,
  pageArgs,
  parseOffsetCursor,
} from "./page.ts";

describe("pageArgs (§1.5: there is no unbounded read)", () => {
  it("defaults to a bounded page", () => {
    expect(pageArgs()).toEqual({ first: DEFAULT_PAGE_SIZE, after: null });
    expect(pageArgs({})).toEqual({ first: DEFAULT_PAGE_SIZE, after: null });
  });

  it("rejects an over-large page rather than silently clamping", () => {
    expect(() => pageArgs({ first: MAX_PAGE_SIZE + 1 })).toThrow(
      ValidationError,
    );
  });

  it("rejects a non-positive or fractional page size", () => {
    expect(() => pageArgs({ first: 0 })).toThrow(ValidationError);
    expect(() => pageArgs({ first: -3 })).toThrow(ValidationError);
    expect(() => pageArgs({ first: 1.5 })).toThrow(ValidationError);
  });
});

describe("offsetPage (search actors' capped in-memory result set)", () => {
  const all = ["a", "b", "c", "d", "e"];

  it("pages forward and reports both flags", () => {
    const first = offsetPage(all, pageArgs({ first: 2 }));
    expect(first.entries.map((e) => e.node)).toEqual(["a", "b"]);
    expect(first).toMatchObject({
      hasNextPage: true,
      hasPreviousPage: false,
      totalCount: 5,
    });

    const cursor = first.entries[1]?.cursor ?? null;
    const second = offsetPage(all, pageArgs({ first: 2, after: cursor }));
    expect(second.entries.map((e) => e.node)).toEqual(["c", "d"]);
    expect(second).toMatchObject({ hasNextPage: true, hasPreviousPage: true });

    const third = offsetPage(
      all,
      pageArgs({ first: 2, after: second.entries[1]?.cursor }),
    );
    expect(third.entries.map((e) => e.node)).toEqual(["e"]);
    expect(third.hasNextPage).toBe(false);
  });

  it("rejects a cursor it did not mint", () => {
    expect(() =>
      offsetPage(all, pageArgs({ after: "uuid-from-elsewhere" })),
    ).toThrow(ValidationError);
    expect(() => parseOffsetCursor("offset:-1")).toThrow(ValidationError);
    expect(parseOffsetCursor(offsetCursor(7))).toBe(7);
  });

  it("rejects the shapes Number() would have coerced", () => {
    // Number("") is 0, Number(" 3") is 3 and Number("1e1") is 10, so a guard
    // written as `Number.isInteger(Number(rest))` accepted all three. None was
    // ever minted by `offsetCursor`, and the damage was silent: `offset:` parsed
    // as 0, which `offsetPage` treats as "after index 0" and starts the page at
    // the SECOND row. A caller lost the first result with no error anywhere.
    for (const bogus of [
      "offset:",
      "offset: 3",
      "offset:3 ",
      "offset:1e1",
      "offset:0x2",
      "offset:+3",
      "offset:3.0",
      "offset:Infinity",
      "offset:NaN",
    ]) {
      expect(() => parseOffsetCursor(bogus), bogus).toThrow(ValidationError);
    }

    // Beyond Number.MAX_SAFE_INTEGER a cursor no longer round-trips.
    expect(() => parseOffsetCursor("offset:99999999999999999999")).toThrow(
      ValidationError,
    );

    // The shapes it does mint still parse, including zero.
    expect(parseOffsetCursor(offsetCursor(0))).toBe(0);
    expect(parseOffsetCursor(offsetCursor(42))).toBe(42);
  });

  it("does not silently drop the first row for a malformed cursor", () => {
    // The observable consequence of the bug above, pinned end to end.
    expect(() => offsetPage(all, pageArgs({ after: "offset:" }))).toThrow(
      ValidationError,
    );
  });

  it("returns an empty page for an empty set", () => {
    expect(offsetPage([], pageArgs())).toEqual(emptyPage());
  });
});

describe("keysetPage (entity and collection actors)", () => {
  const rows = [{ id: "1" }, { id: "2" }, { id: "3" }];

  it("drops the limit(first + 1) probe row and reports hasNextPage", () => {
    const page = keysetPage(rows, pageArgs({ first: 2 }), (row) => row.id);
    expect(page.entries).toEqual([
      { cursor: "1", node: { id: "1" } },
      { cursor: "2", node: { id: "2" } },
    ]);
    expect(page.hasNextPage).toBe(true);
    expect(page.totalCount).toBeNull();
  });

  it("has no next page when the probe row is absent", () => {
    const page = keysetPage(rows, pageArgs({ first: 3 }), (row) => row.id, 3);
    expect(page.hasNextPage).toBe(false);
    expect(page.totalCount).toBe(3);
  });
});

describe("mapPage", () => {
  it("hydrates nodes without disturbing cursors", () => {
    const ids = offsetPage(["x", "y"], pageArgs());
    const hydrated = mapPage(ids, (id) => ({ id }));
    expect(hydrated.entries).toEqual([
      { cursor: "offset:0", node: { id: "x" } },
      { cursor: "offset:1", node: { id: "y" } },
    ]);
  });
});
