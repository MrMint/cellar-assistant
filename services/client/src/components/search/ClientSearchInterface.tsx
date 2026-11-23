"use client";

import { useActor } from "@xstate/react";
import { AnimatePresence, motion } from "motion/react";

import { includes } from "ramda";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useClient } from "urql";
import { IconButton } from "@/components/app/IconButton";
import {
  Camera,
  Close,
  ICON_STROKE,
  Scan,
  Search,
} from "@/components/app/icons";
import { useNavigate } from "@/components/app/useNavigate";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useAnimatedPlaceholder } from "@/hooks/useAnimatedPlaceholder";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import {
  captureHrefWithPhoto,
  photoHandoff,
} from "@/lib/capture/photo-handoff";
import { uploadSearchPhoto } from "@/lib/items/image-search";
import { BarcodeScanner } from "../common/BarcodeScanner";
import { CameraCapture } from "../common/CameraCapture";
import { interactiveSearchMachine } from "./actors/interactiveSearch";
import { barcodeSearchHref, imageSearchHref } from "./adapter";
import { useSearchNavigation } from "./SearchNavigation";
import { modalScale } from "./search-motion";
import type { SearchNavigation } from "./search-navigation";
import { useHydratedReducedMotion } from "./useHasMounted";
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

/**
 * The Scan / Photo pills: `sm` (36 px) to sit inside the 48 px box, with a
 * pseudo-element keeping the touch target at 44 px tall (design §3.3).
 */
const PILL =
  "relative rounded-full after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']";

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
 * the barcode scanner or the camera in a `motion` card. Two changes, both
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
  const nav = useNavigate();
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
        if (method === "push") nav.push(href);
        else nav.replace(href);
      }),
    [nav, startNavigation],
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
  // N07/D25: photo search is not offered where the deployment's embedding
  // model cannot embed a photo. X06: the Photo button stays where a label
  // can still be read — its fallback reads the photo as a label in Add.
  const capabilities = useAiCapabilities();
  const photoSearchOffered = isOffered(capabilities, "imageSearch");
  const photoOffered =
    photoSearchOffered || isOffered(capabilities, "labelRead");
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
    if (!photoSearchOffered) {
      // X06: nothing here can search by photo, so the photo goes straight to
      // its fallback — read as a label in Add, with the same bytes.
      setPhotoNavigating(true);
      const href = captureHrefWithPhoto("bottle", photoHandoff.put(image));
      startNavigation(() => nav.push(href));
      return;
    }
    uploadSearchPhoto(urqlClient, image)
      .then((fileId) => {
        const href = imageSearchHref(fileId);
        if (href === null) throw new Error("The photo could not be uploaded.");
        // Kept for the results' "Read the label instead" (X06), under the
        // search file's id — the one thing the results page knows.
        photoHandoff.put(image, fileId);
        setPhotoNavigating(true);
        startNavigation(() => nav.push(href));
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

  const prefersReducedMotion = useHydratedReducedMotion();

  const isIdle = !includes(state.value, ["barcode", "image"]);
  const isSearching = includes(state.value, [
    "barcodeSearching",
    "imageSearching",
  ]);

  return (
    <div>
      <AnimatePresence mode="wait">
        {isIdle && (
          <motion.div
            key="idle"
            variants={prefersReducedMotion ? undefined : modalScale}
            initial={false}
            animate="animate"
            exit="exit"
          >
            <div className="flex flex-col gap-4">
              <InputGroup className="h-12 rounded-md bg-surface-2 transition-[box-shadow] duration-(--ca-dur-short) ease-standard dark:bg-surface-2">
                <InputGroupAddon>
                  <Search
                    aria-hidden
                    className="size-5 opacity-50"
                    strokeWidth={ICON_STROKE}
                  />
                </InputGroupAddon>
                <InputGroupInput
                  ref={inputRef}
                  // W-12: the sheet opens ready to type, so a phone brings its
                  // keyboard up. Only an empty sheet: opened on `?q=`, the
                  // results are what you came for, not a keyboard over them.
                  // The box never remounts while you type (N01), so this
                  // fires once, when the sheet opens.
                  autoFocus={!urlQuery}
                  aria-label="Search your collection"
                  enterKeyHint="search"
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
                  className="md:text-base"
                />
                <InputGroupAddon align="inline-end" className="gap-1">
                  {searchQuery && (
                    <IconButton
                      size="sm"
                      aria-label="Clear search"
                      // Keep focus in the box: a blur here would commit
                      // the old text a moment before clear commits "".
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleClear}
                    >
                      <Close />
                    </IconButton>
                  )}
                  {searchQuery ? (
                    <>
                      <IconButton
                        variant="secondary"
                        size="sm"
                        aria-label="Scan barcode"
                        onClick={() => send({ type: "SEARCH_BARCODE" })}
                      >
                        <Scan />
                      </IconButton>
                      {photoOffered && (
                        <IconButton
                          variant="secondary"
                          size="sm"
                          aria-label={
                            photoSearchOffered
                              ? "Search by photo"
                              : "Photograph a label"
                          }
                          onClick={() => send({ type: "SEARCH_IMAGE" })}
                        >
                          <Camera />
                        </IconButton>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        className={PILL}
                        onClick={() => send({ type: "SEARCH_BARCODE" })}
                      >
                        <Scan aria-hidden strokeWidth={ICON_STROKE} />
                        Scan
                      </Button>
                      {photoOffered && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className={PILL}
                          onClick={() => send({ type: "SEARCH_IMAGE" })}
                        >
                          <Camera aria-hidden strokeWidth={ICON_STROKE} />
                          Photo
                        </Button>
                      )}
                    </>
                  )}
                </InputGroupAddon>
              </InputGroup>

              {isSearching && (
                <div className="flex flex-col items-center gap-4">
                  <Spinner className="size-8 text-ink-2" />
                  <p className="type-body motion-safe:animate-pulse">
                    {state.value === "barcodeSearching"
                      ? "Searching by barcode..."
                      : "Analyzing image..."}
                  </p>
                </div>
              )}

              {photoError !== null && !isSearching && (
                <p className="type-callout text-center text-destructive">
                  {photoError}
                </p>
              )}
            </div>
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
            <CaptureCard
              title="Scan barcode"
              onCancel={() => send({ type: "CANCEL" })}
            >
              <BarcodeScanner
                cameraFallbackHint="Cancel to search by name instead."
                onChange={(barcode) => {
                  send({ type: "FOUND", barcode });
                  const href = barcodeSearchHref(barcode.text);
                  if (href === null) {
                    send({ type: "SEARCH_ERROR" });
                    return;
                  }
                  startNavigation(() => nav.push(href));
                }}
              />
            </CaptureCard>
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
            <CaptureCard
              title={
                photoSearchOffered
                  ? "Take a picture of the item"
                  : "Take a picture of the label"
              }
              onCancel={() => send({ type: "CANCEL" })}
            >
              <CameraCapture onCapture={handlePhoto} />
            </CaptureCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** The scanner's and the camera's card: a title, the capture, Cancel. */
function CaptureCard({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex max-w-(--breakpoint-md) flex-col gap-3 rounded-lg bg-surface-1 p-4">
      <h2 className="type-headline text-center text-ink-1">{title}</h2>
      {children}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
