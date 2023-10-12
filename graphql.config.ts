import type { IGraphQLConfig } from "graphql-config";

const config: IGraphQLConfig = {
  schema: {
    ["https://local.graphql.nhost.run/v1"]: {
      headers: {
        ["x-hasura-admin-secret"]: "nhost-admin-secret",
      },
    },
  },
};

export default config;
