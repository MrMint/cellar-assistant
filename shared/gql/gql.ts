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
    "\n  mutation InsertFriends(\n    $friends: [friends_insert_input!]!\n    $requestId: uuid!\n  ) {\n    insert_friends(objects: $friends) {\n      affected_rows\n    }\n\n    delete_friend_requests_by_pk(id: $requestId) {\n      id\n    }\n  }\n": types.InsertFriendsDocument,
    "\n  mutation UpdateItemImage($itemId: uuid!, $item: item_image_set_input!) {\n    update_item_image_by_pk(pk_columns: { id: $itemId }, _set: $item) {\n      id\n    }\n  }\n": types.UpdateItemImageDocument,
    "\n  mutation InsertVector($vector: item_vectors_insert_input!) {\n    insert_item_vectors_one(object: $vector) {\n      id\n    }\n  }\n": types.InsertVectorDocument,
    "\n  mutation DeleteVectors($where: item_vectors_bool_exp!) {\n    delete_item_vectors(where: $where) {\n      affected_rows\n    }\n  }\n": types.DeleteVectorsDocument,
    "\n  mutation AddItemOnboarding($onboarding: item_onboardings_insert_input!) {\n    insert_item_onboardings_one(object: $onboarding) {\n      id\n    }\n  }\n": types.AddItemOnboardingDocument,
    "\n  query GetFile($id: uuid!) {\n    file(id: $id) {\n      id\n      bucket {\n        id\n      }\n      mimeType\n      size\n    }\n  }\n": types.GetFileDocument,
    "\n  mutation AddTextExtractionResults($analysis: image_analysis_insert_input!) {\n    insert_image_analysis_one(object: $analysis) {\n      id\n    }\n  }\n": types.AddTextExtractionResultsDocument,
    "\n  mutation InsertItemImage($item: item_image_insert_input!) {\n    insert_item_image_one(object: $item) {\n      id\n    }\n  }\n": types.InsertItemImageDocument,
    "\n  mutation AddItemImage($input: item_image_upload_input!) {\n    item_image_upload(input: $input) {\n      id\n    }\n  }\n": types.AddItemImageDocument,
    "\n  mutation AddBeerToCellar($beer: cellar_beer_insert_input!) {\n    insert_cellar_beer_one(object: $beer) {\n      id\n      cellar_id\n    }\n  }\n": types.AddBeerToCellarDocument,
    "\n  mutation AddBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n": types.AddBeerDocument,
    "\n  mutation UpdateBeer($beerId: uuid!, $beer: beers_set_input!) {\n    update_beers_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n": types.UpdateBeerDocument,
    "\n  mutation UpdateCellarBeer($beerId: uuid!, $beer: cellar_beer_set_input!) {\n    update_cellar_beer_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n": types.UpdateCellarBeerDocument,
    "\n  mutation AddWine($wine: wines_insert_input!) {\n    insert_wines_one(object: $wine) {\n      id\n    }\n  }\n": types.AddWineDocument,
    "\n  mutation AddWineToCellar($input: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $input) {\n      id\n      cellar_id\n    }\n  }\n": types.AddWineToCellarDocument,
    "\n  mutation UpdateWine($wineId: uuid!, $wine: wines_set_input!) {\n    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n": types.UpdateWineDocument,
    "\n  mutation UpdateCellarWine($wineId: uuid!, $wine: cellar_wine_set_input!) {\n    update_cellar_wine_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n": types.UpdateCellarWineDocument,
    "\n  mutation AddSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n": types.AddSpiritDocument,
    "\n  mutation AddSpiritToCellar($spirit: cellar_spirit_insert_input!) {\n    insert_cellar_spirit_one(object: $spirit) {\n      id\n    }\n  }\n": types.AddSpiritToCellarDocument,
    "\n  mutation UpdateSpirit($spiritId: uuid!, $spirit: spirits_set_input!) {\n    update_spirits_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n": types.UpdateSpiritDocument,
    "\n  mutation UpdateCellarSpirit(\n    $spiritId: uuid!\n    $spirit: cellar_spirit_set_input!\n  ) {\n    update_cellar_spirit_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n": types.UpdateCellarSpiritDocument,
    "\n  mutation AddItemReview($review: item_reviews_insert_input!) {\n    insert_item_reviews_one(object: $review) {\n      id\n      beer {\n        id\n      }\n      wine {\n        id\n      }\n      spirit {\n        id\n      }\n    }\n  }\n": types.AddItemReviewDocument,
    "\n  query GetBeerPageQuery($itemId: uuid!, $userId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      style\n      vintage\n      description\n      alcohol_content_percentage\n      country\n      reviews(limit: 10, order_by: { created_at: desc }) {\n        id\n        user {\n          avatarUrl\n          displayName\n        }\n        score\n        text\n        createdAt: created_at\n      }\n      item_images(limit: 1) {\n        file_id\n        placeholder\n      }\n    }\n    cellars(where: { created_by_id: { _eq: $userId } }) {\n      id\n      name\n    }\n  }\n": types.GetBeerPageQueryDocument,
    "\n  query EditBeerPageQuery($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      barcode_code\n      international_bitterness_unit\n      country\n    }\n  }\n": types.EditBeerPageQueryDocument,
    "\n  query GetCellarBeer($itemId: uuid!) {\n    cellar_beer_by_pk(id: $itemId) {\n      beer {\n        id\n        name\n        created_by_id\n        vintage\n        style\n        description\n        alcohol_content_percentage\n        country\n        reviews(limit: 10, order_by: { created_at: desc }) {\n          id\n          user {\n            avatarUrl\n            displayName\n          }\n          score\n          text\n          createdAt: created_at\n        }\n      }\n      display_image {\n        file_id\n        placeholder\n      }\n      cellar {\n        name\n        created_by_id\n        co_owners {\n          user_id\n        }\n      }\n    }\n  }\n": types.GetCellarBeerDocument,
    "\n  query EditCellarQuery($id: uuid!, $userId: uuid!) {\n    cellars_by_pk(id: $id) {\n      id\n      name\n      privacy\n      created_by_id\n      co_owners {\n        user_id\n      }\n    }\n    user(id: $userId) {\n      id\n      displayName\n      avatarUrl\n      friends {\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n": types.EditCellarQueryDocument,
    "\n  query GetCellar($cellarId: uuid!) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n      co_owners {\n        user_id\n      }\n    }\n  }\n": types.GetCellarDocument,
    "\n  query GetCellarItemsQuery($cellarId: uuid!, $search: vector) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n      co_owners {\n        user_id\n      }\n      spirits {\n        id\n        display_image {\n          file_id\n          placeholder\n        }\n        spirit {\n          name\n          vintage\n          item_vectors {\n            distance(args: { search: $search })\n          }\n          reviews_aggregate {\n            aggregate {\n              count\n              avg {\n                score\n              }\n            }\n          }\n        }\n      }\n      wines {\n        id\n        display_image {\n          file_id\n          placeholder\n        }\n        wine {\n          name\n          vintage\n          item_vectors {\n            distance(args: { search: $search })\n          }\n          reviews_aggregate {\n            aggregate {\n              count\n              avg {\n                score\n              }\n            }\n          }\n        }\n      }\n      beers {\n        id\n        display_image {\n          file_id\n          placeholder\n        }\n        beer {\n          name\n          item_vectors {\n            distance(args: { search: $search })\n          }\n          reviews_aggregate {\n            aggregate {\n              count\n              avg {\n                score\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": types.GetCellarItemsQueryDocument,
    "\n  query GetSearchVectorQuery($search: String!) {\n    create_search_vector(search: $search)\n  }\n": types.GetSearchVectorQueryDocument,
    "\n  query EditSpiritPageQuery($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      style\n      description\n      alcohol_content_percentage\n      barcode_code\n      country\n    }\n  }\n": types.EditSpiritPageQueryDocument,
    "\n  query GetSpirit($itemId: uuid!) {\n    cellar_spirit_by_pk(id: $itemId) {\n      spirit {\n        id\n        name\n        created_by_id\n        vintage\n        type\n        description\n        alcohol_content_percentage\n        style\n        country\n        reviews(limit: 10, order_by: { created_at: desc }) {\n          id\n          user {\n            avatarUrl\n            displayName\n          }\n          score\n          text\n          createdAt: created_at\n        }\n      }\n      display_image {\n        file_id\n        placeholder\n      }\n      cellar {\n        name\n        created_by_id\n        co_owners {\n          user_id\n        }\n      }\n    }\n  }\n": types.GetSpiritDocument,
    "\n  query EditWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      description\n      created_by_id\n      vintage\n      description\n      alcohol_content_percentage\n      barcode_code\n      special_designation\n      vineyard_designation\n      variety\n      region\n      style\n      country\n    }\n  }\n": types.EditWinePageQueryDocument,
    "\n  query GetCellarWine($itemId: uuid!) {\n    cellar_wine_by_pk(id: $itemId) {\n      wine {\n        id\n        name\n        created_by_id\n        region\n        variety\n        vintage\n        style\n        country\n        description\n        barcode_code\n        alcohol_content_percentage\n        reviews(limit: 10, order_by: { created_at: desc }) {\n          id\n          user {\n            avatarUrl\n            displayName\n          }\n          score\n          text\n          createdAt: created_at\n        }\n      }\n      display_image {\n        file_id\n        placeholder\n      }\n      cellar {\n        name\n        created_by_id\n        co_owners {\n          user_id\n        }\n      }\n    }\n  }\n": types.GetCellarWineDocument,
    "\n  query AddCellarQuery($userId: uuid!) {\n    user(id: $userId) {\n      friends {\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n": types.AddCellarQueryDocument,
    "\n  query GetCellars {\n    cellars {\n      id\n      name\n      createdBy {\n        id\n        displayName\n        avatarUrl\n      }\n      coOwners: co_owners {\n        user {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n": types.GetCellarsDocument,
    "\n  query SearchUsers($search: String, $userId: uuid!) {\n    users(\n      where: {\n        _and: [\n          { displayName: { _ilike: $search }, id: { _neq: $userId } }\n          { _not: { incomingFriendRequests: { user_id: { _eq: $userId } } } }\n          { _not: { outgoingFriendRequests: { friend_id: { _eq: $userId } } } }\n          { _not: { friends: { friend_id: { _eq: $userId } } } }\n        ]\n      }\n      limit: 10\n    ) {\n      id\n      displayName\n      avatarUrl\n      friends {\n        friend {\n          id\n        }\n      }\n    }\n  }\n": types.SearchUsersDocument,
    "\n  mutation InsertFriendRequest($request: friend_requests_insert_input!) {\n    insert_friend_requests_one(object: $request) {\n      id\n    }\n  }\n": types.InsertFriendRequestDocument,
    "\n  mutation AcceptFriendRequest($id: uuid!) {\n    update_friend_requests_by_pk(\n      pk_columns: { id: $id }\n      _set: { status: ACCEPTED }\n    ) {\n      id\n    }\n  }\n": types.AcceptFriendRequestDocument,
    "\n  mutation DeleteFriendRequest($id: uuid!) {\n    delete_friend_requests_by_pk(id: $id) {\n      id\n    }\n  }\n": types.DeleteFriendRequestDocument,
    "\n  subscription GetFriendRequests($id: uuid!) {\n    user(id: $id) {\n      id\n      outgoingFriendRequests {\n        id\n        status\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n      incomingFriendRequests {\n        id\n        status\n        user {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n      friends {\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n": types.GetFriendRequestsDocument,
    "\n  mutation RemoveFriend($userId: uuid!, $friendId: uuid!) {\n    mine: delete_friends_by_pk(user_id: $userId, friend_id: $friendId) {\n      user_id\n      friend_id\n    }\n    theirs: delete_friends_by_pk(user_id: $friendId, friend_id: $userId) {\n      user_id\n      friend_id\n    }\n  }\n": types.RemoveFriendDocument,
    "\n  query GetSpiritPageQuery($itemId: uuid!, $userId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      style\n      vintage\n      description\n      alcohol_content_percentage\n      type\n      country\n      reviews(limit: 10, order_by: { created_at: desc }) {\n        id\n        user {\n          avatarUrl\n          displayName\n        }\n        score\n        text\n        createdAt: created_at\n      }\n      item_images(limit: 1) {\n        file_id\n        placeholder\n      }\n    }\n    cellars(where: { created_by_id: { _eq: $userId } }) {\n      id\n      name\n    }\n  }\n": types.GetSpiritPageQueryDocument,
    "\n  query GetUser($userId: uuid!) {\n    user(id: $userId) {\n      id\n      displayName\n      avatarUrl\n    }\n  }\n": types.GetUserDocument,
    "\n  mutation UpdateUser($userId: uuid!, $displayName: String!) {\n    updateUser(\n      pk_columns: { id: $userId }\n      _set: { displayName: $displayName }\n    ) {\n      id\n    }\n  }\n": types.UpdateUserDocument,
    "\n  query GetWinePageQuery($itemId: uuid!, $userId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      style\n      vintage\n      description\n      barcode_code\n      alcohol_content_percentage\n      country\n      reviews(limit: 10, order_by: { created_at: desc }) {\n        id\n        user {\n          avatarUrl\n          displayName\n        }\n        score\n        text\n        createdAt: created_at\n      }\n      item_images(limit: 1) {\n        file_id\n        placeholder\n      }\n    }\n    cellars(where: { created_by_id: { _eq: $userId } }) {\n      id\n      name\n    }\n  }\n": types.GetWinePageQueryDocument,
    "\n  query GetBeerDefaults($hint: item_defaults_hint!) {\n    beer_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      country\n      vintage\n      style\n      international_bitterness_unit\n    }\n  }\n": types.GetBeerDefaultsDocument,
    "\n  mutation AddCellar($cellar: cellars_insert_input!) {\n    insert_cellars_one(object: $cellar) {\n      id\n    }\n  }\n": types.AddCellarDocument,
    "\n  mutation EditCellar(\n    $id: uuid!\n    $cellar: cellars_set_input!\n    $co_owners: [cellar_owners_insert_input!]!\n  ) {\n    update_cellars_by_pk(pk_columns: { id: $id }, _set: $cellar) {\n      id\n    }\n    delete_cellar_owners(where: { cellar_id: { _eq: $id } }) {\n      affected_rows\n    }\n    insert_cellar_owners(objects: $co_owners) {\n      affected_rows\n    }\n  }\n": types.EditCellarDocument,
    "\n  query SearchByBarcode($code: String!) {\n    barcodes_by_pk(code: $code) {\n      wines {\n        id\n        name\n        vintage\n      }\n      beers {\n        id\n        name\n        vintage\n      }\n      spirits {\n        id\n        name\n        vintage\n      }\n    }\n  }\n": types.SearchByBarcodeDocument,
    "\n  mutation DeleteCellarBeerMutation($itemId: uuid!) {\n    delete_cellar_beer_by_pk(id: $itemId) {\n      id\n    }\n  }\n": types.DeleteCellarBeerMutationDocument,
    "\n  mutation DeleteCellarSpiritMutation($itemId: uuid!) {\n    delete_cellar_spirit_by_pk(id: $itemId) {\n      id\n    }\n  }\n": types.DeleteCellarSpiritMutationDocument,
    "\n  mutation DeleteCellarWineMutation($itemId: uuid!) {\n    delete_cellar_wine_by_pk(id: $itemId) {\n      id\n    }\n  }\n": types.DeleteCellarWineMutationDocument,
    "\n  mutation DeleteBeerMutation($itemId: uuid!) {\n    delete_beers_by_pk(id: $itemId) {\n      id\n    }\n  }\n": types.DeleteBeerMutationDocument,
    "\n  mutation DeleteSpiritMutation($itemId: uuid!) {\n    delete_spirits_by_pk(id: $itemId) {\n      id\n    }\n  }\n": types.DeleteSpiritMutationDocument,
    "\n  mutation HeaderAddWineMutation($input: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $input) {\n      id\n      cellar_id\n    }\n  }\n": types.HeaderAddWineMutationDocument,
    "\n  query GetSpiritDefaults($hint: item_defaults_hint!) {\n    spirit_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      country\n      vintage\n      style\n      type\n    }\n  }\n": types.GetSpiritDefaultsDocument,
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
export function graphql(source: "\n  query GetCredential($id: String!) {\n    admin_credentials_by_pk(id: $id) {\n      id\n      credentials\n    }\n  }\n"): (typeof documents)["\n  query GetCredential($id: String!) {\n    admin_credentials_by_pk(id: $id) {\n      id\n      credentials\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation InsertFriends(\n    $friends: [friends_insert_input!]!\n    $requestId: uuid!\n  ) {\n    insert_friends(objects: $friends) {\n      affected_rows\n    }\n\n    delete_friend_requests_by_pk(id: $requestId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation InsertFriends(\n    $friends: [friends_insert_input!]!\n    $requestId: uuid!\n  ) {\n    insert_friends(objects: $friends) {\n      affected_rows\n    }\n\n    delete_friend_requests_by_pk(id: $requestId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateItemImage($itemId: uuid!, $item: item_image_set_input!) {\n    update_item_image_by_pk(pk_columns: { id: $itemId }, _set: $item) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateItemImage($itemId: uuid!, $item: item_image_set_input!) {\n    update_item_image_by_pk(pk_columns: { id: $itemId }, _set: $item) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation InsertVector($vector: item_vectors_insert_input!) {\n    insert_item_vectors_one(object: $vector) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation InsertVector($vector: item_vectors_insert_input!) {\n    insert_item_vectors_one(object: $vector) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteVectors($where: item_vectors_bool_exp!) {\n    delete_item_vectors(where: $where) {\n      affected_rows\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteVectors($where: item_vectors_bool_exp!) {\n    delete_item_vectors(where: $where) {\n      affected_rows\n    }\n  }\n"];
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
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation InsertItemImage($item: item_image_insert_input!) {\n    insert_item_image_one(object: $item) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation InsertItemImage($item: item_image_insert_input!) {\n    insert_item_image_one(object: $item) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddItemImage($input: item_image_upload_input!) {\n    item_image_upload(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddItemImage($input: item_image_upload_input!) {\n    item_image_upload(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddBeerToCellar($beer: cellar_beer_insert_input!) {\n    insert_cellar_beer_one(object: $beer) {\n      id\n      cellar_id\n    }\n  }\n"): (typeof documents)["\n  mutation AddBeerToCellar($beer: cellar_beer_insert_input!) {\n    insert_cellar_beer_one(object: $beer) {\n      id\n      cellar_id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddBeer($beer: beers_insert_input!) {\n    insert_beers_one(object: $beer) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateBeer($beerId: uuid!, $beer: beers_set_input!) {\n    update_beers_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateBeer($beerId: uuid!, $beer: beers_set_input!) {\n    update_beers_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateCellarBeer($beerId: uuid!, $beer: cellar_beer_set_input!) {\n    update_cellar_beer_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateCellarBeer($beerId: uuid!, $beer: cellar_beer_set_input!) {\n    update_cellar_beer_by_pk(pk_columns: { id: $beerId }, _set: $beer) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddWine($wine: wines_insert_input!) {\n    insert_wines_one(object: $wine) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddWine($wine: wines_insert_input!) {\n    insert_wines_one(object: $wine) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddWineToCellar($input: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $input) {\n      id\n      cellar_id\n    }\n  }\n"): (typeof documents)["\n  mutation AddWineToCellar($input: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $input) {\n      id\n      cellar_id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateWine($wineId: uuid!, $wine: wines_set_input!) {\n    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateWine($wineId: uuid!, $wine: wines_set_input!) {\n    update_wines_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateCellarWine($wineId: uuid!, $wine: cellar_wine_set_input!) {\n    update_cellar_wine_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateCellarWine($wineId: uuid!, $wine: cellar_wine_set_input!) {\n    update_cellar_wine_by_pk(pk_columns: { id: $wineId }, _set: $wine) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddSpirit($spirit: spirits_insert_input!) {\n    insert_spirits_one(object: $spirit) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddSpiritToCellar($spirit: cellar_spirit_insert_input!) {\n    insert_cellar_spirit_one(object: $spirit) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddSpiritToCellar($spirit: cellar_spirit_insert_input!) {\n    insert_cellar_spirit_one(object: $spirit) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateSpirit($spiritId: uuid!, $spirit: spirits_set_input!) {\n    update_spirits_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateSpirit($spiritId: uuid!, $spirit: spirits_set_input!) {\n    update_spirits_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateCellarSpirit(\n    $spiritId: uuid!\n    $spirit: cellar_spirit_set_input!\n  ) {\n    update_cellar_spirit_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateCellarSpirit(\n    $spiritId: uuid!\n    $spirit: cellar_spirit_set_input!\n  ) {\n    update_cellar_spirit_by_pk(pk_columns: { id: $spiritId }, _set: $spirit) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddItemReview($review: item_reviews_insert_input!) {\n    insert_item_reviews_one(object: $review) {\n      id\n      beer {\n        id\n      }\n      wine {\n        id\n      }\n      spirit {\n        id\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation AddItemReview($review: item_reviews_insert_input!) {\n    insert_item_reviews_one(object: $review) {\n      id\n      beer {\n        id\n      }\n      wine {\n        id\n      }\n      spirit {\n        id\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetBeerPageQuery($itemId: uuid!, $userId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      style\n      vintage\n      description\n      alcohol_content_percentage\n      country\n      reviews(limit: 10, order_by: { created_at: desc }) {\n        id\n        user {\n          avatarUrl\n          displayName\n        }\n        score\n        text\n        createdAt: created_at\n      }\n      item_images(limit: 1) {\n        file_id\n        placeholder\n      }\n    }\n    cellars(where: { created_by_id: { _eq: $userId } }) {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  query GetBeerPageQuery($itemId: uuid!, $userId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      style\n      vintage\n      description\n      alcohol_content_percentage\n      country\n      reviews(limit: 10, order_by: { created_at: desc }) {\n        id\n        user {\n          avatarUrl\n          displayName\n        }\n        score\n        text\n        createdAt: created_at\n      }\n      item_images(limit: 1) {\n        file_id\n        placeholder\n      }\n    }\n    cellars(where: { created_by_id: { _eq: $userId } }) {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EditBeerPageQuery($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      barcode_code\n      international_bitterness_unit\n      country\n    }\n  }\n"): (typeof documents)["\n  query EditBeerPageQuery($itemId: uuid!) {\n    beers_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      style\n      description\n      alcohol_content_percentage\n      barcode_code\n      international_bitterness_unit\n      country\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetCellarBeer($itemId: uuid!) {\n    cellar_beer_by_pk(id: $itemId) {\n      beer {\n        id\n        name\n        created_by_id\n        vintage\n        style\n        description\n        alcohol_content_percentage\n        country\n        reviews(limit: 10, order_by: { created_at: desc }) {\n          id\n          user {\n            avatarUrl\n            displayName\n          }\n          score\n          text\n          createdAt: created_at\n        }\n      }\n      display_image {\n        file_id\n        placeholder\n      }\n      cellar {\n        name\n        created_by_id\n        co_owners {\n          user_id\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetCellarBeer($itemId: uuid!) {\n    cellar_beer_by_pk(id: $itemId) {\n      beer {\n        id\n        name\n        created_by_id\n        vintage\n        style\n        description\n        alcohol_content_percentage\n        country\n        reviews(limit: 10, order_by: { created_at: desc }) {\n          id\n          user {\n            avatarUrl\n            displayName\n          }\n          score\n          text\n          createdAt: created_at\n        }\n      }\n      display_image {\n        file_id\n        placeholder\n      }\n      cellar {\n        name\n        created_by_id\n        co_owners {\n          user_id\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EditCellarQuery($id: uuid!, $userId: uuid!) {\n    cellars_by_pk(id: $id) {\n      id\n      name\n      privacy\n      created_by_id\n      co_owners {\n        user_id\n      }\n    }\n    user(id: $userId) {\n      id\n      displayName\n      avatarUrl\n      friends {\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query EditCellarQuery($id: uuid!, $userId: uuid!) {\n    cellars_by_pk(id: $id) {\n      id\n      name\n      privacy\n      created_by_id\n      co_owners {\n        user_id\n      }\n    }\n    user(id: $userId) {\n      id\n      displayName\n      avatarUrl\n      friends {\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetCellar($cellarId: uuid!) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n      co_owners {\n        user_id\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetCellar($cellarId: uuid!) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n      co_owners {\n        user_id\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetCellarItemsQuery($cellarId: uuid!, $search: vector) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n      co_owners {\n        user_id\n      }\n      spirits {\n        id\n        display_image {\n          file_id\n          placeholder\n        }\n        spirit {\n          name\n          vintage\n          item_vectors {\n            distance(args: { search: $search })\n          }\n          reviews_aggregate {\n            aggregate {\n              count\n              avg {\n                score\n              }\n            }\n          }\n        }\n      }\n      wines {\n        id\n        display_image {\n          file_id\n          placeholder\n        }\n        wine {\n          name\n          vintage\n          item_vectors {\n            distance(args: { search: $search })\n          }\n          reviews_aggregate {\n            aggregate {\n              count\n              avg {\n                score\n              }\n            }\n          }\n        }\n      }\n      beers {\n        id\n        display_image {\n          file_id\n          placeholder\n        }\n        beer {\n          name\n          item_vectors {\n            distance(args: { search: $search })\n          }\n          reviews_aggregate {\n            aggregate {\n              count\n              avg {\n                score\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetCellarItemsQuery($cellarId: uuid!, $search: vector) {\n    cellars_by_pk(id: $cellarId) {\n      id\n      name\n      created_by_id\n      co_owners {\n        user_id\n      }\n      spirits {\n        id\n        display_image {\n          file_id\n          placeholder\n        }\n        spirit {\n          name\n          vintage\n          item_vectors {\n            distance(args: { search: $search })\n          }\n          reviews_aggregate {\n            aggregate {\n              count\n              avg {\n                score\n              }\n            }\n          }\n        }\n      }\n      wines {\n        id\n        display_image {\n          file_id\n          placeholder\n        }\n        wine {\n          name\n          vintage\n          item_vectors {\n            distance(args: { search: $search })\n          }\n          reviews_aggregate {\n            aggregate {\n              count\n              avg {\n                score\n              }\n            }\n          }\n        }\n      }\n      beers {\n        id\n        display_image {\n          file_id\n          placeholder\n        }\n        beer {\n          name\n          item_vectors {\n            distance(args: { search: $search })\n          }\n          reviews_aggregate {\n            aggregate {\n              count\n              avg {\n                score\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetSearchVectorQuery($search: String!) {\n    create_search_vector(search: $search)\n  }\n"): (typeof documents)["\n  query GetSearchVectorQuery($search: String!) {\n    create_search_vector(search: $search)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EditSpiritPageQuery($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      style\n      description\n      alcohol_content_percentage\n      barcode_code\n      country\n    }\n  }\n"): (typeof documents)["\n  query EditSpiritPageQuery($itemId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      vintage\n      type\n      style\n      description\n      alcohol_content_percentage\n      barcode_code\n      country\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetSpirit($itemId: uuid!) {\n    cellar_spirit_by_pk(id: $itemId) {\n      spirit {\n        id\n        name\n        created_by_id\n        vintage\n        type\n        description\n        alcohol_content_percentage\n        style\n        country\n        reviews(limit: 10, order_by: { created_at: desc }) {\n          id\n          user {\n            avatarUrl\n            displayName\n          }\n          score\n          text\n          createdAt: created_at\n        }\n      }\n      display_image {\n        file_id\n        placeholder\n      }\n      cellar {\n        name\n        created_by_id\n        co_owners {\n          user_id\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetSpirit($itemId: uuid!) {\n    cellar_spirit_by_pk(id: $itemId) {\n      spirit {\n        id\n        name\n        created_by_id\n        vintage\n        type\n        description\n        alcohol_content_percentage\n        style\n        country\n        reviews(limit: 10, order_by: { created_at: desc }) {\n          id\n          user {\n            avatarUrl\n            displayName\n          }\n          score\n          text\n          createdAt: created_at\n        }\n      }\n      display_image {\n        file_id\n        placeholder\n      }\n      cellar {\n        name\n        created_by_id\n        co_owners {\n          user_id\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query EditWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      description\n      created_by_id\n      vintage\n      description\n      alcohol_content_percentage\n      barcode_code\n      special_designation\n      vineyard_designation\n      variety\n      region\n      style\n      country\n    }\n  }\n"): (typeof documents)["\n  query EditWinePageQuery($itemId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      description\n      created_by_id\n      vintage\n      description\n      alcohol_content_percentage\n      barcode_code\n      special_designation\n      vineyard_designation\n      variety\n      region\n      style\n      country\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetCellarWine($itemId: uuid!) {\n    cellar_wine_by_pk(id: $itemId) {\n      wine {\n        id\n        name\n        created_by_id\n        region\n        variety\n        vintage\n        style\n        country\n        description\n        barcode_code\n        alcohol_content_percentage\n        reviews(limit: 10, order_by: { created_at: desc }) {\n          id\n          user {\n            avatarUrl\n            displayName\n          }\n          score\n          text\n          createdAt: created_at\n        }\n      }\n      display_image {\n        file_id\n        placeholder\n      }\n      cellar {\n        name\n        created_by_id\n        co_owners {\n          user_id\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetCellarWine($itemId: uuid!) {\n    cellar_wine_by_pk(id: $itemId) {\n      wine {\n        id\n        name\n        created_by_id\n        region\n        variety\n        vintage\n        style\n        country\n        description\n        barcode_code\n        alcohol_content_percentage\n        reviews(limit: 10, order_by: { created_at: desc }) {\n          id\n          user {\n            avatarUrl\n            displayName\n          }\n          score\n          text\n          createdAt: created_at\n        }\n      }\n      display_image {\n        file_id\n        placeholder\n      }\n      cellar {\n        name\n        created_by_id\n        co_owners {\n          user_id\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AddCellarQuery($userId: uuid!) {\n    user(id: $userId) {\n      friends {\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query AddCellarQuery($userId: uuid!) {\n    user(id: $userId) {\n      friends {\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetCellars {\n    cellars {\n      id\n      name\n      createdBy {\n        id\n        displayName\n        avatarUrl\n      }\n      coOwners: co_owners {\n        user {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetCellars {\n    cellars {\n      id\n      name\n      createdBy {\n        id\n        displayName\n        avatarUrl\n      }\n      coOwners: co_owners {\n        user {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchUsers($search: String, $userId: uuid!) {\n    users(\n      where: {\n        _and: [\n          { displayName: { _ilike: $search }, id: { _neq: $userId } }\n          { _not: { incomingFriendRequests: { user_id: { _eq: $userId } } } }\n          { _not: { outgoingFriendRequests: { friend_id: { _eq: $userId } } } }\n          { _not: { friends: { friend_id: { _eq: $userId } } } }\n        ]\n      }\n      limit: 10\n    ) {\n      id\n      displayName\n      avatarUrl\n      friends {\n        friend {\n          id\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query SearchUsers($search: String, $userId: uuid!) {\n    users(\n      where: {\n        _and: [\n          { displayName: { _ilike: $search }, id: { _neq: $userId } }\n          { _not: { incomingFriendRequests: { user_id: { _eq: $userId } } } }\n          { _not: { outgoingFriendRequests: { friend_id: { _eq: $userId } } } }\n          { _not: { friends: { friend_id: { _eq: $userId } } } }\n        ]\n      }\n      limit: 10\n    ) {\n      id\n      displayName\n      avatarUrl\n      friends {\n        friend {\n          id\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation InsertFriendRequest($request: friend_requests_insert_input!) {\n    insert_friend_requests_one(object: $request) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation InsertFriendRequest($request: friend_requests_insert_input!) {\n    insert_friend_requests_one(object: $request) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AcceptFriendRequest($id: uuid!) {\n    update_friend_requests_by_pk(\n      pk_columns: { id: $id }\n      _set: { status: ACCEPTED }\n    ) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AcceptFriendRequest($id: uuid!) {\n    update_friend_requests_by_pk(\n      pk_columns: { id: $id }\n      _set: { status: ACCEPTED }\n    ) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteFriendRequest($id: uuid!) {\n    delete_friend_requests_by_pk(id: $id) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteFriendRequest($id: uuid!) {\n    delete_friend_requests_by_pk(id: $id) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription GetFriendRequests($id: uuid!) {\n    user(id: $id) {\n      id\n      outgoingFriendRequests {\n        id\n        status\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n      incomingFriendRequests {\n        id\n        status\n        user {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n      friends {\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription GetFriendRequests($id: uuid!) {\n    user(id: $id) {\n      id\n      outgoingFriendRequests {\n        id\n        status\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n      incomingFriendRequests {\n        id\n        status\n        user {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n      friends {\n        friend {\n          id\n          displayName\n          avatarUrl\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RemoveFriend($userId: uuid!, $friendId: uuid!) {\n    mine: delete_friends_by_pk(user_id: $userId, friend_id: $friendId) {\n      user_id\n      friend_id\n    }\n    theirs: delete_friends_by_pk(user_id: $friendId, friend_id: $userId) {\n      user_id\n      friend_id\n    }\n  }\n"): (typeof documents)["\n  mutation RemoveFriend($userId: uuid!, $friendId: uuid!) {\n    mine: delete_friends_by_pk(user_id: $userId, friend_id: $friendId) {\n      user_id\n      friend_id\n    }\n    theirs: delete_friends_by_pk(user_id: $friendId, friend_id: $userId) {\n      user_id\n      friend_id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetSpiritPageQuery($itemId: uuid!, $userId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      style\n      vintage\n      description\n      alcohol_content_percentage\n      type\n      country\n      reviews(limit: 10, order_by: { created_at: desc }) {\n        id\n        user {\n          avatarUrl\n          displayName\n        }\n        score\n        text\n        createdAt: created_at\n      }\n      item_images(limit: 1) {\n        file_id\n        placeholder\n      }\n    }\n    cellars(where: { created_by_id: { _eq: $userId } }) {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  query GetSpiritPageQuery($itemId: uuid!, $userId: uuid!) {\n    spirits_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      style\n      vintage\n      description\n      alcohol_content_percentage\n      type\n      country\n      reviews(limit: 10, order_by: { created_at: desc }) {\n        id\n        user {\n          avatarUrl\n          displayName\n        }\n        score\n        text\n        createdAt: created_at\n      }\n      item_images(limit: 1) {\n        file_id\n        placeholder\n      }\n    }\n    cellars(where: { created_by_id: { _eq: $userId } }) {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetUser($userId: uuid!) {\n    user(id: $userId) {\n      id\n      displayName\n      avatarUrl\n    }\n  }\n"): (typeof documents)["\n  query GetUser($userId: uuid!) {\n    user(id: $userId) {\n      id\n      displayName\n      avatarUrl\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateUser($userId: uuid!, $displayName: String!) {\n    updateUser(\n      pk_columns: { id: $userId }\n      _set: { displayName: $displayName }\n    ) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateUser($userId: uuid!, $displayName: String!) {\n    updateUser(\n      pk_columns: { id: $userId }\n      _set: { displayName: $displayName }\n    ) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetWinePageQuery($itemId: uuid!, $userId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      style\n      vintage\n      description\n      barcode_code\n      alcohol_content_percentage\n      country\n      reviews(limit: 10, order_by: { created_at: desc }) {\n        id\n        user {\n          avatarUrl\n          displayName\n        }\n        score\n        text\n        createdAt: created_at\n      }\n      item_images(limit: 1) {\n        file_id\n        placeholder\n      }\n    }\n    cellars(where: { created_by_id: { _eq: $userId } }) {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  query GetWinePageQuery($itemId: uuid!, $userId: uuid!) {\n    wines_by_pk(id: $itemId) {\n      id\n      name\n      created_by_id\n      region\n      variety\n      style\n      vintage\n      description\n      barcode_code\n      alcohol_content_percentage\n      country\n      reviews(limit: 10, order_by: { created_at: desc }) {\n        id\n        user {\n          avatarUrl\n          displayName\n        }\n        score\n        text\n        createdAt: created_at\n      }\n      item_images(limit: 1) {\n        file_id\n        placeholder\n      }\n    }\n    cellars(where: { created_by_id: { _eq: $userId } }) {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetBeerDefaults($hint: item_defaults_hint!) {\n    beer_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      country\n      vintage\n      style\n      international_bitterness_unit\n    }\n  }\n"): (typeof documents)["\n  query GetBeerDefaults($hint: item_defaults_hint!) {\n    beer_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      country\n      vintage\n      style\n      international_bitterness_unit\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddCellar($cellar: cellars_insert_input!) {\n    insert_cellars_one(object: $cellar) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddCellar($cellar: cellars_insert_input!) {\n    insert_cellars_one(object: $cellar) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation EditCellar(\n    $id: uuid!\n    $cellar: cellars_set_input!\n    $co_owners: [cellar_owners_insert_input!]!\n  ) {\n    update_cellars_by_pk(pk_columns: { id: $id }, _set: $cellar) {\n      id\n    }\n    delete_cellar_owners(where: { cellar_id: { _eq: $id } }) {\n      affected_rows\n    }\n    insert_cellar_owners(objects: $co_owners) {\n      affected_rows\n    }\n  }\n"): (typeof documents)["\n  mutation EditCellar(\n    $id: uuid!\n    $cellar: cellars_set_input!\n    $co_owners: [cellar_owners_insert_input!]!\n  ) {\n    update_cellars_by_pk(pk_columns: { id: $id }, _set: $cellar) {\n      id\n    }\n    delete_cellar_owners(where: { cellar_id: { _eq: $id } }) {\n      affected_rows\n    }\n    insert_cellar_owners(objects: $co_owners) {\n      affected_rows\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchByBarcode($code: String!) {\n    barcodes_by_pk(code: $code) {\n      wines {\n        id\n        name\n        vintage\n      }\n      beers {\n        id\n        name\n        vintage\n      }\n      spirits {\n        id\n        name\n        vintage\n      }\n    }\n  }\n"): (typeof documents)["\n  query SearchByBarcode($code: String!) {\n    barcodes_by_pk(code: $code) {\n      wines {\n        id\n        name\n        vintage\n      }\n      beers {\n        id\n        name\n        vintage\n      }\n      spirits {\n        id\n        name\n        vintage\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteCellarBeerMutation($itemId: uuid!) {\n    delete_cellar_beer_by_pk(id: $itemId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteCellarBeerMutation($itemId: uuid!) {\n    delete_cellar_beer_by_pk(id: $itemId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteCellarSpiritMutation($itemId: uuid!) {\n    delete_cellar_spirit_by_pk(id: $itemId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteCellarSpiritMutation($itemId: uuid!) {\n    delete_cellar_spirit_by_pk(id: $itemId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteCellarWineMutation($itemId: uuid!) {\n    delete_cellar_wine_by_pk(id: $itemId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteCellarWineMutation($itemId: uuid!) {\n    delete_cellar_wine_by_pk(id: $itemId) {\n      id\n    }\n  }\n"];
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
export function graphql(source: "\n  mutation HeaderAddWineMutation($input: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $input) {\n      id\n      cellar_id\n    }\n  }\n"): (typeof documents)["\n  mutation HeaderAddWineMutation($input: cellar_wine_insert_input!) {\n    insert_cellar_wine_one(object: $input) {\n      id\n      cellar_id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetSpiritDefaults($hint: item_defaults_hint!) {\n    spirit_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      country\n      vintage\n      style\n      type\n    }\n  }\n"): (typeof documents)["\n  query GetSpiritDefaults($hint: item_defaults_hint!) {\n    spirit_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      country\n      vintage\n      style\n      type\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query GetWineDefaults($hint: item_defaults_hint!) {\n    wine_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      region\n      country\n      special_designation\n      variety\n      vineyard_designation\n      vintage\n      style\n    }\n  }\n"): (typeof documents)["\n  query GetWineDefaults($hint: item_defaults_hint!) {\n    wine_defaults(hint: $hint) {\n      name\n      description\n      alcohol_content_percentage\n      barcode_code\n      barcode_type\n      item_onboarding_id\n      region\n      country\n      special_designation\n      variety\n      vineyard_designation\n      vintage\n      style\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;