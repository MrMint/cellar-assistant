/**
 * `httpPhotonClient` / `photonClient` — X5 (§2.3 `GeocodeActor`).
 *
 * `geocode-actor.test.ts` covers `toForward` / `toReverse` (the pure shaping)
 * and the actor's own caching/authorization behaviour, always injecting a
 * fake `PhotonClient`. Nothing exercised the actual HTTP boundary before this
 * file — the fetch call, the URL it builds, the timeout, the header, and the
 * "every failure is null" contract the module doc promises. **No test here
 * reaches `photon.komoot.io`**: `global.fetch` is stubbed throughout.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  httpPhotonClient,
  PHOTON_DEFAULT_BASE_URL,
  photonClient,
} from "./photon.ts";

const jsonResponse = (body: unknown, ok = true): Response =>
  ({
    ok,
    json: async () => body,
  }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("httpPhotonClient forward", () => {
  it("requests `/api/?q=&limit=1`, with the query encoded and a User-Agent", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        features: [
          {
            geometry: { coordinates: [-83.0, 40.0] },
            properties: { type: "street", street: "N High St" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await httpPhotonClient("https://example.test").forward(
      "N High St, Columbus OH",
    );

    expect(result?.displayName).toBe("N High St");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://example.test/api/?q=N%20High%20St%2C%20Columbus%20OH&limit=1",
    );
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(
      "CellarAssistant/1.0",
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls through to the query text when Photon has nothing specific enough", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          features: [
            {
              geometry: { coordinates: [-83, 40] },
              properties: { type: "state", name: "Ohio" },
            },
          ],
        }),
      ),
    );

    expect(
      await httpPhotonClient("https://example.test").forward("Ohio"),
    ).toBeNull();
  });

  it("returns null on a non-2xx response, without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, false)),
    );

    await expect(
      httpPhotonClient("https://example.test").forward("anywhere"),
    ).resolves.toBeNull();
  });

  it("returns null when fetch rejects — a timeout or a DNS failure look the same", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      }),
    );

    await expect(
      httpPhotonClient("https://example.test").forward("anywhere"),
    ).resolves.toBeNull();
  });

  it("returns null on malformed JSON rather than propagating the parse error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      })),
    );

    await expect(
      httpPhotonClient("https://example.test").forward("anywhere"),
    ).resolves.toBeNull();
  });

  it("returns null when Photon answers with no features at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ features: [] })),
    );

    expect(
      await httpPhotonClient("https://example.test").forward("nowhere"),
    ).toBeNull();
  });
});

describe("httpPhotonClient reverse", () => {
  it("requests `/reverse?lon=&lat=&limit=1`", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        features: [
          {
            geometry: { coordinates: [-83.0, 40.0] },
            properties: { city: "Columbus", countrycode: "us" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await httpPhotonClient("https://example.test").reverse({
      lng: -83.0,
      lat: 39.9612,
    });

    expect(result?.locality).toBe("Columbus");
    expect(result?.countryCode).toBe("US");
    const [url] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://example.test/reverse?lon=-83&lat=39.9612&limit=1",
    );
  });

  it("returns null when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(
      httpPhotonClient("https://example.test").reverse({ lng: 0, lat: 0 }),
    ).resolves.toBeNull();
  });
});

describe("photonClient()", () => {
  it("defaults to the public Photon instance when PHOTON_BASE_URL is unset", async () => {
    vi.stubEnv("PHOTON_BASE_URL", "");
    delete process.env.PHOTON_BASE_URL;
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ features: [] }),
    );
    vi.stubGlobal("fetch", fetch);

    await photonClient().forward("somewhere");

    const [url] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith(PHOTON_DEFAULT_BASE_URL)).toBe(true);
  });

  it("honors PHOTON_BASE_URL when set, e.g. a self-hosted Photon instance", async () => {
    vi.stubEnv("PHOTON_BASE_URL", "https://photon.internal.example");
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ features: [] }),
    );
    vi.stubGlobal("fetch", fetch);

    await photonClient().forward("somewhere");

    const [url] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith("https://photon.internal.example")).toBe(true);
  });

  it("is never the throwing `unconfiguredPhotonClient` — Photon needs no API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ features: [] })),
    );
    // If this were `unconfiguredPhotonClient` it would reject with
    // `ConflictError` before ever calling `fetch`.
    await expect(photonClient().forward("somewhere")).resolves.toBeNull();
  });
});
