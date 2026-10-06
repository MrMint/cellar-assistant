/**
 * The query-cost limits, from both sides.
 *
 * Two jobs, and the first is the one that matters. A cost limit set too low is
 * a worse defect than no cost limit at all — it takes the app down for
 * everybody instead of for an attacker — so the first block rebuilds the
 * *client's measured worst case* for each dimension and asserts it validates
 * clean. Those numbers are not invented: every `graphql()` body in
 * `services/client/src` (116 operations, fragment spreads inlined) was parsed
 * and the maxima are recorded on the constants in `limits.ts`. If someone
 * tightens a limit past what the client actually sends, a test here fails
 * before a page does.
 *
 * The second block is the attack side: each limit refuses what it exists to
 * refuse, and the refusal says which limit and by how much.
 *
 * The row limit now has a third block of its own, because it is the one limit
 * here that has already been bypassed once *after* being proved. Its proof
 * exercised a single chain of connections at uniform page sizes, which is the
 * shape an author reaches for and not the shape an attacker does — so the
 * cases under "rows: aliased pages" vary the two things that proof held fixed,
 * the alias count and the page size, in opposite directions.
 */

import { fileURLToPath } from "node:url";
import {
  findCalls,
  loadProject,
  PROGRAM_TIMEOUT_MS,
  type Project,
  sourceFileAt,
} from "@cellar-assistant/analysis";
import { DEFAULT_PAGE_SIZE } from "@cellar-assistant/contracts";
import { parse, validate } from "graphql";
import { createYoga } from "graphql-yoga";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_COST_LIMITS,
  MAX_FIELD_NODES,
  MAX_MODEL_BACKED_FIELDS,
  MAX_PARSE_TOKENS,
  MAX_QUERY_DEPTH,
  MAX_QUERY_ROWS,
  MAX_ROOT_FIELDS,
  queryCostRule,
  useQueryCostLimits,
} from "./limits.ts";
import { schema } from "./schema/index.ts";

/**
 * Only this rule runs, not graphql-js's specified set: these documents probe
 * *shape*, and tying them to real field names would make the suite fail for
 * schema churn that has nothing to do with cost.
 *
 * The row limit is the one exception and it has to be. "How many rows does
 * this ask for" is a question about the schema — which fields take `first` and
 * what they return — so those documents below use real field names, and a
 * field the schema does not have is treated as unpaged by design (see
 * `pageSizeOf`). That is also why every other block here still passes
 * unchanged: `f { f { leaf } }` names nothing, so it is charged nothing.
 */
const check = (document: string): readonly string[] =>
  validate(schema, parse(document), [queryCostRule()]).map(
    (error) => error.message,
  );

/** `{ f { f { … } } }`, `depth` field levels deep. */
const nested = (depth: number): string => {
  let body = "leaf";
  for (let level = 1; level < depth; level += 1) body = `f { ${body} }`;
  return `{ ${body} }`;
};

/**
 * `depth` field levels, but reached through a chain of fragment spreads: each
 * `F(n)` selects one field and spreads `F(n+1)`. Spreads are transparent to
 * depth, so this must measure exactly the same as {@link nested}.
 */
const nestedViaFragments = (depth: number): string => {
  const parts: string[] = [];
  for (let level = 0; level < depth - 1; level += 1) {
    parts.push(`fragment F${level} on Query { f { ...F${level + 1} } }`);
  }
  parts.push(`fragment F${depth - 1} on Query { leaf }`);
  return `{ ...F0 }\n${parts.join("\n")}`;
};

/** `roots` root fields, each selecting `each` leaves. */
const bushy = (roots: number, each: number): string => {
  const leaves = Array.from({ length: each }, (_, i) => `b${i}: name`).join(
    " ",
  );
  const fields = Array.from(
    { length: roots },
    (_, i) => `a${i}: cellar { ${leaves} }`,
  ).join(" ");
  return `{ ${fields} }`;
};

const aliases = (count: number, field = "cellar"): string =>
  `{ ${Array.from({ length: count }, (_, i) => `a${i}: ${field} { __typename }`).join(" ")} }`;

describe("the client's own documents stay inside every limit", () => {
  /**
   * Measured maxima, per dimension, across `services/client/src`. Each one
   * names the document it came from so a future re-measurement can be compared
   * against the same query rather than against a number with no provenance.
   */
  const CLIENT_WORST = {
    /** `query TierList` and `mutation ReorderTierListBand`, tier-lists.ts. */
    depth: 10,
    /** `query ReferenceOptions`, items.ts — 10 aliased `referenceData` reads. */
    rootFields: 10,
    /** `query PlacesById`, places.ts — 136 static, ~145 once URQL adds `__typename`. */
    fieldNodes: 145,
    /** `query ItemSearch` — no client document selects more than one. */
    modelBackedFields: 1,
    /** `query ReferenceOptions` composed with its fragments: 349 tokens. */
    parseTokens: 349,
  } as const;

  it("clears the deepest document the client sends", () => {
    expect(CLIENT_WORST.depth).toBeLessThan(MAX_QUERY_DEPTH);
    expect(check(nested(CLIENT_WORST.depth))).toEqual([]);
  });

  it("clears the widest root fan-out the client sends", () => {
    expect(CLIENT_WORST.rootFields).toBeLessThan(MAX_ROOT_FIELDS);
    expect(check(aliases(CLIENT_WORST.rootFields))).toEqual([]);
  });

  it("clears the largest field count the client sends", () => {
    expect(CLIENT_WORST.fieldNodes).toBeLessThan(MAX_FIELD_NODES);
    // Shaped like a real document rather than a root fan-out: 10 root fields
    // of 14 leaves each is 150 field nodes, just past the client's 145.
    expect(check(bushy(10, 14))).toEqual([]);
  });

  it("clears a document with one model-backed field", () => {
    expect(CLIENT_WORST.modelBackedFields).toBeLessThan(
      MAX_MODEL_BACKED_FIELDS,
    );
    expect(check(`{ itemSearch(text: "x") { __typename } }`)).toEqual([]);
  });

  it("parses the largest composed document the client sends", () => {
    expect(CLIENT_WORST.parseTokens).toBeLessThan(MAX_PARSE_TOKENS);
  });
});

describe("depth", () => {
  it("refuses a document past the limit, and says by how much", () => {
    const [message] = check(nested(MAX_QUERY_DEPTH + 1));
    expect(message).toContain(`is ${MAX_QUERY_DEPTH + 1} levels deep`);
    expect(message).toContain(`the limit is ${MAX_QUERY_DEPTH}`);
  });

  it("counts through fragment spreads, which is the obvious bypass", () => {
    expect(check(nestedViaFragments(MAX_QUERY_DEPTH))).toEqual([]);
    expect(check(nestedViaFragments(MAX_QUERY_DEPTH + 1))).toHaveLength(1);
  });

  it("does not hang on a cyclic fragment", () => {
    // `NoFragmentCyclesRule` would report this, but every rule in a validate()
    // call visits in parallel — an unguarded walk would recurse forever here
    // rather than let that rule have its say.
    const messages = check(
      `{ ...A } fragment A on Query { f { ...B } } fragment B on Query { f { ...A } }`,
    );
    expect(messages).toEqual([]);
  });
});

describe("root breadth", () => {
  /** The reviewer's probe: 1000 aliases of `cellar(id:)`, unauthenticated. */
  it("refuses the 1000-alias document", () => {
    const [message] = check(aliases(1000));
    expect(message).toContain("selects 1000 root fields");
    expect(message).toContain(`the limit is ${MAX_ROOT_FIELDS}`);
  });

  it("allows exactly the limit and refuses one more", () => {
    expect(check(aliases(MAX_ROOT_FIELDS))).toEqual([]);
    expect(check(aliases(MAX_ROOT_FIELDS + 1))).toHaveLength(1);
  });

  it("sees through a fragment wrapped around the root selection", () => {
    const spread = Array.from(
      { length: MAX_ROOT_FIELDS + 1 },
      (_, i) => `a${i}: cellar { __typename }`,
    ).join(" ");
    const messages = check(`{ ...Wide } fragment Wide on Query { ${spread} }`);
    expect(messages[0]).toContain(`selects ${MAX_ROOT_FIELDS + 1} root fields`);
  });
});

describe("total complexity", () => {
  it("refuses a document with too many field nodes", () => {
    // Under the root-field limit, but far over the field-node limit: aliasing
    // below the root is what this backstops.
    // 10 root fields (well under that limit) x 120 leaves = 1210 field nodes.
    const [message] = check(bushy(10, 120));
    expect(message).toContain(`the limit is ${MAX_FIELD_NODES}`);
    expect(message).toContain("selects 1210 fields");
  });
});

describe("model-backed fields", () => {
  it("refuses more inferences than the limit allows", () => {
    const many = Array.from(
      { length: MAX_MODEL_BACKED_FIELDS + 1 },
      (_, i) => `a${i}: itemSearch(text: "q${i}") { __typename }`,
    ).join(" ");
    const [message] = check(`{ ${many} }`);
    expect(message).toContain(
      `selects ${MAX_MODEL_BACKED_FIELDS + 1} fields that each run a model inference`,
    );
    expect(message).toContain("itemSearch");
  });

  it("counts the search fields together, not separately", () => {
    // Four is the limit, so one of each of the three plus a repeat is the
    // first document that trips it — they share one budget.
    expect(
      check(
        `{ itemSearch(text: "a") { __typename } cellarItemSearch(text: "b") { __typename } recipeSearch(text: "c") { __typename } }`,
      ),
    ).toEqual([]);
    expect(
      check(
        `{ a: itemSearch(text: "a") { __typename } b: cellarItemSearch(text: "b") { __typename } c: recipeSearch(text: "c") { __typename } d: itemSearch(text: "d") { __typename } e: recipeSearch(text: "e") { __typename } }`,
      ),
    ).toHaveLength(1);
  });

  it("does not charge trigram search, which runs no model", () => {
    const many = Array.from(
      { length: MAX_MODEL_BACKED_FIELDS + 2 },
      (_, i) => `a${i}: brandSearch(text: "q${i}") { __typename }`,
    ).join(" ");
    expect(check(`{ ${many} }`)).toEqual([]);
  });

  /**
   * The four instances the hand-written three-name list missed, each at the
   * alias count that was measured passing or that the root-field limit would
   * otherwise allow. `model-backed-fields.test.ts` is what keeps the list
   * complete; these pin that the rule charges what the list says.
   */
  it.each([
    ["placeSearch", 25, `placeSearch(query: "q$") { __typename }`],
    [
      "createRecipe",
      8,
      `createRecipe(input: { name: "r$", type: COCKTAIL }) { __typename }`,
    ],
    [
      "startItemOnboarding",
      MAX_MODEL_BACKED_FIELDS + 1,
      `startItemOnboarding(input: { itemType: WINE, frontLabelFileId: "f$" }) { __typename }`,
    ],
    [
      "createPlace",
      MAX_MODEL_BACKED_FIELDS + 1,
      `createPlace(input: { name: "p$" }) { __typename }`,
    ],
  ])("refuses %s aliased %i times", (name, copies, field) => {
    const isMutation = name !== "placeSearch";
    const body = Array.from(
      { length: copies },
      (_, i) => `a${i}: ${field.replace("$", String(i))}`,
    ).join(" ");
    const messages = check(`${isMutation ? "mutation " : ""}{ ${body} }`);
    const refusal = messages.find((m) => m.includes("model inference")) ?? "";
    expect(refusal).toContain(`selects ${copies} fields`);
    expect(refusal).toContain(`${isMutation ? "Mutation" : "Query"}.${name}`);
  });

  it("counts mutations and queries against the same four", () => {
    expect(
      check(
        'mutation { a: createRecipe(input: { name: "a" }) { __typename } b: updateItem(id: "x", input: {}) { __typename } c: createPlace(input: { name: "c" }) { __typename } d: addTierListItem(tierListId: "t", input: {}) { __typename } }',
      ),
    ).toEqual([]);
    expect(
      check(
        'mutation { a: createRecipe(input: { name: "a" }) { __typename } b: updateItem(id: "x", input: {}) { __typename } c: createPlace(input: { name: "c" }) { __typename } d: addTierListItem(tierListId: "t", input: {}) { __typename } e: createMenuScan(input: {}) { __typename } }',
      ),
    ).toHaveLength(1);
  });

  it("charges by coordinate, so a namesake on another type is free", () => {
    // `TierList.items` shares a name with `Cellar.items` and runs no model.
    // `Barcode`, `Brand` and `ReorderBandPayload` have an `items` too, and
    // those are the schema's only namesakes of any entry. `semanticQuery` is
    // passed here although `TierList.items` has no such argument —
    // `KnownArgumentNamesRule` would refuse this document on its own — because
    // `Cellar.items` is charged only with it, so without it bare-name matching
    // and coordinate matching agree and the case would prove nothing. What it
    // pins is the rule's own lookup, for the day an unconditional entry gains
    // a namesake.
    const many = Array.from(
      { length: MAX_MODEL_BACKED_FIELDS + 1 },
      (_, i) =>
        `t${i}: tierList(id: "t${i}") { ... on TierList { items(first: 1, semanticQuery: "p${i}") { __typename } } }`,
    ).join(" ");
    expect(check(`{ ${many} }`)).toEqual([]);
  });

  describe("Cellar.items, which embeds only with semanticQuery", () => {
    const cellarItems = (args: string, copies = MAX_MODEL_BACKED_FIELDS + 1) =>
      `query ($q: String) { cellar(id: "c") { ... on Cellar { ${Array.from(
        { length: copies },
        (_, i) =>
          `i${i}: items(first: 1${args.replace("$i", String(i))}) { __typename }`,
      ).join(" ")} } } }`;

    it("charges each copy given a phrase", () => {
      const [message] = check(cellarItems(', semanticQuery: "phrase $i"'));
      expect(message).toContain(
        `selects ${MAX_MODEL_BACKED_FIELDS + 1} fields that each run a model inference`,
      );
      expect(message).toContain("Cellar.items");
    });

    it("charges a variable, whose value validation cannot see", () => {
      expect(check(cellarItems(", semanticQuery: $q"))).toHaveLength(1);
    });

    it("does not charge a plain listing, nor an explicit null", () => {
      // The cellar page lists items on every visit; charging that as a model
      // call would spend the budget on a read.
      expect(check(cellarItems(""))).toEqual([]);
      expect(check(cellarItems(", semanticQuery: null"))).toEqual([]);
    });

    it("finds the coordinate through a fragment on the type", () => {
      const document =
        'query { cellar(id: "c") { ...C } } fragment C on Cellar { ' +
        Array.from(
          { length: MAX_MODEL_BACKED_FIELDS + 1 },
          (_, i) => `i${i}: items(semanticQuery: "p${i}") { __typename }`,
        ).join(" ") +
        " }";
      expect(check(document)).toHaveLength(1);
    });
  });
});

describe("parser bound", () => {
  it("refuses a document with more tokens than the limit", () => {
    const huge = aliases(MAX_PARSE_TOKENS);
    // graphql-js 16 says "more that", not "more than" — a typo in its own
    // source. Matched either way so a future fix upstream does not fail this.
    expect(() =>
      parse(huge, { maxTokens: DEFAULT_COST_LIMITS.maxParseTokens }),
    ).toThrow(/Document contains more tha[tn] \d+ tokens/);
  });

  it("parses a document at the client's measured worst case", () => {
    expect(() =>
      parse(aliases(10), { maxTokens: DEFAULT_COST_LIMITS.maxParseTokens }),
    ).not.toThrow();
  });
});

describe("all limits report together", () => {
  it("names every limit one document breaks, not just the first", () => {
    // Too deep, too wide and too complex at once.
    const deep = nested(MAX_QUERY_DEPTH + 2).slice(1, -1);
    const wide = bushy(MAX_ROOT_FIELDS + 1, 40).slice(1, -1);
    const messages = check(`{ ${deep} ${wide} }`);
    expect(messages.some((m) => m.includes("levels deep"))).toBe(true);
    expect(messages.some((m) => m.includes("root fields"))).toBe(true);
    expect(messages.some((m) => m.includes("the limit is 1000"))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `Item -> checkIns -> item -> checkIns -> …`, `levels` connections deep, with
 * whatever `first` argument the caller wants on each.
 *
 * This is not a shape invented for a test. It is the exact document measured
 * against `cellar-stack` while establishing the finding: at `levels: 3` and
 * `first: 100` it is 337 bytes of GraphQL, passes depth, breadth, complexity,
 * model-backed and parser bounds, and returned 1,010,100 nodes / 53 MiB in
 * 12.2 seconds.
 */
const checkInCycle = (levels: number, first: string): string => {
  let body = "id";
  for (let level = 0; level < levels; level += 1) {
    const inner = level === 0 ? "id" : `id item { ... on Wine { ${body} } }`;
    body = `checkIns${first} { edges { node { ${inner} } } }`;
  }
  return `{ item(id: "x", type: WINE) { ... on QueryItemSuccess { data { ... on Wine { ${body} } } } } }`;
};

/**
 * The other shape: not one connection nested `n` times, but one connection
 * *aliased* `n` times at the bottom of a short chain.
 *
 * `myCellars(first: 50) -> items(first: 50) -> item -> { k0..kn: checkIns }`.
 * The 2500 rows above the fan-out are fixed; every alias below it adds its own
 * 2500 because each one is an independent connection returning `first` rows per
 * parent. Measured against `cellar-stack`, two documents differing only in the
 * inner page size: at `first: 2` this was refused at 52,550 rows, and at
 * `first: 1` — byte-identical but for one digit — it was **200 OK**, because
 * the old guard charged a `first: 1` page nothing at all.
 */
const aliasedFanOut = (aliasCount: number, first: number): string => {
  const fan = ["id"]
    .concat(
      Array.from(
        { length: aliasCount },
        (_, i) => `k${i}: checkIns(first: ${first}) { edges { node { id } } }`,
      ),
    )
    .join(" ");
  return (
    "{ myCellars(first: 50) { ... on CellarConnection { edges { node { " +
    "items(first: 50) { ... on CellarItemConnection { edges { node { item { " +
    `... on Wine { ${fan} } } } } } } } } } } }`
  );
};

/**
 * What one document is charged, read out of a refusal forced by setting the row
 * limit to zero.
 *
 * Every other row assertion here is a pass/fail against the real cap, which
 * cannot tell 2550 from 27,550 — and telling those two apart is the entire
 * content of this fix. The other five limits keep their real values, so a
 * document that breaks one of *them* still reports it and this returns the row
 * count regardless.
 */
const rowsCharged = (document: string): number => {
  const message = validate(schema, parse(document), [
    queryCostRule({ ...DEFAULT_COST_LIMITS, maxQueryRows: 0 }),
  ])
    .map((error) => error.message)
    .find((text) => text.includes("asks for up to"));
  if (message === undefined) return 0;
  const rows = /asks for up to (\d+) rows/.exec(message)?.[1];
  if (rows === undefined) throw new Error(`no row count in: ${message}`);
  return Number(rows);
};

describe("rows", () => {
  it("clears the client's widest real document", () => {
    // `query ReferenceOptions`: ten aliased `referenceData` reads at
    // `first: 100`, which is 1000 rows and the most any of the client's 116
    // operations asks for.
    const aliases = Array.from(
      { length: 10 },
      (_, i) =>
        `a${i}: referenceData(kind: COUNTRY, first: 100) { ` +
        "... on ReferenceRowConnection { edges { node { value } } } }",
    ).join(" ");
    expect(check(`{ ${aliases} }`)).toEqual([]);
  });

  it("allows one page of the cap, which is what a connection is for", () => {
    expect(check(checkInCycle(1, "(first: 100)"))).toEqual([]);
  });

  it("refuses the nested cycle that every other limit waved through", () => {
    // Two levels is already 100 + 100*100. The point of the assertion is the
    // *multiplication*: one level is fine and two are not, and nothing about
    // the document grew except one more copy of the same connection.
    const [message] = check(checkInCycle(2, "(first: 100)"));
    expect(message).toMatch(/asks for up to 10100 rows/);
    expect(message).toMatch(new RegExp(`the limit is ${MAX_QUERY_ROWS}`));
    expect(check(checkInCycle(3, "(first: 100)"))).toHaveLength(1);
  });

  it("charges the page size a client omits, not zero", () => {
    // The bypass a syntactic rule would leave open: name no `first` anywhere
    // and the server still returns DEFAULT_PAGE_SIZE per level, so the product
    // is 20^n rather than nothing. Two aliased copies of a three-level cycle
    // cost 2 * (20 + 400 + 8000).
    const one = checkInCycle(3, "").replace(/^\{ | \}$/g, "");
    expect(check(`{ x: ${one} y: ${one} }`)).toHaveLength(1);
  });

  it("charges a variable page size at the cap it will be allowed", () => {
    // `first: $n` has no value at validation time. Costing it at 1 would make
    // the limit opt-out; `pageArgs` refuses anything over MAX_PAGE_SIZE at
    // execution, so that is the honest worst case.
    const document = `query ($n: Int) ${checkInCycle(2, "(first: $n)")}`;
    expect(check(document)).toHaveLength(1);
  });

  it("does not charge a field that returns one object", () => {
    // `item` and `me` take no `first`; only paged fields multiply.
    expect(check("{ me { id } }")).toEqual([]);
  });

  it("allows a document that asks for exactly the limit", () => {
    // The boundary itself, which nothing else here stands on: every other row
    // assertion is either far under (1000) or far over (10,100), so `>` and
    // `>=` are indistinguishable to all of them. A limit that refuses the
    // number it advertises is the "set too low" failure this file opens by
    // saying is worse than no limit at all.
    //
    // 100 outer x 99 inner = 9,900, plus the outer page itself = 10,000.
    // `checkInCycle` builds inside-out, so the *last* `first` in the text is
    // the inner connection.
    const outer = 100;
    const inner = 99;
    const document = checkInCycle(2, `(first: ${outer})`).replace(
      new RegExp(`\\(first: ${outer}\\)(?![\\s\\S]*\\(first: ${outer}\\))`),
      `(first: ${inner})`,
    );
    expect(outer + outer * inner).toBe(MAX_QUERY_ROWS);
    expect(check(document)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Rows: every page is charged, and only pages are                             */
/* -------------------------------------------------------------------------- */

/**
 * The bypass the first version of this rule shipped with, and the boundary it
 * was trying to draw.
 *
 * `MAX_QUERY_ROWS` was proved against a *single chain with uniform page sizes*
 * — one connection nested three times, every level at the same `first`. That
 * proof never fanned a level out sideways, and the guard at the charge site
 * (`rows > multiplier`, i.e. `pageSize > 1`) is invisible to a single chain
 * because nobody writes `first: 1` three levels deep on purpose. Aliased, it is
 * the whole attack: each copy of a `first: 1` connection returns one row per
 * parent, `MAX_FIELD_NODES = 1000` allows a few hundred copies, and all of them
 * together were charged zero.
 *
 * So these cases come in pairs: what must now be refused, and — the half that
 * is easy to lose — what must still be *accepted*, because the replaced guard
 * did have a sound half and a limit set too low is the worse defect.
 */
describe("rows: aliased pages", () => {
  it("charges each aliased copy of a page, not only the ones that widen it", () => {
    // 50 cellars + 50x50 items = 2550 rows above the fan-out, then 2500 per
    // alias. Linear in the alias count is the property; the old guard made it
    // constant.
    expect(rowsCharged(aliasedFanOut(0, 1))).toBe(2550);
    expect(rowsCharged(aliasedFanOut(1, 1))).toBe(2550 + 2500);
    expect(rowsCharged(aliasedFanOut(10, 1))).toBe(2550 + 10 * 2500);
  });

  it("refuses the two documents that differ by one digit, not just the larger", () => {
    // Measured against `cellar-stack` before this fix: `first: 2` was refused
    // at 52,550 rows and `first: 1` returned 200 OK. They ask the database for
    // work within a factor of two of each other.
    const [tight] = check(aliasedFanOut(10, 1));
    expect(tight).toMatch(/asks for up to 27550 rows/);
    expect(tight).toMatch(new RegExp(`the limit is ${MAX_QUERY_ROWS}`));
    expect(rowsCharged(aliasedFanOut(10, 2))).toBe(52_550);
  });

  it("charges the reviewer's widest instance for what it actually returns", () => {
    // The shape pushed to 2,455,300 real rows while the validator charged
    // ~10,000: one `first: 99` level to land the multiplier just under the cap,
    // then as many aliases as MAX_FIELD_NODES allows.
    const fan = Array.from(
      { length: 200 },
      (_, i) => `k${i}: checkIns(first: 1) { edges { node { id } } }`,
    ).join(" ");
    const document =
      "{ myCellars(first: 99) { ... on CellarConnection { edges { node { " +
      "items(first: 99) { ... on CellarItemConnection { edges { node { item { " +
      `... on Wine { ${fan} } } } } } } } } } } }`;
    expect(rowsCharged(document)).toBe(99 + 99 * 99 + 200 * 99 * 99);
    expect(check(document)).toHaveLength(1);
  });

  it("charges a page the same through a fragment spread as inline", () => {
    // Wrapping the fan-out in a named fragment is the first thing to try
    // against a rule that walks the document — `countRootFields` already has
    // its own version of this case, and the row walk needs it too.
    const inline = aliasedFanOut(10, 1);
    const viaFragment = `${aliasedFanOut(0, 1).replace("id }", "id ...Fan }")}\nfragment Fan on Wine { ${Array.from(
      { length: 10 },
      (_, i) => `k${i}: checkIns(first: 1) { edges { node { id } } }`,
    ).join(" ")} }`;
    expect(rowsCharged(viaFragment)).toBe(rowsCharged(inline));
    expect(rowsCharged(viaFragment)).toBe(2550 + 10 * 2500);
  });

  it("charges one fragment spread once per spread site", () => {
    // The `seen` guard in `walk` is a *cycle* guard, added and removed around
    // each recursion. Ten sibling spreads of the same one-connection fragment
    // have to cost ten connections, not one — otherwise a fragment is just an
    // alias with the charge switched off.
    const spreads = Array.from({ length: 10 }, () => "...One").join(" ");
    const document = `${aliasedFanOut(0, 1).replace("id }", `id ${spreads} }`)}\nfragment One on Wine { k: checkIns(first: 1) { edges { node { id } } } }`;
    expect(rowsCharged(document)).toBe(rowsCharged(aliasedFanOut(10, 1)));
    expect(rowsCharged(document)).toBe(2550 + 10 * 2500);
  });

  it("charges every inline-fragment branch, because it cannot know which runs", () => {
    // Ten `... on Wine` branches each holding one connection: the executor runs
    // all of them here, and on a union it would run one. Charging all of them
    // over-charges the union case and under-charges nothing, which is the only
    // direction a cost limit may be wrong in.
    const branches = Array.from(
      { length: 10 },
      (_, i) =>
        `... on Wine { k${i}: checkIns(first: 1) { edges { node { id } } } }`,
    ).join(" ");
    const document = aliasedFanOut(0, 1).replace("id }", `id ${branches} }`);
    expect(rowsCharged(document)).toBe(rowsCharged(aliasedFanOut(10, 1)));
    expect(rowsCharged(document)).toBe(2550 + 10 * 2500);
  });

  it("charges a connection inside a mutation payload", () => {
    // Mutations are walked from `schema.getMutationType()`, so a payload that
    // hands back an entity hands back its connections too. 100 items, then a
    // `first: 1` page of check-ins per item.
    const document =
      'mutation { createCellar(input: { name: "x", privacy: PUBLIC }) { ' +
      "... on Cellar { items(first: 100) { ... on CellarItemConnection { " +
      "edges { node { item { ... on Wine { k: checkIns(first: 1) " +
      "{ edges { node { id } } } } } } } } } } } }";
    expect(rowsCharged(document)).toBe(100 + 100);
  });
});

describe("rows: what must still be free", () => {
  it("charges a page once, not once per field selected under it", () => {
    // The sound half of the guard this fix replaced. `edges`, `cursor`, `node`,
    // `id`, `name` and `__typename` each select one value per row already paid
    // for; billing them their parent's multiplier would charge this document
    // 800 for the 100 rows it reads, and `MAX_QUERY_ROWS` would then start
    // refusing documents by how many *columns* they select.
    expect(
      rowsCharged(
        "{ myCellars(first: 100) { __typename ... on CellarConnection { " +
          "totalCount edges { cursor node { id name itemCount } } } } }",
      ),
    ).toBe(100);
  });

  it("clears the client's real thumbnail-and-maker shape", () => {
    // `TierListEntryItem` (tier-lists.ts) is `brands(first: 1)` plus
    // `images(first: 1)` on every row of a page — a thumbnail and the maker's
    // name, which is what `first: 1` is legitimately *for*. This fix is
    // precisely the one that starts charging that pattern, so it is the
    // over-charge risk in the flesh: it takes `query TierList`, `query
    // Rankings`, `query MyFavorites` and `query TierListItemPicker` from 100
    // rows to 300, the largest change to any of the client's 116 operations,
    // and 3% of the cap.
    const row =
      "brands(first: 1) { edges { node { brand { id name } } } } " +
      "images(first: 1) { edges { node { id placeholder } } }";
    const document =
      '{ tierList(id: "x") { ... on TierList { ' +
      "items(first: 100) { edges { node { " +
      `item { ${row} } } } } } } }`;
    expect(rowsCharged(document)).toBe(300);
    expect(check(document)).toEqual([]);
  });

  it("charges introspection nothing, because it reads no rows", () => {
    // `__schema` and `__type` are meta-fields: they are not in `getFields()`,
    // so they reach `pageSizeOf` with no `fieldDef` and are unpaged. That is
    // the right answer rather than an oversight — introspection is bounded by
    // depth, field nodes and the parser, and there is no page behind it to
    // charge for. The trap this guards is "fix" the unknown-field branch by
    // charging it a row.
    expect(
      rowsCharged(
        "{ __schema { types { fields { type { ofType { name } } } } } }",
      ),
    ).toBe(0);
  });
});

describe("rows: page sizes that are not what they look like", () => {
  it("charges `first: 0` a row per parent rather than nothing", () => {
    // `pageArgs` throws `first must be a positive integer` on 0 and on a
    // negative, so neither document reaches the database. It is charged 1 per
    // parent all the same: a page size that rounds down to "free" is the exact
    // shape of the defect these tests exist for, and a rule that hands out one
    // free connection per `first: 0` invites the next version of it.
    const zero =
      "{ myCellars(first: 100) { ... on CellarConnection { edges { node { " +
      "items(first: 0) { ... on CellarItemConnection { edges { node { id } } } " +
      "} } } } } }";
    expect(rowsCharged(zero)).toBe(200);
    expect(rowsCharged(zero.replace("first: 0", "first: -5"))).toBe(200);
  });

  it("does not let `@skip` or `@include` discount a page", () => {
    // Directives are not evaluated here, so a skipped connection is charged in
    // full. That over-charges a document asking for less, which is the safe
    // direction: `@include(if: $x)` takes its value at execution, and a
    // validation rule that believed it would be handing out a free connection
    // per variable.
    expect(
      rowsCharged(
        "{ myCellars(first: 100) @skip(if: true) { ... on CellarConnection " +
          "{ edges { node { id } } } } }",
      ),
    ).toBe(100);
  });

  it("charges backward paging at the forward default it will be refused at", () => {
    // `last`/`before` are in the schema because Relay puts them there and
    // `toPageArgs` throws on either, so they cannot be used to ask for rows
    // this rule cannot see. `last: 100` is costed as the omitted-`first` case
    // — the default page — and then refused at execution.
    expect(
      rowsCharged(
        "{ myCellars(last: 100) { ... on CellarConnection { edges { node { id } } } } }",
      ),
    ).toBe(DEFAULT_PAGE_SIZE);
  });
});

/* -------------------------------------------------------------------------- */
/* Fragments: walked once, charged at every spread site                        */
/* -------------------------------------------------------------------------- */

/**
 * `query Q { ...F0 }`, then `F0` spreads `F1` `spreads` times, `F1` spreads
 * `F2` the same, and so on down to `F(levels)`, which selects `__typename`.
 *
 * No cycle anywhere, and the body grows linearly in `levels` — but the document
 * *executes* `spreads^levels` copies of the leaf, and a walk that re-walks a
 * fragment at every spread site does that much work too. At `spreads: 2` this
 * is the document measured against `cellar-stack` at `162bbffd` before the fix:
 * n = 20 took 0.49s unauthenticated, and n = 23 held the event loop for 2–4s.
 */
const doublingFragments = (levels: number, spreads = 2): string => {
  const parts = ["query Q { ...F0 }"];
  for (let level = 0; level < levels; level += 1) {
    const next = Array.from({ length: spreads }, () => `...F${level + 1}`);
    parts.push(`fragment F${level} on Query { ${next.join(" ")} }`);
  }
  parts.push(`fragment F${levels} on Query { __typename }`);
  return parts.join("\n");
};

/** Milliseconds `run` took. */
const timed = <T>(run: () => T): { result: T; ms: number } => {
  const started = performance.now();
  const result = run();
  return { result, ms: performance.now() - started };
};

/**
 * Generous for work that is linear in a document of a few KB — it measures
 * well under a millisecond — and some thirty orders of magnitude short of what
 * the exponential walk needed for the same documents, so a regression cannot
 * sneak under it on a slow CI runner.
 */
const LINEAR_BUDGET_MS = 100;

describe("fragments are walked once and charged at every spread site", () => {
  it("still charges the doubling document its full 2^n", () => {
    // The cache must multiply, not skip: ten levels of two spreads is 1024
    // executed `__typename`s, all of them on `Query`.
    const messages = check(doublingFragments(10));
    expect(messages).toContain(
      `query Q selects 1024 root fields; the limit is ${MAX_ROOT_FIELDS}. ` +
        "Aliasing one field many times multiplies the work behind it — page instead.",
    );
    expect(messages.some((m) => m.includes("selects 1024 fields"))).toBe(true);
  });

  it("refuses 60 levels of doubling quickly, instead of walking 2^60 fields", () => {
    const document = parse(doublingFragments(60));
    const { result, ms } = timed(() =>
      validate(schema, document, [queryCostRule()]).map((e) => e.message),
    );
    expect(result.some((m) => m.includes("root fields"))).toBe(true);
    expect(result.some((m) => m.includes(`limit is ${MAX_FIELD_NODES}`))).toBe(
      true,
    );
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it("says a count is past exact rather than printing a rounded one", () => {
    // 2^60 is not a safe integer. The message must not state it as though it
    // were a measurement — and must never say `Infinity` or `NaN`.
    const messages = check(doublingFragments(60));
    expect(messages.some((m) => m.includes("more than 9007199254740991"))).toBe(
      true,
    );
    expect(messages.join(" ")).not.toMatch(/Infinity|NaN/);
  });

  it("keeps the row product finite in the message when it overflows", () => {
    // A connection at `first: 100` inside every level: the row product is
    // 100^levels times the spread count, which passes `Number.MAX_VALUE`.
    const levels = 200;
    const parts = [
      'query Q { item(id: "x", type: WINE) { ... on QueryItemSuccess { data { ...W0 } } } }',
    ];
    for (let level = 0; level < levels; level += 1) {
      parts.push(
        `fragment W${level} on Wine { checkIns(first: 100) { edges { node { item { ...W${level + 1} ...W${level + 1} } } } } }`,
      );
    }
    parts.push(`fragment W${levels} on Wine { id }`);
    const { result, ms } = timed(() => check(parts.join("\n")));
    const rows = result.find((m) => m.includes("asks for up to"));
    expect(rows).toContain("asks for up to more than 9007199254740991 rows");
    expect(result.join(" ")).not.toMatch(/Infinity|NaN/);
    expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
  });

  it("adds a cached fragment's depth to the depth of each spread site", () => {
    // `D` is first measured at the top, two levels deep, and cached there. Its
    // second spread sits 14 fields down, so the operation is 16 deep — which
    // the cache has to report, not the 2 it first saw.
    const deep = (levels: number, inner: string): string =>
      levels === 0 ? inner : `f { ${deep(levels - 1, inner)} }`;
    const document = `{ ...D ${deep(MAX_QUERY_DEPTH - 1, "...D")} } fragment D on Query { a { b } }`;
    const [message] = check(document);
    expect(message).toContain(`is ${MAX_QUERY_DEPTH + 1} levels deep`);
  });

  it("scales a cached fragment's rows by the pages above each spread site", () => {
    // `Fan` is first spread under no page at all (one row), then again at the
    // bottom of a 50 x 50 fan-out — where it must cost 2500, not the 1 cached
    // at the first site.
    const fan =
      "fragment Fan on Wine { k: checkIns(first: 1) { edges { node { id } } } }";
    const single =
      'a: item(id: "x", type: WINE) { ... on QueryItemSuccess { data { ... on Wine { ...Fan } } } }';
    const fanned = aliasedFanOut(0, 1)
      .replace("id }", "id ...Fan }")
      .replace(/^\{ /, "")
      .replace(/ \}$/, "");
    expect(rowsCharged(`{ ${single} ${fanned} }\n${fan}`)).toBe(
      1 + 2550 + 2500,
    );
  });

  it("refuses the widest doubling document the parser admits, over HTTP, promptly", async () => {
    // Five spreads per fragment is about the densest a token budget allows
    // (it maximises levels x log(spreads) per token), so this is the largest
    // multiplication a single request can reach the validator with.
    let levels = 300;
    while (
      (() => {
        try {
          parse(doublingFragments(levels + 1, 5), {
            maxTokens: MAX_PARSE_TOKENS,
          });
          return true;
        } catch {
          return false;
        }
      })()
    ) {
      levels += 1;
    }
    const server = createYoga({ schema, plugins: [useQueryCostLimits()] });
    const started = performance.now();
    const response = await server.fetch("http://limits.test/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: doublingFragments(levels, 5) }),
    });
    const body = await response.text();
    const ms = performance.now() - started;
    expect(body).toContain("QUERY_TOO_WIDE");
    expect(body).toContain("QUERY_TOO_COMPLEX");
    expect(body).not.toMatch(/Infinity|NaN/);
    // An HTTP round trip through Yoga's parser and every specified rule, so a
    // wider budget than the bare rule gets — and still nowhere near the
    // 5^levels walk (levels is ~370 here) this replaced.
    expect(ms).toBeLessThan(5 * LINEAR_BUDGET_MS);
  });
});

/* -------------------------------------------------------------------------- */
/* The plugin                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Everything above drives `queryCostRule` and `parse` directly, which is the
 * right way to test *what the limits say*. It is not a test of whether they are
 * switched on.
 *
 * Found by hand-mutation: deleting `addValidationRule(queryCostRule(limits))`
 * from `useQueryCostLimits`, and deleting `maxTokens` from its `onParse`, each
 * leaves every one of the assertions above green. The rule is the unit; the
 * plugin is the wiring, and this branch has shipped a working unit that nothing
 * connected more than once — an abstention gate exported and called by nothing,
 * `MaintenanceActor` registered but never scheduled. So the plugin is exercised
 * here through a real Yoga instance, over HTTP, the way a request meets it.
 *
 * `index.ts` is not imported: it calls `createServer().listen()` at module
 * scope. The seam that file owns — that it puts `useQueryCostLimits()` in
 * `plugins` at all — is asserted by parsing it, below.
 */
describe("useQueryCostLimits is wired, not merely defined", () => {
  const server = createYoga({ schema, plugins: [useQueryCostLimits()] });

  const post = async (
    query: string,
  ): Promise<{ status: number; body: string }> => {
    const response = await server.fetch("http://limits.test/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    return { status: response.status, body: await response.text() };
  };

  it("installs the cost rule: an over-wide document is refused", async () => {
    // One past the root-breadth limit, not the 1000-alias probe: 1000 aliases
    // is ~7000 lexer tokens, so it dies in `parse` and never reaches a
    // validation rule at all. Which is itself the point of the third case
    // below — but it would make this one pass with no rule installed.
    const { body } = await post(aliases(MAX_ROOT_FIELDS + 1));
    expect(body).toContain("QUERY_TOO_WIDE");
    expect(body).toContain(`the limit is ${MAX_ROOT_FIELDS}`);
  });

  it("installs the row limit too, not just the structural ones", async () => {
    const { body } = await post(checkInCycle(3, "(first: 100)"));
    expect(body).toContain("QUERY_TOO_LARGE");
  });

  it("installs it for an aliased fan-out, not only a nested cycle", async () => {
    // Deliberately the document that a `validate()`-level test and an
    // installed-plugin test would both have to be right about: it is refused
    // only if the rule charges aliased `first: 1` pages *and* the plugin is
    // still adding the rule. The nested-cycle case above passes under the
    // arithmetic this fix replaced, so it cannot stand in for this one.
    const { body } = await post(aliasedFanOut(10, 1));
    expect(body).toContain("QUERY_TOO_LARGE");
    expect(body).toContain("27550");
  });

  it("installs the parser bound, which no validation rule can enforce", async () => {
    // Past `MAX_PARSE_TOKENS` but *under* `MAX_ROOT_FIELDS` is impossible, so
    // this document trips both — the assertion is that it dies in `parse`,
    // which reports a syntax error and never reaches a validation rule.
    const { body } = await post(aliases(MAX_PARSE_TOKENS));
    expect(body).toMatch(/Document contains more tha[tn] \d+ tokens/);
    expect(body).not.toContain("QUERY_TOO_WIDE");
  });

  it("lets the client's own worst-case document through", async () => {
    const { body } = await post(aliases(10));
    expect(body).not.toContain("QUERY_TOO_WIDE");
    expect(body).not.toContain("tokens");
  });
});

/**
 * The last seam: the plugin exists, works and is installed *by `index.ts`*.
 *
 * Resolved rather than grepped, and rather than imported — `index.ts` listens on
 * a port at module scope, and the docblock naming the plugin sits right above
 * the line that uses it, so a comment would satisfy a grep. Same technique and
 * same lesson as `services/actors/src/lib/overture.test.ts`'s "boot wiring".
 */
describe("boot wiring", () => {
  // A repo-only program of the API, built once under a timeout sized for CPU
  // rather than inside the test (PROGRAM_TIMEOUT_MS says why).
  let project: Project;
  beforeAll(() => {
    project = loadProject(
      fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
      { repoOnly: true },
    );
  }, PROGRAM_TIMEOUT_MS);

  it("services/api/src/index.ts passes useQueryCostLimits() to Yoga", () => {
    // Resolved, not name-matched: a renamed import is the plugin, and a
    // local namesake is not. Read from the repo-only program above.
    const src = fileURLToPath(new URL(".", import.meta.url));
    const { calls, refusals } = findCalls(
      project,
      [{ module: `${src}limits.ts`, name: "useQueryCostLimits" }],
      {
        rule: "limits/boot",
        files: [sourceFileAt(project, `${src}index.ts`)],
      },
    );
    expect(refusals).toEqual([]);
    // `plugins: [ … useQueryCostLimits() … ]`, as a property assignment, so
    // that a bare mention or an import does not count.
    const installed = calls.some(({ call }) => {
      const array = call.parent;
      const property = array?.parent;
      return (
        array !== undefined &&
        ts.isArrayLiteralExpression(array) &&
        property !== undefined &&
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === "plugins"
      );
    });

    expect(
      installed,
      "services/api/src/index.ts no longer installs useQueryCostLimits(), so " +
        "every limit in limits.ts is off in production while the rule-level " +
        "assertions in this file stay green.",
    ).toBe(true);
  });
});
