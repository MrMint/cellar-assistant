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
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { MdClose, MdScanner, MdSearch } from "react-icons/md";
import { useAnimatedPlaceholder } from "@/hooks/useAnimatedPlaceholder";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { BarcodeScanner } from "../common/BarcodeScanner";
import { interactiveSearchMachine } from "./actors/interactiveSearch";
import { barcodeSearchHref } from "./adapter";
import { modalScale } from "./motion-variants";

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

const SEARCH_DEBOUNCE_MS = 300;

interface ClientSearchInterfaceProps {
  initialQuery?: string;
}

/**
 * `82450ad1:src/components/search/ClientSearchInterface.tsx`, restored.
 *
 * Same box: animated placeholder, no submit button, a 300 ms debounce that
 * navigates to `?q=`, the clear button and the Scan button opening the barcode
 * scanner in a framer-motion card. Two changes, both data-side:
 *
 * - **No Photo button.** Image search is a chosen drop (G32); the camera half
 *   of the old machine went with it.
 * - **A scan navigates to `?barcode=<code>`.** The old `barcodeSearchAction`
 *   serialized whole result rows into the URL (`?barcode_results=<JSON>`,
 *   forgeable and unbounded, §7) — and its search was a stub that returned
 *   nothing. Now the URL carries the code and the server page looks it up.
 *   The machine stays in `barcodeSearching` while the navigation is pending.
 */
export const ClientSearchInterface = ({
  initialQuery,
}: ClientSearchInterfaceProps) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery || "");
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isMobile = useMediaQuery("(max-width: 600px)");
  const examples = isMobile ? SEARCH_EXAMPLES_MOBILE : SEARCH_EXAMPLES_DESKTOP;
  const isPlaceholderActive = !isFocused && !searchQuery;

  const animatedPlaceholder = useAnimatedPlaceholder({
    examples,
    enabled: isPlaceholderActive,
  });

  const [state, send] = useActor(interactiveSearchMachine, {
    input: {},
  });
  const [isNavigating, startNavigation] = useTransition();

  // The old action resolved after its redirect; a transition's end is the
  // same moment for a client navigation.
  useEffect(() => {
    if (state.value === "barcodeSearching" && !isNavigating) {
      send({ type: "SEARCH_COMPLETE" });
    }
  }, [state.value, isNavigating, send]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) {
        router.push(`/search?q=${encodeURIComponent(value.trim())}`);
      } else {
        router.push("/search");
      }
    }, SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery("");
    router.push("/search");
    inputRef.current?.focus();
  };

  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );

  const isIdle = state.value !== "barcode";
  const isSearching = state.value === "barcodeSearching";

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
                slotProps={{ input: { ref: inputRef } }}
                placeholder={
                  isPlaceholderActive
                    ? animatedPlaceholder
                    : "Search your collection..."
                }
                value={searchQuery}
                onChange={handleChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
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
                        onClick={handleClear}
                        sx={{ minWidth: "auto", p: "4px" }}
                      >
                        <MdClose style={{ fontSize: "1.1rem" }} />
                      </IconButton>
                    )}
                    {searchQuery ? (
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
                    ) : (
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
                    Searching by barcode...
                  </Typography>
                </Stack>
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
      </AnimatePresence>
    </Box>
  );
};
