/**
 * The one test in this file that reaches the real Photon service.
 *
 * `../ai/ollama.live.test.ts` gates on reachability alone — a bare "can I
 * connect" probe — because its target is `localhost:11434`, which is closed
 * in effectively every sandbox and CI runner by default, so the probe fails
 * fast and the suite skips. **That trick does not work here.** `photon.komoot.io`
 * is a public internet host, and this repo's dev sandbox turns out to have
 * outbound network access — a reachability probe against it *succeeds* during
 * an ordinary `bun run test`, which would silently turn "the default test run"
 * into "a test run that depends on a third party's public API being up."
 * That is exactly what X5's brief rules out ("no test hits the live
 * service" — `docs/architecture/target-stack.md`).
 *
 * So this file requires an explicit opt-in, `PHOTON_LIVE_TEST=1`, on top of
 * reachability. Nobody sets that by accident.
 *
 *   PHOTON_LIVE_TEST=1 bun run --filter @cellar-assistant/actors test src/lib/photon.live.test.ts
 *
 * `photon.test.ts` is what X5 actually relies on for correctness — every
 * behaviour in `httpPhotonClient` against a stubbed `fetch`. This file only
 * proves the real integration still matches komoot's actual API shape, on a
 * machine an operator has deliberately pointed at the network.
 *
 * Point it at a self-hosted instance with `PHOTON_BASE_URL`.
 */
import { describe, expect, it } from "vitest";
import { PHOTON_DEFAULT_BASE_URL, photonClient } from "./photon.ts";

const BASE_URL = process.env.PHOTON_BASE_URL ?? PHOTON_DEFAULT_BASE_URL;
const optedIn = process.env.PHOTON_LIVE_TEST === "1";

const reachable = async (): Promise<boolean> => {
  if (!optedIn) return false;
  try {
    const response = await fetch(`${BASE_URL}/api/?q=Columbus&limit=1`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const skip = !(await reachable());

describe.skipIf(skip)(`Photon, live at ${BASE_URL}`, () => {
  it("forward-geocodes a well-known address", async () => {
    const result = await photonClient().forward(
      "2136 N High St, Columbus, Ohio",
    );
    expect(result).not.toBeNull();
    expect(result?.latitude).toBeGreaterThan(39);
    expect(result?.latitude).toBeLessThan(41);
    expect(result?.longitude).toBeGreaterThan(-84);
    expect(result?.longitude).toBeLessThan(-82);
  });

  it("reverse-geocodes a well-known coordinate", async () => {
    const result = await photonClient().reverse({
      lng: -83.0,
      lat: 39.9612,
    });
    expect(result).not.toBeNull();
    expect(result?.countryCode).toBe("US");
  });

  it("returns null for a query with no plausible match", async () => {
    const result = await photonClient().forward("zzzzzzznotarealplacezzzzzzz");
    expect(result).toBeNull();
  });
});
