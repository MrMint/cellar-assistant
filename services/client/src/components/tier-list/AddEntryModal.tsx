"use client";

import {
  Box,
  Button,
  CircularProgress,
  DialogContent,
  DialogTitle,
  Divider,
  Input,
  List,
  ListItem,
  ListItemContent,
  ListItemDecorator,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { type FormEvent, useCallback, useState } from "react";
import { MdFormatListNumbered, MdPlace, MdSearch } from "react-icons/md";
import { useClient } from "urql";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { createLatestOnly } from "@/lib/latest-only";
import { isValidListType } from "./actions";
import { entryTypeOf } from "./adapter";
import type { TierListEntityType } from "./constants";
import {
  PICKER_PAGE_SIZE,
  TierListItemPickerQuery,
  TierListPlacePickerQuery,
} from "./queries";
import { formatCategoryName } from "./utils";

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
 * `AddToTierListModal`'s idiom (outlined `ModalDialog`, the numbered-list
 * title, an outlined `List`, the danger line for errors).
 *
 * The rewrite's picker offered items *and* places on every list; the old app
 * only ever added an entity to a list of its own type (`list_type`), so this
 * one searches the list's type alone: `placeSearch` for a place list,
 * `itemSearch` narrowed to the one item type otherwise. Both embed the phrase,
 * so the search is a submitted form, not search-as-you-type.
 */
export function AddEntryModal({
  open,
  onClose,
  onPick,
  busy,
  error,
  listType,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (candidate: AddEntryCandidate) => void;
  busy: boolean;
  error: string | null;
  listType: string;
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
          setSearchError(result.error.message);
          return;
        }
        setRows(
          result.data.edges.map((edge) => {
            const place = edge.node.place;
            return {
              id: edge.node.id,
              entityType: "place" as const,
              name: place.displayName ?? place.name,
              subtitle: [
                place.primaryCategory
                  ? formatCategoryName(place.primaryCategory)
                  : null,
                place.locality,
                place.countryCode,
              ]
                .filter((part) => part !== null && part !== "")
                .join(" · "),
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
        setSearchError(result.error.message);
        return;
      }
      setRows(
        result.data.edges.map((edge) => ({
          id: edge.node.id,
          entityType,
          name: edge.node.name,
          subtitle: edge.node.item?.country ?? "",
        })),
      );
    },
    [client, entityType, searchGate, text],
  );

  const message = searchError ?? error;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        variant="outlined"
        sx={{ maxWidth: 480, width: "100%", maxHeight: "86vh" }}
      >
        <ModalClose />
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <MdFormatListNumbered style={{ fontSize: 20 }} />
            <span>Add entry</span>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ overflow: "auto" }}>
          <Stack spacing={2}>
            <form onSubmit={search}>
              <Stack direction="row" spacing={1}>
                <Input
                  autoFocus
                  size="sm"
                  sx={{ flex: 1 }}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={
                    entityType === "place"
                      ? "Search places by name or what they are"
                      : `Search ${ENTITY_LABELS[entityType]} by name or description`
                  }
                  startDecorator={
                    entityType === "place" ? <MdPlace /> : <MdSearch />
                  }
                />
                <Button
                  size="sm"
                  type="submit"
                  loading={loading}
                  disabled={text.trim() === ""}
                >
                  Search
                </Button>
              </Stack>
            </form>

            {message !== null && (
              <Typography level="body-sm" color="danger">
                {message}
              </Typography>
            )}

            {loading && rows === null ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress size="sm" />
              </Box>
            ) : rows === null ? (
              <Typography
                level="body-sm"
                sx={{ color: "text.tertiary", textAlign: "center" }}
              >
                Search for {entityType === "place" ? "a place" : "an item"} to
                add. It lands in Unrated.
              </Typography>
            ) : rows.length === 0 ? (
              <Typography
                level="body-sm"
                sx={{ color: "text.tertiary", textAlign: "center" }}
              >
                Nothing matched that phrase.
              </Typography>
            ) : (
              <List
                size="sm"
                variant="outlined"
                sx={{ borderRadius: "md", overflow: "hidden" }}
              >
                {rows.map((row) => (
                  <ListItem
                    key={`${row.entityType}-${row.id}`}
                    endAction={
                      <Button
                        size="sm"
                        variant="soft"
                        disabled={busy}
                        onClick={() => onPick(row)}
                      >
                        Add
                      </Button>
                    }
                  >
                    <ListItemDecorator>
                      <MdFormatListNumbered />
                    </ListItemDecorator>
                    <ListItemContent sx={{ minWidth: 0, pr: 6 }}>
                      <Typography level="title-sm" noWrap>
                        {row.name}
                      </Typography>
                      {row.subtitle !== "" && (
                        <Typography
                          level="body-xs"
                          sx={{ color: "text.tertiary" }}
                          noWrap
                        >
                          {row.subtitle}
                        </Typography>
                      )}
                    </ListItemContent>
                  </ListItem>
                ))}
              </List>
            )}
          </Stack>
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}
