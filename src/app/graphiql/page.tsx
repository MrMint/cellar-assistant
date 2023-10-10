"use client";

import withAuth from "@/hocs/withAuth";
import { useNhostClient } from "@nhost/nextjs";
import { GraphiQL } from "graphiql";
import "graphiql/graphiql.css";
import { Kind, OperationDefinitionNode, OperationTypeNode } from "graphql";
import { isNil } from "ramda";
import { useEffect } from "react";
import { createRequest, useClient } from "urql";

const Graphiql = () => {
  const client = useClient();
  return (
    <GraphiQL
      fetcher={async (params, opts) => {
        let operationType = OperationTypeNode.QUERY;

        if (opts?.documentAST?.definitions !== undefined) {
          let node = opts.documentAST.definitions[0];
          if (node.kind === Kind.OPERATION_DEFINITION) {
            const operationDefinition = node as OperationDefinitionNode;
            operationType = operationDefinition.operation;
          }
        }
        const request = createRequest(params.query, params.variables);
        const operation = client.createRequestOperation(operationType, request);

        switch (operationType) {
          case OperationTypeNode.QUERY:
            return client.executeRequestOperation(operation);
          case OperationTypeNode.SUBSCRIPTION:
            return client.executeSubscription(operation);
          default:
            throw new Error();
        }

        // const result = await client.executeRequestOperation(operation);
        // return result;
      }}
    />
  );
};

export default withAuth(Graphiql);
