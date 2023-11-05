import { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: [
    {
      "https://local.graphql.nhost.run/v1": {
        headers: {
          "x-hasura-admin-secret": "nhost-admin-secret",
        },
      },
    },
  ],
  ignoreNoDocuments: true,
  generates: {
    "./src/gql/": {
      documents: ["./src/**/*.(ts|tsx)"],
      preset: "client",
      plugins: [],
      config: {
        scalars: {
          date: "string",
          money: "number",
          bigint: "number",
          uuid: "string",
          smallint: "number",
          json: "string",
          timestamptz: "string",
        },
        nonOptionalTypename: true,
      },
    },
    "./functions/_gql/": {
      documents: ["./functions/{*.ts,!(node_modules)/**/*.ts}"],
      preset: "client",
      plugins: [],
      config: {
        scalars: {
          date: "string",
          money: "number",
          bigint: "number",
          uuid: "string",
          smallint: "number",
          json: "string",
          timestamptz: "string",
        },
        nonOptionalTypename: true,
      },
    },
  },
};

export default config;
