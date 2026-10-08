"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { useActor } from "@xstate/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { includes } from "ramda";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MdCamera, MdClose, MdScanner, MdSearch } from "react-icons/md";
import { useClient } from "urql";
import { useAnimatedPlaceholder } from "@/hooks/useAnimatedPlaceholder";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { uploadSearchPhoto } from "@/lib/items/image-search";
import { BarcodeScanner } from "../common/BarcodeScanner";
import { CameraCapture } from "../common/CameraCapture";
import { interactiveSearchMachine } from "./actors/interactiveSearch";
import { barcodeSearchHref, imageSearchHref } from "./adapter";
import { modalScale } from "./motion-variants";
import { useSearchNavigation } from "./SearchNavigation";
import type { SearchNavigation } from "./search-navigation";
import { useSearchQuery } from "./useSearchQuery";

const SEARCH_EXAMPLES_DESKTOP = [
  "Search your collection...",
  "a bold Cabernet Sauvignon...",
  "hazy IPA from the Midwest...",
  "single malt Scotch whisky...",
  "Ethiopian natural process...",
  "something for date night...",
];

const SEARCH_EXAMPLES_MOBILE = [
  "Search your collection...",
  "bold Cabernet...",
  "hazy IPA...",
  "single malt...",
  "Ethiopian coffee...",
  "date night pick...",
];

interface ClientSearchInterfaceProps {
  /**
   * The `?q=` the page was rendered for. Not just the initial value: the box
   * follows it when the URL changes under it (Back, Forward, a link).
   */
  urlQuery?: string | null;
}

/**
 * `82450ad1:src/components/search/ClientSearchInterface.tsx`, restored.
 *
 * Same box: animated placeholder, no submit button, a 300 ms debounce that
 * navigates to `?q=`, the clear button, and the Scan and Photo buttons opening
 * the barcode scanner or the camera in a framer-motion card. Two changes, both
 * data-side:
 *
 * - **A photo is uploaded, then navigates to `?image=<fileId>`** (G32). The
 *   old `imageSearchAction` posted the capture's base64 data URL to a server
 *   action and serialized the result rows into `?image_results=<JSON>`. Now
 *   the capture goes up the presigned path (`image-search`) and the server
 *   page searches with the file id. The machine stays in `imageSearching`
 *   through the upload and the navigation. A failed upload says so under the
 *   box, where the old flow returned to idle silently.
 * - **A scan navigates to `?barcode=<code>`.** The old `barcodeSearchAction`
 *   serialized whole result rows into the URL (`?barcode_results=<JSON>`,
 *   forgeable and unbounded, §7) — and its search was a stub that returned
 *   nothing. Now the URL carries the code and the server page looks it up.
 *   The machine stays in `barcodeSearching` while the navigation is pending.
 *
 * And the box never remounts while you type (N01): the page renders it in one
 * slot for both the landing and the results view, typing `replace`s the URL
 * (a typing session opens with one `push`; `search-navigation.ts` has the
 * rules), and every navigation runs in the page's shared transition, so the
 * results below show a skeleton while the next page streams.
 */
export const ClientSearchInterface = ({
  urlQuery,
}: ClientSearchInterfaceProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // The page's shared transition when there is one (the results skeleton
  // reads it); a local one otherwise.
  const [localPending, localStartTransition] = useTransition();
  const shared = useSearchNavigation();
  const isNavigating = shared?.isPending ?? localPending;
  const startNavigation = shared?.startTransition ?? localStartTransition;

  const navigate = useCallback(
    ({ method, href }: SearchNavigation) =>
      startNavigation(() => {
        if (method === "push") router.push(href);
        else router.replace(href);
      }),
    [router, startNavigation],
  );
  const {
    value: searchQuery,
    onChange,
    commit,
    clear,
  } = useSearchQuery({ urlQuery, navigate, isNavigating });

  const isMobile = useMediaQuery("(max-width: 600px)");
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");
  const examples = isMobile ? SEARCH_EXAMPLES_MOBILE : SEARCH_EXAMPLES_DESKTOP;
  const isPlaceholderActive = !isFocused && !searchQuery;

  const animatedPlaceholder = useAnimatedPlaceholder({
    examples,
    enabled: isPlaceholderActive,
  });

  const [state, send] = useActor(interactiveSearchMachine, {
    input: {},
  });
  const urqlClient = useClient();
  // N07/D25: photo search is hidden, not refused, where the deployment's
  // embedding model cannot embed a photo.
  const photoOffered = isOffered(useAiCapabilities(), "imageSearch");
  const [photoError, setPhotoError] = useState<string | null>(null);

  // The old action resolved after its redirect; a transition's end is the
  // same moment for a client navigation. An image search is still uploading
  // until `photoNavigating` says the navigation has started.
  const [photoNavigating, setPhotoNavigating] = useState(false);
  useEffect(() => {
    if (state.value === "barcodeSearching" && !isNavigating) {
      send({ type: "SEARCH_COMPLETE" });
    }
    if (state.value === "imageSearching" && photoNavigating && !isNavigating) {
      setPhotoNavigating(false);
      send({ type: "SEARCH_COMPLETE" });
    }
  }, [state.value, isNavigating, photoNavigating, send]);

  const handlePhoto = (image: string) => {
    send({ type: "CAPTURED", image });
    setPhotoError(null);
    uploadSearchPhoto(urqlClient, image)
      .then((fileId) => {
        const href = imageSearchHref(fileId);
        if (href === null) throw new Error("The photo could not be uploaded.");
        setPhotoNavigating(true);
        startNavigation(() => router.push(href));
      })
      .catch((error: unknown) => {
        setPhotoError(
          error instanceof Error
            ? error.message
            : "The photo could not be uploaded.",
        );
        send({ type: "SEARCH_ERROR" });
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    commit();
    // On a phone, Search on the keyboard should reveal the results.
    if (isCoarsePointer) inputRef.current?.blur();
  };

  const handleClear = () => {
    clear();
    inputRef.current?.focus();
  };

  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );

  const isIdle = !includes(state.value, ["barcode", "image"]);
  const isSearching = includes(state.value, [
    "barcodeSearching",
    "imageSearching",
  ]);

  return (
    <Box>
      <AnimatePresence mode="wait">
        {isIdle && (
          <motion.div
            key="idle"
            variants={prefersReducedMotion ? undefined : modalScale}
            initial={false}
            animate="animate"
            exit="exit"
          >
            <Stack spacing={2}>
              <Input
                slotProps={{
                  input: {
                    ref: inputRef,
                    "aria-label": "Search your collection",
                    enterKeyHint: "search",
                  },
                }}
                placeholder={
                  isPlaceholderActive
                    ? animatedPlaceholder
                    : "Search your collection..."
                }
                value={searchQuery}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                  setIsFocused(false);
                  commit();
                }}
                startDecorator={
                  <MdSearch style={{ fontSize: "1.25rem", opacity: 0.5 }} />
                }
                endDecorator={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {searchQuery && (
                      <IconButton
                        variant="plain"
                        color="neutral"
                        size="sm"
                        aria-label="Clear search"
                        // Keep focus in the box: a blur here would commit
                        // the old text a moment before clear commits "".
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleClear}
                        sx={{ minWidth: "auto", p: "4px" }}
                      >
                        <MdClose style={{ fontSize: "1.1rem" }} />
                      </IconButton>
                    )}
                    {searchQuery ? (
                      <>
                        <IconButton
                          variant="soft"
                          color="neutral"
                          size="sm"
                          aria-label="Scan barcode"
                          onClick={() => send({ type: "SEARCH_BARCODE" })}
                          sx={{
                            borderRadius: "50%",
                            "--IconButton-size": "30px",
                          }}
                        >
                          <MdScanner style={{ fontSize: "1.1rem" }} />
                        </IconButton>
                        {photoOffered && (
                          <IconButton
                            variant="soft"
                            color="neutral"
                            size="sm"
                            aria-label="Search by photo"
                            onClick={() => send({ type: "SEARCH_IMAGE" })}
                            sx={{
                              borderRadius: "50%",
                              "--IconButton-size": "30px",
                            }}
                          >
                            <MdCamera style={{ fontSize: "1.1rem" }} />
                          </IconButton>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          variant="soft"
                          color="neutral"
                          size="sm"
                          startDecorator={
                            <MdScanner style={{ fontSize: "1rem" }} />
                          }
                          onClick={() => send({ type: "SEARCH_BARCODE" })}
                          sx={{
                            borderRadius: "lg",
                            fontSize: "xs",
                            fontWeight: "md",
                            px: 1.5,
                            "--Button-minHeight": "30px",
                          }}
                        >
                          Scan
                        </Button>
                        {photoOffered && (
                          <Button
                            variant="soft"
                            color="neutral"
                            size="sm"
                            startDecorator={
                              <MdCamera style={{ fontSize: "1rem" }} />
                            }
                            onClick={() => send({ type: "SEARCH_IMAGE" })}
                            sx={{
                              borderRadius: "lg",
                              fontSize: "xs",
                              fontWeight: "md",
                              px: 1.5,
                              "--Button-minHeight": "30px",
                            }}
                          >
                            Photo
                          </Button>
                        )}
                      </>
                    )}
                  </Stack>
                }
                sx={{
                  "--Input-minHeight": "48px",
                  fontSize: "md",
                  borderRadius: "xl",
                  "--Input-focusedThickness": "1.5px",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  "&:focus-within": {
                    boxShadow: "sm",
                  },
                }}
              />

              {isSearching && (
                <Stack
                  spacing={2}
                  alignItems="center"
                  sx={{
                    "@keyframes pulse": {
                      "0%, 100%": { opacity: 0.6 },
                      "50%": { opacity: 1 },
                    },
                  }}
                >
                  <CircularProgress />
                  <Typography
                    level="body-md"
                    sx={{
                      "@media (prefers-reduced-motion: no-preference)": {
                        animation: "pulse 2s ease-in-out infinite",
                      },
                    }}
                  >
                    {state.value === "barcodeSearching"
                      ? "Searching by barcode..."
                      : "Analyzing image..."}
                  </Typography>
                </Stack>
              )}

              {photoError !== null && !isSearching && (
                <Typography
                  level="body-sm"
                  color="danger"
                  sx={{ textAlign: "center" }}
                >
                  {photoError}
                </Typography>
              )}
            </Stack>
          </motion.div>
        )}

        {state.value === "barcode" && (
          <motion.div
            key="barcode"
            variants={prefersReducedMotion ? undefined : modalScale}
            initial={prefersReducedMotion ? false : "initial"}
            animate="animate"
            exit="exit"
          >
            <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.md })}>
              <Card sx={{ padding: "1rem" }}>
                <Typography level="title-lg" textAlign="center">
                  Scan barcode
                </Typography>
                <BarcodeScanner
                  onChange={(barcode) => {
                    send({ type: "FOUND", barcode });
                    const href = barcodeSearchHref(barcode.text);
                    if (href === null) {
                      send({ type: "SEARCH_ERROR" });
                      return;
                    }
                    startNavigation(() => router.push(href));
                  }}
                />
                <CardContent
                  orientation="horizontal"
                  sx={{ justifyContent: "flex-end" }}
                >
                  <Button onClick={() => send({ type: "CANCEL" })}>
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            </Box>
          </motion.div>
        )}

        {state.value === "image" && (
          <motion.div
            key="image"
            variants={prefersReducedMotion ? undefined : modalScale}
            initial={prefersReducedMotion ? false : "initial"}
            animate="animate"
            exit="exit"
          >
            <Box sx={(theme) => ({ maxWidth: theme.breakpoints.values.md })}>
              <Card sx={{ padding: "1rem" }}>
                <Typography level="title-lg" textAlign="center">
                  Take a picture of the item
                </Typography>
                <CameraCapture onCapture={handlePhoto} />
                <CardContent
                  orientation="horizontal"
                  sx={{ justifyContent: "space-between" }}
                >
                  <Button
                    onClick={() => send({ type: "CANCEL" })}
                    color="neutral"
                  >
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
};
