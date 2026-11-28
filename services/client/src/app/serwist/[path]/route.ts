import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";
import { OFFLINE_PATH } from "@/lib/pwa/offline";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf-8",
  }).stdout?.trim() ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: OFFLINE_PATH, revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
