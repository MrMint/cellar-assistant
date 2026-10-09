import { describe, expect, it } from "vitest";
import { bottleMatchesStatus, orderOwnBottles } from "./cellars.ts";

const bottle = (
  id: string,
  over: Partial<{
    openAt: string | null;
    emptyAt: string | null;
    createdAt: string;
  }> = {},
) => ({
  id,
  openAt: null,
  emptyAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("orderOwnBottles (X09 Your bottles)", () => {
  it("lists open bottles first, then sealed, then finished", () => {
    const ordered = orderOwnBottles([
      bottle("finished", {
        openAt: "2026-02-01T00:00:00.000Z",
        emptyAt: "2026-03-01T00:00:00.000Z",
      }),
      bottle("sealed"),
      bottle("open", { openAt: "2026-02-10T00:00:00.000Z" }),
    ]);
    expect(ordered.map((b) => b.id)).toEqual(["open", "sealed", "finished"]);
  });

  it("orders each group newest first by its own instant", () => {
    const ordered = orderOwnBottles([
      bottle("opened-earlier", { openAt: "2026-02-01T00:00:00.000Z" }),
      bottle("opened-later", { openAt: "2026-02-05T00:00:00.000Z" }),
      bottle("added-earlier", { createdAt: "2026-01-01T00:00:00.000Z" }),
      bottle("added-later", { createdAt: "2026-01-09T00:00:00.000Z" }),
      bottle("emptied-earlier", {
        emptyAt: "2026-03-01T00:00:00.000Z",
      }),
      bottle("emptied-later", { emptyAt: "2026-03-09T00:00:00.000Z" }),
    ]);
    expect(ordered.map((b) => b.id)).toEqual([
      "opened-later",
      "opened-earlier",
      "added-later",
      "added-earlier",
      "emptied-later",
      "emptied-earlier",
    ]);
  });

  it("breaks ties by id, so two reads agree", () => {
    const rows = [bottle("b"), bottle("a"), bottle("c")];
    expect(orderOwnBottles(rows).map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(orderOwnBottles([...rows].reverse()).map((b) => b.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("does not reorder its input", () => {
    const rows = [bottle("b"), bottle("a")];
    orderOwnBottles(rows);
    expect(rows.map((b) => b.id)).toEqual(["b", "a"]);
  });
});

describe("bottleMatchesStatus", () => {
  const live = bottle("live");
  const done = bottle("done", { emptyAt: "2026-03-01T00:00:00.000Z" });
  it("ACTIVE is still in the cellar", () => {
    expect(bottleMatchesStatus(live, "ACTIVE")).toBe(true);
    expect(bottleMatchesStatus(done, "ACTIVE")).toBe(false);
  });
  it("EMPTY is finished", () => {
    expect(bottleMatchesStatus(live, "EMPTY")).toBe(false);
    expect(bottleMatchesStatus(done, "EMPTY")).toBe(true);
  });
  it("ALL is both", () => {
    expect(bottleMatchesStatus(live, "ALL")).toBe(true);
    expect(bottleMatchesStatus(done, "ALL")).toBe(true);
  });
});
