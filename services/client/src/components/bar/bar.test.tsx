/**
 * X14's client pieces: the copy (one voice for availability and
 * makeability), What can I make's sections and "Worth picking up", the
 * Bar pantry's sections, and the ingredient row's tags — rendered to static
 * markup, the way the restored recipe pages are tested.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PANTRY_KINDS } from "@cellar-assistant/contracts/bar";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { stripTags } from "@/test-support/markup";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/recipes/bar",
  useSearchParams: () => new URLSearchParams(),
}));

const copy = await import("./copy");
const { IngredientAvailabilityTag, MakeabilitySummary } = await import(
  "./Availability"
);
const { WhatCanIMake, nextBottles } = await import("./WhatCanIMake");
const { PantryEditor, pantrySections } = await import("./PantryEditor");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>);
const text = (html: string) => stripTags(html);

const match = (
  recipeId: string,
  name: string,
  status: "MAKE_NOW" | "ONE_AWAY",
  missing: string[] = [],
  substituteCount = 0,
) => ({
  __typename: "BarRecipeMatch" as const,
  recipeId,
  recipeGroupId: null,
  name,
  makeability: {
    status,
    missing,
    missingKinds: [] as string[],
    substituteCount,
    requiredCount: 3,
    haveCount: 3 - missing.length,
  },
  recipe: {
    __typename: "Recipe" as const,
    id: recipeId,
    ingredients: { edges: [] as { node: never }[] },
  },
});

describe("copy", () => {
  test("the verdict and its detail", () => {
    const now = {
      status: "MAKE_NOW" as const,
      missing: [],
      substituteCount: 0,
    };
    assert.equal(copy.makeabilityHeadline(now), "You can make this");
    assert.equal(copy.makeabilityDetail(now), null);
    assert.equal(
      copy.makeabilityDetail({ ...now, substituteCount: 2 }),
      "with 2 swaps",
    );
    const away = {
      status: "ONE_AWAY" as const,
      missing: ["Campari"],
      substituteCount: 0,
    };
    assert.equal(copy.makeabilityHeadline(away), "One bottle away");
    assert.equal(copy.makeabilityDetail(away), "Campari");
    const far = {
      status: "MISSING" as const,
      missing: ["Gin", "Campari", "Sweet vermouth"],
      substituteCount: 0,
    };
    assert.equal(copy.makeabilityHeadline(far), "Missing 3");
    assert.equal(copy.makeabilityDetail(far), "Gin, Campari +1");
  });

  test("row descriptions", () => {
    assert.equal(
      copy.matchDescription({
        status: "MAKE_NOW",
        missing: [],
        substituteCount: 0,
      }),
      "Ready to make",
    );
    assert.equal(
      copy.matchDescription({
        status: "MAKE_NOW",
        missing: [],
        substituteCount: 1,
      }),
      "Make it with 1 swap",
    );
    assert.equal(
      copy.matchDescription({
        status: "ONE_AWAY",
        missing: ["Campari"],
        substituteCount: 0,
      }),
      "Needs Campari",
    );
  });

  test("availability tags never guess", () => {
    assert.equal(
      copy.availabilityText({
        status: "HAVE",
        source: "BOTTLE",
        label: "Buffalo Trace",
      }),
      "You have Buffalo Trace",
    );
    assert.equal(
      copy.availabilityText({
        status: "HAVE",
        source: "PANTRY",
        label: "Limes",
      }),
      "In your pantry",
    );
    assert.equal(
      copy.availabilityText({ status: "HAVE", source: "STAPLE" }),
      "Staple",
    );
    assert.equal(
      copy.availabilityText({
        status: "SUBSTITUTE",
        source: "BOTTLE",
        label: "Rittenhouse",
      }),
      "Swap: Rittenhouse",
    );
    assert.equal(copy.availabilityText({ status: "MISSING" }), "Missing");
    assert.equal(copy.availabilityText({ status: "UNKNOWN" }), "Not tracked");
  });
});

describe("availability markup", () => {
  test("a tag prints its word, and colours only Have", () => {
    const have = render(
      <IngredientAvailabilityTag
        availability={{
          status: "HAVE",
          source: "BOTTLE",
          label: "Buffalo Trace",
        }}
      />,
    );
    assert.match(have, /data-availability="have"/);
    assert.match(have, /text-success/);
    assert.match(text(have), /You have Buffalo Trace/);
    const missing = render(
      <IngredientAvailabilityTag availability={{ status: "MISSING" }} />,
    );
    assert.doesNotMatch(missing, /text-success/);
    assert.match(text(missing), /Missing/);
  });

  test("the summary links into the bar", () => {
    const html = render(
      <MakeabilitySummary
        makeability={{
          status: "ONE_AWAY",
          missing: ["Campari"],
          substituteCount: 0,
        }}
      />,
    );
    assert.match(text(html), /One bottle away · Campari/);
    assert.match(html, /href="\/recipes\/bar"/);
  });
});

describe("What can I make", () => {
  const data = {
    makeNow: [match("r1", "Old Fashioned", "MAKE_NOW")],
    oneBottleAway: [
      match("r2", "Negroni", "ONE_AWAY", ["Campari"]),
      match("r3", "Boulevardier", "ONE_AWAY", ["Campari"]),
      match("r4", "Gimlet", "ONE_AWAY", ["Gin"]),
    ],
    makeNowCount: 1,
    oneBottleAwayCount: 3,
    bottleCount: 2,
    pantryCount: 5,
    scanned: 40,
  };

  test("opens on Make now, with counts on both segments", () => {
    const html = render(<WhatCanIMake data={data} />);
    assert.match(text(html), /Make now\D*1/);
    assert.match(text(html), /One bottle away\D*3/);
    assert.match(text(html), /1 ready · 3 one away/);
    assert.match(html, /data-testid="make-now"/);
    assert.match(html, /href="\/recipes\/r1"/);
    assert.match(html, /href="\/recipes\/r1\/make"/);
    assert.match(text(html), /From 2 bottles and 5 pantry items/);
  });

  test("opens on One bottle away when nothing is makeable yet", () => {
    const html = render(
      <WhatCanIMake data={{ ...data, makeNow: [], makeNowCount: 0 }} />,
    );
    assert.match(html, /data-testid="one-bottle-away"/);
    assert.match(text(html), /Worth picking up/);
    assert.match(text(html), /Campari\s*In 2 drinks/);
  });

  test("an empty bar says how to fill it", () => {
    const html = render(
      <WhatCanIMake
        data={{
          ...data,
          makeNow: [],
          oneBottleAway: [],
          makeNowCount: 0,
          oneBottleAwayCount: 0,
          bottleCount: 0,
          pantryCount: 0,
        }}
      />,
    );
    assert.match(text(html), /Your bar is empty/);
    assert.match(text(html), /Stock pantry/);
    assert.match(html, /href="\/recipes\/bar\/pantry"/);
  });

  test("Worth picking up counts what would unlock more than one", () => {
    assert.deepEqual(nextBottles(data.oneBottleAway), [
      { name: "Campari", unlocks: 2, kind: null },
    ]);
  });

  test("Worth picking up counts one bottle once, however recipes spell it", () => {
    const missingOne = (name: string, kind: string | null) => ({
      makeability: {
        ...match("x", "x", "ONE_AWAY", [name]).makeability,
        missingKinds: kind === null ? [] : [kind],
      },
    });
    assert.deepEqual(
      nextBottles([
        missingOne("Campari", "red_bitter"),
        missingOne("Red bitter aperitivo", "red_bitter"),
        missingOne("falernum", null),
        missingOne("Falernum", null),
        missingOne("Gin", "gin"),
      ] as Parameters<typeof nextBottles>[0]),
      [
        { name: "Campari / red bitter", unlocks: 2, kind: "red_bitter" },
        { name: "falernum", unlocks: 2, kind: null },
      ],
    );
  });
});

describe("Bar pantry", () => {
  test("every toggle is in exactly one section", () => {
    const listed = pantrySections().flatMap((section) => section.kinds);
    assert.deepEqual([...listed].sort(), [...PANTRY_KINDS].sort());
  });

  test("renders a pressed chip for what is on", () => {
    const html = render(<PantryEditor initial={["lime"]} />);
    assert.match(
      html,
      /data-pantry-kind="lime"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-pantry-kind="lime"/,
    );
    assert.match(text(html), /1 of \d+/);
    assert.match(text(html), /Bottles in your cellars already count/);
    assert.match(text(html), /Citrus &amp; juice|Citrus & juice/);
  });
});
