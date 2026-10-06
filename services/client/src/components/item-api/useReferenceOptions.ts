"use client";

import { useQuery } from "urql";
import { MoreCountriesQuery, ReferenceOptionsQuery } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { type AttributeField, STATIC_OPTIONS } from "./itemFormRules";

export type ReferenceOption = { value: string; comment: string | null };

/**
 * A `referenceData` alias, narrowed.
 *
 * A7c turned `Query.referenceData` from a plain `ReferenceRowConnection` into
 * `QueryReferenceDataResult`, a §8.3 union, after D3 shipped. A reference table
 * failing to load is not something a form can do anything about — the picker
 * simply has no options — so both branches collapse to a list here rather than
 * surfacing ten separate errors.
 */
const toOptions = (
  // biome-ignore lint/suspicious/noExplicitAny: one helper over ten differently-aliased members of the same union.
  value: any,
): ReferenceOption[] => {
  const result = unwrapResult(value, "ReferenceRowConnection");
  if (!result.ok) {
    return [];
  }
  const edges = (
    result.data as {
      edges?: readonly { node: { value: string; comment: string | null } }[];
    }
  ).edges;
  return (edges ?? []).map((edge) => ({
    value: edge.node.value,
    comment: edge.node.comment ?? null,
  }));
};

/** `pageInfo` off a `referenceData` alias, or nulls when it failed. */
const toPageInfo = (
  // biome-ignore lint/suspicious/noExplicitAny: see toOptions.
  value: any,
): { hasNextPage: boolean; endCursor: string | null } => {
  const result = unwrapResult(value, "ReferenceRowConnection");
  if (!result.ok) {
    return { hasNextPage: false, endCursor: null };
  }
  const pageInfo = (
    result.data as {
      pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    }
  ).pageInfo;
  return pageInfo ?? { hasNextPage: false, endCursor: null };
};

/**
 * Every constrained field's allowed values, in as few reads as the API allows.
 *
 * `referenceData` takes one `kind` per call, so the document aliases all ten
 * kinds into a single operation. URQL caches it, and every form on the page
 * shares the one response — which matters because the wizard and the edit form
 * can both be mounted at once.
 *
 * **`first` is capped at 100 for every connection on this API**, so `country`
 * (197 rows) needs a second read. That is `MoreCountriesQuery`, paused until
 * the first page's `endCursor` exists. Without it the picker would end at
 * whatever the hundredth country happens to be, and a user from the back half
 * of the alphabet would conclude their country was not supported.
 *
 * Options are **not** cosmetic. Every one of these columns is a foreign key to
 * a reference table (or a Postgres enum), the GraphQL input takes a plain
 * `String`, and a value that is not a row fails as a constraint violation deep
 * inside `ItemActor` — for wine, beer, spirit and coffee that failure happens
 * *in the outbox*, where the user never sees it. A picker is the only design
 * that cannot produce that.
 */
export const useReferenceOptions = () => {
  const [{ data, fetching, error }] = useQuery({
    query: ReferenceOptionsQuery,
    variables: {},
  });

  const countryPage = toPageInfo(data?.country);
  const nextCursor = countryPage.hasNextPage ? countryPage.endCursor : null;

  const [{ data: more, fetching: fetchingMore }] = useQuery({
    query: MoreCountriesQuery,
    variables: { after: nextCursor ?? "" },
    pause: nextCursor === null,
  });

  const optionsFor = (field: AttributeField): ReferenceOption[] => {
    if (field.kind === "static") {
      const key = field.options;
      if (key === undefined) return [];
      return STATIC_OPTIONS[key].map((value) => ({ value, comment: null }));
    }
    if (field.kind !== "reference") return [];
    const source = field.reference;
    if (source === undefined || data === undefined) return [];
    return toOptions(data[source]);
  };

  const countries = [
    ...toOptions(data?.country),
    ...toOptions(more?.referenceData),
  ];

  return {
    optionsFor,
    countries,
    fetching: fetching || fetchingMore,
    error,
  };
};
