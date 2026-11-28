"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useClient } from "urql";
import {
  Barcode,
  Camera,
  Close,
  ICON_STROKE,
  Photo,
  Search,
} from "@/components/app/icons";
import { useAppKey } from "@/components/app/overlays/app-keys";
import { pressFeedback } from "@/components/app/overlays/press";
import { useNavigate } from "@/components/app/useNavigate";
import { Spinner } from "@/components/ui/spinner";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import {
  captureHrefWithPhoto,
  photoHandoff,
} from "@/lib/capture/photo-handoff";
import { feedback } from "@/lib/feedback";
import { uploadSearchPhoto } from "@/lib/items/image-search";
import { createLatestOnly, runLatest } from "@/lib/latest-only";
import { cn } from "@/lib/utils";
import { BarcodeScanner, type ScanMode } from "../common/BarcodeScanner";
import { barcodeSearchHref, imageSearchHref } from "./adapter";
import { useSearchNavigation } from "./SearchNavigation";
import { type SearchNavigation, textSearchHref } from "./search-navigation";
import { SECTION_LABELS, type SearchSection } from "./universal-search";
import { useSearchQuery } from "./useSearchQuery";

/** What the field holds in place of words: a scanned code or a photo. */
export type SearchToken = "barcode" | "photo" | null;

interface ClientSearchInterfaceProps {
  /**
   * The `?q=` the page was rendered for. Not just the initial value: the box
   * follows it when the URL changes under it (Back, Forward, a link).
   */
  urlQuery?: string | null;
  /** A barcode or photo search: the field shows its token (Recipes-Search 33). */
  token?: SearchToken;
  /** `?in=`: the field says what it looks in ("Search places"). */
  scope?: SearchSection | null;
  /**
   * `?with=`: Home's Scan or Photo — the sheet opens on arrival, and `with`
   * leaves the URL so Back or a reload doesn't open it again (F-102).
   */
  openWith?: ScanMode | null;
}

const SEGMENT =
  "flex min-h-11 w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 border-edge border-l text-ink transition-transform duration-(--ca-dur-micro) ease-standard active:scale-97 motion-reduce:active:scale-100 disabled:opacity-40";

/**
 * Search's field (KIT § 2 "Search field"; Recipes-Search 01, 08, 33): 44
 * tall, r8, edge, the glyph at 12, focus ring in act-ink, Clear while there
 * is something to clear, and Scan and Photo as segments at its end (Scan
 * is phone only: DECISIONS 40d). `/` focuses it from anywhere in the app
 * that is not already typing.
 *
 * Typing navigates to `?q=` after a 300 ms debounce and never remounts the
 * box (N01; `useSearchQuery`, `search-navigation.ts`). A scan navigates to
 * `?barcode=`; a photo is uploaded and navigates to `?image=<fileId>` (G32)
 * — or, where nothing can search by photo, goes to Add to be read as a
 * label (X06). Uploads answer by sequence (`lib/latest-only.ts`): an upload
 * that finishes after the sheet closed, or after a newer photo, is dropped.
 */
export const ClientSearchInterface = ({
  urlQuery,
  token = null,
  scope = null,
  openWith = null,
}: ClientSearchInterfaceProps) => {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // The page's shared transition when there is one (the results dim while
  // it runs); a local one otherwise.
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
  } = useSearchQuery({ urlQuery, navigate, isNavigating, scope });

  const urqlClient = useClient();
  // N07/D25: photo search is not offered where the deployment's embedding
  // model cannot embed a photo. X06: Photo stays where a label can still be
  // read — its fallback reads the photo as a label in Add.
  const capabilities = useAiCapabilities();
  const photoSearchOffered = isOffered(capabilities, "imageSearch");
  const photoOffered =
    photoSearchOffered || isOffered(capabilities, "labelRead");

  const [sheet, setSheet] = useState<ScanMode | null>(null);
  const [working, setWorking] = useState<ScanMode | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const uploads = useMemo(createLatestOnly, []);

  // The work indicator ends with the navigation it started: when a pending
  // navigation settles, not while an upload has yet to start one.
  const wasNavigating = useRef(false);
  useEffect(() => {
    if (wasNavigating.current && !isNavigating) setWorking(null);
    wasNavigating.current = isNavigating;
  }, [isNavigating]);

  // Opened once per arrival: the replace below clears `with`, so this does
  // not run again for the same link.
  useEffect(() => {
    if (openWith === null) return;
    setSheet(openWith);
    nav.replace(textSearchHref(urlQuery ?? "", scope));
  }, [openWith, nav, urlQuery, scope]);

  const closeSheet = () => {
    uploads.invalidate();
    setSheet(null);
    inputRef.current?.focus();
  };

  const handleBarcode = (barcode: { text: string }) => {
    const href = barcodeSearchHref(barcode.text);
    setSheet(null);
    if (href === null) {
      feedback("refuse");
      return;
    }
    feedback("success");
    setWorking("barcode");
    startNavigation(() => nav.push(href));
  };

  const handlePhoto = (image: string) => {
    setSheet(null);
    setPhotoError(null);
    if (!photoSearchOffered) {
      // X06: nothing here can search by photo, so the photo goes straight to
      // its fallback — read as a label in Add, with the same bytes.
      uploads.invalidate();
      const href = captureHrefWithPhoto("bottle", photoHandoff.put(image));
      startNavigation(() => nav.push(href));
      return;
    }
    setWorking("photo");
    runLatest(
      uploads,
      () => uploadSearchPhoto(urqlClient, image),
      (fileId) => {
        const href = imageSearchHref(fileId);
        if (href === null) throw new Error("The photo could not be uploaded.");
        // Kept for the results' "Read the label" (X06), under the search
        // file's id — the one thing the results page knows.
        photoHandoff.put(image, fileId);
        startNavigation(() => nav.push(href));
      },
    ).catch(() => {
      setWorking(null);
      feedback("refuse");
      setPhotoError("Couldn't send the photo");
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && searchQuery !== "") {
      e.preventDefault();
      clear();
      return;
    }
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    commit();
    // On a phone, Search on the keyboard should reveal the results.
    if (window.matchMedia?.("(pointer: coarse)").matches) {
      inputRef.current?.blur();
    }
  };

  // `/` focuses the field (desk-01's key hint): the shell's key, on the app
  // element; this screen's handler wins while it is mounted.
  useAppKey("/", () => inputRef.current?.focus());

  const handleClear = () => {
    feedback("tick");
    if (token !== null && searchQuery === "") {
      startNavigation(() => nav.replace("/search"));
    } else {
      clear();
    }
    inputRef.current?.focus();
  };

  const press = pressFeedback();
  const placeholder =
    scope === null
      ? "Search everything"
      : `Search ${SECTION_LABELS[scope].toLowerCase()}`;
  const showToken = token !== null && searchQuery === "";
  const canClear = searchQuery !== "" || token !== null;

  return (
    <div className="flex flex-col gap-2">
      <div
        data-search-field
        className="flex min-h-11 items-stretch overflow-hidden rounded-md border border-edge bg-card transition-[border-color,box-shadow] duration-(--ca-dur-short) ease-standard focus-within:border-act-ink focus-within:ring-1 focus-within:ring-act-ink"
      >
        <span className="flex w-10 shrink-0 items-center justify-end pr-1 text-glyph">
          <Search aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
        </span>
        {showToken && (
          <span
            data-search-token={token}
            className="t-cap my-1.5 ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-sel px-2 text-ink"
          >
            {token === "barcode" ? (
              <Barcode
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-4"
              />
            ) : (
              <Photo aria-hidden strokeWidth={ICON_STROKE} className="size-4" />
            )}
            {token === "barcode" ? "Barcode" : "Photo"}
          </span>
        )}
        <input
          ref={inputRef}
          // W-12: an empty search opens ready to type, so a phone brings its
          // keyboard up. Opened on `?q=`, the results are what you came for.
          // The box never remounts while you type (N01), so this fires once.
          // biome-ignore lint/a11y/noAutofocus: W-12, the search screen's one job is typing.
          autoFocus={!urlQuery && token === null && openWith === null}
          type="search"
          aria-label="Search"
          enterKeyHint="search"
          placeholder={showToken ? "" : placeholder}
          value={searchQuery}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit()}
          className="t-body min-w-0 flex-1 bg-transparent px-2 text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {canClear && (
          <button
            type="button"
            aria-label="Clear search"
            // Keep focus in the box: a blur here would commit the old text
            // a moment before clear commits "".
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            {...press}
            className="flex min-h-11 w-11 shrink-0 items-center justify-center text-glyph"
          >
            <Close aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
          </button>
        )}
        <span
          aria-hidden
          className="hidden w-8 shrink-0 items-center justify-center md:flex"
        >
          <kbd className="t-micro rounded-sm border border-edge px-1.5 text-ink-2">
            /
          </kbd>
        </span>
        <button
          type="button"
          aria-label="Scan a barcode"
          disabled={working !== null}
          onClick={() => setSheet("barcode")}
          {...press}
          className={cn(SEGMENT, "md:hidden")}
        >
          {working === "barcode" ? (
            <Spinner aria-hidden className="size-5" />
          ) : (
            <Barcode
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5 text-act-ink"
            />
          )}
          <span className="t-micro">Scan</span>
        </button>
        {photoOffered && (
          <button
            type="button"
            aria-label={
              photoSearchOffered ? "Search by photo" : "Photograph a label"
            }
            disabled={working !== null}
            onClick={() => setSheet("photo")}
            {...press}
            className={SEGMENT}
          >
            {working === "photo" ? (
              <Spinner aria-hidden className="size-5" />
            ) : (
              <Camera
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-5 text-act-ink"
              />
            )}
            <span className="t-micro">Photo</span>
          </button>
        )}
      </div>

      {photoError !== null && working === null && (
        <p role="alert" className="t-cap m-0 text-danger">
          {photoError}
        </p>
      )}

      {sheet !== null && (
        <BarcodeScanner
          mode={sheet}
          onModeChange={setSheet}
          photoOffered={photoOffered}
          onBarcode={handleBarcode}
          onPhoto={handlePhoto}
          onClose={closeSheet}
        />
      )}
    </div>
  );
};
