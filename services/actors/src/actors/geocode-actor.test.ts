/**
 * `GeocodeActor` — C1 (§2.3).
 *
 * **No test in this file reaches `photon.komoot.io`.** The client is an
 * injected seam whose default throws; the shaping functions it wraps are pure
 * and are tested directly.
 */
import type { Ctx, GeocodeInput } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  geocodeActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { ActorId, DaprClient } from "@dapr/dapr";
import { describe, expect, it, vi } from "vitest";
import type { PhotonClient } from "../lib/photon.ts";
import {
  toForward,
  toReverse,
  unconfiguredPhotonClient,
} from "../lib/photon.ts";
import { GeocodeActor } from "./geocode-actor.ts";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const userCtx = (viewerId: string | null = VIEWER): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const newActor = (
  input: GeocodeInput,
  photon: PhotonClient,
  viewerId: string | null = VIEWER,
): GeocodeActor =>
  new GeocodeActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(geocodeActorId(input, viewerId)),
    null as never,
    photon,
  );

const fakePhoton = (overrides: Partial<PhotonClient> = {}): PhotonClient => ({
  forward: async () => null,
  reverse: async () => null,
  ...overrides,
});

describe("GeocodeActor (§2.3)", () => {
  it("calls the geocoder once and answers from the activation after that", async () => {
    const forward = vi.fn(async () => ({
      latitude: 40.0,
      longitude: -83.0,
      displayName: "2136 N High St, Columbus, Ohio",
    }));
    const input: GeocodeInput = { mode: "forward", query: "2136 N High St" };
    const actor = newActor(input, fakePhoton({ forward }));

    const first = await actor.forward(userCtx(), input);
    const second = await actor.forward(userCtx(), input);

    expect(first?.displayName).toBe("2136 N High St, Columbus, Ohio");
    expect(second).toEqual(first);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(actor.searchRuns).toBe(1);
  });

  it("caches a `null` too — 'no such address' is an answer", async () => {
    const forward = vi.fn(async () => null);
    const input: GeocodeInput = {
      mode: "forward",
      query: "not a place at all",
    };
    const actor = newActor(input, fakePhoton({ forward }));

    expect(await actor.forward(userCtx(), input)).toBeNull();
    expect(await actor.forward(userCtx(), input)).toBeNull();
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it("reverse-geocodes, keyed to ~1m so map jitter reuses the activation", async () => {
    const reverse = vi.fn(async () => ({
      streetAddress: "2136 N High St",
      locality: "Columbus",
      region: "Ohio",
      postcode: "43201",
      countryCode: "US",
    }));
    const input: GeocodeInput = {
      mode: "reverse",
      location: { lng: -83.0, lat: 39.9612 },
    };
    const actor = newActor(input, fakePhoton({ reverse }));

    expect((await actor.reverse(userCtx(), input))?.locality).toBe("Columbus");
    // The same coordinate to within a rounding step is the same activation…
    const jittered: GeocodeInput = {
      mode: "reverse",
      location: { lng: -83.0, lat: 39.961200004 },
    };
    expect(geocodeActorId(jittered, VIEWER)).toBe(
      geocodeActorId(input, VIEWER),
    );
    expect(await actor.reverse(userCtx(), jittered)).toEqual(
      await actor.reverse(userCtx(), input),
    );
    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it("is shared across viewers — an address is an address", () => {
    const input: GeocodeInput = { mode: "forward", query: "2136 N High St" };
    expect(geocodeActorId(input, VIEWER)).toBe(
      geocodeActorId(input, "22222222-2222-4222-8222-222222222222"),
    );
  });

  it("refuses a mismatched key, the wrong mode, and an anonymous caller", async () => {
    const input: GeocodeInput = { mode: "forward", query: "2136 N High St" };
    const actor = newActor(input, fakePhoton());

    await expect(
      actor.forward(userCtx(), { mode: "forward", query: "somewhere else" }),
    ).rejects.toThrow(ValidationError);
    await expect(actor.reverse(userCtx(), input)).rejects.toThrow(
      ValidationError,
    );
    await expect(
      newActor(input, fakePhoton(), null).forward(userCtx(null), input),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws loudly when no geocoder is wired, rather than returning null", async () => {
    const input: GeocodeInput = { mode: "forward", query: "2136 N High St" };
    await expect(
      newActor(input, unconfiguredPhotonClient).forward(userCtx(), input),
    ).rejects.toThrow(/no geocoder wired/);
  });

  it("X5: the constructor default is a real geocoder, not the throwing stub", async () => {
    // Every other test in this file injects a fake `PhotonClient` explicitly,
    // which would hide a regression to `unconfiguredPhotonClient` as the
    // constructor default (that was, in fact, exactly the bug X5 fixes —
    // Dapr constructs every actor with `new ActorCls(daprClient, actorId)`
    // and nothing else, so the default is production's *only* wiring). This
    // test omits `photon` and stubs `global.fetch` instead, so a regression
    // back to the throwing stub fails here rather than silently in prod.
    const input: GeocodeInput = { mode: "forward", query: "2136 N High St" };
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [-83.0, 40.0] },
            properties: { type: "street", street: "N High St" },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetch);
    try {
      const actor = new GeocodeActor(
        new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
        new ActorId(geocodeActorId(input, VIEWER)),
        null as never,
        // `photon` deliberately omitted — exercising the constructor default.
      );

      const result = await actor.forward(userCtx(), input);

      expect(result?.displayName).toBe("N High St");
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Photon response shaping (ported from src/lib/cache)", () => {
  const feature = (properties: Record<string, unknown>) => ({
    geometry: { coordinates: [-83.0, 40.0] as [number, number] },
    properties,
  });

  it("accepts only the specific result types", () => {
    for (const type of [
      "house",
      "street",
      "locality",
      "district",
      "postcode",
    ]) {
      expect(
        toForward(feature({ type, street: "High St" }), "q"),
      ).not.toBeNull();
    }
    // A whole state is not an address; the map must fall through to a place
    // search rather than flying to a centroid.
    expect(toForward(feature({ type: "state", name: "Ohio" }), "q")).toBeNull();
    expect(toForward(feature({ type: "country" }), "q")).toBeNull();
  });

  it("builds the display name housenumber-street, city, state", () => {
    expect(
      toForward(
        feature({
          type: "house",
          housenumber: "2136",
          street: "N High St",
          city: "Columbus",
          state: "Ohio",
        }),
        "q",
      )?.displayName,
    ).toBe("2136 N High St, Columbus, Ohio");
  });

  it("falls back to the query when there is nothing to name it with", () => {
    expect(
      toForward(feature({ type: "locality" }), "somewhere")?.displayName,
    ).toBe("somewhere");
  });

  it("upper-cases the reverse country code and nulls an empty street", () => {
    expect(toReverse(feature({ city: "Columbus", countrycode: "us" }))).toEqual(
      {
        streetAddress: null,
        locality: "Columbus",
        region: null,
        postcode: null,
        countryCode: "US",
      },
    );
  });

  it("returns null when Photon had no feature at all", () => {
    expect(toForward(undefined, "q")).toBeNull();
    expect(toReverse(undefined)).toBeNull();
  });
});
