/**
 * The eval's fixtures hold together — without a database or a model, so this
 * runs everywhere, including where the live eval skips.
 *
 * A typo in an expected key would otherwise make a query unanswerable and
 * read as a retrieval failure; a misspelt attribute key would be silently
 * dropped by `attributeColumns` and the item embedded without it.
 */
import {
  ITEM_TYPE_SPECS,
  REQUIRED_ITEM_ATTRIBUTES,
} from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog.ts";
import { MENUS, menuOcrText } from "./menus.ts";
import { QUERIES } from "./queries.ts";

const keys = new Set(CATALOG.map((entry) => entry.key));

describe("retrieval eval fixtures (N05)", () => {
  it("has the size the roadmap asks for: ~30 queries, ~10 menus", () => {
    expect(QUERIES.length).toBeGreaterThanOrEqual(30);
    expect(MENUS.length).toBeGreaterThanOrEqual(10);
    expect(CATALOG.length).toBeGreaterThanOrEqual(50);
  });

  it("catalog keys are unique and prefixed with their type", () => {
    expect(keys.size).toBe(CATALOG.length);
    for (const entry of CATALOG) {
      expect(entry.key.startsWith(`${entry.type.toLowerCase()}.`)).toBe(true);
    }
  });

  it("every attribute key is one the type declares, and every required one is present", () => {
    for (const entry of CATALOG) {
      const declared = Object.keys(ITEM_TYPE_SPECS[entry.type].attributes);
      for (const key of Object.keys(entry.attributes)) {
        expect(declared, `${entry.key}.${key}`).toContain(key);
      }
      for (const required of REQUIRED_ITEM_ATTRIBUTES[entry.type]) {
        const holder: object =
          required.on === "attributes" ? entry.attributes : entry;
        expect(
          Object.hasOwn(holder, required.field),
          `${entry.key} needs ${required.column}`,
        ).toBe(true);
      }
    }
  });

  it("every expected key in the queries and menus names a catalog entry", () => {
    for (const query of QUERIES) {
      expect(query.relevant.length, query.id).toBeGreaterThan(0);
      for (const key of query.relevant) expect(keys, query.id).toContain(key);
    }
    for (const menu of MENUS) {
      for (const line of menu.lines) {
        if (line.expected !== null) {
          expect(keys, line.id).toContain(line.expected);
        }
      }
    }
  });

  it("query and menu-line ids are unique", () => {
    const queryIds = QUERIES.map((query) => query.id);
    expect(new Set(queryIds).size).toBe(queryIds.length);
    const lineIds = MENUS.flatMap((menu) => menu.lines.map((line) => line.id));
    expect(new Set(lineIds).size).toBe(lineIds.length);
  });

  it("the menus hold both kinds of line, so a matcher that always answers is exposed", () => {
    const lines = MENUS.flatMap((menu) => menu.lines);
    const absent = lines.filter((line) => line.expected === null).length;
    expect(absent).toBeGreaterThanOrEqual(8);
    expect(lines.length - absent).toBeGreaterThanOrEqual(40);
  });

  it("the OCR text carries every line as read", () => {
    const menu = MENUS[0];
    if (menu === undefined) throw new Error("no menus");
    const text = menuOcrText(menu);
    expect(text.split("\n")).toHaveLength(menu.lines.length + 1);
    for (const line of menu.lines) expect(text).toContain(line.ocr);
  });
});
