import { assign, createMachine } from "xstate";
import type { Barcode } from "@/constants";

/**
 * `82450ad1:src/components/search/actors/interactiveSearch.ts`, restored
 * without its image half: `SEARCH_IMAGE`, `image`, `CAPTURED` and
 * `imageSearching` drove the Photo button, and image search is a chosen drop
 * (G32 — `itemSearch` takes an embedding the client would have to hold, and
 * nothing turns a photo into one). The barcode half is unchanged.
 */
export const interactiveSearchMachine = createMachine({
  id: "interactive-search",
  initial: "idle",
  types: {} as {
    input: Record<string, never>;
    context: {
      barcode?: Barcode;
    };
    events:
      | {
          type: "FOUND";
          barcode?: Barcode;
        }
      | { type: "CANCEL" }
      | { type: "SEARCH_BARCODE" }
      | { type: "SEARCH_COMPLETE" }
      | { type: "SEARCH_ERROR" };
  },
  context: () => ({}),
  states: {
    idle: {
      on: {
        SEARCH_BARCODE: "barcode",
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
    barcodeSearching: {
      on: {
        SEARCH_COMPLETE: "idle",
        SEARCH_ERROR: "idle",
        CANCEL: "idle",
      },
    },
  },
});
