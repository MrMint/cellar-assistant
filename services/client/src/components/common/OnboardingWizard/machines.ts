import { isEmpty, isNil, isNotNil, not } from "ramda";
import type { Client } from "urql";
import { assign, createMachine, type PromiseActorLogic } from "xstate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { Barcode } from "@/constants";
import { fetchDefaults } from "./actors/fetchDefaults";
import { insertCellarItem } from "./actors/insertCellarItem";
import { searchByBarcode } from "./actors/searchByBarcode";
import type {
  DefaultValuesResult,
  FetchDefaultsInput,
  InsertCellarItemInput,
  InsertCellarItemResult,
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

/** `router.push` is all the machine needs of Next's router. */
type Navigate = { push: (href: string) => void };

/**
 * `82450ad1:src/components/common/OnboardingWizard/machines.ts`, ported with
 * its states, events and transitions intact. What changed:
 *
 * - **Actors** are the new API's (see `actors/*`): presigned label uploads,
 *   `startItemOnboarding`, `barcode(code).items`, `attachItemImage`,
 *   `addItemToCellar`. All six types share them, so they are provided here
 *   rather than per type, and `itemType` is an `ApiItemType` (`WINE`), not a
 *   route segment.
 * - **No `userId`** in input or context: the API reads the viewer from the
 *   session (C4: never send one).
 * - **`itemOnboardingId` and `cellarItemId` are minted once**, so a retried
 *   analysis reuses the session and a retried add files one bottle.
 * - **Quick add (Q7)** is entered only through `canQuickAdd`: a label was
 *   actually photographed and read, confidence ≥ 0.9, and nothing the
 *   database requires is missing — the E2c guard. The 15 s card itself is the
 *   old one.
 * - **`searchingByImage` / `chooseExistingImage` are gone** from the picture
 *   machine: image search is a chosen drop (G32, e4 §6a), so a display photo
 *   goes straight to `done`.
 * - **`analyze` failures that are answers** (no label, not a label, no
 *   provider) resolve with empty defaults and the server's message instead of
 *   throwing; only a transport failure takes the old `retryAnalyze` path.
 * - `uploadImage` failing still lands on `finalPrompt`, as before, but now
 *   keeps the message (`imageError`) so the prompt can say the photo was not
 *   saved; `addItemToCellar` failing shows its message instead of hanging.
 */
export const OnboardingMachine = createMachine(
  {
    id: "onboarding-wizard",
    initial: "wizard",
    types: {} as {
      input: {
        urqlClient: Client;
        cellarId?: string;
        router: Navigate;
        itemType: ApiItemType;
      };
      context: {
        urqlClient: Client;
        barcode?: Barcode;
        frontLabel?: string;
        backLabel?: string;
        frontLabelFileId?: string;
        backLabelFileId?: string;
        displayImageDataUrl?: string;
        itemOnboardingId: string;
        defaults?: OnboardingDefaults;
        /** The server's reason nothing was read, shown above the form. */
        extractionError?: string;
        existingItemId?: string;
        /** The cellar_items ID after adding item to cellar (used for redirect) */
        cellarItemId?: string;
        /** Minted up front so a retried add files one bottle. */
        newCellarItemId: string;
        cellarId?: string;
        router: Navigate;
        retryCount: number;
        /** AI analysis confidence score (0-1) */
        confidence?: number;
        /** Whether quick add mode is enabled for this session */
        quickAddEnabled: boolean;
        itemType: ApiItemType;
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
            backLabel?: string;
            existingItemId?: string;
            displayImageDataUrl?: string;
          }
        | { type: "CREATED"; itemId: string }
        | { type: "ADD_ANOTHER" }
        | { type: "DONE" }
        | { type: "CONFIRM"; itemId: string }
        | { type: "EDIT" }
        | { type: "RETRY" };
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
            src: "uploadItemImage";
            logic: PromiseActorLogic<
              UploadItemImageResult,
              UploadItemImageInput
            >;
          };
    },
    context: ({ input }) => ({
      itemOnboardingId: crypto.randomUUID(),
      newCellarItemId: crypto.randomUUID(),
      urqlClient: input.urqlClient,
      cellarId: input.cellarId,
      router: input.router,
      retryCount: 0,
      quickAddEnabled: true, // Enable quick add by default
      itemType: input.itemType,
    }),
    states: {
      wizard: {
        on: {
          COMPLETE: [
            {
              guard: ({ event }) => isNil(event.existingItemId),
              actions: assign({
                barcode: ({ event }) => event.barcode,
                frontLabel: ({ event }) => event.frontLabel,
                backLabel: ({ event }) => event.backLabel,
                displayImageDataUrl: ({ event }) => event.displayImageDataUrl,
                defaults: undefined,
              }),
              target: "upload",
            },
            {
              guard: ({ event, context }) =>
                isNotNil(event.existingItemId) && isNotNil(context.cellarId),
              actions: assign({
                existingItemId: ({ event }) => event.existingItemId,
                displayImageDataUrl: ({ event }) => event.displayImageDataUrl,
              }),
              target: "addItemToCellar",
            },
            {
              guard: ({ event }) => isNotNil(event.existingItemId),
              actions: assign({
                existingItemId: ({ event }) => event.existingItemId,
                displayImageDataUrl: ({ event }) => event.displayImageDataUrl,
              }),
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
            actions: assign({
              backLabelFileId: ({ event }) => event.output.backLabelFileId,
              frontLabelFileId: ({ event }) => event.output.frontLabelFileId,
            }),
          },
          // New: the old actor's failure left the wizard spinning forever.
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
            },
          }) => ({
            urqlClient,
            itemType,
            itemOnboardingId,
            barcode,
            backLabelFileId,
            frontLabelFileId,
          }),
          onError: {
            target: "retryAnalyze",
          },
          onDone: [
            // High confidence + quick add enabled + a label was read → quickReview
            {
              guard: ({ event, context }) =>
                context.quickAddEnabled &&
                canQuickAdd({
                  type: context.itemType,
                  labelSent:
                    isNotNil(context.frontLabelFileId) ||
                    isNotNil(context.backLabelFileId),
                  confidence: event.output.confidence,
                  defaults: event.output.defaults,
                }),
              target: "quickReview",
              actions: assign({
                itemOnboardingId: ({ event }) => event.output.itemOnboardingId,
                defaults: ({ event }) => event.output.defaults,
                confidence: ({ event }) => event.output.confidence,
                extractionError: ({ event }) => event.output.extractionError,
              }),
            },
            // Default → form (existing behavior)
            {
              target: "form",
              actions: assign({
                itemOnboardingId: ({ event }) => event.output.itemOnboardingId,
                defaults: ({ event }) => event.output.defaults,
                confidence: ({ event }) => event.output.confidence,
                extractionError: ({ event }) => event.output.extractionError,
              }),
            },
          ],
        },
      },
      quickReview: {
        // Note: Auto-confirm is handled by the QuickAddCard component
        // which creates the item and sends CONFIRM with itemId
        on: {
          CONFIRM: [
            {
              guard: ({ context }) => isNotNil(context.cellarId),
              actions: assign({
                existingItemId: ({ event }) => event.itemId,
              }),
              target: "addItemToCellar",
            },
            {
              actions: assign({
                existingItemId: ({ event }) => event.itemId,
              }),
              target: "uploadImage",
            },
          ],
          EDIT: {
            target: "form",
            actions: assign({
              quickAddEnabled: () => false, // Disable quick add if user chooses to edit
            }),
          },
        },
      },
      form: {
        on: {
          CREATED: [
            {
              guard: ({ context }) => isNotNil(context.cellarId),
              actions: assign({
                existingItemId: ({ event }) => event.itemId,
              }),
              target: "addItemToCellar",
            },
            {
              actions: assign({
                existingItemId: ({ event }) => event.itemId,
              }),
              target: "uploadImage",
            },
          ],
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
            },
          }) => ({
            itemId: existingItemId ?? "",
            itemType,
            cellarId: cellarId ?? "",
            cellarItemId: newCellarItemId,
            urqlClient,
            displayImage: displayImageDataUrl,
          }),
          onDone: {
            target: "finalPrompt",
            actions: assign({
              cellarItemId: ({ event }) => event.output.itemId,
            }),
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
              urqlClient,
              itemType,
            },
          }) => ({
            itemId: existingItemId ?? "",
            itemType,
            displayImage: displayImageDataUrl,
            urqlClient,
          }),
          onDone: {
            target: "finalPrompt",
          },
          onError: {
            target: "finalPrompt",
            actions: assign({
              imageError: ({ event }) =>
                event.error instanceof Error
                  ? event.error.message
                  : "The photo could not be saved.",
            }),
          },
        },
      },
      finalPrompt: {
        on: {
          ADD_ANOTHER: {
            actions: ({ context }) => {
              context.router.push(addAnotherHref(context.cellarId));
            },
            target: "done",
          },
          DONE: {
            actions: ({ context }) => {
              // Redirect to cellar item page if added to cellar, otherwise item page
              context.router.push(
                finishedHref({
                  type: context.itemType,
                  itemId: context.existingItemId ?? "",
                  cellarId: context.cellarId,
                  cellarItemId: context.cellarItemId,
                }),
              );
            },
            target: "done",
          },
        },
      },
      done: {
        type: "final",
      },
    },
  },
  {
    actors: {
      uploadFiles,
      fetchDefaults,
      insertCellarItem,
      uploadItemImage,
    },
  },
);

export const pictureOnboardingMachine = createMachine(
  {
    id: "onboarding-wizard-sub",
    initial: "barcode",
    types: {} as {
      input: { urqlClient: Client };
      context: {
        barcode?: Barcode;
        frontLabelDataUrl?: string;
        backLabelDataUrl?: string;
        displayImageDataUrl?: string;
        existingItems?: ExistingItem[];
        existingItemId?: string;
        urqlClient: Client;
      };
      events:
        | {
            type: "FOUND";
            barcode?: Barcode;
          }
        | { type: "SKIP" }
        | { type: "BACK" }
        | { type: "CHOOSE_ITEM"; existingItemId: string }
        | { type: "CAPTURED"; image: string };
      actions: { type: "handleDone" };
      actors: { src: "searchByBarcode"; logic: typeof searchByBarcode };
    },
    context: ({ input }) => ({
      urqlClient: input.urqlClient,
    }),
    states: {
      barcode: {
        on: {
          FOUND: {
            actions: assign({
              barcode: ({ event }) => event.barcode,
            }),
            target: "searching",
          },
          SKIP: "clearing",
        },
      },
      searching: {
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
            {
              target: "clearing",
            },
          ],
          // A lookup that failed outright is treated like one that found
          // nothing: go on and photograph the label.
          onError: { target: "clearing" },
        },
      },
      chooseExisting: {
        on: {
          CHOOSE_ITEM: {
            actions: assign({
              existingItemId: ({ event }) => event.existingItemId,
            }),
            target: "display",
          },
          SKIP: "back",
        },
      },
      clearing: {
        after: {
          // We need to delay a bit to give time for the camera to deal with new video constraints
          50: { target: "back" },
        },
      },
      back: {
        on: {
          CAPTURED: {
            actions: assign({
              backLabelDataUrl: ({ event }) => event.image,
            }),
            target: "front",
          },
          BACK: "barcode",
          SKIP: "front",
        },
      },
      front: {
        on: {
          CAPTURED: {
            actions: assign({
              frontLabelDataUrl: ({ event }) => event.image,
            }),
            target: "display",
          },
          BACK: "back",
          SKIP: "display",
        },
      },
      display: {
        on: {
          // Old: a photo of a new item went to `searchingByImage` first.
          // Image search is a chosen drop (G32), so it is done here.
          CAPTURED: {
            actions: assign({
              displayImageDataUrl: ({ event }) => event.image,
            }),
            target: "done",
          },
          BACK: "front",
          SKIP: "done",
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
