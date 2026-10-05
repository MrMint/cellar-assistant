/**
 * The hand-written Pothos item types against `ITEM_TYPE_SPECS`.
 *
 * The GraphQL types are **not** generated from the spec, on purpose: several
 * per-type choices are deliberate departures from the column — `Wine.style`
 * and `Wine.vintage` are nullable although their columns are `NOT NULL`
 * (graphql-js's `SameResponseShape` across sibling fragments), and sake's
 * integer `vintage` is `vintageYear` on the wire. Those choices are written
 * beside the Pothos definitions in `item.ts` and are listed here as the only
 * permitted departures.
 *
 * Everything else must match: every spec attribute is a field of the object
 * type and of the attribute input, and nothing else is; each field's scalar is
 * the one its kind implies; the create and update inputs carry one bag per
 * type, under the spec's bag key; and a non-null object field is a required
 * attribute. A seventh type added to the spec without its GraphQL half, or an
 * attribute added to one side only, fails here.
 */
import {
  ITEM_TYPE_SPECS,
  ITEM_TYPES,
  type ItemAttributeKind,
  itemAttributeEntries,
} from "@cellar-assistant/contracts";
import {
  type GraphQLField,
  type GraphQLInputField,
  getNamedType,
  isInputObjectType,
  isInterfaceType,
  isNonNullType,
  isObjectType,
} from "graphql";
import { describe, expect, it } from "vitest";
import { schema } from "./index.ts";

const SCALAR_OF: Record<ItemAttributeKind, string> = {
  text: "String",
  date: "Date",
  year: "Int",
  integer: "Int",
  decimal: "Float",
  boolean: "Boolean",
};

/**
 * Required attributes whose object field is nullable anyway, each for the
 * reason `item.ts` gives beside it. Adding to this list is a decision.
 */
const NULLABLE_BY_CHOICE = new Set(["Wine.style", "Wine.vintage"]);

const objectFields = (name: string) => {
  const type = schema.getType(name);
  if (!isObjectType(type)) throw new Error(`${name} is not an object type`);
  const item = schema.getType("Item");
  if (!isInterfaceType(item)) throw new Error("Item is not an interface");
  const inherited = new Set(Object.keys(item.getFields()));
  return new Map(
    Object.entries(type.getFields()).filter(([key]) => !inherited.has(key)),
  ) as Map<string, GraphQLField<unknown, unknown>>;
};

const inputFields = (name: string) => {
  const type = schema.getType(name);
  if (!isInputObjectType(type)) throw new Error(`${name} is not an input`);
  return new Map(Object.entries(type.getFields())) as Map<
    string,
    GraphQLInputField
  >;
};

describe("Pothos item types vs ITEM_TYPE_SPECS", () => {
  for (const type of ITEM_TYPES) {
    const spec = ITEM_TYPE_SPECS[type];
    const keys = itemAttributeEntries(type).map(([key]) => key);

    it(`${spec.graphql.object} has exactly the spec's attributes`, () => {
      expect([...objectFields(spec.graphql.object).keys()].sort()).toEqual(
        [...keys].sort(),
      );
    });

    it(`${spec.graphql.input} has exactly the spec's attributes`, () => {
      expect([...inputFields(spec.graphql.input).keys()].sort()).toEqual(
        [...keys].sort(),
      );
    });

    it(`${spec.graphql.object} / ${spec.graphql.input}: scalars follow each kind`, () => {
      const object = objectFields(spec.graphql.object);
      const input = inputFields(spec.graphql.input);
      for (const [key, attribute] of itemAttributeEntries(type)) {
        const scalar = SCALAR_OF[attribute.kind];
        expect(getNamedType(object.get(key)?.type)?.name, key).toBe(scalar);
        expect(getNamedType(input.get(key)?.type)?.name, key).toBe(scalar);
      }
    });

    it(`${spec.graphql.object}: non-null only where the spec says required`, () => {
      const object = objectFields(spec.graphql.object);
      for (const [key, attribute] of itemAttributeEntries(type)) {
        const label = `${spec.graphql.object}.${key}`;
        const nonNull = isNonNullType(object.get(key)?.type);
        expect(nonNull, label).toBe(
          attribute.required && !NULLABLE_BY_CHOICE.has(label),
        );
      }
    });

    it(`${spec.graphql.input}: every field optional (GraphQL has no input unions)`, () => {
      for (const [key, field] of inputFields(spec.graphql.input)) {
        expect(isNonNullType(field.type), key).toBe(false);
      }
    });
  }

  for (const input of ["CreateItemInput", "UpdateItemInput"]) {
    it(`${input} carries one bag per type, under the spec's bag key`, () => {
      const fields = inputFields(input);
      for (const type of ITEM_TYPES) {
        const spec = ITEM_TYPE_SPECS[type];
        expect(getNamedType(fields.get(spec.bag)?.type)?.name, spec.bag).toBe(
          spec.graphql.input,
        );
      }
    });
  }

  it("every documented departure is still a real one", () => {
    for (const label of NULLABLE_BY_CHOICE) {
      const [object, key] = label.split(".") as [string, string];
      const type = ITEM_TYPES.find(
        (candidate) => ITEM_TYPE_SPECS[candidate].graphql.object === object,
      );
      expect(type, label).toBeDefined();
      const attribute = itemAttributeEntries(type ?? "WINE").find(
        ([candidate]) => candidate === key,
      )?.[1];
      expect(attribute?.required, label).toBe(true);
      expect(isNonNullType(objectFields(object).get(key)?.type), label).toBe(
        false,
      );
    }
  });
});
