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
    "\n  query GetBeer($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n": types.GetBeerDocument,
    "\n  mutation addBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n": types.AddBeerDocument,
    "\n  query GetCellar($cellarId: uuid!) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n    }\n  }\n": types.GetCellarDocument,
    "\n  query GetItemsQuery($cellarId: uuid!) {\n    beers(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    wines(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    spirits(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n    }\n  }\n": types.GetItemsQueryDocument,
    "\n  query GetSpirit($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      description\n      alcohol_content_percentage\n      style\n      cellar {\n        name\n      }\n    }\n  }\n": types.GetSpiritDocument,
    "\n  mutation addSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n": types.AddSpiritDocument,
    "\n  query GetWine($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      vintage\n      ean_13\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n": types.GetWineDocument,
    "\n  mutation addWine($wine: wines_insert_input!) {\n    insert_wines_one(object: $wine) {\n      id\n    }\n  }\n": types.AddWineDocument,
    "\n  mutation addCellar($cellar: cellars_insert_input!) {\n    insert_cellars_one(object: $cellar) {\n      id\n    }\n  }\n": types.AddCellarDocument,
    "\n  mutation addUserToCellarUsers($cellarUser: cellar_user_insert_input!) {\n    insert_cellar_user_one(object: $cellarUser) {\n      id\n    }\n  }\n": types.AddUserToCellarUsersDocument,
    "\n  query GetCellars {\n    cellars {\n      id\n      name\n      createdBy {\n        displayName\n        avatarUrl\n      }\n    }\n  }\n": types.GetCellarsDocument,
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
export function graphql(source: "\n  query GetBeer($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetBeer($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation addBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation addBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetCellar($cellarId: uuid!) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n    }\n  }\n"): (typeof documents)["\n  query GetCellar($cellarId: uuid!) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetItemsQuery($cellarId: uuid!) {\n    beers(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    wines(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    spirits(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  query GetItemsQuery($cellarId: uuid!) {\n    beers(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    wines(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    spirits(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetSpirit($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      description\n      alcohol_content_percentage\n      style\n      cellar {\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetSpirit($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      description\n      alcohol_content_percentage\n      style\n      cellar {\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation addSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation addSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetWine($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      vintage\n      ean_13\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetWine($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      vintage\n      ean_13\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation addWine($wine: wines_insert_input!) {\n    insert_wines_one(object: $wine) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation addWine($wine: wines_insert_input!) {\n    insert_wines_one(object: $wine) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation addCellar($cellar: cellars_insert_input!) {\n    insert_cellars_one(object: $cellar) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation addCellar($cellar: cellars_insert_input!) {\n    insert_cellars_one(object: $cellar) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation addUserToCellarUsers($cellarUser: cellar_user_insert_input!) {\n    insert_cellar_user_one(object: $cellarUser) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation addUserToCellarUsers($cellarUser: cellar_user_insert_input!) {\n    insert_cellar_user_one(object: $cellarUser) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetCellars {\n    cellars {\n      id\n      name\n      createdBy {\n        displayName\n        avatarUrl\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetCellars {\n    cellars {\n      id\n      name\n      createdBy {\n        displayName\n        avatarUrl\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;