import { CodegenConfig } from "@graphql-codegen/cli";

const scalars = {
  date: "string",
  money: "number",
  float8: "number",
  bigint: "number",
  uuid: "string",
  smallint: "number",
  json: "string",
  timestamptz: "string",
};

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
    "./shared/gql/": {
      documents: [
        "./src/**/*.(ts|tsx)",
        "./functions/{*.ts,!(node_modules)/**/*.ts}",
        "./shared/{*.ts,!(gql)/**/*.ts}",
      ],
      preset: "client",
      plugins: [],
      config: {
        scalars,
        nonOptionalTypename: true,
      },
    },
  },
};

export default config;
