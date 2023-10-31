import { type NhostClient } from "@nhost/nextjs";
import { type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { isEmpty, isNil, isNotNil, not } from "ramda";
import { Client } from "urql";
import { PromiseActorLogic, assign, createMachine } from "xstate";
import { insertCellarItem } from "@/components/wine/actors/insertCellarItem";
import { Barcode } from "@/constants";
import { searchByBarcode } from "./actors/searchByBarcode";
import {
  BarcodeSearchResult,
  DefaultValues,
  DefaultValuesResult,
  FetchDefaultsInput,
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
        itemOnboardingId: string;
        defaults?: DefaultValues;
        existingItemId?: string;
        cellarId: string;
        router: AppRouterInstance;
      };
      events:
        | {
            type: "COMPLETE";
            barcode?: Barcode;
            frontLabel?: string;
            backLabel?: string;
            existingItemId?: string;
          }
        | { type: "CREATED" }
        | { type: "ADD_ANOTHER" }
        | { type: "DONE" };
      actors:
        | {
            src: "uploadFiles";
            logic: typeof uploadFiles;
          }
        | {
            src: "insertCellarItem";
            logic: typeof insertCellarItem;
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
                defaults: undefined,
              }),
              target: "upload",
            },
            {
              guard: ({ event }) => isNotNil(event.existingItemId),
              actions: assign({
                existingItemId: ({ event }) => event.existingItemId,
              }),
              target: "addExisting",
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
        on: { CREATED: "finalPrompt" },
      },
      addExisting: {
        invoke: {
          src: "insertCellarItem",
          input: ({ context: { existingItemId, cellarId, urqlClient } }) => ({
            itemId: existingItemId ?? "",
            cellarId,
            urqlClient,
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
        },
      },
      chooseExisting: {
        on: {
          CHOOSE_ITEM: {
            actions: assign({
              existingItemId: ({ event }) => event.existingItemId,
            }),
            target: "done",
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
            target: "done",
          },
          BACK: "back",
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
