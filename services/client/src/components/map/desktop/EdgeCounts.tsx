"use client";

import { ArrowDown, ArrowUp, Back, ICON_STROKE } from "@/components/app/icons";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import type { Edge, Edges } from "../core/own-places";

const PLACE: Record<Edge, string> = {
  left: "left-3 top-1/2 -translate-y-1/2",
  right: "right-16 top-1/2 -translate-y-1/2",
  up: "top-3 left-1/2 -translate-x-1/2",
  down: "bottom-10 left-1/2 -translate-x-1/2",
};

const WORDS: Record<Edge, string> = {
  left: "to the west",
  right: "to the east",
  up: "to the north",
  down: "to the south",
};

function EdgeGlyph({ edge }: { edge: Edge }) {
  const props = {
    "aria-hidden": true,
    strokeWidth: ICON_STROKE,
    className: "size-4",
  } as const;
  if (edge === "up") return <ArrowUp {...props} />;
  if (edge === "down") return <ArrowDown {...props} />;
  return (
    <Back
      {...props}
      className={cn("size-4", edge === "right" && "rotate-180")}
    />
  );
}

/**
 * F-34 (desktop/Places): how many of yours lie past each edge of the map,
 * "← 12" at the left and so on; a tap takes the map to that side's places.
 */
export function EdgeCounts({
  edges,
  onShow,
}: {
  edges: Edges;
  onShow: (edge: Edge) => void;
}) {
  return (
    <>
      {(Object.keys(PLACE) as Edge[]).map((edge) =>
        edges[edge] === 0 ? null : (
          <button
            key={edge}
            type="button"
            data-slot="map-edge-count"
            aria-label={`${edges[edge]} of your places ${WORDS[edge]}, show them`}
            onClick={() => {
              feedback("tick");
              onShow(edge);
            }}
            className={cn(
              "t-cap tabular absolute z-[12] inline-flex h-11 items-center gap-1.5 rounded-full border border-edge bg-surface-1/90 px-3 text-ink shadow-md outline-none active:bg-raised focus-visible:outline-2 focus-visible:outline-act-ink",
              PLACE[edge],
            )}
          >
            {edge !== "right" && edge !== "down" && <EdgeGlyph edge={edge} />}
            {edge === "down" && <EdgeGlyph edge={edge} />}
            {edges[edge]}
            {edge === "right" && <EdgeGlyph edge={edge} />}
          </button>
        ),
      )}
    </>
  );
}
