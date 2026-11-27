import { isEmpty, isNil, isNotNil, not } from "ramda";
import type { Client } from "urql";
import {
  assign,
  createMachine,
  enqueueActions,
  type PromiseActorLogic,
} from "xstate";
import {
  type ApiItemType,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import type { Barcode } from "@/constants";
import type { AiOutcome } from "@/lib/ai/outcome";
import { closeOnboarding } from "./actors/closeOnboarding";
import { fetchDefaults } from "./actors/fetchDefaults";
import { insertCellarItem } from "./actors/insertCellarItem";
import { rereadLabels } from "./actors/rereadLabels";
import { searchByBarcode } from "./actors/searchByBarcode";
import { searchByImage } from "./actors/searchByImage";
import { searchCatalog } from "./actors/searchCatalog";
import type {
  CloseOnboardingInput,
  DefaultValuesResult,
  FetchDefaultsInput,
  InsertCellarItemInput,
  InsertCellarItemResult,
  RereadLabelsInput,
  RereadLabelsResult,
  SearchByImageInput,
  SearchCatalogInput,
  UploadItemImageInput,
  UploadItemImageResult,
} from "./actors/types";
import { uploadFiles } from "./actors/uploadFiles";
import { uploadItemImage } from "./actors/uploadItemImage";
import {
  addAnotherHref,
  canQuickAdd,
  type ExistingItem,
  emptyDefaults,
  finishedHref,
  type OnboardingDefaults,
} from "./adapter";
import type { CatalogMatch } from "./catalog-match";

/**
 * How long `matching` waits for `itemSearch` before showing the form anyway.
 * A text search is one embedding plus a vector query; past this the provider
 * is struggling, and the person should not be left watching a spinner for a
 * suggestion.
 */
export const CATALOG_MATCH_TIMEOUT_MS = 8000;

/** `push` is all the machine needs of `useNavigate()`. */
type Navigate = { push: (href: string) => void };

/** What the page tells the read about itself, to track it (X05). */
type DraftInput = {
  /** Where "Review" goes for this session id and type. */
  readonly resumeHref: (
    itemOnboardingId: string,
    itemType: ApiItemType,
    /** F-59: the cellar the bottle was aimed at, for "Review" to reopen on. */
    cellarId?: string,
  ) => string;
};

/**
 * The add-a-bottle flow, snap-once (X05, N21) over `82450ad1`'s machine.
 *
 * **One photo, and the read starts at the shutter.** The capture step
 * (`index.tsx`, `pictureOnboardingMachine`) is one live camera that reads a
 * barcode while you frame the label; the shutter's photo is the front label,
 * and it is also the display photo (N21) and the photo-search query (G32,
 * D12). `COMPLETE` goes straight to `upload` → `analyze`, while the photo
 * search runs beside the read (`imageSearch`, spawned once the label is up,
 * never waited for). **The bytes go up once** (X06): the read, the photo
 * search and the bottle's display image all use the one `label-front` file.
 * The back label is an optional re-read from the draft card
 * (`form.rereading`), never a step in the way.
 *
 * What carried over from the restored machine, unchanged in meaning:
 *
 * - **Actors** are the new API's: presigned label uploads,
 *   `startItemOnboarding`, `barcode(code).items`, `attachItemImage`,
 *   `addItemToCellar`. No `userId` anywhere (C4).
 * - **`itemOnboardingId` and the cellar-item id are minted once**, so a
 *   retried analysis reuses the session and a retried add files one bottle.
 * - **Quick add (Q7, N02)** is entered only through `canQuickAdd`: a label
 *   photographed and read at ≥ 0.9, an *exact* catalogue match, a cellar to
 *   file into. Its `CONFIRM` files a bottle of the matched item — it never
 *   creates one (D25: nothing new enters the catalogue without a tap).
 * - **`matching` (N19)**: the name read goes to `itemSearch`; a match leads
 *   the draft card with "Is it this one? +1 bottle".
 * - **`analyze` failures that are answers** (no label, a menu, no provider)
 *   resolve with empty defaults and words for the person (N07); only a
 *   transport failure takes `retryAnalyze`.
 *
 * New here:
 *
 * - The read is **tracked outside the component** (`components/capture/
 *   drafts.ts`) when `draft` is given, so "Keep going in the background"
 *   can leave the page without losing it, and `resumeId` reopens the draft
 *   on the same session — no second model call.
 * - The type and the cellar can change before the bottle is filed
 *   (`SET_TYPE` while framing, `SET_CELLAR` until it is filed), because they
 *   are defaults (last used), not route facts, on the generic add page.
 * - The ending is a success sheet (`finalPrompt`): Snap another · Open it
 *   now (N21). "Open it now" shows the bottle's page, where opening it is
 *   one tap; it never uncorks anything itself (X06's call).
 * - A draft resumed after a full reload has lost its capture, but the session
 *   remembers the label's file (`frontLabelFileId` from the read), which is
 *   what its photo and display image come back from.
 */
export const OnboardingMachine = createMachine(
  {
    id: "onboarding-wizard",
    initial: "init",
    types: {} as {
      input: {
        urqlClient: Client;
        cellarId?: string | null;
        navigate: Navigate;
        itemType: ApiItemType;
        /** Track the read for background continuation (X05). */
        draft?: DraftInput;
        /** Reopen this onboarding's draft rather than starting a new one. */
        resumeId?: string;
        /** The resumed draft's photo, when the page still has it. */
        resumePhoto?: string;
        /** "Snap another": start over in place. Default: `addAnotherHref`. */
        onRestart?: () => void;
      };
      context: {
        urqlClient: Client;
        barcode?: Barcode;
        frontLabel?: string;
        backLabel?: string;
        frontLabelFileId?: string;
        backLabelFileId?: string;
        displayImageDataUrl?: string;
        /**
         * The display photo, already uploaded: the front label's file when
         * the display photo is the front label (N21). Attached as it is.
         */
        displayImageFileId?: string;
        itemOnboardingId: string;
        /** Whether a label photograph actually reached the read. */
        labelSent: boolean;
        defaults?: OnboardingDefaults;
        /**
         * Why nothing was read, as words for a person (N07: chosen by
         * `aiOutcome`, never the server's message). Shown above the form.
         */
        extractionError?: AiOutcome;
        existingItemId?: string;
        /** The filed item's name, for the success sheet. */
        itemName?: string;
        /** Items the person said no to — never offered back. */
        declinedItemIds: readonly string[];
        /** N19: the catalogue item the label names, if there is one. */
        catalogMatch?: CatalogMatch;
        /**
         * DECISIONS 34 (2): the match the person said "Not this" to. Typing
         * its name and maker again warns, and "Add that one instead" files it.
         */
        declinedMatch?: CatalogMatch;
        /** G32/D12: what the front photo looks like in the catalogue. */
        imageMatches: readonly ExistingItem[];
        /**
         * X05: a back-label re-read's answer, for the draft card to fill
         * into fields the person has not touched. `id` changes per re-read.
         */
        refill?: { id: string; defaults: OnboardingDefaults };
        /** The back-label re-read could not be made. */
        rereadError?: AiOutcome | string;
        /**
         * The bottle being filed is a catalogue item (quick-add, a match, a
         * photo match), so the onboarding `analyze` opened is closed as
         * `MATCHED` once it is filed rather than left open forever.
         */
        filedMatch?: boolean;
        /** The cellar_items ID after adding item to cellar (used for redirect) */
        cellarItemId?: string;
        /** Minted up front so a retried add files one bottle. */
        newCellarItemId: string;
        cellarId?: string;
        navigate: Navigate;
        retryCount: number;
        /** AI analysis confidence score (0-1) */
        confidence?: number;
        /** Whether quick add mode is enabled for this session */
        quickAddEnabled: boolean;
        itemType: ApiItemType;
        draft?: DraftInput;
        resumed: boolean;
        /** The page fixed the cellar (`/cellars/<id>/…/add`): a draft's own
         * cellar does not replace it. */
        cellarPinned: boolean;
        onRestart?: () => void;
        /** Why the last step failed, when it did (upload, add to cellar). */
        error?: string;
        /** The display photo could not be saved; the item was. */
        imageError?: string;
      };
      events:
        | {
            type: "COMPLETE";
            barcode?: Barcode;
            frontLabel?: string;
            existingItemId?: string;
            /** The chosen existing item's type and name (barcode chooser). */
            existingItemType?: ApiItemType;
            existingItemName?: string;
            displayImageDataUrl?: string;
            declinedItemIds?: readonly string[];
          }
        | { type: "SET_TYPE"; itemType: ApiItemType }
        | { type: "SET_CELLAR"; cellarId: string | null }
        | { type: "CREATED"; itemId: string; name?: string }
        | { type: "USE_MATCH" }
        | { type: "DISMISS_MATCH" }
        | { type: "USE_DECLINED_MATCH" }
        | { type: "USE_IMAGE_MATCH"; item: ExistingItem }
        | { type: "DISMISS_IMAGE_MATCHES" }
        | { type: "BACK_LABEL"; image: string }
        | { type: "SNAP_ANOTHER" }
        | { type: "OPEN_NOW" }
        | { type: "DONE" }
        | { type: "CONFIRM" }
        | { type: "EDIT" }
        | { type: "RETRY" }
        | {
            type: "xstate.done.actor.imageSearch";
            output: ExistingItem[];
          }
        | { type: "xstate.error.actor.imageSearch"; error: unknown };
      actors:
        | {
            src: "uploadFiles";
            logic: typeof uploadFiles;
          }
        | {
            src: "insertCellarItem";
            logic: PromiseActorLogic<
              InsertCellarItemResult,
              InsertCellarItemInput
            >;
          }
        | {
            src: "fetchDefaults";
            logic: PromiseActorLogic<DefaultValuesResult, FetchDefaultsInput>;
          }
        | {
            src: "searchCatalog";
            logic: PromiseActorLogic<CatalogMatch | null, SearchCatalogInput>;
          }
        | {
            src: "searchByImage";
            logic: PromiseActorLogic<ExistingItem[], SearchByImageInput>;
          }
        | {
            src: "rereadLabels";
            logic: PromiseActorLogic<RereadLabelsResult, RereadLabelsInput>;
          }
        | {
            src: "uploadItemImage";
            logic: PromiseActorLogic<
              UploadItemImageResult,
              UploadItemImageInput
            >;
          }
        | {
            src: "closeOnboarding";
            logic: PromiseActorLogic<boolean, CloseOnboardingInput>;
          };
      delays: "catalogMatchTimeout";
    },
    context: ({ input }) => ({
      itemOnboardingId: input.resumeId ?? crypto.randomUUID(),
      newCellarItemId: crypto.randomUUID(),
      urqlClient: input.urqlClient,
      cellarId: input.cellarId ?? undefined,
      navigate: input.navigate,
      retryCount: 0,
      quickAddEnabled: true, // Enable quick add by default
      declinedItemIds: [],
      imageMatches: [],
      labelSent: false,
      itemType: input.itemType,
      draft: input.draft,
      resumed: input.resumeId !== undefined,
      cellarPinned: input.cellarId !== undefined && input.cellarId !== null,
      frontLabel: input.resumePhoto,
      displayImageDataUrl: input.resumePhoto,
      onRestart: input.onRestart,
    }),
    on: {
      // The photo search runs beside the read and lands whenever it lands
      // (a late answer still leads the draft card). Never waited for.
      "xstate.done.actor.imageSearch": {
        actions: assign({
          imageMatches: ({ event, context }) =>
            event.output.filter(
              (match) => !context.declinedItemIds.includes(match.item.itemId),
            ),
        }),
      },
      // A photo search that failed is one with nothing to offer — never the
      // flow's failure (an unhandled child error would stop the machine).
      "xstate.error.actor.imageSearch": {},
      // Until the bottle is filed, the cellar is a default the person can
      // change (X05: defaulted, not asked).
      SET_CELLAR: {
        guard: ({ context }) => isNil(context.cellarItemId),
        actions: assign({
          cellarId: ({ event }) => event.cellarId ?? undefined,
        }),
      },
    },
    states: {
      init: {
        always: [
          { guard: ({ context }) => context.resumed, target: "analyze" },
          { target: "wizard" },
        ],
      },
      wizard: {
        on: {
          SET_TYPE: {
            actions: assign({ itemType: ({ event }) => event.itemType }),
          },
          COMPLETE: [
            {
              guard: ({ event }) => isNil(event.existingItemId),
              actions: [
                assign({
                  barcode: ({ event }) => event.barcode,
                  frontLabel: ({ event }) => event.frontLabel,
                  // N21: the display photo is the front label.
                  displayImageDataUrl: ({ event }) => event.frontLabel,
                  declinedItemIds: ({ event }) => event.declinedItemIds ?? [],
                  defaults: undefined,
                  catalogMatch: undefined,
                }),
              ],
              target: "upload",
            },
            {
              guard: ({ event, context }) =>
                isNotNil(event.existingItemId) && isNotNil(context.cellarId),
              actions: "chooseExisting",
              target: "addItemToCellar",
            },
            {
              guard: ({ event }) => isNotNil(event.existingItemId),
              actions: "chooseExisting",
              target: "uploadImage",
            },
          ],
        },
      },
      upload: {
        invoke: {
          src: "uploadFiles",
          input: ({ context: { backLabel, frontLabel, urqlClient } }) => ({
            urqlClient,
            backLabel,
            frontLabel,
          }),
          onDone: {
            target: "analyze",
            actions: [
              assign({
                backLabelFileId: ({ event }) => event.output.backLabelFileId,
                frontLabelFileId: ({ event }) => event.output.frontLabelFileId,
                // N21: the display photo is the front label, so its file is.
                displayImageFileId: ({ event, context }) =>
                  context.displayImageDataUrl === context.frontLabel
                    ? event.output.frontLabelFileId
                    : undefined,
              }),
              // G32/D12: the same file is the photo-search query (X06: no
              // second upload of the same bytes).
              "startImageSearch",
            ],
          },
          // The photos could not be stored, so read nothing and go on to the
          // form — the session still opens, and the reason is shown.
          onError: {
            target: "analyze",
            actions: assign({
              frontLabelFileId: undefined,
              backLabelFileId: undefined,
              error: ({ event }) =>
                event.error instanceof Error
                  ? `The label photos could not be uploaded: ${event.error.message}`
                  : "The label photos could not be uploaded.",
            }),
          },
        },
      },
      retryAnalyze: {
        after: {
          100: [
            {
              guard: ({ context }) => context.retryCount < 2,
              target: "analyze",
              actions: assign({
                retryCount: ({ context }) => context.retryCount + 1,
              }),
            },
            {
              actions: assign({
                defaults: () => emptyDefaults(),
              }),
              target: "form",
            },
          ],
        },
      },
      analyze: {
        invoke: {
          src: "fetchDefaults",
          input: ({
            context: {
              urqlClient,
              itemType,
              itemOnboardingId,
              barcode,
              backLabelFileId,
              frontLabelFileId,
              draft,
              frontLabel,
              resumed,
              cellarId,
            },
          }) => ({
            urqlClient,
            itemType,
            itemOnboardingId,
            barcode,
            backLabelFileId,
            frontLabelFileId,
            resumed,
            draft:
              draft === undefined
                ? undefined
                : {
                    label: itemTypeLabel(itemType).toLowerCase(),
                    resumeHref: draft.resumeHref(
                      itemOnboardingId,
                      itemType,
                      cellarId,
                    ),
                    ...(frontLabel === undefined ? {} : { photo: frontLabel }),
                  },
          }),
          onError: {
            target: "retryAnalyze",
          },
          onDone: {
            target: "matching",
            actions: [
              assign({
                itemOnboardingId: ({ event }) => event.output.itemOnboardingId,
                defaults: ({ event }) => event.output.defaults,
                confidence: ({ event }) => event.output.confidence,
                extractionError: ({ event }) => event.output.extractionError,
                labelSent: ({ event, context }) =>
                  event.output.labelSent ??
                  (isNotNil(context.frontLabelFileId) ||
                    isNotNil(context.backLabelFileId)),
                // F-59: a saved draft opens on the cellar it was saved
                // against, not the last-used default set at mount.
                cellarId: ({ event, context }) =>
                  context.cellarPinned || isNil(event.output.draftCellarId)
                    ? context.cellarId
                    : event.output.draftCellarId,
              }),
              // A resumed draft uploaded nothing here: its label's file is
              // the one the session stored (X06), and so is its display
              // photo, unless the page still holds a different capture.
              enqueueActions(({ context, event, enqueue }) => {
                const stored = event.output.frontLabelFileId;
                if (!context.resumed || isNotNil(context.frontLabelFileId)) {
                  return;
                }
                if (isNil(stored)) return;
                enqueue.assign({
                  frontLabelFileId: stored,
                  displayImageFileId:
                    context.displayImageDataUrl === context.frontLabel
                      ? stored
                      : undefined,
                });
                enqueue("startImageSearch");
              }),
            ],
          },
        },
      },
      matching: {
        // The lookup is a convenience, so it never holds the form hostage: a
        // search that has not answered in time is the old path to the form.
        // (Leaving the state stops the invoked actor; its late answer is
        // dropped.)
        after: {
          catalogMatchTimeout: { target: "form" },
        },
        invoke: {
          src: "searchCatalog",
          input: ({
            context: { urqlClient, itemType, defaults, declinedItemIds },
          }) => ({
            urqlClient,
            itemType,
            defaults: defaults ?? emptyDefaults(),
            excludeItemIds: declinedItemIds,
          }),
          onDone: [
            // High confidence + quick add enabled + a label was read → quickReview
            {
              guard: ({ context, event }) =>
                context.quickAddEnabled &&
                canQuickAdd({
                  labelSent: context.labelSent,
                  confidence: context.confidence,
                  defaults: context.defaults,
                  match: event.output,
                  inCellar: isNotNil(context.cellarId),
                }),
              target: "quickReview",
              actions: assign({
                catalogMatch: ({ event }) => event.output ?? undefined,
              }),
            },
            // Default → form, led by the match when there is one
            {
              target: "form",
              actions: assign({
                catalogMatch: ({ event }) => event.output ?? undefined,
              }),
            },
          ],
          // The lookup is a convenience: failing it is the old path.
          onError: { target: "form" },
        },
      },
      quickReview: {
        // The QuickAddCard counts down and sends CONFIRM. Only ever a bottle
        // of the matched catalogue item (N02): nothing here creates an item.
        on: {
          CONFIRM: [
            {
              guard: ({ context }) =>
                isNotNil(context.catalogMatch) && isNotNil(context.cellarId),
              actions: "useCatalogMatch",
              target: "addItemToCellar",
            },
            // The "Into" row was switched to "No cellar" while the card was
            // up (X05: the cellar is a default, changeable here): the match
            // is still the item — show it, file no bottle. Without this
            // branch the CONFIRM was dropped and the card sat on "Adding…".
            {
              guard: ({ context }) => isNotNil(context.catalogMatch),
              actions: "useCatalogMatch",
              target: "uploadImage",
            },
          ],
          // "Not this one": the form, without the match and without offering
          // it again.
          EDIT: {
            target: "form",
            actions: assign({
              quickAddEnabled: () => false,
              declinedMatch: ({ context }) =>
                context.catalogMatch ?? context.declinedMatch,
              catalogMatch: undefined,
              declinedItemIds: ({ context }) =>
                isNil(context.catalogMatch)
                  ? context.declinedItemIds
                  : [
                      ...context.declinedItemIds,
                      context.catalogMatch.item.itemId,
                    ],
            }),
          },
        },
      },
      form: {
        initial: "idle",
        on: {
          // N19: "Is it this one? +1 bottle" — the person tapped it.
          USE_MATCH: [
            {
              guard: ({ context }) =>
                isNotNil(context.catalogMatch) && isNotNil(context.cellarId),
              actions: "useCatalogMatch",
              target: "addItemToCellar",
            },
            {
              guard: ({ context }) => isNotNil(context.catalogMatch),
              actions: "useCatalogMatch",
              target: "uploadImage",
            },
          ],
          DISMISS_MATCH: {
            actions: assign({
              declinedMatch: ({ context }) =>
                context.catalogMatch ?? context.declinedMatch,
              catalogMatch: undefined,
              declinedItemIds: ({ context }) =>
                isNil(context.catalogMatch)
                  ? context.declinedItemIds
                  : [
                      ...context.declinedItemIds,
                      context.catalogMatch.item.itemId,
                    ],
            }),
          },
          // DECISIONS 34 (2): "Add that one instead" — the declined match
          // after all. Files a bottle of it; never creates an item.
          USE_DECLINED_MATCH: [
            {
              guard: ({ context }) =>
                isNotNil(context.declinedMatch) && isNotNil(context.cellarId),
              actions: ["restoreDeclinedMatch", "useCatalogMatch"],
              target: "addItemToCellar",
            },
            {
              guard: ({ context }) => isNotNil(context.declinedMatch),
              actions: ["restoreDeclinedMatch", "useCatalogMatch"],
              target: "uploadImage",
            },
          ],
          // G32/D12: one of the photo matches, tapped. Like USE_MATCH, it
          // files (or shows) a catalogue item; it never creates one.
          USE_IMAGE_MATCH: [
            {
              guard: ({ context }) => isNotNil(context.cellarId),
              actions: "useImageMatch",
              target: "addItemToCellar",
            },
            { actions: "useImageMatch", target: "uploadImage" },
          ],
          DISMISS_IMAGE_MATCHES: {
            actions: assign({
              imageMatches: [],
              declinedItemIds: ({ context }) => [
                ...context.declinedItemIds,
                ...context.imageMatches.map((match) => match.item.itemId),
              ],
            }),
          },
          CREATED: [
            {
              guard: ({ context }) => isNotNil(context.cellarId),
              actions: assign({
                existingItemId: ({ event }) => event.itemId,
                itemName: ({ event }) => event.name,
              }),
              target: "addItemToCellar",
            },
            {
              actions: assign({
                existingItemId: ({ event }) => event.itemId,
                itemName: ({ event }) => event.name,
              }),
              target: "uploadImage",
            },
          ],
        },
        states: {
          idle: {
            on: {
              // X05/N21: the optional back label, read together with the
              // front under a fresh session (`start` is idempotent per id).
              BACK_LABEL: {
                target: "rereading",
                actions: assign({
                  backLabel: ({ event }) => event.image,
                  rereadError: undefined,
                }),
              },
            },
          },
          rereading: {
            invoke: {
              src: "rereadLabels",
              input: ({ context }) => ({
                urqlClient: context.urqlClient,
                itemType: context.itemType,
                barcode: context.barcode,
                frontLabelFileId: context.frontLabelFileId,
                backLabel: context.backLabel ?? "",
              }),
              onDone: {
                target: "idle",
                actions: assign(({ event, context }) =>
                  event.output.extractionError !== undefined
                    ? {
                        rereadError: event.output.extractionError,
                        backLabelFileId: event.output.backLabelFileId,
                      }
                    : {
                        itemOnboardingId: event.output.itemOnboardingId,
                        backLabelFileId: event.output.backLabelFileId,
                        confidence: event.output.confidence,
                        labelSent: true,
                        refill: {
                          id: event.output.itemOnboardingId,
                          defaults: event.output.defaults,
                        },
                        extractionError: context.labelSent
                          ? context.extractionError
                          : undefined,
                      },
                ),
              },
              onError: {
                target: "idle",
                actions: assign({
                  rereadError: ({ event }) =>
                    event.error instanceof Error
                      ? event.error.message
                      : "The back label could not be read.",
                }),
              },
            },
          },
        },
      },
      addItemToCellar: {
        entry: assign({ error: undefined }),
        invoke: {
          src: "insertCellarItem",
          input: ({
            context: {
              existingItemId,
              itemType,
              cellarId,
              newCellarItemId,
              urqlClient,
              displayImageDataUrl,
              displayImageFileId,
            },
          }) => ({
            itemId: existingItemId ?? "",
            itemType,
            cellarId: cellarId ?? "",
            cellarItemId: newCellarItemId,
            urqlClient,
            displayImage: displayImageDataUrl,
            displayImageFileId,
          }),
          onDone: {
            target: "finalPrompt",
            actions: [
              assign({
                cellarItemId: ({ event }) => event.output.itemId,
              }),
              "closeMatchedOnboarding",
            ],
          },
          onError: {
            target: "addFailed",
            actions: assign({
              error: ({ event }) =>
                event.error instanceof Error
                  ? event.error.message
                  : "Failed to add cellar item.",
            }),
          },
        },
      },
      addFailed: {
        on: { RETRY: "addItemToCellar" },
      },
      uploadImage: {
        invoke: {
          src: "uploadItemImage",
          input: ({
            context: {
              existingItemId,
              displayImageDataUrl,
              displayImageFileId,
              urqlClient,
              itemType,
            },
          }) => ({
            itemId: existingItemId ?? "",
            itemType,
            displayImage: displayImageDataUrl,
            displayImageFileId,
            urqlClient,
          }),
          // The item was chosen either way; only its photo can have failed.
          onDone: {
            target: "finalPrompt",
            actions: "closeMatchedOnboarding",
          },
          onError: {
            target: "finalPrompt",
            actions: [
              assign({
                imageError: ({ event }) =>
                  event.error instanceof Error
                    ? event.error.message
                    : "The photo could not be saved.",
              }),
              "closeMatchedOnboarding",
            ],
          },
        },
      },
      // N21's real ending: the success sheet.
      finalPrompt: {
        on: {
          SNAP_ANOTHER: {
            actions: ({ context }) => {
              if (context.onRestart !== undefined) context.onRestart();
              else context.navigate.push(addAnotherHref(context.cellarId));
            },
            target: "done",
          },
          // "Open it now" (X06's call): the bottle's page, where opening it
          // is one tap — never an uncork from the sheet, which a tap meant as
          // "show me" would have written into the bottle's log.
          OPEN_NOW: {
            guard: ({ context }) =>
              isNotNil(context.cellarId) && isNotNil(context.cellarItemId),
            actions: "goToResult",
            target: "leaving",
          },
          DONE: {
            actions: "goToResult",
            target: "leaving",
          },
        },
      },
      // F-36: on the way to the result, with the success sheet still up.
      // The sheet holds a history entry (`overlays/layers.ts`); unmounting it
      // in the same commit as the push runs `history.back()` ahead of Next's
      // own `pushState` and undoes the navigation. Held open here, the sheet
      // goes when the page does, and its entry is no longer the current one.
      leaving: {},
      done: {
        type: "final",
      },
    },
  },
  {
    delays: {
      catalogMatchTimeout: CATALOG_MATCH_TIMEOUT_MS,
    },
    actions: {
      chooseExisting: assign(({ event }) =>
        event.type === "COMPLETE"
          ? {
              existingItemId: event.existingItemId,
              displayImageDataUrl: event.displayImageDataUrl,
              itemName: event.existingItemName,
              filedMatch: false,
              ...(event.existingItemType === undefined
                ? {}
                : { itemType: event.existingItemType }),
            }
          : {},
      ),
      restoreDeclinedMatch: assign(({ context }) => ({
        catalogMatch: context.declinedMatch,
      })),
      useCatalogMatch: assign(({ context }) => ({
        existingItemId: context.catalogMatch?.item.itemId,
        itemName: context.catalogMatch?.item.name,
        filedMatch: true,
      })),
      useImageMatch: assign(({ event }) =>
        event.type === "USE_IMAGE_MATCH"
          ? {
              existingItemId: event.item.item.itemId,
              itemName: event.item.item.name,
              itemType: event.item.type,
              filedMatch: true,
            }
          : {},
      ),
      // Run after the assigns before it in the same list, so the label's
      // file id is already in the context.
      startImageSearch: enqueueActions(({ context, enqueue }) => {
        if (isNil(context.frontLabelFileId)) return;
        enqueue.spawnChild("searchByImage", {
          id: "imageSearch",
          input: {
            imageFileId: context.frontLabelFileId,
            urqlClient: context.urqlClient,
            itemType: context.itemType,
          },
        });
      }),
      goToResult: ({ context }) => {
        // In a cellar, the bottle; otherwise the item.
        context.navigate.push(
          finishedHref({
            type: context.itemType,
            itemId: context.existingItemId ?? "",
            cellarId: context.cellarId,
            cellarItemId: context.cellarItemId,
          }),
        );
      },
      // Fire and forget: the bottle is filed, and closing the session is
      // bookkeeping the person need not wait on (`closeOnboarding` never
      // throws). Only when the bottle was a catalogue match — a created
      // item's session is closed by `confirmItemOnboarding` itself, and a
      // barcode-chooser pick never opened one.
      closeMatchedOnboarding: enqueueActions(({ context, enqueue }) => {
        if (context.filedMatch !== true) return;
        enqueue.spawnChild("closeOnboarding", {
          input: {
            urqlClient: context.urqlClient,
            itemOnboardingId: context.itemOnboardingId,
          },
        });
      }),
    },
    actors: {
      uploadFiles,
      fetchDefaults,
      searchCatalog,
      searchByImage,
      rereadLabels,
      insertCellarItem,
      uploadItemImage,
      closeOnboarding,
    },
  },
);

/**
 * The capture step (X05): one live camera, framing the label while a barcode
 * is read off the same picture.
 *
 * - `framing`: a `BARCODE` is looked up (`searching`); the shutter
 *   (`CAPTURED`) is the front label and ends the step at once — the read
 *   starts there. `MANUAL` ends it with no photo (fill it in by hand).
 * - A barcode that names catalogue items opens the chooser
 *   (`chooseExisting`); picking one asks for an optional photo of it
 *   (`photo`), since it needs no read. "None of these" goes back to framing
 *   with those items declined.
 * - The shutter still works while a barcode lookup is in flight: the photo
 *   wins, and the lookup's late answer is dropped with the state.
 */
export const pictureOnboardingMachine = createMachine(
  {
    id: "onboarding-wizard-sub",
    initial: "framing",
    types: {} as {
      input: { urqlClient: Client; itemType?: ApiItemType };
      context: {
        barcode?: Barcode;
        frontLabelDataUrl?: string;
        displayImageDataUrl?: string;
        existingItems?: ExistingItem[];
        chosen?: ExistingItem;
        /** Matches the person passed over with "None of these". */
        declinedItemIds: string[];
        urqlClient: Client;
        itemType?: ApiItemType;
      };
      events:
        | { type: "BARCODE"; barcode: Barcode }
        | { type: "CAPTURED"; image: string }
        | { type: "MANUAL" }
        | { type: "SKIP" }
        | { type: "BACK" }
        | { type: "CHOOSE_ITEM"; item: ExistingItem };
      actions: { type: "handleDone" };
      actors: { src: "searchByBarcode"; logic: typeof searchByBarcode };
    },
    context: ({ input }) => ({
      urqlClient: input.urqlClient,
      itemType: input.itemType,
      declinedItemIds: [],
    }),
    states: {
      framing: {
        on: {
          BARCODE: {
            actions: assign({ barcode: ({ event }) => event.barcode }),
            target: "searching",
          },
          CAPTURED: {
            actions: assign({
              frontLabelDataUrl: ({ event }) => event.image,
            }),
            target: "done",
          },
          MANUAL: "done",
        },
      },
      searching: {
        on: {
          CAPTURED: {
            actions: assign({
              frontLabelDataUrl: ({ event }) => event.image,
            }),
            target: "done",
          },
          MANUAL: "done",
        },
        invoke: {
          src: "searchByBarcode",
          input: ({ context: { barcode, urqlClient } }) => ({
            barcode,
            urqlClient,
          }),
          onDone: [
            {
              guard: ({ event }) => not(isEmpty(event.output)),
              target: "chooseExisting",
              actions: assign({
                existingItems: ({ event }) => event.output,
              }),
            },
            { target: "framing" },
          ],
          // A lookup that failed outright is treated like one that found
          // nothing: go on and photograph the label.
          onError: { target: "framing" },
        },
      },
      chooseExisting: {
        on: {
          CHOOSE_ITEM: {
            actions: assign({ chosen: ({ event }) => event.item }),
            target: "photo",
          },
          SKIP: {
            target: "framing",
            actions: assign({
              declinedItemIds: ({ context }) => [
                ...context.declinedItemIds,
                ...(context.existingItems ?? []).map((x) => x.item.itemId),
              ],
            }),
          },
        },
      },
      photo: {
        on: {
          CAPTURED: {
            actions: assign({
              displayImageDataUrl: ({ event }) => event.image,
            }),
            target: "done",
          },
          SKIP: "done",
          BACK: "chooseExisting",
        },
      },
      done: {
        entry: ["handleDone"],
        type: "final",
      },
    },
  },
  { actors: { searchByBarcode } },
);
