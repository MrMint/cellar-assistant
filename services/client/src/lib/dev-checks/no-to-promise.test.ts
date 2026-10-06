/**
 * No hand-rolled request plumbing in components — unless it says why.
 *
 * `client.query(…).toPromise()` in a component is where every race this
 * client has had lives: fifteen components tracked `endCursor` by hand, eleven
 * appended pages by hand, and only four gated which answer could land, so a
 * "Load more" in flight across a filter change appended the old filter's rows
 * and cursor to the new list, and a double click rendered a page twice. The
 * paging ones now go through `usePagedConnection` (`src/lib/paging/`), which
 * owns the gate; mutations go through urql's `useMutation`.
 *
 * What is left is imperative on purpose — a poll, a search run on submit, a
 * map that re-reads on every pan — and each such file is listed in
 * {@link EXEMPT} with how many calls it makes and why a hook does not fit.
 * The count is exact, so a new `.toPromise()` in an exempt file is a failure
 * too: somebody should look at whether it is gated before it lands. The shape
 * is `services/api`'s `NO_SURFACE`: the reason is the point.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const COMPONENTS = fileURLToPath(new URL("../../components", import.meta.url));

type Exemption = { readonly calls: number; readonly reason: string };

/**
 * Files under `src/components/` that may call `.toPromise()`, keyed by path
 * relative to it. Every entry's requests are gated — by `createLatestOnly`
 * or an effect's `cancelled` flag — and the reason says which.
 */
const EXEMPT: Readonly<Record<string, Exemption>> = {
  "map/actions.ts": {
    calls: 12,
    reason:
      "The old map server actions as client functions (82450ad1's " +
      "map/actions.ts, place-actions.ts, menuScanning.ts): the map machine's " +
      "fetch (geocode → placeSearch, or mapBrowse walked page by page to the " +
      "500-feature limit) runs one at a time and xstate drops the answer of a " +
      "fetch it re-entered past; the form's geocode/Google/duplicate reads, " +
      "the deep-link read and the scan-status poll are one-shots whose " +
      "callers carry a `cancelled` flag; the G21 details pre-fill is a " +
      "one-shot per pick whose caller keeps only the latest pick's answer " +
      "(a request counter in CreatePlaceForm); the rest are submit-driven " +
      "writes.",
  },
  "tier-list/AddEntryModal.tsx": {
    calls: 2,
    reason:
      "The picker runs one search on submit (items, or places for a place " +
      "list) and shows one page of candidates to pick from; there is no list " +
      "to page. Both are behind one `searchGate`, so a resubmit retires the " +
      "search before it.",
  },
  "cellar-api/CellarCheckIns.tsx": {
    calls: 1,
    reason:
      "`Cellar.checkIns` is reachable only through CellarDetailQuery, so 'more' " +
      "re-reads the cellar with a bigger window and replaces the list — not a " +
      "cursor walk the hook models. `windowGate` keeps a smaller, older window " +
      "from landing after a bigger one.",
  },
  "recipe/RecipePhotoProcessor.tsx": {
    calls: 1,
    reason:
      "Polls one recipe-photo job to a terminal state with network-only reads " +
      "in an effect whose cleanup sets `cancelled`; a poll is a loop over one " +
      "object, not a list.",
  },
  "common/OnboardingWizard/actors/createItem.ts": {
    calls: 4,
    reason:
      "The onboarding save as one sequence: confirm, a network-only poll until " +
      "the outbox has written the item (bounded by a deadline), then " +
      "ensureBarcode + linkBarcodeItem for a typed code. Each step needs the " +
      "previous one's answer; nothing here is a list, and the form's submit " +
      "is the only caller, so there is nothing for a newer request to race.",
  },
  "common/OnboardingWizard/actors/fetchDefaults.ts": {
    calls: 1,
    reason:
      "An xstate promise actor (the restored OnboardingMachine's `analyze`): " +
      "one startItemOnboarding per invocation, and xstate drops the result of " +
      "an actor whose state has been left, which is the gate.",
  },
  "common/OnboardingWizard/actors/insertCellarItem.ts": {
    calls: 1,
    reason:
      "An xstate promise actor (`addItemToCellar`): one addItemToCellar with a " +
      "client-minted cellarItemId after the display photo is attached; the " +
      "machine discards the answer of an actor it has left.",
  },
  "common/OnboardingWizard/actors/searchByBarcode.ts": {
    calls: 1,
    reason:
      "An xstate promise actor (`searching`): one barcode(code) lookup per " +
      "scan, network-only, read once to choose a next state — not a list to " +
      "page, and the machine drops an answer for a state it has left.",
  },
  "common/OnboardingWizard/actors/uploadItemImage.ts": {
    calls: 1,
    reason:
      "attachItemImage after the presigned upload, inside the `uploadImage` / " +
      "`addItemToCellar` promise actors; one call per photo, whose answer is " +
      "the image id the next step needs.",
  },
};

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });

/** `.toPromise()` call sites per file, read from the AST (comments excluded). */
const toPromiseCalls = (): Map<string, number[]> => {
  const found = new Map<string, number[]>();
  for (const file of sourceFiles(COMPONENTS)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("toPromise")) continue;
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.ESNext,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const lines: number[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "toPromise"
      ) {
        lines.push(
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (lines.length > 0) found.set(relative(COMPONENTS, file), lines);
  }
  return found;
};

describe("no .toPromise() in src/components/** outside the exemptions", () => {
  const calls = toPromiseCalls();

  test("no unlisted component calls .toPromise()", () => {
    const unlisted = [...calls]
      .filter(([file]) => !Object.hasOwn(EXEMPT, file))
      .map(([file, lines]) => `${file}:${lines.join(",")}`);
    assert.deepEqual(
      unlisted,
      [],
      "Page a list with usePagedConnection (src/lib/paging/use-paged-connection.ts), " +
        "run a mutation with urql's useMutation, or — if neither fits — gate the " +
        "request (src/lib/latest-only.ts) and add the file to EXEMPT with a reason.",
    );
  });

  test("every exempt file makes exactly the calls it declares", () => {
    const drifted = Object.entries(EXEMPT).flatMap(([file, { calls: n }]) => {
      const actual = calls.get(file)?.length ?? 0;
      return actual === n ? [] : [`${file}: declares ${n}, has ${actual}`];
    });
    assert.deepEqual(
      drifted,
      [],
      "A new call in an exempt file needs the same look the first ones got — is " +
        "it gated? A call that went away should take its count (or entry) with it.",
    );
  });

  test("every exemption gives a real reason", () => {
    const lazy = Object.entries(EXEMPT)
      .filter(([, { reason }]) => reason.trim().length < 80)
      .map(([file]) => file);
    assert.deepEqual(lazy, []);
  });
});
