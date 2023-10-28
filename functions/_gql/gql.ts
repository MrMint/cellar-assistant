/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 */
const documents = {
    "\n  query GetCredential($id: String!) {\n    admin_credentials_by_pk(id: $id) {\n      id\n      credentials\n    }\n  }\n": types.GetCredentialDocument,
    "\n  mutation AddItemOnboarding($onboarding: item_onboardings_insert_input!) {\n    insert_item_onboardings_one(object: $onboarding) {\n      id\n    }\n  }\n": types.AddItemOnboardingDocument,
    "\n  query GetFile($id: uuid!) {\n    file(id: $id) {\n      id\n      bucket {\n        id\n      }\n      mimeType\n      size\n    }\n  }\n": types.GetFileDocument,
    "\n  mutation AddTextExtractionResults($analysis: image_analysis_insert_input!) {\n    insert_image_analysis_one(object: $analysis) {\n      id\n    }\n  }\n": types.AddTextExtractionResultsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetCredential($id: String!) {\n    admin_credentials_by_pk(id: $id) {\n      id\n      credentials\n    }\n  }\n"): (typeof documents)["\n  query GetCredential($id: String!) {\n    admin_credentials_by_pk(id: $id) {\n      id\n      credentials\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddItemOnboarding($onboarding: item_onboardings_insert_input!) {\n    insert_item_onboardings_one(object: $onboarding) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddItemOnboarding($onboarding: item_onboardings_insert_input!) {\n    insert_item_onboardings_one(object: $onboarding) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetFile($id: uuid!) {\n    file(id: $id) {\n      id\n      bucket {\n        id\n      }\n      mimeType\n      size\n    }\n  }\n"): (typeof documents)["\n  query GetFile($id: uuid!) {\n    file(id: $id) {\n      id\n      bucket {\n        id\n      }\n      mimeType\n      size\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddTextExtractionResults($analysis: image_analysis_insert_input!) {\n    insert_image_analysis_one(object: $analysis) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddTextExtractionResults($analysis: image_analysis_insert_input!) {\n    insert_image_analysis_one(object: $analysis) {\n      id\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;