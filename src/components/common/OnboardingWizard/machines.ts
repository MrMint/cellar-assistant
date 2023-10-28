import { BeerFormDefaultValues } from "@/components/beer/BeerForm";
import { SpiritFormDefaultValues } from "@/components/spirit/SpiritForm";
import { WineFormDefaultValues } from "@/components/wine/WineForm";
import { Barcode } from "@/constants";
import { dataUrlToFile } from "@/utilities";
import { type NhostClient } from "@nhost/nextjs";
import { isNotNil } from "ramda";
import { PromiseActorLogic, assign, createMachine, fromPromise } from "xstate";

export type uploadFilesInput = {
  frontLabel?: string;
  backLabel?: string;
  nhostClient: NhostClient;
};

export type fetchDefaultsInput = {
  barcode?: Barcode;
  frontLabelFileId?: string;
  backLabelFileId?: string;
};

type defaultValues =
  | BeerFormDefaultValues
  | WineFormDefaultValues
  | SpiritFormDefaultValues;

export interface defaultValuesResult<T extends defaultValues> {
  defaults: T;
  itemOnboardingId: string;
}

const uploadFiles = fromPromise(
  async ({
    input: { frontLabel, backLabel, nhostClient },
  }: {
    input: uploadFilesInput;
  }): Promise<fetchDefaultsInput> => {
    let frontLabelFileId: string | undefined;
    let backLabelFileId: string | undefined;

    nhostClient.storage.setAccessToken(nhostClient.auth.getAccessToken());

    if (isNotNil(frontLabel)) {
      const file = dataUrlToFile(frontLabel, "front-label.jpg");
      if (isNotNil(file)) {
        const { fileMetadata } = await nhostClient.storage.upload({
          file,
          bucketId: "label_images",
        });
        frontLabelFileId = fileMetadata?.id;
      }
    }
    if (isNotNil(backLabel)) {
      const file = dataUrlToFile(backLabel, "back-label.jpg");
      if (isNotNil(file)) {
        const { fileMetadata } = await nhostClient.storage.upload({
          file,
          bucketId: "label_images",
        });
        backLabelFileId = fileMetadata?.id;
      }
    }
    return { frontLabelFileId, backLabelFileId };
  },
);

export const OnboardingMachine = createMachine(
  {
    id: "onboarding-wizard",
    initial: "wizard",
    types: {} as {
      input: { nhostClient: NhostClient };
      context: {
        nhostClient: NhostClient;
        barcode?: Barcode;
        frontLabel?: string;
        backLabel?: string;
        frontLabelFileId?: string;
        backLabelFileId?: string;
        itemOnboardingId: string;
        defaults?: defaultValues;
      };
      events:
        | {
            type: "COMPLETE";
            barcode?: Barcode;
            frontLabel?: string;
            backLabel?: string;
          }
        | { type: "SUBMIT" };
      actors:
        | {
            src: "uploadFiles";
            logic: typeof uploadFiles;
          }
        | {
            src: "fetchDefaults";
            logic: PromiseActorLogic<
              defaultValuesResult<defaultValues>,
              fetchDefaultsInput
            >;
          };
    },
    context: ({ input }) => ({
      itemOnboardingId: "",
      nhostClient: input.nhostClient,
    }),
    states: {
      wizard: {
        on: {
          COMPLETE: {
            actions: assign({
              barcode: ({ event }) => event.barcode,
              frontLabel: ({ event }) => event.frontLabel,
              backLabel: ({ event }) => event.backLabel,
              defaults: undefined,
            }),
            target: "upload",
          },
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
            }) as uploadFilesInput,
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
            context: { barcode, backLabelFileId, frontLabelFileId },
          }) => ({
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
        on: { SUBMIT: "done" },
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

export const pictureOnboardingMachine = createMachine({
  id: "onboarding-wizard-sub",
  initial: "barcode",
  types: {} as {
    context: {
      barcode?: Barcode;
      frontLabelDataUrl?: string;
      backLabelDataUrl?: string;
    };
    events:
      | {
          type: "FOUND";
          barcode?: Barcode;
        }
      | { type: "SKIP" }
      | { type: "BACK" }
      | { type: "CAPTURED"; image: string };
    actions: { type: "handleDone" };
  },
  states: {
    barcode: {
      on: {
        FOUND: {
          actions: assign({
            barcode: ({ event }) => event.barcode,
          }),
          target: "clearing",
        },
        SKIP: "clearing",
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
});
