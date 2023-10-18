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
    "\n  query EditBeerPageQuery($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      price\n      upc_12\n      ean_13\n      international_bitterness_unit\n    }\n  }\n": types.EditBeerPageQueryDocument,
    "\n  query GetBeer($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n": types.GetBeerDocument,
    "\n  query GetCellar($cellarId: uuid!) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n    }\n  }\n": types.GetCellarDocument,
    "\n  query GetItemsQuery($cellarId: uuid!) {\n    beers(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    wines(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    spirits(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n    }\n  }\n": types.GetItemsQueryDocument,
    "\n  query EditSpiritPageQuery($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      style\n      description\n      alcohol_content_percentage\n      price\n      upc_12\n      ean_13\n    }\n  }\n": types.EditSpiritPageQueryDocument,
    "\n  query GetSpirit($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      description\n      alcohol_content_percentage\n      style\n      cellar {\n        name\n      }\n    }\n  }\n": types.GetSpiritDocument,
    "\n  query EditWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      description\n      created_by_id\n      vintage\n      description\n      alcohol_content_percentage\n      price\n      ean_13\n      upc_12\n      special_designation\n      vineyard_designation\n      variety\n      region\n    }\n  }\n": types.EditWinePageQueryDocument,
    "\n  query GetWine($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      vintage\n      ean_13\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n": types.GetWineDocument,
    "\n  mutation addCellar($cellar: cellars_insert_input!) {\n    insert_cellars_one(object: $cellar) {\n      id\n    }\n  }\n": types.AddCellarDocument,
    "\n  mutation addUserToCellarUsers($cellarUser: cellar_user_insert_input!) {\n    insert_cellar_user_one(object: $cellarUser) {\n      id\n    }\n  }\n": types.AddUserToCellarUsersDocument,
    "\n  query GetCellars {\n    cellars {\n      id\n      name\n      createdBy {\n        displayName\n        avatarUrl\n      }\n    }\n  }\n": types.GetCellarsDocument,
    "\n  mutation addBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n": types.AddBeerDocument,
    "\n  mutation updateBeer($beerId: uuid!, $beer: beers_set_input!) {\n    update_beers_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n": types.UpdateBeerDocument,
    "\n  mutation addSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n": types.AddSpiritDocument,
    "\n  mutation updateSpirit($spiritId: uuid!, $spirit: spirits_set_input!) {\n    update_spirits_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n": types.UpdateSpiritDocument,
    "\n  mutation addWine($wine: wines_insert_input!) {\n    insert_wines_one(object: $wine) {\n      id\n    }\n  }\n": types.AddWineDocument,
    "\n  mutation updateWine($wineId: uuid!, $wine: wines_set_input!) {\n    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n": types.UpdateWineDocument,
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
export function graphql(source: "\n  query EditBeerPageQuery($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      price\n      upc_12\n      ean_13\n      international_bitterness_unit\n    }\n  }\n"): (typeof documents)["\n  query EditBeerPageQuery($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      price\n      upc_12\n      ean_13\n      international_bitterness_unit\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetBeer($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetBeer($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query EditSpiritPageQuery($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      style\n      description\n      alcohol_content_percentage\n      price\n      upc_12\n      ean_13\n    }\n  }\n"): (typeof documents)["\n  query EditSpiritPageQuery($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      style\n      description\n      alcohol_content_percentage\n      price\n      upc_12\n      ean_13\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetSpirit($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      description\n      alcohol_content_percentage\n      style\n      cellar {\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetSpirit($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      description\n      alcohol_content_percentage\n      style\n      cellar {\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EditWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      description\n      created_by_id\n      vintage\n      description\n      alcohol_content_percentage\n      price\n      ean_13\n      upc_12\n      special_designation\n      vineyard_designation\n      variety\n      region\n    }\n  }\n"): (typeof documents)["\n  query EditWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      description\n      created_by_id\n      vintage\n      description\n      alcohol_content_percentage\n      price\n      ean_13\n      upc_12\n      special_designation\n      vineyard_designation\n      variety\n      region\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetWine($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      vintage\n      ean_13\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetWine($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      vintage\n      ean_13\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n"];
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
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation addBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation addBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation updateBeer($beerId: uuid!, $beer: beers_set_input!) {\n    update_beers_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation updateBeer($beerId: uuid!, $beer: beers_set_input!) {\n    update_beers_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation addSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation addSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation updateSpirit($spiritId: uuid!, $spirit: spirits_set_input!) {\n    update_spirits_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation updateSpirit($spiritId: uuid!, $spirit: spirits_set_input!) {\n    update_spirits_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation addWine($wine: wines_insert_input!) {\n    insert_wines_one(object: $wine) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation addWine($wine: wines_insert_input!) {\n    insert_wines_one(object: $wine) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation updateWine($wineId: uuid!, $wine: wines_set_input!) {\n    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation updateWine($wineId: uuid!, $wine: wines_set_input!) {\n    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;