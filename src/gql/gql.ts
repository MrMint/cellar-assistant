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
    "\n  query EditBeerPageQuery($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      price\n      barcode_code\n      international_bitterness_unit\n    }\n  }\n": types.EditBeerPageQueryDocument,
    "\n  query GetBeer($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      cellar {\n        name\n      }\n    }\n  }\n": types.GetBeerDocument,
    "\n  query GetCellar($cellarId: uuid!) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n    }\n  }\n": types.GetCellarDocument,
    "\n  query GetItemsQuery($cellarId: uuid!) {\n    beers(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellar_wine(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      wine {\n        name\n        vintage\n      }\n    }\n    spirits(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n    }\n  }\n": types.GetItemsQueryDocument,
    "\n  query EditSpiritPageQuery($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      style\n      description\n      alcohol_content_percentage\n      price\n      barcode_code\n    }\n  }\n": types.EditSpiritPageQueryDocument,
    "\n  query GetSpirit($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      description\n      alcohol_content_percentage\n      style\n      cellar {\n        name\n      }\n    }\n  }\n": types.GetSpiritDocument,
    "\n  query EditWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      description\n      created_by_id\n      vintage\n      description\n      alcohol_content_percentage\n      barcode_code\n      special_designation\n      vineyard_designation\n      variety\n      region\n      style\n      country\n    }\n  }\n": types.EditWinePageQueryDocument,
    "\n  query GetCellarWine($itemId: uuid!) {\n    cellar_wine_by_pk(id: $itemId) {\n      wine {\n        id\n        name\n        created_by_id\n        region\n        variety\n        vintage\n        style\n        country\n        description\n        barcode_code\n        alcohol_content_percentage\n      }\n      cellar {\n        name\n      }\n    }\n  }\n": types.GetCellarWineDocument,
    "\n  mutation addCellar($cellar: cellars_insert_input!) {\n    insert_cellars_one(object: $cellar) {\n      id\n    }\n  }\n": types.AddCellarDocument,
    "\n  mutation addUserToCellarUsers($cellarUser: cellar_user_insert_input!) {\n    insert_cellar_user_one(object: $cellarUser) {\n      id\n    }\n  }\n": types.AddUserToCellarUsersDocument,
    "\n  query GetCellars {\n    cellars {\n      id\n      name\n      createdBy {\n        displayName\n        avatarUrl\n      }\n    }\n  }\n": types.GetCellarsDocument,
    "\n  query GetWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      style\n      vintage\n      description\n      barcode_code\n      alcohol_content_percentage\n    }\n    cellars {\n      id\n      name\n    }\n  }\n": types.GetWinePageQueryDocument,
    "\n  mutation addBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n": types.AddBeerDocument,
    "\n  mutation updateBeer($beerId: uuid!, $beer: beers_set_input!) {\n    update_beers_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n": types.UpdateBeerDocument,
    "\n  query GetBeerDefaults($hint: item_defaults_hint!) {\n    beer_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      vintage\n      barcode_code\n      barcode_type\n      country\n      international_bitterness_unit\n      style\n      item_onboarding_id\n    }\n  }\n": types.GetBeerDefaultsDocument,
    "\n  query SearchByBarcode($code: String!) {\n    barcodes_by_pk(code: $code) {\n      wines {\n        id\n        name\n        vintage\n      }\n    }\n  }\n": types.SearchByBarcodeDocument,
    "\n  mutation DeleteBeerMutation($itemId: uuid!) {\n    delete_beers_by_pk(id: $itemId) {\n      id\n    }\n  }\n": types.DeleteBeerMutationDocument,
    "\n  mutation DeleteSpiritMutation($itemId: uuid!) {\n    delete_spirits_by_pk(id: $itemId) {\n      id\n    }\n  }\n": types.DeleteSpiritMutationDocument,
    "\n  mutation DeleteWineMutation($itemId: uuid!) {\n    delete_cellar_wine_by_pk(id: $itemId) {\n      id\n    }\n  }\n": types.DeleteWineMutationDocument,
    "\n  mutation HeaderAddWineMutation($input: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $input) {\n      id\n      cellar_id\n    }\n  }\n": types.HeaderAddWineMutationDocument,
    "\n  mutation addSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n": types.AddSpiritDocument,
    "\n  mutation updateSpirit($spiritId: uuid!, $spirit: spirits_set_input!) {\n    update_spirits_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n": types.UpdateSpiritDocument,
    "\n  query GetSpiritDefaults($hint: item_defaults_hint!) {\n    spirit_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      country\n      distillery\n      item_onboarding_id\n      style\n      type\n      vintage\n    }\n  }\n": types.GetSpiritDefaultsDocument,
    "\n  mutation addWine($wine: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $wine) {\n      id\n    }\n  }\n": types.AddWineDocument,
    "\n  mutation updateWine($wineId: uuid!, $wine: wines_set_input!) {\n    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n": types.UpdateWineDocument,
    "\n  query GetWineDefaults($hint: item_defaults_hint!) {\n    wine_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      region\n      country\n      special_designation\n      variety\n      vineyard_designation\n      vintage\n      style\n    }\n  }\n": types.GetWineDefaultsDocument,
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
export function graphql(source: "\n  query EditBeerPageQuery($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      price\n      barcode_code\n      international_bitterness_unit\n    }\n  }\n"): (typeof documents)["\n  query EditBeerPageQuery($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      price\n      barcode_code\n      international_bitterness_unit\n    }\n  }\n"];
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
export function graphql(source: "\n  query GetItemsQuery($cellarId: uuid!) {\n    beers(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellar_wine(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      wine {\n        name\n        vintage\n      }\n    }\n    spirits(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  query GetItemsQuery($cellarId: uuid!) {\n    beers(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellar_wine(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      wine {\n        name\n        vintage\n      }\n    }\n    spirits(where: { cellar_id: { _eq: $cellarId } }) {\n      id\n      name\n    }\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EditSpiritPageQuery($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      style\n      description\n      alcohol_content_percentage\n      price\n      barcode_code\n    }\n  }\n"): (typeof documents)["\n  query EditSpiritPageQuery($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      style\n      description\n      alcohol_content_percentage\n      price\n      barcode_code\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetSpirit($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      description\n      alcohol_content_percentage\n      style\n      cellar {\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetSpirit($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      description\n      alcohol_content_percentage\n      style\n      cellar {\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EditWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      description\n      created_by_id\n      vintage\n      description\n      alcohol_content_percentage\n      barcode_code\n      special_designation\n      vineyard_designation\n      variety\n      region\n      style\n      country\n    }\n  }\n"): (typeof documents)["\n  query EditWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      description\n      created_by_id\n      vintage\n      description\n      alcohol_content_percentage\n      barcode_code\n      special_designation\n      vineyard_designation\n      variety\n      region\n      style\n      country\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetCellarWine($itemId: uuid!) {\n    cellar_wine_by_pk(id: $itemId) {\n      wine {\n        id\n        name\n        created_by_id\n        region\n        variety\n        vintage\n        style\n        country\n        description\n        barcode_code\n        alcohol_content_percentage\n      }\n      cellar {\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetCellarWine($itemId: uuid!) {\n    cellar_wine_by_pk(id: $itemId) {\n      wine {\n        id\n        name\n        created_by_id\n        region\n        variety\n        vintage\n        style\n        country\n        description\n        barcode_code\n        alcohol_content_percentage\n      }\n      cellar {\n        name\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query GetWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      style\n      vintage\n      description\n      barcode_code\n      alcohol_content_percentage\n    }\n    cellars {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  query GetWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      style\n      vintage\n      description\n      barcode_code\n      alcohol_content_percentage\n    }\n    cellars {\n      id\n      name\n    }\n  }\n"];
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
export function graphql(source: "\n  query GetBeerDefaults($hint: item_defaults_hint!) {\n    beer_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      vintage\n      barcode_code\n      barcode_type\n      country\n      international_bitterness_unit\n      style\n      item_onboarding_id\n    }\n  }\n"): (typeof documents)["\n  query GetBeerDefaults($hint: item_defaults_hint!) {\n    beer_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      vintage\n      barcode_code\n      barcode_type\n      country\n      international_bitterness_unit\n      style\n      item_onboarding_id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchByBarcode($code: String!) {\n    barcodes_by_pk(code: $code) {\n      wines {\n        id\n        name\n        vintage\n      }\n    }\n  }\n"): (typeof documents)["\n  query SearchByBarcode($code: String!) {\n    barcodes_by_pk(code: $code) {\n      wines {\n        id\n        name\n        vintage\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteBeerMutation($itemId: uuid!) {\n    delete_beers_by_pk(id: $itemId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteBeerMutation($itemId: uuid!) {\n    delete_beers_by_pk(id: $itemId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteSpiritMutation($itemId: uuid!) {\n    delete_spirits_by_pk(id: $itemId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteSpiritMutation($itemId: uuid!) {\n    delete_spirits_by_pk(id: $itemId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteWineMutation($itemId: uuid!) {\n    delete_cellar_wine_by_pk(id: $itemId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteWineMutation($itemId: uuid!) {\n    delete_cellar_wine_by_pk(id: $itemId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation HeaderAddWineMutation($input: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $input) {\n      id\n      cellar_id\n    }\n  }\n"): (typeof documents)["\n  mutation HeaderAddWineMutation($input: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $input) {\n      id\n      cellar_id\n    }\n  }\n"];
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
export function graphql(source: "\n  query GetSpiritDefaults($hint: item_defaults_hint!) {\n    spirit_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      country\n      distillery\n      item_onboarding_id\n      style\n      type\n      vintage\n    }\n  }\n"): (typeof documents)["\n  query GetSpiritDefaults($hint: item_defaults_hint!) {\n    spirit_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      country\n      distillery\n      item_onboarding_id\n      style\n      type\n      vintage\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation addWine($wine: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $wine) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation addWine($wine: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $wine) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation updateWine($wineId: uuid!, $wine: wines_set_input!) {\n    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation updateWine($wineId: uuid!, $wine: wines_set_input!) {\n    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetWineDefaults($hint: item_defaults_hint!) {\n    wine_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      region\n      country\n      special_designation\n      variety\n      vineyard_designation\n      vintage\n      style\n    }\n  }\n"): (typeof documents)["\n  query GetWineDefaults($hint: item_defaults_hint!) {\n    wine_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      region\n      country\n      special_designation\n      variety\n      vineyard_designation\n      vintage\n      style\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;