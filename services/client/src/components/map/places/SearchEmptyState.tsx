"use client";

import { Button, Sheet, Stack, Typography } from "@mui/joy";
import { MdAddLocationAlt } from "react-icons/md";
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
    <Sheet
      role="status"
      variant="outlined"
      sx={{
        borderRadius: "md",
        boxShadow: "md",
        px: 2,
        py: 1.5,
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        justifyContent="space-between"
      >
        <Typography level="body-sm" sx={{ minWidth: 0 }} noWrap>
          {NOT_ON_MAP_TITLE}
          {query ? (
            <Typography textColor="text.tertiary">
              {" "}
              · &ldquo;{query}&rdquo;
            </Typography>
          ) : null}
        </Typography>
        <Button
          size="sm"
          variant="solid"
          startDecorator={<MdAddLocationAlt />}
          onClick={onAddHere}
          sx={{ flexShrink: 0 }}
        >
          {ADD_IT_HERE}
        </Button>
      </Stack>
    </Sheet>
  );
}
