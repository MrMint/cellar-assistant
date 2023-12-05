import { type NhostClient } from "@nhost/nextjs";
import { type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { isEmpty, isNil, isNotNil, not } from "ramda";
import { Client } from "urql";
import { PromiseActorLogic, assign, createMachine } from "xstate";
import { Barcode } from "@/constants";
import { searchByBarcode } from "./actors/searchByBarcode";
import { searchByImage } from "./actors/searchByImage";
import {
  BarcodeSearchResult,
  DefaultValues,
  DefaultValuesResult,
  FetchDefaultsInput,
  InsertCellarItemInput,
  InsertCellarItemResult,
  UploadFilesInput,
} from "./actors/types";
import { uploadFiles } from "./actors/uploadFiles";

export const OnboardingMachine = createMachine(
  {
    id: "onboarding-wizard",
    initial: "wizard",
    types: {} as {
      input: {
        nhostClient: NhostClient;
        urqlClient: Client;
        cellarId: string;
        router: AppRouterInstance;
      };
      context: {
        urqlClient: Client;
        nhostClient: NhostClient;
        barcode?: Barcode;
        frontLabel?: string;
        backLabel?: string;
        frontLabelFileId?: string;
        backLabelFileId?: string;
        displayImageDataUrl?: string;
        itemOnboardingId: string;
        defaults?: DefaultValues;
        existingItemId?: string;
        cellarId: string;
        router: AppRouterInstance;
        retryCount: number;
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
        | { type: "DONE" };
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
            logic: PromiseActorLogic<
              DefaultValuesResult<DefaultValues>,
              FetchDefaultsInput
            >;
          };
    },
    context: ({ input }) => ({
      itemOnboardingId: "",
      nhostClient: input.nhostClient,
      urqlClient: input.urqlClient,
      cellarId: input.cellarId,
      router: input.router,
      retryCount: 0,
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
              guard: ({ event }) => isNotNil(event.existingItemId),
              actions: assign({
                existingItemId: ({ event }) => event.existingItemId,
                displayImageDataUrl: ({ event }) => event.displayImageDataUrl,
              }),
              target: "addItemToCellar",
            },
          ],
        },
      },
      upload: {
        invoke: {
          src: "uploadFiles",
          input: ({ context: { backLabel, frontLabel, nhostClient } }) =>
            ({
              backLabel,
              frontLabel,
              nhostClient,
            }) as UploadFilesInput,
          onDone: {
            target: "analyze",
            actions: assign({
              backLabelFileId: ({ event }) => event.output.backLabelFileId,
              frontLabelFileId: ({ event }) => event.output.frontLabelFileId,
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
                defaults: () => ({}),
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
            context: { urqlClient, barcode, backLabelFileId, frontLabelFileId },
          }) => ({
            urqlClient,
            barcode,
            backLabelFileId,
            frontLabelFileId,
          }),
          onError: {
            target: "retryAnalyze",
          },
          onDone: {
            target: "form",
            actions: assign({
              itemOnboardingId: ({ event }) => event.output.itemOnboardingId,
              defaults: ({ event }) => event.output.defaults,
            }),
          },
        },
      },
      form: {
        on: {
          CREATED: {
            actions: assign({
              existingItemId: ({ event }) => event.itemId,
            }),
            target: "addItemToCellar",
          },
        },
      },
      addItemToCellar: {
        invoke: {
          src: "insertCellarItem",
          input: ({
            context: {
              existingItemId,
              cellarId,
              urqlClient,
              displayImageDataUrl,
            },
          }) => ({
            itemId: existingItemId ?? "",
            cellarId,
            urqlClient,
            displayImage: displayImageDataUrl,
          }),
          onDone: [
            {
              target: "finalPrompt",
            },
          ],
        },
      },
      finalPrompt: {
        on: {
          ADD_ANOTHER: {
            actions: ({ context }) => {
              context.router.push(`/cellars/${context.cellarId}/items/add`);
            },
            target: "done",
          },
          DONE: {
            actions: ({ context }) => {
              context.router.push(`/cellars/${context.cellarId}/items`);
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
        existingItems?: BarcodeSearchResult[];
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
      actors:
        | { src: "searchByBarcode"; logic: typeof searchByBarcode }
        | { src: "searchByImage"; logic: typeof searchByImage };
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
          CAPTURED: {
            actions: assign({
              displayImageDataUrl: ({ event }) => event.image,
            }),
            target: "searchingByImage",
          },
          BACK: "front",
          SKIP: "done",
        },
      },
      searchingByImage: {
        invoke: {
          src: "searchByImage",
          input: ({ context: { displayImageDataUrl, urqlClient } }) => ({
            displayImage: displayImageDataUrl,
            urqlClient,
          }),
          onDone: [
            {
              guard: ({ event }) => not(isEmpty(event.output)),
              target: "chooseExistingImage",
              actions: assign({
                existingItems: ({ event }) => event.output,
              }),
            },
            {
              target: "done",
            },
          ],
        },
      },
      chooseExistingImage: {
        on: {
          CHOOSE_ITEM: {
            actions: assign({
              existingItemId: ({ event }) => event.existingItemId,
            }),
            target: "done",
          },
          SKIP: "done",
        },
      },
      done: {
        entry: ["handleDone"],
        type: "final",
      },
    },
  },
  { actors: { searchByBarcode, searchByImage } },
);
