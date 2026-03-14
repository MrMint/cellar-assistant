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
import { AnimatePresence, motion } from "framer-motion";
import { useActor } from "@xstate/react";
import { useRouter } from "next/navigation";
import { includes } from "ramda";
import { useEffect, useRef, useState } from "react";
import { MdCamera, MdClose, MdScanner, MdSearch } from "react-icons/md";
import {
  barcodeSearchAction,
  imageSearchAction,
} from "@/app/(authenticated)/search/actions";
import { useAnimatedPlaceholder } from "@/hooks/useAnimatedPlaceholder";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { BarcodeScanner } from "../common/BarcodeScanner";
import { CameraCapture } from "../common/CameraCapture";
import { interactiveSearchMachine } from "./actors/interactiveSearch";
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
                          onClick={() => send({ type: "SEARCH_BARCODE" })}
                          sx={{
                            borderRadius: "50%",
                            "--IconButton-size": "30px",
                          }}
                        >
                          <MdScanner style={{ fontSize: "1.1rem" }} />
                        </IconButton>
                        <IconButton
                          variant="soft"
                          color="neutral"
                          size="sm"
                          onClick={() => send({ type: "SEARCH_IMAGE" })}
                          sx={{
                            borderRadius: "50%",
                            "--IconButton-size": "30px",
                          }}
                        >
                          <MdCamera style={{ fontSize: "1.1rem" }} />
                        </IconButton>
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
                    const form = document.createElement("form");
                    form.style.display = "none";

                    const barcodeInput = document.createElement("input");
                    barcodeInput.name = "barcode";
                    barcodeInput.value = JSON.stringify(barcode);

                    form.appendChild(barcodeInput);
                    document.body.appendChild(form);

                    barcodeSearchAction(new FormData(form))
                      .then(() => {
                        document.body.removeChild(form);
                        send({ type: "SEARCH_COMPLETE" });
                      })
                      .catch(() => {
                        document.body.removeChild(form);
                        send({ type: "SEARCH_ERROR" });
                      });
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
                <CameraCapture
                  onCapture={(image) => {
                    send({ type: "CAPTURED", image });
                    const form = document.createElement("form");
                    form.style.display = "none";

                    const imageInput = document.createElement("input");
                    imageInput.name = "image";
                    imageInput.value = image;

                    form.appendChild(imageInput);
                    document.body.appendChild(form);

                    imageSearchAction(new FormData(form))
                      .then(() => {
                        document.body.removeChild(form);
                        send({ type: "SEARCH_COMPLETE" });
                      })
                      .catch(() => {
                        document.body.removeChild(form);
                        send({ type: "SEARCH_ERROR" });
                      });
                  }}
                />
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
