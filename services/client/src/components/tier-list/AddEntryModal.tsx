"use client";

import { type FormEvent, useCallback, useState } from "react";
import { useClient } from "urql";
import { ICON_STROKE, Place, Ranked, Search } from "@/components/app/icons";
import { ListRow } from "@/components/app/Page";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { aiOutcome } from "@/lib/ai/outcome";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { createLatestOnly } from "@/lib/latest-only";
import { displayItemName } from "@/utilities/smart-title-case";
import { isValidListType } from "./actions";
import {
  candidateHref,
  entryTypeOf,
  itemEntrySubtitle,
  placeEntrySubtitle,
} from "./adapter";
import type { TierListEntityType } from "./constants";
import {
  PICKER_PAGE_SIZE,
  TierListItemPickerQuery,
  TierListPlacePickerQuery,
} from "./queries";

export type AddEntryCandidate = {
  id: string;
  entityType: TierListEntityType;
  name: string;
  subtitle: string;
};

const ENTITY_LABELS: Record<TierListEntityType, string> = {
  place: "places",
  wine: "wines",
  beer: "beers",
  spirit: "spirits",
  coffee: "coffees",
  sake: "sake",
  tea: "teas",
};

/**
 * In-page add — **new-only, kept** (decision 2) and restyled in the old
 * `AddToTierListModal`'s idiom (the numbered-list rows, the danger line for
 * errors), on the app's `ResponsiveDialog`: a bottom sheet on a phone, a
 * centred dialog from `md` up.
 *
 * The rewrite's picker offered items *and* places on every list; the old app
 * only ever added an entity to a list of its own type (`list_type`), so this
 * one searches the list's type alone: `placeSearch` for a place list,
 * `itemSearch` narrowed to the one item type otherwise. Both embed the phrase,
 * so the search is a submitted form, not search-as-you-type.
 *
 * The parent remounts it on every open (`key`), so a reopened picker starts
 * empty rather than showing the last query's rows as if they were fresh, and
 * `onList` marks what is already on the board instead of offering "Add" for
 * it — an add the actor would only refuse.
 */
export function AddEntryModal({
  open,
  onClose,
  onPick,
  busy,
  error,
  listType,
  onList,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (candidate: AddEntryCandidate) => void;
  busy: boolean;
  error: string | null;
  listType: string;
  /** Board hrefs of the entries already on the list (`onListHrefs`). */
  onList: ReadonlySet<string>;
}) {
  const client = useClient();
  const entityType: TierListEntityType = isValidListType(listType)
    ? listType
    : "place";
  const [text, setText] = useState("");
  const [rows, setRows] = useState<AddEntryCandidate[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** A resubmit retires the search before it: only the newest may land. */
  const [searchGate] = useState(createLatestOnly);

  const search = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const phrase = text.trim();
      if (phrase === "") return;
      const isCurrent = searchGate.begin();
      setLoading(true);
      setSearchError(null);

      if (entityType === "place") {
        const response = await client
          .query(TierListPlacePickerQuery, {
            query: phrase,
            first: PICKER_PAGE_SIZE,
          })
          .toPromise();
        if (!isCurrent()) return;
        setLoading(false);
        if (response.error !== undefined) {
          setRows(null);
          setSearchError(failureFromTransport(response.error).message);
          return;
        }
        const result = unwrapResult(
          response.data?.placeSearch,
          "PlaceSearchConnection",
        );
        if (!result.ok) {
          setRows(null);
          // N07: a semantic search refused for an AI reason (no provider, a
          // spent allowance) says so in words, never the server's message.
          setSearchError(
            aiOutcome(result.error, { subject: "search" }).message,
          );
          return;
        }
        setRows(
          result.data.edges.map((edge) => {
            const place = edge.node.place;
            return {
              id: edge.node.id,
              entityType: "place" as const,
              name: place.displayName ?? place.name,
              subtitle: placeEntrySubtitle(place),
            };
          }),
        );
        return;
      }

      const itemType = entryTypeOf(entityType);
      const response = await client
        .query(TierListItemPickerQuery, {
          text: phrase,
          itemTypes: itemType === "PLACE" ? null : [itemType],
          first: PICKER_PAGE_SIZE,
        })
        .toPromise();
      if (!isCurrent()) return;
      setLoading(false);
      if (response.error !== undefined) {
        setRows(null);
        setSearchError(failureFromTransport(response.error).message);
        return;
      }
      const result = unwrapResult(
        response.data?.itemSearch,
        "ItemSearchConnection",
      );
      if (!result.ok) {
        setRows(null);
        setSearchError(aiOutcome(result.error, { subject: "search" }).message);
        return;
      }
      setRows(
        result.data.edges.map((edge) => ({
          id: edge.node.id,
          entityType,
          name: displayItemName(edge.node.name),
          subtitle: itemEntrySubtitle(edge.node.item),
        })),
      );
    },
    [client, entityType, searchGate, text],
  );

  const message = searchError ?? error;

  const placeholder =
    entityType === "place"
      ? "Search places by name or what they are"
      : `Search ${ENTITY_LABELS[entityType]} by name or description`;
  const SearchGlyph = entityType === "place" ? Place : Search;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add entry"
      className="md:max-w-[480px]"
    >
      <div className="flex flex-col gap-4 pb-1">
        <form onSubmit={search} className="flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchGlyph aria-hidden strokeWidth={ICON_STROKE} />
            </InputGroupAddon>
            <InputGroupInput
              autoFocus
              type="search"
              aria-label={placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={placeholder}
            />
          </InputGroup>
          <Button type="submit" disabled={loading || text.trim() === ""}>
            {loading && <Spinner aria-hidden />}
            Search
          </Button>
        </form>

        {message !== null && (
          <p role="alert" className="text-destructive type-callout">
            {message}
          </p>
        )}

        {loading && rows === null ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : rows === null ? (
          <p className="text-center text-ink-3 type-callout">
            Search for {entityType === "place" ? "a place" : "an item"} to add.
            It lands in Unrated.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-center text-ink-3 type-callout">
            Nothing matched that phrase.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1 md:max-h-[60vh] md:overflow-y-auto">
            {rows.map((row) => (
              <li key={`${row.entityType}-${row.id}`}>
                <ListRow
                  leading={
                    <Ranked
                      aria-hidden
                      strokeWidth={ICON_STROKE}
                      className="size-5"
                    />
                  }
                  title={row.name}
                  description={row.subtitle !== "" ? row.subtitle : undefined}
                  trailing={
                    onList.has(candidateHref(row)) ? (
                      <Badge variant="secondary" className="text-ink-2">
                        On list
                      </Badge>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onPick(row)}
                      >
                        Add
                      </Button>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  );
}
