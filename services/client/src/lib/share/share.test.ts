/**
 * X17's pure rules: which paths are public and where they are served, the
 * share action's decision table, the request origin, the tier-list ranks and
 * the Share guard.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ITEM_TYPES } from "@/components/cellar-api/itemTypes";
import { itemPageHref } from "@/components/item/adapter";
import { requestOrigin } from "./origin";
import {
  absoluteUrl,
  canonicalPath,
  invitePath,
  isPublicSharePath,
  itemTypeOfSegment,
  publicPath,
  publicRewriteFor,
  shareTargetOf,
} from "./routes";
import { type ShareCapabilities, shareLink } from "./share-link";
import { recipeShareBlock, tierListShareBlock } from "./share-rules";
import { groupByBand, topEntries } from "./tier-bands";

const ID = "3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f";

describe("share routes", () => {
  test("the canonical pages a signed-out viewer may open, and where", () => {
    assert.equal(
      publicRewriteFor(`/tier-lists/${ID}`),
      `/share/tier-lists/${ID}`,
    );
    assert.equal(publicRewriteFor(`/recipes/${ID}`), `/share/recipes/${ID}`);
    assert.equal(publicRewriteFor(`/wines/${ID}`), `/share/items/wines/${ID}`);
    assert.equal(publicRewriteFor(`/teas/${ID}/`), `/share/items/teas/${ID}`);
  });

  test("everything else stays behind the gate", () => {
    for (const path of [
      "/tier-lists",
      `/tier-lists/${ID}/edit`,
      "/tier-lists/add",
      `/recipes/groups/${ID}`,
      "/recipes/ai-generator",
      // X15: the composer and the author's editor are never share pages.
      "/recipes/new",
      `/recipes/${ID}/edit`,
      `/cellars/${ID}`,
      `/cellars/${ID}/wines/${ID}`,
      `/wines/${ID}/edit`,
      "/wines/not-a-uuid",
      `/brands/${ID}`,
      "/",
      "/friends",
    ]) {
      assert.equal(publicRewriteFor(path), null, path);
    }
  });

  test("an item's canonical path is the item page's own href", () => {
    for (const type of ITEM_TYPES) {
      const target = { kind: "item" as const, type, id: ID };
      assert.equal(canonicalPath(target), itemPageHref(type, ID));
      assert.deepEqual(shareTargetOf(canonicalPath(target)), target);
      const segment = publicPath(target).split("/")[3] ?? "";
      assert.equal(itemTypeOfSegment(segment), type);
    }
    assert.equal(itemTypeOfSegment("cellars"), null);
  });

  test("/share and /invite are public in their own right", () => {
    assert.equal(isPublicSharePath(`/share/tier-lists/${ID}`), true);
    assert.equal(
      isPublicSharePath(`/share/items/wines/${ID}/opengraph-image`),
      true,
    );
    assert.equal(isPublicSharePath("/invite/abc"), true);
    assert.equal(isPublicSharePath("/shared"), false);
    assert.equal(isPublicSharePath("/invites"), false);
  });

  test("absolute URLs and invite paths", () => {
    assert.equal(
      absoluteUrl("https://cellar.example/", invitePath("abc_-")),
      "https://cellar.example/invite/abc_-",
    );
  });
});

describe("shareLink: the share sheet, else the clipboard", () => {
  const request = { url: "https://cellar.example/x", title: "Negroni" };
  const clipboard = (log: string[], ok = true) => ({
    writeText: async (text: string) => {
      if (!ok) throw new Error("denied");
      log.push(text);
    },
  });
  const abort = () =>
    Object.assign(new Error("cancelled"), { name: "AbortError" });

  test("uses the share sheet when there is one", async () => {
    const shared: ShareData[] = [];
    const nav: ShareCapabilities = {
      share: async (data) => {
        shared.push(data);
      },
      canShare: () => true,
    };
    assert.equal(await shareLink(request, nav), "shared");
    assert.deepEqual(shared, [request]);
  });

  test("closing the sheet is a choice, not an error, and copies nothing", async () => {
    const log: string[] = [];
    const nav: ShareCapabilities = {
      share: async () => {
        throw abort();
      },
      clipboard: clipboard(log),
    };
    assert.equal(await shareLink(request, nav), "dismissed");
    assert.deepEqual(log, []);
  });

  test("a refused sheet, or none at all, copies the link", async () => {
    const log: string[] = [];
    const refused: ShareCapabilities = {
      share: async () => {
        throw Object.assign(new Error("no activation"), {
          name: "NotAllowedError",
        });
      },
      clipboard: clipboard(log),
    };
    assert.equal(await shareLink(request, refused), "copied");
    assert.equal(
      await shareLink(request, {
        canShare: () => false,
        share: async () => {},
        clipboard: clipboard(log),
      }),
      "copied",
    );
    assert.equal(
      await shareLink(request, { clipboard: clipboard(log) }),
      "copied",
    );
    assert.deepEqual(log, [request.url, request.url, request.url]);
  });

  test("neither works: failed", async () => {
    assert.equal(await shareLink(request, {}), "failed");
    assert.equal(
      await shareLink(request, { clipboard: clipboard([], false) }),
      "failed",
    );
  });
});

describe("requestOrigin", () => {
  const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name] ?? null,
  });

  test("prefers the forwarded host and protocol", () => {
    assert.equal(
      requestOrigin(
        headers({
          host: "internal:3000",
          "x-forwarded-host": "cellar.example",
          "x-forwarded-proto": "https",
        }),
      ),
      "https://cellar.example",
    );
  });

  test("http only for loopback, https otherwise", () => {
    assert.equal(
      requestOrigin(headers({ host: "localhost:3003" })),
      "http://localhost:3003",
    );
    assert.equal(
      requestOrigin(headers({ host: "cellar.example" })),
      "https://cellar.example",
    );
  });

  test("a host that is not host-shaped is not trusted", () => {
    assert.equal(requestOrigin(headers({ host: "evil.example/path" })), null);
    assert.equal(requestOrigin(headers({})), null);
  });
});

describe("tier bands", () => {
  const entries = [
    { id: "u", band: 0, position: 0 },
    { id: "b", band: 5, position: 1 },
    { id: "a", band: 5, position: 0 },
    { id: "c", band: 3, position: 0 },
  ];

  test("bands best first, Unrated last and unranked", () => {
    const groups = groupByBand(entries);
    assert.deepEqual(
      groups.map((group) => group.band),
      [5, 3, 0],
    );
    assert.deepEqual(
      groups.flatMap((group) => group.entries.map((e) => [e.id, e.rank])),
      [
        ["a", 1],
        ["b", 2],
        ["c", 3],
        ["u", null],
      ],
    );
  });

  test("the top entries skip Unrated", () => {
    assert.deepEqual(
      topEntries(entries, 5).map((entry) => entry.id),
      ["a", "b", "c"],
    );
  });
});

describe("tierListShareBlock", () => {
  test("only a private list's owner is stopped, with the way out", () => {
    assert.equal(tierListShareBlock("PUBLIC", true), null);
    assert.equal(tierListShareBlock("FRIENDS", true), null);
    assert.match(
      tierListShareBlock("PRIVATE", true)?.description ?? "",
      /public or friends-only/,
    );
  });
});

describe("recipeShareBlock (X15 / D22)", () => {
  test("the author of a private recipe or a draft is stopped, with the way out", () => {
    assert.equal(recipeShareBlock("PUBLIC", false, true), null);
    assert.equal(recipeShareBlock("FRIENDS", false, true), null);
    assert.match(
      recipeShareBlock("PRIVATE", false, true)?.description ?? "",
      /public or friends-only/,
    );
    assert.match(
      recipeShareBlock("PUBLIC", true, true)?.message ?? "",
      /draft/,
    );
  });

  test("nobody else is ever blocked: they cannot see a private recipe at all", () => {
    assert.equal(recipeShareBlock("PRIVATE", false, false), null);
    assert.equal(recipeShareBlock("PUBLIC", false, false), null);
  });
});
