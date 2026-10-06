import { assign, createMachine } from "xstate";
import type { Barcode } from "@/constants";

/**
 * `82450ad1:src/components/search/actors/interactiveSearch.ts`, restored
 * whole — the barcode half and, with image search back (G32), the camera half
 * the Photo button drives.
 */
export const interactiveSearchMachine = createMachine({
  id: "interactive-search",
  initial: "idle",
  types: {} as {
    input: Record<string, never>;
    context: {
      barcode?: Barcode;
      imageDataUrl?: string;
    };
    events:
      | {
          type: "FOUND";
          barcode?: Barcode;
        }
      | { type: "CANCEL" }
      | { type: "SEARCH_BARCODE" }
      | { type: "SEARCH_IMAGE" }
      | { type: "CAPTURED"; image: string }
      | { type: "SEARCH_COMPLETE" }
      | { type: "SEARCH_ERROR" };
  },
  context: () => ({}),
  states: {
    idle: {
      on: {
        SEARCH_BARCODE: "barcode",
        SEARCH_IMAGE: "image",
      },
    },
    barcode: {
      on: {
        FOUND: {
          actions: assign({
            barcode: ({ event }) => event.barcode,
          }),
          target: "barcodeSearching",
        },
        CANCEL: "idle",
      },
    },
    image: {
      on: {
        CAPTURED: {
          actions: assign({
            imageDataUrl: ({ event }) => event.image,
          }),
          target: "imageSearching",
        },
        CANCEL: "idle",
      },
    },
    barcodeSearching: {
      on: {
        SEARCH_COMPLETE: "idle",
        SEARCH_ERROR: "idle",
        CANCEL: "idle",
      },
    },
    imageSearching: {
      on: {
        SEARCH_COMPLETE: "idle",
        SEARCH_ERROR: "idle",
        CANCEL: "idle",
      },
    },
  },
});
