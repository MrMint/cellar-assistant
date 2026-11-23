/**
 * H-8: a bottle card's title morphs into the bottle page's heading (B05).
 *
 * `<ViewTransition>` renders nothing on the server, so `MorphTitle` is
 * swapped for a probe that marks its child. The probe passes through to the
 * real component unless `probing` is on, so the module mock (process-wide in
 * bun) changes no other file's markup.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NextImageConfig,
  nextImageModule,
} from "../../test-support/next-image";

mock.module("next/image", () => nextImageModule("art"));

const real = await import("@/components/app/RouteTransition");
// Held before the mock: bun patches `real` in place, so `real.MorphTitle`
// would be the probe itself afterwards.
const RealMorphTitle = real.MorphTitle;
let probing = false;
mock.module("@/components/app/RouteTransition", () => ({
  ...real,
  MorphTitle: (props: ComponentProps<typeof RealMorphTitle>) =>
    probing ? (
      <span data-morph={props.href ?? "(self)"}>{props.children}</span>
    ) : (
      RealMorphTitle(props)
    ),
}));

const { BottleCard } = await import("./BottleCard");

const probe = (node: React.ReactNode): string => {
  probing = true;
  try {
    return renderToStaticMarkup(<NextImageConfig>{node}</NextImageConfig>);
  } finally {
    probing = false;
  }
};

describe("BottleCard title morph (H-8)", () => {
  test("the title link sits in a MorphTitle named for the card's href", () => {
    const html = probe(
      <BottleCard
        cell={
          {
            type: "WINE",
            item: {
              id: "bottle-1",
              itemId: "item-1",
              name: "Barolo",
              vintage: "2016",
              plate: { producer: "Vietti", name: "Barolo", vintage: "2016" },
              favoriteCount: 0,
              reviewCount: 0,
            },
            bottle: { openAt: null, emptyAt: null, percentageRemaining: 100 },
          } as unknown as ComponentProps<typeof BottleCard>["cell"]
        }
        href="/cellars/c1/wines/bottle-1"
        now={Date.parse("2026-10-08T12:00:00.000Z")}
      />,
    );
    assert.match(
      html,
      /<span data-morph="\/cellars\/c1\/wines\/bottle-1"><a\b[^>]*href="\/cellars\/c1\/wines\/bottle-1"[^>]*>2016 Barolo<\/a><\/span>/,
    );
  });
});
