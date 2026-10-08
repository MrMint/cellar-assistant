import { createRequire } from "node:module";
import { dirname } from "node:path";
import { defineConfig } from "vitest/config";

// graphql-js brands its own types with a module-local symbol and throws
// "Cannot use GraphQLSchema from another module or realm" the moment two
// copies meet. graphql 17 ships a CJS (`.js`) and an ESM (`.mjs`) build behind
// export conditions (its `__dev__` entries only switch dev mode on and
// re-export the ESM build). graphql-yoga and @graphql-tools are externalized
// and loaded by the runtime itself, which resolves `import "graphql"` to the
// ESM `index.mjs` (bun, and Node >= 22.12 via `module-sync`). Vite resolves
// what it inlines — the test files and Pothos — on its own, and without this
// alias hands them other files: the old `graphql/index.js` alias gave them the
// CJS build (453 of 628 tests failed under graphql 17), and an unaliased
// `graphql/type` still comes back as a second module, so `GraphQLObjectType`
// from "graphql" and from "graphql/type" were different classes.
// `src/graphql-instance.test.ts` pins that.
//
// So the bare specifier and each directory entry (`graphql/type`,
// `graphql/language`, …) all map to the same ESM files the runtime loads.
// Deep imports (`graphql/type/definition`) are not covered; nothing uses them.
// (`import.meta.resolve` would say where directly, but Vite's config loader
// rewrites it into a specifier it then cannot load.)
const graphqlRoot = dirname(createRequire(import.meta.url).resolve("graphql"));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^graphql(\/(?:error|execution|language|type|utilities|validation))?$/,
        replacement: `${graphqlRoot}$1/index.mjs`,
      },
    ],
    dedupe: ["graphql"],
  },
  test: {
    // A Pothos plugin loaded from a different copy of `@pothos/core` than the
    // builder registers its methods on the wrong prototype
    // (`builder.globalConnectionFields is not a function`), so inline them all.
    server: { deps: { inline: [/^@pothos\//] } },
  },
});
