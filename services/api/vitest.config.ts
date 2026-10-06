import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vitest/config";

// graphql-js brands its own types with a module-local symbol and throws
// "Cannot use GraphQLSchema from another module or realm" the moment two
// copies meet. graphql 17 ships four builds of itself (CJS and ESM, each in a
// prod and a `__dev__` flavour) behind export conditions, and the two loaders
// in a test run pick different ones: Vite applies the `development` condition
// (NODE_ENV is `test`), so the test file and the inlined Pothos got
// `__dev__/index.mjs`, while graphql-yoga and @graphql-tools — externalized,
// loaded by the runtime itself — got `index.mjs`. Pinning Vite's bare
// `graphql` to that same prod ESM entry (what bun, and Node >= 22.12 via
// `module-sync`, resolve for `import "graphql"`) puts both on one copy. The
// regex is exact on purpose: the externalized deps' own `graphql/language`
// and friends are resolved by the runtime too, into that same tree.
// (`import.meta.resolve` would say this directly, but Vite's config loader
// rewrites it into a specifier it then cannot load.)
const runtimeGraphql = join(
  dirname(createRequire(import.meta.url).resolve("graphql")),
  "index.mjs",
);

export default defineConfig({
  resolve: {
    alias: [{ find: /^graphql$/, replacement: runtimeGraphql }],
    dedupe: ["graphql"],
  },
  test: {
    // A Pothos plugin loaded from a different copy of `@pothos/core` than the
    // builder registers its methods on the wrong prototype
    // (`builder.globalConnectionFields is not a function`), so inline them all.
    server: { deps: { inline: [/^@pothos\//] } },
  },
});
