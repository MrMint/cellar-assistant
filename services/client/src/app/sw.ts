import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
// Relative, not `@/`: serwist bundles this file with its own esbuild step.
import { OFFLINE_PATH } from "../lib/pwa/offline";
import { runtimeCaching } from "../lib/pwa/runtime-caching";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Order matters — see `src/lib/pwa/runtime-caching.ts`.
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: OFFLINE_PATH,
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
