"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "urql";
import { TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  itemCardFromFragment,
  primaryBrandName,
} from "@/components/item/ItemCard/adapter";
import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { Button } from "@/components/ui/button";
import { readFragment } from "@/lib/api/graphql";
import { feedback } from "@/lib/feedback";
import type { ExistingItem } from "./adapter";
import {
  type CatalogCandidate,
  normalizeName,
  TYPE_AHEAD_MIN,
  typeAheadLine,
  typeAheadMatch,
} from "./catalog-match";
import {
  CATALOG_MATCH_LIMIT,
  CATALOG_MATCH_MAX_DISTANCE,
  OnboardingCatalogMatchQuery,
} from "./queries";

/** How long typing pauses before the catalog is asked. */
const TYPE_AHEAD_DELAY_MS = 300;

/**
 * F-60 (board add-bottle-17): under Name, the catalog item the person is
 * typing, as one row with "Add". A tap files another bottle of it (or opens
 * it, with no cellar) through the machine's match path; nothing is created.
 * Quiet while the name is short, while the search is out, and when nothing
 * fits.
 */
export function TypeAheadRow({
  type,
  name,
  inCellar,
  excludeItemIds,
  disabled,
  onAdd,
}: {
  type: ApiItemType;
  name: string;
  inCellar: boolean;
  excludeItemIds: readonly string[];
  disabled?: boolean;
  onAdd: (match: ExistingItem) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    const next = normalizeName(name);
    const timer = setTimeout(() => setText(next), TYPE_AHEAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [name]);
  const short = text.replace(/\s/g, "").length < TYPE_AHEAD_MIN;
  const [{ data }] = useQuery({
    query: OnboardingCatalogMatchQuery,
    variables: {
      text,
      itemTypes: [type],
      first: CATALOG_MATCH_LIMIT,
      limit: CATALOG_MATCH_LIMIT,
      maxDistance: CATALOG_MATCH_MAX_DISTANCE,
    },
    pause: short,
  });
  const match = useMemo(() => {
    const result = data?.itemSearch;
    if (short || result?.__typename !== "ItemSearchConnection") return null;
    const candidates: CatalogCandidate[] = result.edges.map(({ node }) => {
      const card = readFragment(ItemCardFragment, node.item);
      return {
        item: itemCardFromFragment(node.item),
        type: card.type,
        source: "search" as const,
        distance: node.distance ?? undefined,
        brandName: primaryBrandName(card),
      };
    });
    return typeAheadMatch({ typed: name, candidates, excludeItemIds });
  }, [data, short, name, excludeItemIds]);
  if (match === null) return null;
  const line = typeAheadLine(match);
  return (
    <div
      data-slot="type-ahead-match"
      className="flex items-center gap-3 rounded-lg bg-raised p-2"
    >
      {match.item.displayImageUrl === undefined ? (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-card">
          <TypeGlyph type={match.type} className="size-5" />
        </span>
      ) : (
        <Image
          src={match.item.displayImageUrl}
          alt=""
          width={96}
          height={96}
          className="size-12 shrink-0 rounded-md object-cover"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-head truncate text-ink">{match.item.name}</span>
        {line !== undefined && (
          <span className="t-cap truncate text-ink-2">{line}</span>
        )}
      </span>
      <Button
        type="button"
        variant="quiet"
        disabled={disabled}
        aria-label={`${inCellar ? "Add a bottle of" : "Use"} ${match.item.name}`}
        onClick={() => {
          feedback("press");
          onAdd(match);
        }}
      >
        {inCellar ? "Add" : "Use"}
      </Button>
    </div>
  );
}
