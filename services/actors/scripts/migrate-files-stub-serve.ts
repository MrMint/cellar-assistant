/**
 * Test-only: serve `migrate-files-stub.ts`'s stand-in for Nhost's Storage API
 * as a process, for `scripts/cutover/test/files-phase.sh` — which drives the
 * real `cutover.sh` and so cannot hold the stub in its own memory the way the
 * vitest files do.
 *
 *   bun scripts/migrate-files-stub-serve.ts <manifest.json> <port-file> <log-file>
 *
 * The manifest is `{ secret, files: [{ id, hex, throttle? }] }`. It listens on
 * `0.0.0.0` (a `FILES_RUNNER=docker` container reaches it through
 * `host.docker.internal`), writes its port to <port-file> once listening, and
 * rewrites <log-file> every 200 ms with what it has served: GETs per id, the
 * HEAD count, and whether any secret other than the manifest's was presented —
 * as labels, never the secret itself.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { startStub } from "./migrate-files-stub.ts";

const [manifestPath, portPath, logPath] = process.argv.slice(2);
if (
  manifestPath === undefined ||
  portPath === undefined ||
  logPath === undefined
) {
  throw new Error(
    "usage: migrate-files-stub-serve.ts <manifest.json> <port-file> <log-file>",
  );
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  secret: string;
  files: { id: string; hex: string; throttle?: number }[];
};
const stub = await startStub(manifest.secret, "0.0.0.0");
for (const f of manifest.files) {
  stub.files.set(f.id, {
    body: Buffer.from(f.hex, "hex"),
    throttle: f.throttle,
    retryAfter: "0",
  });
}
const writeLog = () =>
  writeFileSync(
    logPath,
    JSON.stringify({
      gets: Object.fromEntries(stub.gets),
      heads: stub.heads,
      secretsSeen: [...stub.secretsSeen].map((s) =>
        s === manifest.secret ? "manifest" : "other",
      ),
    }),
  );
writeLog();
setInterval(writeLog, 200);
writeFileSync(portPath, new URL(stub.url).port);
