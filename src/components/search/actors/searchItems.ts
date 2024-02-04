import { isEmpty, not } from "ramda";
import { Client } from "urql";
import { assign, createMachine } from "xstate";
import { searchByBarcode } from "@/components/common/OnboardingWizard/actors/searchByBarcode";
import { searchByImage } from "@/components/common/OnboardingWizard/actors/searchByImage";
import { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";
import { Barcode } from "@/constants";
import { searchByText } from "./searchByText";

export const searchItemsMachine = createMachine(
  {
    id: "search-items",
    initial: "idle",
    types: {} as {
      input: { urqlClient: Client; userId: string };
      context: {
        userId: string;
        text: string;
        barcode?: Barcode;
        imageDataUrl?: string;
        items: BarcodeSearchResult[];
        urqlClient: Client;
      };
      events:
        | {
            type: "FOUND";
            barcode?: Barcode;
          }
        | { type: "CANCEL" }
        | { type: "SEARCH_BARCODE" }
        | { type: "SEARCH_IMAGE" }
        | { type: "BACK" }
        | { type: "CAPTURED"; image: string }
        | { type: "SEARCH"; text: string };
      actors:
        | { src: "searchByBarcode"; logic: typeof searchByBarcode }
        | { src: "searchByText"; logic: typeof searchByText }
        | { src: "searchByImage"; logic: typeof searchByImage };
    },
    context: ({ input }) => ({
      urqlClient: input.urqlClient,
      userId: input.userId,
      text: "",
      items: [],
    }),
    states: {
      idle: {
        on: {
          SEARCH_BARCODE: "barcode",
          SEARCH_IMAGE: "image",
          SEARCH: [
            {
              actions: assign({
                text: ({ event }) => event.text,
              }),
              target: "debouncing",
            },
          ],
        },
      },
      debouncing: {
        on: {
          SEARCH: {
            actions: assign({
              text: ({ event }) => event.text,
            }),
            target: "debouncing",
          },
        },
        after: {
          1000: [
            {
              guard: ({ context }) => isEmpty(context.text),
              actions: assign({
                text: () => "",
                items: () => [],
              }),
              target: "idle",
            },
            {
              guard: ({ context }) => not(isEmpty(context.text)),
              target: "textSearching",
            },
          ],
        },
      },
      barcode: {
        on: {
          FOUND: {
            actions: assign({
              barcode: ({ event }) => event.barcode,
              text: () => "",
              items: () => [],
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
              text: () => "",
              items: () => [],
            }),
            target: "imageSearching",
          },
          CANCEL: "idle",
        },
      },
      textSearching: {
        on: {
          SEARCH: {
            actions: assign({
              text: ({ event }) => event.text,
            }),
            target: "debouncing",
          },
        },
        invoke: {
          src: "searchByText",
          input: ({ context: { text, urqlClient, userId } }) => ({
            text,
            urqlClient,
            userId,
          }),
          onDone: [
            {
              target: "idle",
              actions: assign({
                items: ({ event }) => event.output,
              }),
            },
          ],
        },
      },
      barcodeSearching: {
        invoke: {
          src: "searchByBarcode",
          input: ({ context: { barcode, urqlClient, userId } }) => ({
            barcode,
            userId,
            urqlClient,
          }),
          onDone: [
            {
              target: "idle",
              actions: assign({
                items: ({ event }) => event.output,
              }),
            },
          ],
        },
      },
      imageSearching: {
        invoke: {
          src: "searchByImage",
          input: ({ context: { imageDataUrl, urqlClient, userId } }) => ({
            displayImage: imageDataUrl,
            userId,
            urqlClient,
          }),
          onDone: [
            {
              target: "idle",
              actions: assign({
                items: ({ event }) => event.output,
              }),
            },
          ],
        },
      },
      done: {
        type: "final",
      },
    },
  },
  { actors: { searchByBarcode, searchByImage, searchByText } },
);
