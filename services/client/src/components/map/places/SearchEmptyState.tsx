"use client";

import { AddPlace } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { ADD_IT_HERE, NOT_ON_MAP_TITLE } from "./search-empty-state";

interface SearchEmptyStateProps {
  query: string;
  /** Starts the pin drop at the map's centre, with `query` as the name. */
  onAddHere: () => void;
}

/**
 * N22: what a map search with no results says. Markup only — when it shows
 * is `showNotOnMapYet` (`search-empty-state.ts`).
 */
export function SearchEmptyState({ query, onAddHere }: SearchEmptyStateProps) {
  return (
    <div role="status" className="surface-glass rounded-lg px-4 py-3">
      <div className="flex flex-row items-center justify-between gap-3">
        <p className="type-callout min-w-0 truncate text-ink-1">
          {NOT_ON_MAP_TITLE}
          {query ? (
            <span className="text-ink-3"> · &ldquo;{query}&rdquo;</span>
          ) : null}
        </p>
        <Button onClick={onAddHere} className="shrink-0">
          <AddPlace aria-hidden />
          {ADD_IT_HERE}
        </Button>
      </div>
    </div>
  );
}
