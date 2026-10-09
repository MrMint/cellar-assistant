import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatAbv,
  labelPlateFrom,
  plateFootLine,
  plateSummary,
} from "./label-plate.ts";

describe("labelPlateFrom", () => {
  test("a full wine: producer, name, year, region · ABV", () => {
    const plate = labelPlateFrom({
      type: "WINE",
      name: "Barolo Castiglione",
      producer: "Vietti",
      vintage: "2016-01-01",
      region: "Piedmont",
      country: "ITALY",
      alcoholContentPercentage: 14,
    });
    assert.deepEqual(plate, {
      producer: "Vietti",
      name: "Barolo Castiglione",
      vintage: "2016",
      origin: "Piedmont",
      abv: "14%",
    });
    assert.equal(plateFootLine(plate), "Piedmont · 14%");
  });

  test("deterministic: the same source gives the same plate", () => {
    const source = {
      type: "SAKE" as const,
      name: "Dassai 23",
      vintageYear: 2021,
      country: "JAPAN",
    };
    assert.deepEqual(labelPlateFrom(source), labelPlateFrom({ ...source }));
  });

  test("a wine with no vintage is NV; no other type invents one", () => {
    assert.equal(labelPlateFrom({ type: "WINE", name: "Brut" }).vintage, "NV");
    for (const type of ["BEER", "SPIRIT", "SAKE", "COFFEE", "TEA"] as const) {
      assert.equal(
        labelPlateFrom({ type, name: "X" }).vintage,
        undefined,
        `${type} got a vintage it does not have`,
      );
    }
  });

  test("coffee and tea never print a vintage, even when one is passed", () => {
    assert.equal(
      labelPlateFrom({ type: "COFFEE", name: "C", vintage: "2020-01-01" })
        .vintage,
      undefined,
    );
  });

  test("sake reads vintageYear", () => {
    assert.equal(
      labelPlateFrom({ type: "SAKE", name: "S", vintageYear: 2019 }).vintage,
      "2019",
    );
  });

  test("region wins over country; a country enum is formatted", () => {
    assert.equal(
      labelPlateFrom({ type: "TEA", name: "T", country: "NEW_ZEALAND" }).origin,
      "New Zealand",
    );
    assert.equal(
      labelPlateFrom({
        type: "TEA",
        name: "T",
        region: "Uji",
        country: "JAPAN",
      }).origin,
      "Uji",
    );
    assert.equal(
      labelPlateFrom({ type: "TEA", name: "T", region: "  ", country: null })
        .origin,
      undefined,
    );
  });

  test("a shouting name is title cased; a producer equal to it is dropped", () => {
    const plate = labelPlateFrom({
      type: "BEER",
      name: "PLINY THE ELDER",
      producer: "Pliny the Elder",
    });
    assert.equal(plate.name, "Pliny the Elder");
    assert.equal(plate.producer, undefined);
  });

  test("a bare item is just its name", () => {
    assert.deepEqual(labelPlateFrom({ type: "BEER", name: "Pils" }), {
      name: "Pils",
    });
    assert.equal(plateFootLine({ name: "Pils" }), undefined);
  });
});

describe("formatAbv", () => {
  const cases: [number | null | undefined, string | undefined][] = [
    [13.5, "13.5%"],
    [14, "14%"],
    [12.04, "12%"],
    [40.25, "40.3%"],
    [0, undefined],
    [-1, undefined],
    [101, undefined],
    [Number.NaN, undefined],
    [null, undefined],
    [undefined, undefined],
  ];
  for (const [input, expected] of cases) {
    test(`${input} → ${expected}`, () =>
      assert.equal(formatAbv(input), expected));
  }
});

describe("plateSummary", () => {
  test("reads like a sentence, NV spelled out", () => {
    assert.equal(
      plateSummary({
        producer: "Krug",
        name: "Grande Cuvée",
        vintage: "NV",
        origin: "Champagne",
        abv: "12%",
      }),
      "Krug Grande Cuvée, non-vintage, Champagne · 12%",
    );
    assert.equal(plateSummary({ name: "Pils" }), "Pils");
  });
});
