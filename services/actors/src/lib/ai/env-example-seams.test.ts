/**
 * The operator-facing lists of model seams stay whole.
 *
 * `infra/.env.example` tells an operator which names `AI_BUDGET_MAX_REQUESTS`
 * accepts, and `services/actors/README.md` tables which seam backs which
 * feature. Both are prose, so nothing failed when X19 added
 * `item_suggestions` (and X02 `flavour_tags`, G32 the two image seams) without
 * them: a cap written for a seam the example never named reads as a typo to
 * the operator who has to set it. `MODEL_SEAMS` is the source of truth; these
 * read the documents and compare.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODEL_SEAMS } from "../../actors/budget-actor.ts";

const repoFile = (path: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../${path}`, import.meta.url)),
    "utf8",
  );

/** The comma-separated seam names under "Per-seam monthly request caps". */
const documentedSeams = (envExample: string): string[] => {
  const lines = envExample.split("\n");
  const start = lines.findIndex((line) =>
    line.startsWith("# Per-seam monthly request caps"),
  );
  if (start === -1) throw new Error("no per-seam caps block in .env.example");
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("#") || line.startsWith("#AI_BUDGET")) break;
    block.push(line.replace(/^#\s?/, ""));
  }
  // The names are the snake_case words of the final, period-terminated list.
  const list = block.join(" ").split(":").pop() ?? "";
  return list
    .replace(/\.\s*$/, "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
};

describe("documented model seams", () => {
  it("infra/.env.example names every MODEL_SEAMS entry for AI_BUDGET_MAX_REQUESTS, and nothing else", () => {
    expect(documentedSeams(repoFile("infra/.env.example")).sort()).toEqual(
      [...MODEL_SEAMS].sort(),
    );
  });

  it("services/actors/README.md tables the item_suggestions seam (X19)", () => {
    const readme = repoFile("services/actors/README.md");
    expect(readme).toContain("`ItemSuggestionsProvider`");
    expect(readme).toContain("`src/lib/item-suggestions.ts`");
  });
});
