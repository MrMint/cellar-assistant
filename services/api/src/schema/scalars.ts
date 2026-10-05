import { GraphQLError } from "graphql";
import { builder } from "./builder.ts";

/**
 * Scalars are declared, not imported from a library: there are three, and all
 * are produced by actors rather than parsed from a driver. `graphql-scalars`
 * would be 40 types to get these three.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const asString = (value: unknown, typeName: string): string => {
  if (typeof value !== "string") {
    throw new GraphQLError(`${typeName} must be a string`);
  }
  return value;
};

builder.scalarType("DateTime", {
  description: "An ISO-8601 instant, e.g. 2026-09-08T20:15:00.000Z.",
  serialize: (value) => asString(value, "DateTime"),
  parseValue: (value) => {
    const text = asString(value, "DateTime");
    if (Number.isNaN(Date.parse(text))) {
      throw new GraphQLError(`not a valid DateTime: ${text}`);
    }
    return text;
  },
});

builder.scalarType("Date", {
  description: "An ISO-8601 calendar date, e.g. 2019-01-31.",
  serialize: (value) => asString(value, "Date"),
  parseValue: (value) => {
    const text = asString(value, "Date");
    if (!ISO_DATE.test(text)) {
      throw new GraphQLError(`not a valid Date: ${text}`);
    }
    return text;
  },
});

/**
 * An arbitrary JSON value (object, array, string, number, boolean or null).
 * `tier_lists.ai_insights` (B7) is `jsonb` with no fixed shape — it is
 * whatever `TierListActor.generateInsights`'s injected generator produces —
 * so there is nothing to validate here beyond "valid JSON", which the
 * `jsonb` column and `JSON.parse` already guarantee on the way in.
 */
builder.scalarType("JSON", {
  description: "An arbitrary JSON value.",
  serialize: (value) => value,
  parseValue: (value) => value,
});
