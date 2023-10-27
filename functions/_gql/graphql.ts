/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  bigint: { input: number; output: number; }
  bytea: { input: any; output: any; }
  citext: { input: any; output: any; }
  date: { input: string; output: string; }
  jsonb: { input: any; output: any; }
  money: { input: number; output: number; }
  numeric: { input: any; output: any; }
  polygon: { input: any; output: any; }
  timestamptz: { input: any; output: any; }
  uuid: { input: string; output: string; }
};

/** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
export type Boolean_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['Boolean']['input']>;
  _gt?: InputMaybe<Scalars['Boolean']['input']>;
  _gte?: InputMaybe<Scalars['Boolean']['input']>;
  _in?: InputMaybe<Array<Scalars['Boolean']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['Boolean']['input']>;
  _lte?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Scalars['Boolean']['input']>;
  _nin?: InputMaybe<Array<Scalars['Boolean']['input']>>;
};

/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
export type Int_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['Int']['input']>;
  _gt?: InputMaybe<Scalars['Int']['input']>;
  _gte?: InputMaybe<Scalars['Int']['input']>;
  _in?: InputMaybe<Array<Scalars['Int']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['Int']['input']>;
  _lte?: InputMaybe<Scalars['Int']['input']>;
  _neq?: InputMaybe<Scalars['Int']['input']>;
  _nin?: InputMaybe<Array<Scalars['Int']['input']>>;
};

/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
export type String_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['String']['input']>;
  _gt?: InputMaybe<Scalars['String']['input']>;
  _gte?: InputMaybe<Scalars['String']['input']>;
  /** does the column match the given case-insensitive pattern */
  _ilike?: InputMaybe<Scalars['String']['input']>;
  _in?: InputMaybe<Array<Scalars['String']['input']>>;
  /** does the column match the given POSIX regular expression, case insensitive */
  _iregex?: InputMaybe<Scalars['String']['input']>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  /** does the column match the given pattern */
  _like?: InputMaybe<Scalars['String']['input']>;
  _lt?: InputMaybe<Scalars['String']['input']>;
  _lte?: InputMaybe<Scalars['String']['input']>;
  _neq?: InputMaybe<Scalars['String']['input']>;
  /** does the column NOT match the given case-insensitive pattern */
  _nilike?: InputMaybe<Scalars['String']['input']>;
  _nin?: InputMaybe<Array<Scalars['String']['input']>>;
  /** does the column NOT match the given POSIX regular expression, case insensitive */
  _niregex?: InputMaybe<Scalars['String']['input']>;
  /** does the column NOT match the given pattern */
  _nlike?: InputMaybe<Scalars['String']['input']>;
  /** does the column NOT match the given POSIX regular expression, case sensitive */
  _nregex?: InputMaybe<Scalars['String']['input']>;
  /** does the column NOT match the given SQL regular expression */
  _nsimilar?: InputMaybe<Scalars['String']['input']>;
  /** does the column match the given POSIX regular expression, case sensitive */
  _regex?: InputMaybe<Scalars['String']['input']>;
  /** does the column match the given SQL regular expression */
  _similar?: InputMaybe<Scalars['String']['input']>;
};

/** Oauth requests, inserted before redirecting to the provider's site. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthProviderRequests = {
  __typename: 'authProviderRequests';
  id: Scalars['uuid']['output'];
  options?: Maybe<Scalars['jsonb']['output']>;
};


/** Oauth requests, inserted before redirecting to the provider's site. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthProviderRequestsOptionsArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};

/** aggregated selection of "auth.provider_requests" */
export type AuthProviderRequests_Aggregate = {
  __typename: 'authProviderRequests_aggregate';
  aggregate?: Maybe<AuthProviderRequests_Aggregate_Fields>;
  nodes: Array<AuthProviderRequests>;
};

/** aggregate fields of "auth.provider_requests" */
export type AuthProviderRequests_Aggregate_Fields = {
  __typename: 'authProviderRequests_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<AuthProviderRequests_Max_Fields>;
  min?: Maybe<AuthProviderRequests_Min_Fields>;
};


/** aggregate fields of "auth.provider_requests" */
export type AuthProviderRequests_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<AuthProviderRequests_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type AuthProviderRequests_Append_Input = {
  options?: InputMaybe<Scalars['jsonb']['input']>;
};

/** Boolean expression to filter rows from the table "auth.provider_requests". All fields are combined with a logical 'AND'. */
export type AuthProviderRequests_Bool_Exp = {
  _and?: InputMaybe<Array<AuthProviderRequests_Bool_Exp>>;
  _not?: InputMaybe<AuthProviderRequests_Bool_Exp>;
  _or?: InputMaybe<Array<AuthProviderRequests_Bool_Exp>>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  options?: InputMaybe<Jsonb_Comparison_Exp>;
};

/** unique or primary key constraints on table "auth.provider_requests" */
export enum AuthProviderRequests_Constraint {
  /** unique or primary key constraint on columns "id" */
  ProviderRequestsPkey = 'provider_requests_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type AuthProviderRequests_Delete_At_Path_Input = {
  options?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type AuthProviderRequests_Delete_Elem_Input = {
  options?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type AuthProviderRequests_Delete_Key_Input = {
  options?: InputMaybe<Scalars['String']['input']>;
};

/** input type for inserting data into table "auth.provider_requests" */
export type AuthProviderRequests_Insert_Input = {
  id?: InputMaybe<Scalars['uuid']['input']>;
  options?: InputMaybe<Scalars['jsonb']['input']>;
};

/** aggregate max on columns */
export type AuthProviderRequests_Max_Fields = {
  __typename: 'authProviderRequests_max_fields';
  id?: Maybe<Scalars['uuid']['output']>;
};

/** aggregate min on columns */
export type AuthProviderRequests_Min_Fields = {
  __typename: 'authProviderRequests_min_fields';
  id?: Maybe<Scalars['uuid']['output']>;
};

/** response of any mutation on the table "auth.provider_requests" */
export type AuthProviderRequests_Mutation_Response = {
  __typename: 'authProviderRequests_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<AuthProviderRequests>;
};

/** on_conflict condition type for table "auth.provider_requests" */
export type AuthProviderRequests_On_Conflict = {
  constraint: AuthProviderRequests_Constraint;
  update_columns?: Array<AuthProviderRequests_Update_Column>;
  where?: InputMaybe<AuthProviderRequests_Bool_Exp>;
};

/** Ordering options when selecting data from "auth.provider_requests". */
export type AuthProviderRequests_Order_By = {
  id?: InputMaybe<Order_By>;
  options?: InputMaybe<Order_By>;
};

/** primary key columns input for table: auth.provider_requests */
export type AuthProviderRequests_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type AuthProviderRequests_Prepend_Input = {
  options?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "auth.provider_requests" */
export enum AuthProviderRequests_Select_Column {
  /** column name */
  Id = 'id',
  /** column name */
  Options = 'options'
}

/** input type for updating data in table "auth.provider_requests" */
export type AuthProviderRequests_Set_Input = {
  id?: InputMaybe<Scalars['uuid']['input']>;
  options?: InputMaybe<Scalars['jsonb']['input']>;
};

/** Streaming cursor of the table "authProviderRequests" */
export type AuthProviderRequests_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: AuthProviderRequests_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type AuthProviderRequests_Stream_Cursor_Value_Input = {
  id?: InputMaybe<Scalars['uuid']['input']>;
  options?: InputMaybe<Scalars['jsonb']['input']>;
};

/** update columns of table "auth.provider_requests" */
export enum AuthProviderRequests_Update_Column {
  /** column name */
  Id = 'id',
  /** column name */
  Options = 'options'
}

export type AuthProviderRequests_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<AuthProviderRequests_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<AuthProviderRequests_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<AuthProviderRequests_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<AuthProviderRequests_Delete_Key_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<AuthProviderRequests_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<AuthProviderRequests_Set_Input>;
  /** filter the rows which have to be updated */
  where: AuthProviderRequests_Bool_Exp;
};

/** List of available Oauth providers. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthProviders = {
  __typename: 'authProviders';
  id: Scalars['String']['output'];
  /** An array relationship */
  userProviders: Array<AuthUserProviders>;
  /** An aggregate relationship */
  userProviders_aggregate: AuthUserProviders_Aggregate;
};


/** List of available Oauth providers. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthProvidersUserProvidersArgs = {
  distinct_on?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserProviders_Order_By>>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};


/** List of available Oauth providers. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthProvidersUserProviders_AggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserProviders_Order_By>>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};

/** aggregated selection of "auth.providers" */
export type AuthProviders_Aggregate = {
  __typename: 'authProviders_aggregate';
  aggregate?: Maybe<AuthProviders_Aggregate_Fields>;
  nodes: Array<AuthProviders>;
};

/** aggregate fields of "auth.providers" */
export type AuthProviders_Aggregate_Fields = {
  __typename: 'authProviders_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<AuthProviders_Max_Fields>;
  min?: Maybe<AuthProviders_Min_Fields>;
};


/** aggregate fields of "auth.providers" */
export type AuthProviders_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<AuthProviders_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "auth.providers". All fields are combined with a logical 'AND'. */
export type AuthProviders_Bool_Exp = {
  _and?: InputMaybe<Array<AuthProviders_Bool_Exp>>;
  _not?: InputMaybe<AuthProviders_Bool_Exp>;
  _or?: InputMaybe<Array<AuthProviders_Bool_Exp>>;
  id?: InputMaybe<String_Comparison_Exp>;
  userProviders?: InputMaybe<AuthUserProviders_Bool_Exp>;
  userProviders_aggregate?: InputMaybe<AuthUserProviders_Aggregate_Bool_Exp>;
};

/** unique or primary key constraints on table "auth.providers" */
export enum AuthProviders_Constraint {
  /** unique or primary key constraint on columns "id" */
  ProvidersPkey = 'providers_pkey'
}

/** input type for inserting data into table "auth.providers" */
export type AuthProviders_Insert_Input = {
  id?: InputMaybe<Scalars['String']['input']>;
  userProviders?: InputMaybe<AuthUserProviders_Arr_Rel_Insert_Input>;
};

/** aggregate max on columns */
export type AuthProviders_Max_Fields = {
  __typename: 'authProviders_max_fields';
  id?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type AuthProviders_Min_Fields = {
  __typename: 'authProviders_min_fields';
  id?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "auth.providers" */
export type AuthProviders_Mutation_Response = {
  __typename: 'authProviders_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<AuthProviders>;
};

/** input type for inserting object relation for remote table "auth.providers" */
export type AuthProviders_Obj_Rel_Insert_Input = {
  data: AuthProviders_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<AuthProviders_On_Conflict>;
};

/** on_conflict condition type for table "auth.providers" */
export type AuthProviders_On_Conflict = {
  constraint: AuthProviders_Constraint;
  update_columns?: Array<AuthProviders_Update_Column>;
  where?: InputMaybe<AuthProviders_Bool_Exp>;
};

/** Ordering options when selecting data from "auth.providers". */
export type AuthProviders_Order_By = {
  id?: InputMaybe<Order_By>;
  userProviders_aggregate?: InputMaybe<AuthUserProviders_Aggregate_Order_By>;
};

/** primary key columns input for table: auth.providers */
export type AuthProviders_Pk_Columns_Input = {
  id: Scalars['String']['input'];
};

/** select columns of table "auth.providers" */
export enum AuthProviders_Select_Column {
  /** column name */
  Id = 'id'
}

/** input type for updating data in table "auth.providers" */
export type AuthProviders_Set_Input = {
  id?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "authProviders" */
export type AuthProviders_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: AuthProviders_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type AuthProviders_Stream_Cursor_Value_Input = {
  id?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "auth.providers" */
export enum AuthProviders_Update_Column {
  /** column name */
  Id = 'id'
}

export type AuthProviders_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<AuthProviders_Set_Input>;
  /** filter the rows which have to be updated */
  where: AuthProviders_Bool_Exp;
};

/** columns and relationships of "auth.refresh_token_types" */
export type AuthRefreshTokenTypes = {
  __typename: 'authRefreshTokenTypes';
  comment?: Maybe<Scalars['String']['output']>;
  /** An array relationship */
  refreshTokens: Array<AuthRefreshTokens>;
  /** An aggregate relationship */
  refreshTokens_aggregate: AuthRefreshTokens_Aggregate;
  value: Scalars['String']['output'];
};


/** columns and relationships of "auth.refresh_token_types" */
export type AuthRefreshTokenTypesRefreshTokensArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokens_Order_By>>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};


/** columns and relationships of "auth.refresh_token_types" */
export type AuthRefreshTokenTypesRefreshTokens_AggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokens_Order_By>>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};

/** aggregated selection of "auth.refresh_token_types" */
export type AuthRefreshTokenTypes_Aggregate = {
  __typename: 'authRefreshTokenTypes_aggregate';
  aggregate?: Maybe<AuthRefreshTokenTypes_Aggregate_Fields>;
  nodes: Array<AuthRefreshTokenTypes>;
};

/** aggregate fields of "auth.refresh_token_types" */
export type AuthRefreshTokenTypes_Aggregate_Fields = {
  __typename: 'authRefreshTokenTypes_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<AuthRefreshTokenTypes_Max_Fields>;
  min?: Maybe<AuthRefreshTokenTypes_Min_Fields>;
};


/** aggregate fields of "auth.refresh_token_types" */
export type AuthRefreshTokenTypes_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<AuthRefreshTokenTypes_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "auth.refresh_token_types". All fields are combined with a logical 'AND'. */
export type AuthRefreshTokenTypes_Bool_Exp = {
  _and?: InputMaybe<Array<AuthRefreshTokenTypes_Bool_Exp>>;
  _not?: InputMaybe<AuthRefreshTokenTypes_Bool_Exp>;
  _or?: InputMaybe<Array<AuthRefreshTokenTypes_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  refreshTokens?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
  refreshTokens_aggregate?: InputMaybe<AuthRefreshTokens_Aggregate_Bool_Exp>;
  value?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "auth.refresh_token_types" */
export enum AuthRefreshTokenTypes_Constraint {
  /** unique or primary key constraint on columns "value" */
  RefreshTokenTypesPkey = 'refresh_token_types_pkey'
}

export enum AuthRefreshTokenTypes_Enum {
  /** Personal access token */
  Pat = 'pat',
  /** Regular refresh token */
  Regular = 'regular'
}

/** Boolean expression to compare columns of type "authRefreshTokenTypes_enum". All fields are combined with logical 'AND'. */
export type AuthRefreshTokenTypes_Enum_Comparison_Exp = {
  _eq?: InputMaybe<AuthRefreshTokenTypes_Enum>;
  _in?: InputMaybe<Array<AuthRefreshTokenTypes_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<AuthRefreshTokenTypes_Enum>;
  _nin?: InputMaybe<Array<AuthRefreshTokenTypes_Enum>>;
};

/** input type for inserting data into table "auth.refresh_token_types" */
export type AuthRefreshTokenTypes_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  refreshTokens?: InputMaybe<AuthRefreshTokens_Arr_Rel_Insert_Input>;
  value?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type AuthRefreshTokenTypes_Max_Fields = {
  __typename: 'authRefreshTokenTypes_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type AuthRefreshTokenTypes_Min_Fields = {
  __typename: 'authRefreshTokenTypes_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "auth.refresh_token_types" */
export type AuthRefreshTokenTypes_Mutation_Response = {
  __typename: 'authRefreshTokenTypes_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<AuthRefreshTokenTypes>;
};

/** on_conflict condition type for table "auth.refresh_token_types" */
export type AuthRefreshTokenTypes_On_Conflict = {
  constraint: AuthRefreshTokenTypes_Constraint;
  update_columns?: Array<AuthRefreshTokenTypes_Update_Column>;
  where?: InputMaybe<AuthRefreshTokenTypes_Bool_Exp>;
};

/** Ordering options when selecting data from "auth.refresh_token_types". */
export type AuthRefreshTokenTypes_Order_By = {
  comment?: InputMaybe<Order_By>;
  refreshTokens_aggregate?: InputMaybe<AuthRefreshTokens_Aggregate_Order_By>;
  value?: InputMaybe<Order_By>;
};

/** primary key columns input for table: auth.refresh_token_types */
export type AuthRefreshTokenTypes_Pk_Columns_Input = {
  value: Scalars['String']['input'];
};

/** select columns of table "auth.refresh_token_types" */
export enum AuthRefreshTokenTypes_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Value = 'value'
}

/** input type for updating data in table "auth.refresh_token_types" */
export type AuthRefreshTokenTypes_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  value?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "authRefreshTokenTypes" */
export type AuthRefreshTokenTypes_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: AuthRefreshTokenTypes_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type AuthRefreshTokenTypes_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  value?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "auth.refresh_token_types" */
export enum AuthRefreshTokenTypes_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Value = 'value'
}

export type AuthRefreshTokenTypes_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<AuthRefreshTokenTypes_Set_Input>;
  /** filter the rows which have to be updated */
  where: AuthRefreshTokenTypes_Bool_Exp;
};

/** User refresh tokens. Hasura auth uses them to rotate new access tokens as long as the refresh token is not expired. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthRefreshTokens = {
  __typename: 'authRefreshTokens';
  createdAt: Scalars['timestamptz']['output'];
  expiresAt: Scalars['timestamptz']['output'];
  id: Scalars['uuid']['output'];
  metadata?: Maybe<Scalars['jsonb']['output']>;
  refreshTokenHash?: Maybe<Scalars['String']['output']>;
  type: AuthRefreshTokenTypes_Enum;
  /** An object relationship */
  user: Users;
  userId: Scalars['uuid']['output'];
};


/** User refresh tokens. Hasura auth uses them to rotate new access tokens as long as the refresh token is not expired. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthRefreshTokensMetadataArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};

/** aggregated selection of "auth.refresh_tokens" */
export type AuthRefreshTokens_Aggregate = {
  __typename: 'authRefreshTokens_aggregate';
  aggregate?: Maybe<AuthRefreshTokens_Aggregate_Fields>;
  nodes: Array<AuthRefreshTokens>;
};

export type AuthRefreshTokens_Aggregate_Bool_Exp = {
  count?: InputMaybe<AuthRefreshTokens_Aggregate_Bool_Exp_Count>;
};

export type AuthRefreshTokens_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "auth.refresh_tokens" */
export type AuthRefreshTokens_Aggregate_Fields = {
  __typename: 'authRefreshTokens_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<AuthRefreshTokens_Max_Fields>;
  min?: Maybe<AuthRefreshTokens_Min_Fields>;
};


/** aggregate fields of "auth.refresh_tokens" */
export type AuthRefreshTokens_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "auth.refresh_tokens" */
export type AuthRefreshTokens_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<AuthRefreshTokens_Max_Order_By>;
  min?: InputMaybe<AuthRefreshTokens_Min_Order_By>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type AuthRefreshTokens_Append_Input = {
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
};

/** input type for inserting array relation for remote table "auth.refresh_tokens" */
export type AuthRefreshTokens_Arr_Rel_Insert_Input = {
  data: Array<AuthRefreshTokens_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<AuthRefreshTokens_On_Conflict>;
};

/** Boolean expression to filter rows from the table "auth.refresh_tokens". All fields are combined with a logical 'AND'. */
export type AuthRefreshTokens_Bool_Exp = {
  _and?: InputMaybe<Array<AuthRefreshTokens_Bool_Exp>>;
  _not?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
  _or?: InputMaybe<Array<AuthRefreshTokens_Bool_Exp>>;
  createdAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  expiresAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  metadata?: InputMaybe<Jsonb_Comparison_Exp>;
  refreshTokenHash?: InputMaybe<String_Comparison_Exp>;
  type?: InputMaybe<AuthRefreshTokenTypes_Enum_Comparison_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  userId?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "auth.refresh_tokens" */
export enum AuthRefreshTokens_Constraint {
  /** unique or primary key constraint on columns "id" */
  RefreshTokensPkey = 'refresh_tokens_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type AuthRefreshTokens_Delete_At_Path_Input = {
  metadata?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type AuthRefreshTokens_Delete_Elem_Input = {
  metadata?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type AuthRefreshTokens_Delete_Key_Input = {
  metadata?: InputMaybe<Scalars['String']['input']>;
};

/** input type for inserting data into table "auth.refresh_tokens" */
export type AuthRefreshTokens_Insert_Input = {
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  expiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  refreshTokenHash?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<AuthRefreshTokenTypes_Enum>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type AuthRefreshTokens_Max_Fields = {
  __typename: 'authRefreshTokens_max_fields';
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  expiresAt?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  refreshTokenHash?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "auth.refresh_tokens" */
export type AuthRefreshTokens_Max_Order_By = {
  createdAt?: InputMaybe<Order_By>;
  expiresAt?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  refreshTokenHash?: InputMaybe<Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type AuthRefreshTokens_Min_Fields = {
  __typename: 'authRefreshTokens_min_fields';
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  expiresAt?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  refreshTokenHash?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "auth.refresh_tokens" */
export type AuthRefreshTokens_Min_Order_By = {
  createdAt?: InputMaybe<Order_By>;
  expiresAt?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  refreshTokenHash?: InputMaybe<Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "auth.refresh_tokens" */
export type AuthRefreshTokens_Mutation_Response = {
  __typename: 'authRefreshTokens_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<AuthRefreshTokens>;
};

/** on_conflict condition type for table "auth.refresh_tokens" */
export type AuthRefreshTokens_On_Conflict = {
  constraint: AuthRefreshTokens_Constraint;
  update_columns?: Array<AuthRefreshTokens_Update_Column>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};

/** Ordering options when selecting data from "auth.refresh_tokens". */
export type AuthRefreshTokens_Order_By = {
  createdAt?: InputMaybe<Order_By>;
  expiresAt?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  metadata?: InputMaybe<Order_By>;
  refreshTokenHash?: InputMaybe<Order_By>;
  type?: InputMaybe<Order_By>;
  user?: InputMaybe<Users_Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** primary key columns input for table: auth.refresh_tokens */
export type AuthRefreshTokens_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type AuthRefreshTokens_Prepend_Input = {
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "auth.refresh_tokens" */
export enum AuthRefreshTokens_Select_Column {
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  ExpiresAt = 'expiresAt',
  /** column name */
  Id = 'id',
  /** column name */
  Metadata = 'metadata',
  /** column name */
  RefreshTokenHash = 'refreshTokenHash',
  /** column name */
  Type = 'type',
  /** column name */
  UserId = 'userId'
}

/** input type for updating data in table "auth.refresh_tokens" */
export type AuthRefreshTokens_Set_Input = {
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  expiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  refreshTokenHash?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<AuthRefreshTokenTypes_Enum>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "authRefreshTokens" */
export type AuthRefreshTokens_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: AuthRefreshTokens_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type AuthRefreshTokens_Stream_Cursor_Value_Input = {
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  expiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  refreshTokenHash?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<AuthRefreshTokenTypes_Enum>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "auth.refresh_tokens" */
export enum AuthRefreshTokens_Update_Column {
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  ExpiresAt = 'expiresAt',
  /** column name */
  Id = 'id',
  /** column name */
  Metadata = 'metadata',
  /** column name */
  RefreshTokenHash = 'refreshTokenHash',
  /** column name */
  Type = 'type',
  /** column name */
  UserId = 'userId'
}

export type AuthRefreshTokens_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<AuthRefreshTokens_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<AuthRefreshTokens_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<AuthRefreshTokens_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<AuthRefreshTokens_Delete_Key_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<AuthRefreshTokens_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<AuthRefreshTokens_Set_Input>;
  /** filter the rows which have to be updated */
  where: AuthRefreshTokens_Bool_Exp;
};

/** Persistent Hasura roles for users. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthRoles = {
  __typename: 'authRoles';
  role: Scalars['String']['output'];
  /** An array relationship */
  userRoles: Array<AuthUserRoles>;
  /** An aggregate relationship */
  userRoles_aggregate: AuthUserRoles_Aggregate;
  /** An array relationship */
  usersByDefaultRole: Array<Users>;
  /** An aggregate relationship */
  usersByDefaultRole_aggregate: Users_Aggregate;
};


/** Persistent Hasura roles for users. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthRolesUserRolesArgs = {
  distinct_on?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserRoles_Order_By>>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};


/** Persistent Hasura roles for users. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthRolesUserRoles_AggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserRoles_Order_By>>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};


/** Persistent Hasura roles for users. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthRolesUsersByDefaultRoleArgs = {
  distinct_on?: InputMaybe<Array<Users_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Users_Order_By>>;
  where?: InputMaybe<Users_Bool_Exp>;
};


/** Persistent Hasura roles for users. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthRolesUsersByDefaultRole_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Users_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Users_Order_By>>;
  where?: InputMaybe<Users_Bool_Exp>;
};

/** aggregated selection of "auth.roles" */
export type AuthRoles_Aggregate = {
  __typename: 'authRoles_aggregate';
  aggregate?: Maybe<AuthRoles_Aggregate_Fields>;
  nodes: Array<AuthRoles>;
};

/** aggregate fields of "auth.roles" */
export type AuthRoles_Aggregate_Fields = {
  __typename: 'authRoles_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<AuthRoles_Max_Fields>;
  min?: Maybe<AuthRoles_Min_Fields>;
};


/** aggregate fields of "auth.roles" */
export type AuthRoles_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<AuthRoles_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "auth.roles". All fields are combined with a logical 'AND'. */
export type AuthRoles_Bool_Exp = {
  _and?: InputMaybe<Array<AuthRoles_Bool_Exp>>;
  _not?: InputMaybe<AuthRoles_Bool_Exp>;
  _or?: InputMaybe<Array<AuthRoles_Bool_Exp>>;
  role?: InputMaybe<String_Comparison_Exp>;
  userRoles?: InputMaybe<AuthUserRoles_Bool_Exp>;
  userRoles_aggregate?: InputMaybe<AuthUserRoles_Aggregate_Bool_Exp>;
  usersByDefaultRole?: InputMaybe<Users_Bool_Exp>;
  usersByDefaultRole_aggregate?: InputMaybe<Users_Aggregate_Bool_Exp>;
};

/** unique or primary key constraints on table "auth.roles" */
export enum AuthRoles_Constraint {
  /** unique or primary key constraint on columns "role" */
  RolesPkey = 'roles_pkey'
}

/** input type for inserting data into table "auth.roles" */
export type AuthRoles_Insert_Input = {
  role?: InputMaybe<Scalars['String']['input']>;
  userRoles?: InputMaybe<AuthUserRoles_Arr_Rel_Insert_Input>;
  usersByDefaultRole?: InputMaybe<Users_Arr_Rel_Insert_Input>;
};

/** aggregate max on columns */
export type AuthRoles_Max_Fields = {
  __typename: 'authRoles_max_fields';
  role?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type AuthRoles_Min_Fields = {
  __typename: 'authRoles_min_fields';
  role?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "auth.roles" */
export type AuthRoles_Mutation_Response = {
  __typename: 'authRoles_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<AuthRoles>;
};

/** input type for inserting object relation for remote table "auth.roles" */
export type AuthRoles_Obj_Rel_Insert_Input = {
  data: AuthRoles_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<AuthRoles_On_Conflict>;
};

/** on_conflict condition type for table "auth.roles" */
export type AuthRoles_On_Conflict = {
  constraint: AuthRoles_Constraint;
  update_columns?: Array<AuthRoles_Update_Column>;
  where?: InputMaybe<AuthRoles_Bool_Exp>;
};

/** Ordering options when selecting data from "auth.roles". */
export type AuthRoles_Order_By = {
  role?: InputMaybe<Order_By>;
  userRoles_aggregate?: InputMaybe<AuthUserRoles_Aggregate_Order_By>;
  usersByDefaultRole_aggregate?: InputMaybe<Users_Aggregate_Order_By>;
};

/** primary key columns input for table: auth.roles */
export type AuthRoles_Pk_Columns_Input = {
  role: Scalars['String']['input'];
};

/** select columns of table "auth.roles" */
export enum AuthRoles_Select_Column {
  /** column name */
  Role = 'role'
}

/** input type for updating data in table "auth.roles" */
export type AuthRoles_Set_Input = {
  role?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "authRoles" */
export type AuthRoles_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: AuthRoles_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type AuthRoles_Stream_Cursor_Value_Input = {
  role?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "auth.roles" */
export enum AuthRoles_Update_Column {
  /** column name */
  Role = 'role'
}

export type AuthRoles_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<AuthRoles_Set_Input>;
  /** filter the rows which have to be updated */
  where: AuthRoles_Bool_Exp;
};

/** Active providers for a given user. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthUserProviders = {
  __typename: 'authUserProviders';
  accessToken: Scalars['String']['output'];
  createdAt: Scalars['timestamptz']['output'];
  id: Scalars['uuid']['output'];
  /** An object relationship */
  provider: AuthProviders;
  providerId: Scalars['String']['output'];
  providerUserId: Scalars['String']['output'];
  refreshToken?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['timestamptz']['output'];
  /** An object relationship */
  user: Users;
  userId: Scalars['uuid']['output'];
};

/** aggregated selection of "auth.user_providers" */
export type AuthUserProviders_Aggregate = {
  __typename: 'authUserProviders_aggregate';
  aggregate?: Maybe<AuthUserProviders_Aggregate_Fields>;
  nodes: Array<AuthUserProviders>;
};

export type AuthUserProviders_Aggregate_Bool_Exp = {
  count?: InputMaybe<AuthUserProviders_Aggregate_Bool_Exp_Count>;
};

export type AuthUserProviders_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<AuthUserProviders_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "auth.user_providers" */
export type AuthUserProviders_Aggregate_Fields = {
  __typename: 'authUserProviders_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<AuthUserProviders_Max_Fields>;
  min?: Maybe<AuthUserProviders_Min_Fields>;
};


/** aggregate fields of "auth.user_providers" */
export type AuthUserProviders_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "auth.user_providers" */
export type AuthUserProviders_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<AuthUserProviders_Max_Order_By>;
  min?: InputMaybe<AuthUserProviders_Min_Order_By>;
};

/** input type for inserting array relation for remote table "auth.user_providers" */
export type AuthUserProviders_Arr_Rel_Insert_Input = {
  data: Array<AuthUserProviders_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<AuthUserProviders_On_Conflict>;
};

/** Boolean expression to filter rows from the table "auth.user_providers". All fields are combined with a logical 'AND'. */
export type AuthUserProviders_Bool_Exp = {
  _and?: InputMaybe<Array<AuthUserProviders_Bool_Exp>>;
  _not?: InputMaybe<AuthUserProviders_Bool_Exp>;
  _or?: InputMaybe<Array<AuthUserProviders_Bool_Exp>>;
  accessToken?: InputMaybe<String_Comparison_Exp>;
  createdAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  provider?: InputMaybe<AuthProviders_Bool_Exp>;
  providerId?: InputMaybe<String_Comparison_Exp>;
  providerUserId?: InputMaybe<String_Comparison_Exp>;
  refreshToken?: InputMaybe<String_Comparison_Exp>;
  updatedAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  userId?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "auth.user_providers" */
export enum AuthUserProviders_Constraint {
  /** unique or primary key constraint on columns "id" */
  UserProvidersPkey = 'user_providers_pkey',
  /** unique or primary key constraint on columns "provider_user_id", "provider_id" */
  UserProvidersProviderIdProviderUserIdKey = 'user_providers_provider_id_provider_user_id_key',
  /** unique or primary key constraint on columns "user_id", "provider_id" */
  UserProvidersUserIdProviderIdKey = 'user_providers_user_id_provider_id_key'
}

/** input type for inserting data into table "auth.user_providers" */
export type AuthUserProviders_Insert_Input = {
  accessToken?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  provider?: InputMaybe<AuthProviders_Obj_Rel_Insert_Input>;
  providerId?: InputMaybe<Scalars['String']['input']>;
  providerUserId?: InputMaybe<Scalars['String']['input']>;
  refreshToken?: InputMaybe<Scalars['String']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type AuthUserProviders_Max_Fields = {
  __typename: 'authUserProviders_max_fields';
  accessToken?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  providerId?: Maybe<Scalars['String']['output']>;
  providerUserId?: Maybe<Scalars['String']['output']>;
  refreshToken?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
  userId?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "auth.user_providers" */
export type AuthUserProviders_Max_Order_By = {
  accessToken?: InputMaybe<Order_By>;
  createdAt?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  providerId?: InputMaybe<Order_By>;
  providerUserId?: InputMaybe<Order_By>;
  refreshToken?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type AuthUserProviders_Min_Fields = {
  __typename: 'authUserProviders_min_fields';
  accessToken?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  providerId?: Maybe<Scalars['String']['output']>;
  providerUserId?: Maybe<Scalars['String']['output']>;
  refreshToken?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
  userId?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "auth.user_providers" */
export type AuthUserProviders_Min_Order_By = {
  accessToken?: InputMaybe<Order_By>;
  createdAt?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  providerId?: InputMaybe<Order_By>;
  providerUserId?: InputMaybe<Order_By>;
  refreshToken?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "auth.user_providers" */
export type AuthUserProviders_Mutation_Response = {
  __typename: 'authUserProviders_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<AuthUserProviders>;
};

/** on_conflict condition type for table "auth.user_providers" */
export type AuthUserProviders_On_Conflict = {
  constraint: AuthUserProviders_Constraint;
  update_columns?: Array<AuthUserProviders_Update_Column>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};

/** Ordering options when selecting data from "auth.user_providers". */
export type AuthUserProviders_Order_By = {
  accessToken?: InputMaybe<Order_By>;
  createdAt?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  provider?: InputMaybe<AuthProviders_Order_By>;
  providerId?: InputMaybe<Order_By>;
  providerUserId?: InputMaybe<Order_By>;
  refreshToken?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
  user?: InputMaybe<Users_Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** primary key columns input for table: auth.user_providers */
export type AuthUserProviders_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "auth.user_providers" */
export enum AuthUserProviders_Select_Column {
  /** column name */
  AccessToken = 'accessToken',
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  Id = 'id',
  /** column name */
  ProviderId = 'providerId',
  /** column name */
  ProviderUserId = 'providerUserId',
  /** column name */
  RefreshToken = 'refreshToken',
  /** column name */
  UpdatedAt = 'updatedAt',
  /** column name */
  UserId = 'userId'
}

/** input type for updating data in table "auth.user_providers" */
export type AuthUserProviders_Set_Input = {
  accessToken?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  providerId?: InputMaybe<Scalars['String']['input']>;
  providerUserId?: InputMaybe<Scalars['String']['input']>;
  refreshToken?: InputMaybe<Scalars['String']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "authUserProviders" */
export type AuthUserProviders_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: AuthUserProviders_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type AuthUserProviders_Stream_Cursor_Value_Input = {
  accessToken?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  providerId?: InputMaybe<Scalars['String']['input']>;
  providerUserId?: InputMaybe<Scalars['String']['input']>;
  refreshToken?: InputMaybe<Scalars['String']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "auth.user_providers" */
export enum AuthUserProviders_Update_Column {
  /** column name */
  AccessToken = 'accessToken',
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  Id = 'id',
  /** column name */
  ProviderId = 'providerId',
  /** column name */
  ProviderUserId = 'providerUserId',
  /** column name */
  RefreshToken = 'refreshToken',
  /** column name */
  UpdatedAt = 'updatedAt',
  /** column name */
  UserId = 'userId'
}

export type AuthUserProviders_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<AuthUserProviders_Set_Input>;
  /** filter the rows which have to be updated */
  where: AuthUserProviders_Bool_Exp;
};

/** Roles of users. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthUserRoles = {
  __typename: 'authUserRoles';
  createdAt: Scalars['timestamptz']['output'];
  id: Scalars['uuid']['output'];
  role: Scalars['String']['output'];
  /** An object relationship */
  roleByRole: AuthRoles;
  /** An object relationship */
  user: Users;
  userId: Scalars['uuid']['output'];
};

/** aggregated selection of "auth.user_roles" */
export type AuthUserRoles_Aggregate = {
  __typename: 'authUserRoles_aggregate';
  aggregate?: Maybe<AuthUserRoles_Aggregate_Fields>;
  nodes: Array<AuthUserRoles>;
};

export type AuthUserRoles_Aggregate_Bool_Exp = {
  count?: InputMaybe<AuthUserRoles_Aggregate_Bool_Exp_Count>;
};

export type AuthUserRoles_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<AuthUserRoles_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "auth.user_roles" */
export type AuthUserRoles_Aggregate_Fields = {
  __typename: 'authUserRoles_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<AuthUserRoles_Max_Fields>;
  min?: Maybe<AuthUserRoles_Min_Fields>;
};


/** aggregate fields of "auth.user_roles" */
export type AuthUserRoles_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "auth.user_roles" */
export type AuthUserRoles_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<AuthUserRoles_Max_Order_By>;
  min?: InputMaybe<AuthUserRoles_Min_Order_By>;
};

/** input type for inserting array relation for remote table "auth.user_roles" */
export type AuthUserRoles_Arr_Rel_Insert_Input = {
  data: Array<AuthUserRoles_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<AuthUserRoles_On_Conflict>;
};

/** Boolean expression to filter rows from the table "auth.user_roles". All fields are combined with a logical 'AND'. */
export type AuthUserRoles_Bool_Exp = {
  _and?: InputMaybe<Array<AuthUserRoles_Bool_Exp>>;
  _not?: InputMaybe<AuthUserRoles_Bool_Exp>;
  _or?: InputMaybe<Array<AuthUserRoles_Bool_Exp>>;
  createdAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  role?: InputMaybe<String_Comparison_Exp>;
  roleByRole?: InputMaybe<AuthRoles_Bool_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  userId?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "auth.user_roles" */
export enum AuthUserRoles_Constraint {
  /** unique or primary key constraint on columns "id" */
  UserRolesPkey = 'user_roles_pkey',
  /** unique or primary key constraint on columns "user_id", "role" */
  UserRolesUserIdRoleKey = 'user_roles_user_id_role_key'
}

/** input type for inserting data into table "auth.user_roles" */
export type AuthUserRoles_Insert_Input = {
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  roleByRole?: InputMaybe<AuthRoles_Obj_Rel_Insert_Input>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type AuthUserRoles_Max_Fields = {
  __typename: 'authUserRoles_max_fields';
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  role?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "auth.user_roles" */
export type AuthUserRoles_Max_Order_By = {
  createdAt?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  role?: InputMaybe<Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type AuthUserRoles_Min_Fields = {
  __typename: 'authUserRoles_min_fields';
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  role?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "auth.user_roles" */
export type AuthUserRoles_Min_Order_By = {
  createdAt?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  role?: InputMaybe<Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "auth.user_roles" */
export type AuthUserRoles_Mutation_Response = {
  __typename: 'authUserRoles_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<AuthUserRoles>;
};

/** on_conflict condition type for table "auth.user_roles" */
export type AuthUserRoles_On_Conflict = {
  constraint: AuthUserRoles_Constraint;
  update_columns?: Array<AuthUserRoles_Update_Column>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};

/** Ordering options when selecting data from "auth.user_roles". */
export type AuthUserRoles_Order_By = {
  createdAt?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  role?: InputMaybe<Order_By>;
  roleByRole?: InputMaybe<AuthRoles_Order_By>;
  user?: InputMaybe<Users_Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** primary key columns input for table: auth.user_roles */
export type AuthUserRoles_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "auth.user_roles" */
export enum AuthUserRoles_Select_Column {
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  Id = 'id',
  /** column name */
  Role = 'role',
  /** column name */
  UserId = 'userId'
}

/** input type for updating data in table "auth.user_roles" */
export type AuthUserRoles_Set_Input = {
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "authUserRoles" */
export type AuthUserRoles_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: AuthUserRoles_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type AuthUserRoles_Stream_Cursor_Value_Input = {
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "auth.user_roles" */
export enum AuthUserRoles_Update_Column {
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  Id = 'id',
  /** column name */
  Role = 'role',
  /** column name */
  UserId = 'userId'
}

export type AuthUserRoles_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<AuthUserRoles_Set_Input>;
  /** filter the rows which have to be updated */
  where: AuthUserRoles_Bool_Exp;
};

/** User webauthn security keys. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type AuthUserSecurityKeys = {
  __typename: 'authUserSecurityKeys';
  counter: Scalars['bigint']['output'];
  credentialId: Scalars['String']['output'];
  credentialPublicKey?: Maybe<Scalars['bytea']['output']>;
  id: Scalars['uuid']['output'];
  nickname?: Maybe<Scalars['String']['output']>;
  transports: Scalars['String']['output'];
  /** An object relationship */
  user: Users;
  userId: Scalars['uuid']['output'];
};

/** aggregated selection of "auth.user_security_keys" */
export type AuthUserSecurityKeys_Aggregate = {
  __typename: 'authUserSecurityKeys_aggregate';
  aggregate?: Maybe<AuthUserSecurityKeys_Aggregate_Fields>;
  nodes: Array<AuthUserSecurityKeys>;
};

export type AuthUserSecurityKeys_Aggregate_Bool_Exp = {
  count?: InputMaybe<AuthUserSecurityKeys_Aggregate_Bool_Exp_Count>;
};

export type AuthUserSecurityKeys_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<AuthUserSecurityKeys_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "auth.user_security_keys" */
export type AuthUserSecurityKeys_Aggregate_Fields = {
  __typename: 'authUserSecurityKeys_aggregate_fields';
  avg?: Maybe<AuthUserSecurityKeys_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<AuthUserSecurityKeys_Max_Fields>;
  min?: Maybe<AuthUserSecurityKeys_Min_Fields>;
  stddev?: Maybe<AuthUserSecurityKeys_Stddev_Fields>;
  stddev_pop?: Maybe<AuthUserSecurityKeys_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<AuthUserSecurityKeys_Stddev_Samp_Fields>;
  sum?: Maybe<AuthUserSecurityKeys_Sum_Fields>;
  var_pop?: Maybe<AuthUserSecurityKeys_Var_Pop_Fields>;
  var_samp?: Maybe<AuthUserSecurityKeys_Var_Samp_Fields>;
  variance?: Maybe<AuthUserSecurityKeys_Variance_Fields>;
};


/** aggregate fields of "auth.user_security_keys" */
export type AuthUserSecurityKeys_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<AuthUserSecurityKeys_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Aggregate_Order_By = {
  avg?: InputMaybe<AuthUserSecurityKeys_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<AuthUserSecurityKeys_Max_Order_By>;
  min?: InputMaybe<AuthUserSecurityKeys_Min_Order_By>;
  stddev?: InputMaybe<AuthUserSecurityKeys_Stddev_Order_By>;
  stddev_pop?: InputMaybe<AuthUserSecurityKeys_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<AuthUserSecurityKeys_Stddev_Samp_Order_By>;
  sum?: InputMaybe<AuthUserSecurityKeys_Sum_Order_By>;
  var_pop?: InputMaybe<AuthUserSecurityKeys_Var_Pop_Order_By>;
  var_samp?: InputMaybe<AuthUserSecurityKeys_Var_Samp_Order_By>;
  variance?: InputMaybe<AuthUserSecurityKeys_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Arr_Rel_Insert_Input = {
  data: Array<AuthUserSecurityKeys_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<AuthUserSecurityKeys_On_Conflict>;
};

/** aggregate avg on columns */
export type AuthUserSecurityKeys_Avg_Fields = {
  __typename: 'authUserSecurityKeys_avg_fields';
  counter?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Avg_Order_By = {
  counter?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "auth.user_security_keys". All fields are combined with a logical 'AND'. */
export type AuthUserSecurityKeys_Bool_Exp = {
  _and?: InputMaybe<Array<AuthUserSecurityKeys_Bool_Exp>>;
  _not?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
  _or?: InputMaybe<Array<AuthUserSecurityKeys_Bool_Exp>>;
  counter?: InputMaybe<Bigint_Comparison_Exp>;
  credentialId?: InputMaybe<String_Comparison_Exp>;
  credentialPublicKey?: InputMaybe<Bytea_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  nickname?: InputMaybe<String_Comparison_Exp>;
  transports?: InputMaybe<String_Comparison_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  userId?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "auth.user_security_keys" */
export enum AuthUserSecurityKeys_Constraint {
  /** unique or primary key constraint on columns "credential_id" */
  UserSecurityKeyCredentialIdKey = 'user_security_key_credential_id_key',
  /** unique or primary key constraint on columns "id" */
  UserSecurityKeysPkey = 'user_security_keys_pkey'
}

/** input type for incrementing numeric columns in table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Inc_Input = {
  counter?: InputMaybe<Scalars['bigint']['input']>;
};

/** input type for inserting data into table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Insert_Input = {
  counter?: InputMaybe<Scalars['bigint']['input']>;
  credentialId?: InputMaybe<Scalars['String']['input']>;
  credentialPublicKey?: InputMaybe<Scalars['bytea']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  nickname?: InputMaybe<Scalars['String']['input']>;
  transports?: InputMaybe<Scalars['String']['input']>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type AuthUserSecurityKeys_Max_Fields = {
  __typename: 'authUserSecurityKeys_max_fields';
  counter?: Maybe<Scalars['bigint']['output']>;
  credentialId?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  nickname?: Maybe<Scalars['String']['output']>;
  transports?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Max_Order_By = {
  counter?: InputMaybe<Order_By>;
  credentialId?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  nickname?: InputMaybe<Order_By>;
  transports?: InputMaybe<Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type AuthUserSecurityKeys_Min_Fields = {
  __typename: 'authUserSecurityKeys_min_fields';
  counter?: Maybe<Scalars['bigint']['output']>;
  credentialId?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  nickname?: Maybe<Scalars['String']['output']>;
  transports?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Min_Order_By = {
  counter?: InputMaybe<Order_By>;
  credentialId?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  nickname?: InputMaybe<Order_By>;
  transports?: InputMaybe<Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Mutation_Response = {
  __typename: 'authUserSecurityKeys_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<AuthUserSecurityKeys>;
};

/** on_conflict condition type for table "auth.user_security_keys" */
export type AuthUserSecurityKeys_On_Conflict = {
  constraint: AuthUserSecurityKeys_Constraint;
  update_columns?: Array<AuthUserSecurityKeys_Update_Column>;
  where?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
};

/** Ordering options when selecting data from "auth.user_security_keys". */
export type AuthUserSecurityKeys_Order_By = {
  counter?: InputMaybe<Order_By>;
  credentialId?: InputMaybe<Order_By>;
  credentialPublicKey?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  nickname?: InputMaybe<Order_By>;
  transports?: InputMaybe<Order_By>;
  user?: InputMaybe<Users_Order_By>;
  userId?: InputMaybe<Order_By>;
};

/** primary key columns input for table: auth.user_security_keys */
export type AuthUserSecurityKeys_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "auth.user_security_keys" */
export enum AuthUserSecurityKeys_Select_Column {
  /** column name */
  Counter = 'counter',
  /** column name */
  CredentialId = 'credentialId',
  /** column name */
  CredentialPublicKey = 'credentialPublicKey',
  /** column name */
  Id = 'id',
  /** column name */
  Nickname = 'nickname',
  /** column name */
  Transports = 'transports',
  /** column name */
  UserId = 'userId'
}

/** input type for updating data in table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Set_Input = {
  counter?: InputMaybe<Scalars['bigint']['input']>;
  credentialId?: InputMaybe<Scalars['String']['input']>;
  credentialPublicKey?: InputMaybe<Scalars['bytea']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  nickname?: InputMaybe<Scalars['String']['input']>;
  transports?: InputMaybe<Scalars['String']['input']>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate stddev on columns */
export type AuthUserSecurityKeys_Stddev_Fields = {
  __typename: 'authUserSecurityKeys_stddev_fields';
  counter?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Stddev_Order_By = {
  counter?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type AuthUserSecurityKeys_Stddev_Pop_Fields = {
  __typename: 'authUserSecurityKeys_stddev_pop_fields';
  counter?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Stddev_Pop_Order_By = {
  counter?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type AuthUserSecurityKeys_Stddev_Samp_Fields = {
  __typename: 'authUserSecurityKeys_stddev_samp_fields';
  counter?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Stddev_Samp_Order_By = {
  counter?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "authUserSecurityKeys" */
export type AuthUserSecurityKeys_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: AuthUserSecurityKeys_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type AuthUserSecurityKeys_Stream_Cursor_Value_Input = {
  counter?: InputMaybe<Scalars['bigint']['input']>;
  credentialId?: InputMaybe<Scalars['String']['input']>;
  credentialPublicKey?: InputMaybe<Scalars['bytea']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  nickname?: InputMaybe<Scalars['String']['input']>;
  transports?: InputMaybe<Scalars['String']['input']>;
  userId?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate sum on columns */
export type AuthUserSecurityKeys_Sum_Fields = {
  __typename: 'authUserSecurityKeys_sum_fields';
  counter?: Maybe<Scalars['bigint']['output']>;
};

/** order by sum() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Sum_Order_By = {
  counter?: InputMaybe<Order_By>;
};

/** update columns of table "auth.user_security_keys" */
export enum AuthUserSecurityKeys_Update_Column {
  /** column name */
  Counter = 'counter',
  /** column name */
  CredentialId = 'credentialId',
  /** column name */
  CredentialPublicKey = 'credentialPublicKey',
  /** column name */
  Id = 'id',
  /** column name */
  Nickname = 'nickname',
  /** column name */
  Transports = 'transports',
  /** column name */
  UserId = 'userId'
}

export type AuthUserSecurityKeys_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<AuthUserSecurityKeys_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<AuthUserSecurityKeys_Set_Input>;
  /** filter the rows which have to be updated */
  where: AuthUserSecurityKeys_Bool_Exp;
};

/** aggregate var_pop on columns */
export type AuthUserSecurityKeys_Var_Pop_Fields = {
  __typename: 'authUserSecurityKeys_var_pop_fields';
  counter?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Var_Pop_Order_By = {
  counter?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type AuthUserSecurityKeys_Var_Samp_Fields = {
  __typename: 'authUserSecurityKeys_var_samp_fields';
  counter?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Var_Samp_Order_By = {
  counter?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type AuthUserSecurityKeys_Variance_Fields = {
  __typename: 'authUserSecurityKeys_variance_fields';
  counter?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "auth.user_security_keys" */
export type AuthUserSecurityKeys_Variance_Order_By = {
  counter?: InputMaybe<Order_By>;
};

/** columns and relationships of "barcodes" */
export type Barcodes = {
  __typename: 'barcodes';
  code: Scalars['String']['output'];
  type?: Maybe<Scalars['String']['output']>;
};

/** aggregated selection of "barcodes" */
export type Barcodes_Aggregate = {
  __typename: 'barcodes_aggregate';
  aggregate?: Maybe<Barcodes_Aggregate_Fields>;
  nodes: Array<Barcodes>;
};

/** aggregate fields of "barcodes" */
export type Barcodes_Aggregate_Fields = {
  __typename: 'barcodes_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Barcodes_Max_Fields>;
  min?: Maybe<Barcodes_Min_Fields>;
};


/** aggregate fields of "barcodes" */
export type Barcodes_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Barcodes_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "barcodes". All fields are combined with a logical 'AND'. */
export type Barcodes_Bool_Exp = {
  _and?: InputMaybe<Array<Barcodes_Bool_Exp>>;
  _not?: InputMaybe<Barcodes_Bool_Exp>;
  _or?: InputMaybe<Array<Barcodes_Bool_Exp>>;
  code?: InputMaybe<String_Comparison_Exp>;
  type?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "barcodes" */
export enum Barcodes_Constraint {
  /** unique or primary key constraint on columns "code" */
  BarcodesPkey = 'barcodes_pkey'
}

/** input type for inserting data into table "barcodes" */
export type Barcodes_Insert_Input = {
  code?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Barcodes_Max_Fields = {
  __typename: 'barcodes_max_fields';
  code?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Barcodes_Min_Fields = {
  __typename: 'barcodes_min_fields';
  code?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "barcodes" */
export type Barcodes_Mutation_Response = {
  __typename: 'barcodes_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Barcodes>;
};

/** input type for inserting object relation for remote table "barcodes" */
export type Barcodes_Obj_Rel_Insert_Input = {
  data: Barcodes_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Barcodes_On_Conflict>;
};

/** on_conflict condition type for table "barcodes" */
export type Barcodes_On_Conflict = {
  constraint: Barcodes_Constraint;
  update_columns?: Array<Barcodes_Update_Column>;
  where?: InputMaybe<Barcodes_Bool_Exp>;
};

/** Ordering options when selecting data from "barcodes". */
export type Barcodes_Order_By = {
  code?: InputMaybe<Order_By>;
  type?: InputMaybe<Order_By>;
};

/** primary key columns input for table: barcodes */
export type Barcodes_Pk_Columns_Input = {
  code: Scalars['String']['input'];
};

/** select columns of table "barcodes" */
export enum Barcodes_Select_Column {
  /** column name */
  Code = 'code',
  /** column name */
  Type = 'type'
}

/** input type for updating data in table "barcodes" */
export type Barcodes_Set_Input = {
  code?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "barcodes" */
export type Barcodes_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Barcodes_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Barcodes_Stream_Cursor_Value_Input = {
  code?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "barcodes" */
export enum Barcodes_Update_Column {
  /** column name */
  Code = 'code',
  /** column name */
  Type = 'type'
}

export type Barcodes_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Barcodes_Set_Input>;
  /** filter the rows which have to be updated */
  where: Barcodes_Bool_Exp;
};

export type Beer_Defaults_Result = {
  __typename: 'beer_defaults_result';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  barcode_type?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Int']['output']>;
  item_onboarding_id: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** columns and relationships of "beers" */
export type Beers = {
  __typename: 'beers';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  back_label_image_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  barcode?: Maybe<Barcodes>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  /** An object relationship */
  cellar: Cellars;
  cellar_id: Scalars['uuid']['output'];
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by_id: Scalars['uuid']['output'];
  description?: Maybe<Scalars['String']['output']>;
  front_label_image_id?: Maybe<Scalars['uuid']['output']>;
  id: Scalars['uuid']['output'];
  international_bitterness_unit?: Maybe<Scalars['Int']['output']>;
  name: Scalars['String']['output'];
  price?: Maybe<Scalars['money']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  updated_at: Scalars['timestamptz']['output'];
  vintage?: Maybe<Scalars['date']['output']>;
};

/** aggregated selection of "beers" */
export type Beers_Aggregate = {
  __typename: 'beers_aggregate';
  aggregate?: Maybe<Beers_Aggregate_Fields>;
  nodes: Array<Beers>;
};

export type Beers_Aggregate_Bool_Exp = {
  count?: InputMaybe<Beers_Aggregate_Bool_Exp_Count>;
};

export type Beers_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Beers_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Beers_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "beers" */
export type Beers_Aggregate_Fields = {
  __typename: 'beers_aggregate_fields';
  avg?: Maybe<Beers_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Beers_Max_Fields>;
  min?: Maybe<Beers_Min_Fields>;
  stddev?: Maybe<Beers_Stddev_Fields>;
  stddev_pop?: Maybe<Beers_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Beers_Stddev_Samp_Fields>;
  sum?: Maybe<Beers_Sum_Fields>;
  var_pop?: Maybe<Beers_Var_Pop_Fields>;
  var_samp?: Maybe<Beers_Var_Samp_Fields>;
  variance?: Maybe<Beers_Variance_Fields>;
};


/** aggregate fields of "beers" */
export type Beers_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Beers_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "beers" */
export type Beers_Aggregate_Order_By = {
  avg?: InputMaybe<Beers_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Beers_Max_Order_By>;
  min?: InputMaybe<Beers_Min_Order_By>;
  stddev?: InputMaybe<Beers_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Beers_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Beers_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Beers_Sum_Order_By>;
  var_pop?: InputMaybe<Beers_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Beers_Var_Samp_Order_By>;
  variance?: InputMaybe<Beers_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "beers" */
export type Beers_Arr_Rel_Insert_Input = {
  data: Array<Beers_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Beers_On_Conflict>;
};

/** aggregate avg on columns */
export type Beers_Avg_Fields = {
  __typename: 'beers_avg_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "beers" */
export type Beers_Avg_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "beers". All fields are combined with a logical 'AND'. */
export type Beers_Bool_Exp = {
  _and?: InputMaybe<Array<Beers_Bool_Exp>>;
  _not?: InputMaybe<Beers_Bool_Exp>;
  _or?: InputMaybe<Array<Beers_Bool_Exp>>;
  alcohol_content_percentage?: InputMaybe<Numeric_Comparison_Exp>;
  back_label_image_id?: InputMaybe<Uuid_Comparison_Exp>;
  barcode?: InputMaybe<Barcodes_Bool_Exp>;
  barcode_code?: InputMaybe<String_Comparison_Exp>;
  cellar?: InputMaybe<Cellars_Bool_Exp>;
  cellar_id?: InputMaybe<Uuid_Comparison_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by_id?: InputMaybe<Uuid_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  front_label_image_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  international_bitterness_unit?: InputMaybe<Int_Comparison_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  price?: InputMaybe<Money_Comparison_Exp>;
  style?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  vintage?: InputMaybe<Date_Comparison_Exp>;
};

/** unique or primary key constraints on table "beers" */
export enum Beers_Constraint {
  /** unique or primary key constraint on columns "id" */
  BeersPkey = 'beers_pkey'
}

/** input type for incrementing numeric columns in table "beers" */
export type Beers_Inc_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  international_bitterness_unit?: InputMaybe<Scalars['Int']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
};

/** input type for inserting data into table "beers" */
export type Beers_Insert_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  back_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  barcode?: InputMaybe<Barcodes_Obj_Rel_Insert_Input>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar?: InputMaybe<Cellars_Obj_Rel_Insert_Input>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  front_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  international_bitterness_unit?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
  style?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate max on columns */
export type Beers_Max_Fields = {
  __typename: 'beers_max_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  back_label_image_id?: Maybe<Scalars['uuid']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  front_label_image_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  price?: Maybe<Scalars['money']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** order by max() on columns of table "beers" */
export type Beers_Max_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  back_label_image_id?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  front_label_image_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
  style?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Beers_Min_Fields = {
  __typename: 'beers_min_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  back_label_image_id?: Maybe<Scalars['uuid']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  front_label_image_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Int']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  price?: Maybe<Scalars['money']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** order by min() on columns of table "beers" */
export type Beers_Min_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  back_label_image_id?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  front_label_image_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
  style?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "beers" */
export type Beers_Mutation_Response = {
  __typename: 'beers_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Beers>;
};

/** on_conflict condition type for table "beers" */
export type Beers_On_Conflict = {
  constraint: Beers_Constraint;
  update_columns?: Array<Beers_Update_Column>;
  where?: InputMaybe<Beers_Bool_Exp>;
};

/** Ordering options when selecting data from "beers". */
export type Beers_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  back_label_image_id?: InputMaybe<Order_By>;
  barcode?: InputMaybe<Barcodes_Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar?: InputMaybe<Cellars_Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  front_label_image_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
  style?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
};

/** primary key columns input for table: beers */
export type Beers_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "beers" */
export enum Beers_Select_Column {
  /** column name */
  AlcoholContentPercentage = 'alcohol_content_percentage',
  /** column name */
  BackLabelImageId = 'back_label_image_id',
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  FrontLabelImageId = 'front_label_image_id',
  /** column name */
  Id = 'id',
  /** column name */
  InternationalBitternessUnit = 'international_bitterness_unit',
  /** column name */
  Name = 'name',
  /** column name */
  Price = 'price',
  /** column name */
  Style = 'style',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  Vintage = 'vintage'
}

/** input type for updating data in table "beers" */
export type Beers_Set_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  back_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  front_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  international_bitterness_unit?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
  style?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate stddev on columns */
export type Beers_Stddev_Fields = {
  __typename: 'beers_stddev_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "beers" */
export type Beers_Stddev_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Beers_Stddev_Pop_Fields = {
  __typename: 'beers_stddev_pop_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "beers" */
export type Beers_Stddev_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Beers_Stddev_Samp_Fields = {
  __typename: 'beers_stddev_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "beers" */
export type Beers_Stddev_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "beers" */
export type Beers_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Beers_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Beers_Stream_Cursor_Value_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  back_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  front_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  international_bitterness_unit?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
  style?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate sum on columns */
export type Beers_Sum_Fields = {
  __typename: 'beers_sum_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Int']['output']>;
  price?: Maybe<Scalars['money']['output']>;
};

/** order by sum() on columns of table "beers" */
export type Beers_Sum_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** update columns of table "beers" */
export enum Beers_Update_Column {
  /** column name */
  AlcoholContentPercentage = 'alcohol_content_percentage',
  /** column name */
  BackLabelImageId = 'back_label_image_id',
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  FrontLabelImageId = 'front_label_image_id',
  /** column name */
  Id = 'id',
  /** column name */
  InternationalBitternessUnit = 'international_bitterness_unit',
  /** column name */
  Name = 'name',
  /** column name */
  Price = 'price',
  /** column name */
  Style = 'style',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  Vintage = 'vintage'
}

export type Beers_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Beers_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Beers_Set_Input>;
  /** filter the rows which have to be updated */
  where: Beers_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Beers_Var_Pop_Fields = {
  __typename: 'beers_var_pop_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "beers" */
export type Beers_Var_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Beers_Var_Samp_Fields = {
  __typename: 'beers_var_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "beers" */
export type Beers_Var_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Beers_Variance_Fields = {
  __typename: 'beers_variance_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "beers" */
export type Beers_Variance_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** Boolean expression to compare columns of type "bigint". All fields are combined with logical 'AND'. */
export type Bigint_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['bigint']['input']>;
  _gt?: InputMaybe<Scalars['bigint']['input']>;
  _gte?: InputMaybe<Scalars['bigint']['input']>;
  _in?: InputMaybe<Array<Scalars['bigint']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['bigint']['input']>;
  _lte?: InputMaybe<Scalars['bigint']['input']>;
  _neq?: InputMaybe<Scalars['bigint']['input']>;
  _nin?: InputMaybe<Array<Scalars['bigint']['input']>>;
};

/** columns and relationships of "storage.buckets" */
export type Buckets = {
  __typename: 'buckets';
  cacheControl?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['timestamptz']['output'];
  downloadExpiration: Scalars['Int']['output'];
  /** An array relationship */
  files: Array<Files>;
  /** An aggregate relationship */
  files_aggregate: Files_Aggregate;
  id: Scalars['String']['output'];
  maxUploadFileSize: Scalars['Int']['output'];
  minUploadFileSize: Scalars['Int']['output'];
  presignedUrlsEnabled: Scalars['Boolean']['output'];
  updatedAt: Scalars['timestamptz']['output'];
};


/** columns and relationships of "storage.buckets" */
export type BucketsFilesArgs = {
  distinct_on?: InputMaybe<Array<Files_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Files_Order_By>>;
  where?: InputMaybe<Files_Bool_Exp>;
};


/** columns and relationships of "storage.buckets" */
export type BucketsFiles_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Files_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Files_Order_By>>;
  where?: InputMaybe<Files_Bool_Exp>;
};

/** aggregated selection of "storage.buckets" */
export type Buckets_Aggregate = {
  __typename: 'buckets_aggregate';
  aggregate?: Maybe<Buckets_Aggregate_Fields>;
  nodes: Array<Buckets>;
};

/** aggregate fields of "storage.buckets" */
export type Buckets_Aggregate_Fields = {
  __typename: 'buckets_aggregate_fields';
  avg?: Maybe<Buckets_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Buckets_Max_Fields>;
  min?: Maybe<Buckets_Min_Fields>;
  stddev?: Maybe<Buckets_Stddev_Fields>;
  stddev_pop?: Maybe<Buckets_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Buckets_Stddev_Samp_Fields>;
  sum?: Maybe<Buckets_Sum_Fields>;
  var_pop?: Maybe<Buckets_Var_Pop_Fields>;
  var_samp?: Maybe<Buckets_Var_Samp_Fields>;
  variance?: Maybe<Buckets_Variance_Fields>;
};


/** aggregate fields of "storage.buckets" */
export type Buckets_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Buckets_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** aggregate avg on columns */
export type Buckets_Avg_Fields = {
  __typename: 'buckets_avg_fields';
  downloadExpiration?: Maybe<Scalars['Float']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Float']['output']>;
  minUploadFileSize?: Maybe<Scalars['Float']['output']>;
};

/** Boolean expression to filter rows from the table "storage.buckets". All fields are combined with a logical 'AND'. */
export type Buckets_Bool_Exp = {
  _and?: InputMaybe<Array<Buckets_Bool_Exp>>;
  _not?: InputMaybe<Buckets_Bool_Exp>;
  _or?: InputMaybe<Array<Buckets_Bool_Exp>>;
  cacheControl?: InputMaybe<String_Comparison_Exp>;
  createdAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  downloadExpiration?: InputMaybe<Int_Comparison_Exp>;
  files?: InputMaybe<Files_Bool_Exp>;
  files_aggregate?: InputMaybe<Files_Aggregate_Bool_Exp>;
  id?: InputMaybe<String_Comparison_Exp>;
  maxUploadFileSize?: InputMaybe<Int_Comparison_Exp>;
  minUploadFileSize?: InputMaybe<Int_Comparison_Exp>;
  presignedUrlsEnabled?: InputMaybe<Boolean_Comparison_Exp>;
  updatedAt?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "storage.buckets" */
export enum Buckets_Constraint {
  /** unique or primary key constraint on columns "id" */
  BucketsPkey = 'buckets_pkey'
}

/** input type for incrementing numeric columns in table "storage.buckets" */
export type Buckets_Inc_Input = {
  downloadExpiration?: InputMaybe<Scalars['Int']['input']>;
  maxUploadFileSize?: InputMaybe<Scalars['Int']['input']>;
  minUploadFileSize?: InputMaybe<Scalars['Int']['input']>;
};

/** input type for inserting data into table "storage.buckets" */
export type Buckets_Insert_Input = {
  cacheControl?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  downloadExpiration?: InputMaybe<Scalars['Int']['input']>;
  files?: InputMaybe<Files_Arr_Rel_Insert_Input>;
  id?: InputMaybe<Scalars['String']['input']>;
  maxUploadFileSize?: InputMaybe<Scalars['Int']['input']>;
  minUploadFileSize?: InputMaybe<Scalars['Int']['input']>;
  presignedUrlsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate max on columns */
export type Buckets_Max_Fields = {
  __typename: 'buckets_max_fields';
  cacheControl?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  downloadExpiration?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Int']['output']>;
  minUploadFileSize?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
};

/** aggregate min on columns */
export type Buckets_Min_Fields = {
  __typename: 'buckets_min_fields';
  cacheControl?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  downloadExpiration?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Int']['output']>;
  minUploadFileSize?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
};

/** response of any mutation on the table "storage.buckets" */
export type Buckets_Mutation_Response = {
  __typename: 'buckets_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Buckets>;
};

/** input type for inserting object relation for remote table "storage.buckets" */
export type Buckets_Obj_Rel_Insert_Input = {
  data: Buckets_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Buckets_On_Conflict>;
};

/** on_conflict condition type for table "storage.buckets" */
export type Buckets_On_Conflict = {
  constraint: Buckets_Constraint;
  update_columns?: Array<Buckets_Update_Column>;
  where?: InputMaybe<Buckets_Bool_Exp>;
};

/** Ordering options when selecting data from "storage.buckets". */
export type Buckets_Order_By = {
  cacheControl?: InputMaybe<Order_By>;
  createdAt?: InputMaybe<Order_By>;
  downloadExpiration?: InputMaybe<Order_By>;
  files_aggregate?: InputMaybe<Files_Aggregate_Order_By>;
  id?: InputMaybe<Order_By>;
  maxUploadFileSize?: InputMaybe<Order_By>;
  minUploadFileSize?: InputMaybe<Order_By>;
  presignedUrlsEnabled?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
};

/** primary key columns input for table: storage.buckets */
export type Buckets_Pk_Columns_Input = {
  id: Scalars['String']['input'];
};

/** select columns of table "storage.buckets" */
export enum Buckets_Select_Column {
  /** column name */
  CacheControl = 'cacheControl',
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  DownloadExpiration = 'downloadExpiration',
  /** column name */
  Id = 'id',
  /** column name */
  MaxUploadFileSize = 'maxUploadFileSize',
  /** column name */
  MinUploadFileSize = 'minUploadFileSize',
  /** column name */
  PresignedUrlsEnabled = 'presignedUrlsEnabled',
  /** column name */
  UpdatedAt = 'updatedAt'
}

/** input type for updating data in table "storage.buckets" */
export type Buckets_Set_Input = {
  cacheControl?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  downloadExpiration?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
  maxUploadFileSize?: InputMaybe<Scalars['Int']['input']>;
  minUploadFileSize?: InputMaybe<Scalars['Int']['input']>;
  presignedUrlsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate stddev on columns */
export type Buckets_Stddev_Fields = {
  __typename: 'buckets_stddev_fields';
  downloadExpiration?: Maybe<Scalars['Float']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Float']['output']>;
  minUploadFileSize?: Maybe<Scalars['Float']['output']>;
};

/** aggregate stddev_pop on columns */
export type Buckets_Stddev_Pop_Fields = {
  __typename: 'buckets_stddev_pop_fields';
  downloadExpiration?: Maybe<Scalars['Float']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Float']['output']>;
  minUploadFileSize?: Maybe<Scalars['Float']['output']>;
};

/** aggregate stddev_samp on columns */
export type Buckets_Stddev_Samp_Fields = {
  __typename: 'buckets_stddev_samp_fields';
  downloadExpiration?: Maybe<Scalars['Float']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Float']['output']>;
  minUploadFileSize?: Maybe<Scalars['Float']['output']>;
};

/** Streaming cursor of the table "buckets" */
export type Buckets_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Buckets_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Buckets_Stream_Cursor_Value_Input = {
  cacheControl?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  downloadExpiration?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
  maxUploadFileSize?: InputMaybe<Scalars['Int']['input']>;
  minUploadFileSize?: InputMaybe<Scalars['Int']['input']>;
  presignedUrlsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate sum on columns */
export type Buckets_Sum_Fields = {
  __typename: 'buckets_sum_fields';
  downloadExpiration?: Maybe<Scalars['Int']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Int']['output']>;
  minUploadFileSize?: Maybe<Scalars['Int']['output']>;
};

/** update columns of table "storage.buckets" */
export enum Buckets_Update_Column {
  /** column name */
  CacheControl = 'cacheControl',
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  DownloadExpiration = 'downloadExpiration',
  /** column name */
  Id = 'id',
  /** column name */
  MaxUploadFileSize = 'maxUploadFileSize',
  /** column name */
  MinUploadFileSize = 'minUploadFileSize',
  /** column name */
  PresignedUrlsEnabled = 'presignedUrlsEnabled',
  /** column name */
  UpdatedAt = 'updatedAt'
}

export type Buckets_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Buckets_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Buckets_Set_Input>;
  /** filter the rows which have to be updated */
  where: Buckets_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Buckets_Var_Pop_Fields = {
  __typename: 'buckets_var_pop_fields';
  downloadExpiration?: Maybe<Scalars['Float']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Float']['output']>;
  minUploadFileSize?: Maybe<Scalars['Float']['output']>;
};

/** aggregate var_samp on columns */
export type Buckets_Var_Samp_Fields = {
  __typename: 'buckets_var_samp_fields';
  downloadExpiration?: Maybe<Scalars['Float']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Float']['output']>;
  minUploadFileSize?: Maybe<Scalars['Float']['output']>;
};

/** aggregate variance on columns */
export type Buckets_Variance_Fields = {
  __typename: 'buckets_variance_fields';
  downloadExpiration?: Maybe<Scalars['Float']['output']>;
  maxUploadFileSize?: Maybe<Scalars['Float']['output']>;
  minUploadFileSize?: Maybe<Scalars['Float']['output']>;
};

/** Boolean expression to compare columns of type "bytea". All fields are combined with logical 'AND'. */
export type Bytea_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['bytea']['input']>;
  _gt?: InputMaybe<Scalars['bytea']['input']>;
  _gte?: InputMaybe<Scalars['bytea']['input']>;
  _in?: InputMaybe<Array<Scalars['bytea']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['bytea']['input']>;
  _lte?: InputMaybe<Scalars['bytea']['input']>;
  _neq?: InputMaybe<Scalars['bytea']['input']>;
  _nin?: InputMaybe<Array<Scalars['bytea']['input']>>;
};

/** columns and relationships of "cellar_user" */
export type Cellar_User = {
  __typename: 'cellar_user';
  /** An object relationship */
  cellar: Cellars;
  cellar_id: Scalars['uuid']['output'];
  id: Scalars['Int']['output'];
  /** An object relationship */
  user: Users;
  user_id: Scalars['uuid']['output'];
};

/** aggregated selection of "cellar_user" */
export type Cellar_User_Aggregate = {
  __typename: 'cellar_user_aggregate';
  aggregate?: Maybe<Cellar_User_Aggregate_Fields>;
  nodes: Array<Cellar_User>;
};

export type Cellar_User_Aggregate_Bool_Exp = {
  count?: InputMaybe<Cellar_User_Aggregate_Bool_Exp_Count>;
};

export type Cellar_User_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Cellar_User_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Cellar_User_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "cellar_user" */
export type Cellar_User_Aggregate_Fields = {
  __typename: 'cellar_user_aggregate_fields';
  avg?: Maybe<Cellar_User_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Cellar_User_Max_Fields>;
  min?: Maybe<Cellar_User_Min_Fields>;
  stddev?: Maybe<Cellar_User_Stddev_Fields>;
  stddev_pop?: Maybe<Cellar_User_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Cellar_User_Stddev_Samp_Fields>;
  sum?: Maybe<Cellar_User_Sum_Fields>;
  var_pop?: Maybe<Cellar_User_Var_Pop_Fields>;
  var_samp?: Maybe<Cellar_User_Var_Samp_Fields>;
  variance?: Maybe<Cellar_User_Variance_Fields>;
};


/** aggregate fields of "cellar_user" */
export type Cellar_User_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Cellar_User_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "cellar_user" */
export type Cellar_User_Aggregate_Order_By = {
  avg?: InputMaybe<Cellar_User_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Cellar_User_Max_Order_By>;
  min?: InputMaybe<Cellar_User_Min_Order_By>;
  stddev?: InputMaybe<Cellar_User_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Cellar_User_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Cellar_User_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Cellar_User_Sum_Order_By>;
  var_pop?: InputMaybe<Cellar_User_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Cellar_User_Var_Samp_Order_By>;
  variance?: InputMaybe<Cellar_User_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "cellar_user" */
export type Cellar_User_Arr_Rel_Insert_Input = {
  data: Array<Cellar_User_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Cellar_User_On_Conflict>;
};

/** aggregate avg on columns */
export type Cellar_User_Avg_Fields = {
  __typename: 'cellar_user_avg_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "cellar_user" */
export type Cellar_User_Avg_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "cellar_user". All fields are combined with a logical 'AND'. */
export type Cellar_User_Bool_Exp = {
  _and?: InputMaybe<Array<Cellar_User_Bool_Exp>>;
  _not?: InputMaybe<Cellar_User_Bool_Exp>;
  _or?: InputMaybe<Array<Cellar_User_Bool_Exp>>;
  cellar?: InputMaybe<Cellars_Bool_Exp>;
  cellar_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Int_Comparison_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  user_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "cellar_user" */
export enum Cellar_User_Constraint {
  /** unique or primary key constraint on columns "id" */
  CellarUserPkey = 'cellar_user_pkey'
}

/** input type for inserting data into table "cellar_user" */
export type Cellar_User_Insert_Input = {
  cellar?: InputMaybe<Cellars_Obj_Rel_Insert_Input>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Cellar_User_Max_Fields = {
  __typename: 'cellar_user_max_fields';
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "cellar_user" */
export type Cellar_User_Max_Order_By = {
  cellar_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Cellar_User_Min_Fields = {
  __typename: 'cellar_user_min_fields';
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "cellar_user" */
export type Cellar_User_Min_Order_By = {
  cellar_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "cellar_user" */
export type Cellar_User_Mutation_Response = {
  __typename: 'cellar_user_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Cellar_User>;
};

/** on_conflict condition type for table "cellar_user" */
export type Cellar_User_On_Conflict = {
  constraint: Cellar_User_Constraint;
  update_columns?: Array<Cellar_User_Update_Column>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};

/** Ordering options when selecting data from "cellar_user". */
export type Cellar_User_Order_By = {
  cellar?: InputMaybe<Cellars_Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  user?: InputMaybe<Users_Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: cellar_user */
export type Cellar_User_Pk_Columns_Input = {
  id: Scalars['Int']['input'];
};

/** select columns of table "cellar_user" */
export enum Cellar_User_Select_Column {
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  Id = 'id',
  /** column name */
  UserId = 'user_id'
}

/** input type for updating data in table "cellar_user" */
export type Cellar_User_Set_Input = {
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate stddev on columns */
export type Cellar_User_Stddev_Fields = {
  __typename: 'cellar_user_stddev_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "cellar_user" */
export type Cellar_User_Stddev_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Cellar_User_Stddev_Pop_Fields = {
  __typename: 'cellar_user_stddev_pop_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "cellar_user" */
export type Cellar_User_Stddev_Pop_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Cellar_User_Stddev_Samp_Fields = {
  __typename: 'cellar_user_stddev_samp_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "cellar_user" */
export type Cellar_User_Stddev_Samp_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "cellar_user" */
export type Cellar_User_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Cellar_User_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Cellar_User_Stream_Cursor_Value_Input = {
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate sum on columns */
export type Cellar_User_Sum_Fields = {
  __typename: 'cellar_user_sum_fields';
  id?: Maybe<Scalars['Int']['output']>;
};

/** order by sum() on columns of table "cellar_user" */
export type Cellar_User_Sum_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** update columns of table "cellar_user" */
export enum Cellar_User_Update_Column {
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  UserId = 'user_id'
}

export type Cellar_User_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Cellar_User_Set_Input>;
  /** filter the rows which have to be updated */
  where: Cellar_User_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Cellar_User_Var_Pop_Fields = {
  __typename: 'cellar_user_var_pop_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "cellar_user" */
export type Cellar_User_Var_Pop_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Cellar_User_Var_Samp_Fields = {
  __typename: 'cellar_user_var_samp_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "cellar_user" */
export type Cellar_User_Var_Samp_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Cellar_User_Variance_Fields = {
  __typename: 'cellar_user_variance_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "cellar_user" */
export type Cellar_User_Variance_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** columns and relationships of "cellars" */
export type Cellars = {
  __typename: 'cellars';
  /** An array relationship */
  beers: Array<Beers>;
  /** An aggregate relationship */
  beers_aggregate: Beers_Aggregate;
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by_id: Scalars['uuid']['output'];
  id: Scalars['uuid']['output'];
  is_public: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  /** An array relationship */
  spirits: Array<Spirits>;
  /** An aggregate relationship */
  spirits_aggregate: Spirits_Aggregate;
  updated_at: Scalars['timestamptz']['output'];
  /** An array relationship */
  users: Array<Cellar_User>;
  /** An aggregate relationship */
  users_aggregate: Cellar_User_Aggregate;
  /** An array relationship */
  wines: Array<Wines>;
  /** An aggregate relationship */
  wines_aggregate: Wines_Aggregate;
};


/** columns and relationships of "cellars" */
export type CellarsBeersArgs = {
  distinct_on?: InputMaybe<Array<Beers_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beers_Order_By>>;
  where?: InputMaybe<Beers_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsBeers_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Beers_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beers_Order_By>>;
  where?: InputMaybe<Beers_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsSpiritsArgs = {
  distinct_on?: InputMaybe<Array<Spirits_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirits_Order_By>>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsSpirits_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Spirits_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirits_Order_By>>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsUsersArgs = {
  distinct_on?: InputMaybe<Array<Cellar_User_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_User_Order_By>>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsUsers_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_User_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_User_Order_By>>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsWinesArgs = {
  distinct_on?: InputMaybe<Array<Wines_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wines_Order_By>>;
  where?: InputMaybe<Wines_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsWines_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Wines_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wines_Order_By>>;
  where?: InputMaybe<Wines_Bool_Exp>;
};

/** aggregated selection of "cellars" */
export type Cellars_Aggregate = {
  __typename: 'cellars_aggregate';
  aggregate?: Maybe<Cellars_Aggregate_Fields>;
  nodes: Array<Cellars>;
};

export type Cellars_Aggregate_Bool_Exp = {
  bool_and?: InputMaybe<Cellars_Aggregate_Bool_Exp_Bool_And>;
  bool_or?: InputMaybe<Cellars_Aggregate_Bool_Exp_Bool_Or>;
  count?: InputMaybe<Cellars_Aggregate_Bool_Exp_Count>;
};

export type Cellars_Aggregate_Bool_Exp_Bool_And = {
  arguments: Cellars_Select_Column_Cellars_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Cellars_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Cellars_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Cellars_Select_Column_Cellars_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Cellars_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Cellars_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Cellars_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Cellars_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "cellars" */
export type Cellars_Aggregate_Fields = {
  __typename: 'cellars_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Cellars_Max_Fields>;
  min?: Maybe<Cellars_Min_Fields>;
};


/** aggregate fields of "cellars" */
export type Cellars_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Cellars_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "cellars" */
export type Cellars_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Cellars_Max_Order_By>;
  min?: InputMaybe<Cellars_Min_Order_By>;
};

/** input type for inserting array relation for remote table "cellars" */
export type Cellars_Arr_Rel_Insert_Input = {
  data: Array<Cellars_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Cellars_On_Conflict>;
};

/** Boolean expression to filter rows from the table "cellars". All fields are combined with a logical 'AND'. */
export type Cellars_Bool_Exp = {
  _and?: InputMaybe<Array<Cellars_Bool_Exp>>;
  _not?: InputMaybe<Cellars_Bool_Exp>;
  _or?: InputMaybe<Array<Cellars_Bool_Exp>>;
  beers?: InputMaybe<Beers_Bool_Exp>;
  beers_aggregate?: InputMaybe<Beers_Aggregate_Bool_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  is_public?: InputMaybe<Boolean_Comparison_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  spirits?: InputMaybe<Spirits_Bool_Exp>;
  spirits_aggregate?: InputMaybe<Spirits_Aggregate_Bool_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  users?: InputMaybe<Cellar_User_Bool_Exp>;
  users_aggregate?: InputMaybe<Cellar_User_Aggregate_Bool_Exp>;
  wines?: InputMaybe<Wines_Bool_Exp>;
  wines_aggregate?: InputMaybe<Wines_Aggregate_Bool_Exp>;
};

/** unique or primary key constraints on table "cellars" */
export enum Cellars_Constraint {
  /** unique or primary key constraint on columns "id" */
  CellarsPkey = 'cellars_pkey'
}

/** input type for inserting data into table "cellars" */
export type Cellars_Insert_Input = {
  beers?: InputMaybe<Beers_Arr_Rel_Insert_Input>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  is_public?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  spirits?: InputMaybe<Spirits_Arr_Rel_Insert_Input>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  users?: InputMaybe<Cellar_User_Arr_Rel_Insert_Input>;
  wines?: InputMaybe<Wines_Arr_Rel_Insert_Input>;
};

/** aggregate max on columns */
export type Cellars_Max_Fields = {
  __typename: 'cellars_max_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by max() on columns of table "cellars" */
export type Cellars_Max_Order_By = {
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Cellars_Min_Fields = {
  __typename: 'cellars_min_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by min() on columns of table "cellars" */
export type Cellars_Min_Order_By = {
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "cellars" */
export type Cellars_Mutation_Response = {
  __typename: 'cellars_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Cellars>;
};

/** input type for inserting object relation for remote table "cellars" */
export type Cellars_Obj_Rel_Insert_Input = {
  data: Cellars_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Cellars_On_Conflict>;
};

/** on_conflict condition type for table "cellars" */
export type Cellars_On_Conflict = {
  constraint: Cellars_Constraint;
  update_columns?: Array<Cellars_Update_Column>;
  where?: InputMaybe<Cellars_Bool_Exp>;
};

/** Ordering options when selecting data from "cellars". */
export type Cellars_Order_By = {
  beers_aggregate?: InputMaybe<Beers_Aggregate_Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  is_public?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  spirits_aggregate?: InputMaybe<Spirits_Aggregate_Order_By>;
  updated_at?: InputMaybe<Order_By>;
  users_aggregate?: InputMaybe<Cellar_User_Aggregate_Order_By>;
  wines_aggregate?: InputMaybe<Wines_Aggregate_Order_By>;
};

/** primary key columns input for table: cellars */
export type Cellars_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "cellars" */
export enum Cellars_Select_Column {
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Id = 'id',
  /** column name */
  IsPublic = 'is_public',
  /** column name */
  Name = 'name',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** select "cellars_aggregate_bool_exp_bool_and_arguments_columns" columns of table "cellars" */
export enum Cellars_Select_Column_Cellars_Aggregate_Bool_Exp_Bool_And_Arguments_Columns {
  /** column name */
  IsPublic = 'is_public'
}

/** select "cellars_aggregate_bool_exp_bool_or_arguments_columns" columns of table "cellars" */
export enum Cellars_Select_Column_Cellars_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns {
  /** column name */
  IsPublic = 'is_public'
}

/** input type for updating data in table "cellars" */
export type Cellars_Set_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  is_public?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** Streaming cursor of the table "cellars" */
export type Cellars_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Cellars_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Cellars_Stream_Cursor_Value_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  is_public?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** update columns of table "cellars" */
export enum Cellars_Update_Column {
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Id = 'id',
  /** column name */
  IsPublic = 'is_public',
  /** column name */
  Name = 'name',
  /** column name */
  UpdatedAt = 'updated_at'
}

export type Cellars_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Cellars_Set_Input>;
  /** filter the rows which have to be updated */
  where: Cellars_Bool_Exp;
};

/** Boolean expression to compare columns of type "citext". All fields are combined with logical 'AND'. */
export type Citext_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['citext']['input']>;
  _gt?: InputMaybe<Scalars['citext']['input']>;
  _gte?: InputMaybe<Scalars['citext']['input']>;
  /** does the column match the given case-insensitive pattern */
  _ilike?: InputMaybe<Scalars['citext']['input']>;
  _in?: InputMaybe<Array<Scalars['citext']['input']>>;
  /** does the column match the given POSIX regular expression, case insensitive */
  _iregex?: InputMaybe<Scalars['citext']['input']>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  /** does the column match the given pattern */
  _like?: InputMaybe<Scalars['citext']['input']>;
  _lt?: InputMaybe<Scalars['citext']['input']>;
  _lte?: InputMaybe<Scalars['citext']['input']>;
  _neq?: InputMaybe<Scalars['citext']['input']>;
  /** does the column NOT match the given case-insensitive pattern */
  _nilike?: InputMaybe<Scalars['citext']['input']>;
  _nin?: InputMaybe<Array<Scalars['citext']['input']>>;
  /** does the column NOT match the given POSIX regular expression, case insensitive */
  _niregex?: InputMaybe<Scalars['citext']['input']>;
  /** does the column NOT match the given pattern */
  _nlike?: InputMaybe<Scalars['citext']['input']>;
  /** does the column NOT match the given POSIX regular expression, case sensitive */
  _nregex?: InputMaybe<Scalars['citext']['input']>;
  /** does the column NOT match the given SQL regular expression */
  _nsimilar?: InputMaybe<Scalars['citext']['input']>;
  /** does the column match the given POSIX regular expression, case sensitive */
  _regex?: InputMaybe<Scalars['citext']['input']>;
  /** does the column match the given SQL regular expression */
  _similar?: InputMaybe<Scalars['citext']['input']>;
};

/** ordering argument of a cursor */
export enum Cursor_Ordering {
  /** ascending ordering of the cursor */
  Asc = 'ASC',
  /** descending ordering of the cursor */
  Desc = 'DESC'
}

/** Boolean expression to compare columns of type "date". All fields are combined with logical 'AND'. */
export type Date_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['date']['input']>;
  _gt?: InputMaybe<Scalars['date']['input']>;
  _gte?: InputMaybe<Scalars['date']['input']>;
  _in?: InputMaybe<Array<Scalars['date']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['date']['input']>;
  _lte?: InputMaybe<Scalars['date']['input']>;
  _neq?: InputMaybe<Scalars['date']['input']>;
  _nin?: InputMaybe<Array<Scalars['date']['input']>>;
};

/** columns and relationships of "storage.files" */
export type Files = {
  __typename: 'files';
  /** An object relationship */
  bucket: Buckets;
  bucketId: Scalars['String']['output'];
  createdAt: Scalars['timestamptz']['output'];
  etag?: Maybe<Scalars['String']['output']>;
  id: Scalars['uuid']['output'];
  isUploaded?: Maybe<Scalars['Boolean']['output']>;
  metadata?: Maybe<Scalars['jsonb']['output']>;
  mimeType?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  size?: Maybe<Scalars['Int']['output']>;
  updatedAt: Scalars['timestamptz']['output'];
  uploadedByUserId?: Maybe<Scalars['uuid']['output']>;
};


/** columns and relationships of "storage.files" */
export type FilesMetadataArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};

/** aggregated selection of "storage.files" */
export type Files_Aggregate = {
  __typename: 'files_aggregate';
  aggregate?: Maybe<Files_Aggregate_Fields>;
  nodes: Array<Files>;
};

export type Files_Aggregate_Bool_Exp = {
  bool_and?: InputMaybe<Files_Aggregate_Bool_Exp_Bool_And>;
  bool_or?: InputMaybe<Files_Aggregate_Bool_Exp_Bool_Or>;
  count?: InputMaybe<Files_Aggregate_Bool_Exp_Count>;
};

export type Files_Aggregate_Bool_Exp_Bool_And = {
  arguments: Files_Select_Column_Files_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Files_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Files_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Files_Select_Column_Files_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Files_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Files_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Files_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Files_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "storage.files" */
export type Files_Aggregate_Fields = {
  __typename: 'files_aggregate_fields';
  avg?: Maybe<Files_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Files_Max_Fields>;
  min?: Maybe<Files_Min_Fields>;
  stddev?: Maybe<Files_Stddev_Fields>;
  stddev_pop?: Maybe<Files_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Files_Stddev_Samp_Fields>;
  sum?: Maybe<Files_Sum_Fields>;
  var_pop?: Maybe<Files_Var_Pop_Fields>;
  var_samp?: Maybe<Files_Var_Samp_Fields>;
  variance?: Maybe<Files_Variance_Fields>;
};


/** aggregate fields of "storage.files" */
export type Files_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Files_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "storage.files" */
export type Files_Aggregate_Order_By = {
  avg?: InputMaybe<Files_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Files_Max_Order_By>;
  min?: InputMaybe<Files_Min_Order_By>;
  stddev?: InputMaybe<Files_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Files_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Files_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Files_Sum_Order_By>;
  var_pop?: InputMaybe<Files_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Files_Var_Samp_Order_By>;
  variance?: InputMaybe<Files_Variance_Order_By>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type Files_Append_Input = {
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
};

/** input type for inserting array relation for remote table "storage.files" */
export type Files_Arr_Rel_Insert_Input = {
  data: Array<Files_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Files_On_Conflict>;
};

/** aggregate avg on columns */
export type Files_Avg_Fields = {
  __typename: 'files_avg_fields';
  size?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "storage.files" */
export type Files_Avg_Order_By = {
  size?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "storage.files". All fields are combined with a logical 'AND'. */
export type Files_Bool_Exp = {
  _and?: InputMaybe<Array<Files_Bool_Exp>>;
  _not?: InputMaybe<Files_Bool_Exp>;
  _or?: InputMaybe<Array<Files_Bool_Exp>>;
  bucket?: InputMaybe<Buckets_Bool_Exp>;
  bucketId?: InputMaybe<String_Comparison_Exp>;
  createdAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  etag?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  isUploaded?: InputMaybe<Boolean_Comparison_Exp>;
  metadata?: InputMaybe<Jsonb_Comparison_Exp>;
  mimeType?: InputMaybe<String_Comparison_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  size?: InputMaybe<Int_Comparison_Exp>;
  updatedAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  uploadedByUserId?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "storage.files" */
export enum Files_Constraint {
  /** unique or primary key constraint on columns "id" */
  FilesPkey = 'files_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type Files_Delete_At_Path_Input = {
  metadata?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type Files_Delete_Elem_Input = {
  metadata?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type Files_Delete_Key_Input = {
  metadata?: InputMaybe<Scalars['String']['input']>;
};

/** input type for incrementing numeric columns in table "storage.files" */
export type Files_Inc_Input = {
  size?: InputMaybe<Scalars['Int']['input']>;
};

/** input type for inserting data into table "storage.files" */
export type Files_Insert_Input = {
  bucket?: InputMaybe<Buckets_Obj_Rel_Insert_Input>;
  bucketId?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  etag?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  isUploaded?: InputMaybe<Scalars['Boolean']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  mimeType?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  uploadedByUserId?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Files_Max_Fields = {
  __typename: 'files_max_fields';
  bucketId?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  etag?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  mimeType?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  size?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
  uploadedByUserId?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "storage.files" */
export type Files_Max_Order_By = {
  bucketId?: InputMaybe<Order_By>;
  createdAt?: InputMaybe<Order_By>;
  etag?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  mimeType?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  size?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
  uploadedByUserId?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Files_Min_Fields = {
  __typename: 'files_min_fields';
  bucketId?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  etag?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  mimeType?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  size?: Maybe<Scalars['Int']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
  uploadedByUserId?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "storage.files" */
export type Files_Min_Order_By = {
  bucketId?: InputMaybe<Order_By>;
  createdAt?: InputMaybe<Order_By>;
  etag?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  mimeType?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  size?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
  uploadedByUserId?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "storage.files" */
export type Files_Mutation_Response = {
  __typename: 'files_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Files>;
};

/** input type for inserting object relation for remote table "storage.files" */
export type Files_Obj_Rel_Insert_Input = {
  data: Files_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Files_On_Conflict>;
};

/** on_conflict condition type for table "storage.files" */
export type Files_On_Conflict = {
  constraint: Files_Constraint;
  update_columns?: Array<Files_Update_Column>;
  where?: InputMaybe<Files_Bool_Exp>;
};

/** Ordering options when selecting data from "storage.files". */
export type Files_Order_By = {
  bucket?: InputMaybe<Buckets_Order_By>;
  bucketId?: InputMaybe<Order_By>;
  createdAt?: InputMaybe<Order_By>;
  etag?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  isUploaded?: InputMaybe<Order_By>;
  metadata?: InputMaybe<Order_By>;
  mimeType?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  size?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
  uploadedByUserId?: InputMaybe<Order_By>;
};

/** primary key columns input for table: storage.files */
export type Files_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type Files_Prepend_Input = {
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "storage.files" */
export enum Files_Select_Column {
  /** column name */
  BucketId = 'bucketId',
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  Etag = 'etag',
  /** column name */
  Id = 'id',
  /** column name */
  IsUploaded = 'isUploaded',
  /** column name */
  Metadata = 'metadata',
  /** column name */
  MimeType = 'mimeType',
  /** column name */
  Name = 'name',
  /** column name */
  Size = 'size',
  /** column name */
  UpdatedAt = 'updatedAt',
  /** column name */
  UploadedByUserId = 'uploadedByUserId'
}

/** select "files_aggregate_bool_exp_bool_and_arguments_columns" columns of table "storage.files" */
export enum Files_Select_Column_Files_Aggregate_Bool_Exp_Bool_And_Arguments_Columns {
  /** column name */
  IsUploaded = 'isUploaded'
}

/** select "files_aggregate_bool_exp_bool_or_arguments_columns" columns of table "storage.files" */
export enum Files_Select_Column_Files_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns {
  /** column name */
  IsUploaded = 'isUploaded'
}

/** input type for updating data in table "storage.files" */
export type Files_Set_Input = {
  bucketId?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  etag?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  isUploaded?: InputMaybe<Scalars['Boolean']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  mimeType?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  uploadedByUserId?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate stddev on columns */
export type Files_Stddev_Fields = {
  __typename: 'files_stddev_fields';
  size?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "storage.files" */
export type Files_Stddev_Order_By = {
  size?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Files_Stddev_Pop_Fields = {
  __typename: 'files_stddev_pop_fields';
  size?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "storage.files" */
export type Files_Stddev_Pop_Order_By = {
  size?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Files_Stddev_Samp_Fields = {
  __typename: 'files_stddev_samp_fields';
  size?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "storage.files" */
export type Files_Stddev_Samp_Order_By = {
  size?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "files" */
export type Files_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Files_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Files_Stream_Cursor_Value_Input = {
  bucketId?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  etag?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  isUploaded?: InputMaybe<Scalars['Boolean']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  mimeType?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  uploadedByUserId?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate sum on columns */
export type Files_Sum_Fields = {
  __typename: 'files_sum_fields';
  size?: Maybe<Scalars['Int']['output']>;
};

/** order by sum() on columns of table "storage.files" */
export type Files_Sum_Order_By = {
  size?: InputMaybe<Order_By>;
};

/** update columns of table "storage.files" */
export enum Files_Update_Column {
  /** column name */
  BucketId = 'bucketId',
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  Etag = 'etag',
  /** column name */
  Id = 'id',
  /** column name */
  IsUploaded = 'isUploaded',
  /** column name */
  Metadata = 'metadata',
  /** column name */
  MimeType = 'mimeType',
  /** column name */
  Name = 'name',
  /** column name */
  Size = 'size',
  /** column name */
  UpdatedAt = 'updatedAt',
  /** column name */
  UploadedByUserId = 'uploadedByUserId'
}

export type Files_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<Files_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<Files_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<Files_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<Files_Delete_Key_Input>;
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Files_Inc_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<Files_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Files_Set_Input>;
  /** filter the rows which have to be updated */
  where: Files_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Files_Var_Pop_Fields = {
  __typename: 'files_var_pop_fields';
  size?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "storage.files" */
export type Files_Var_Pop_Order_By = {
  size?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Files_Var_Samp_Fields = {
  __typename: 'files_var_samp_fields';
  size?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "storage.files" */
export type Files_Var_Samp_Order_By = {
  size?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Files_Variance_Fields = {
  __typename: 'files_variance_fields';
  size?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "storage.files" */
export type Files_Variance_Order_By = {
  size?: InputMaybe<Order_By>;
};

/** columns and relationships of "image_analysis" */
export type Image_Analysis = {
  __typename: 'image_analysis';
  created_at: Scalars['timestamptz']['output'];
  file_id: Scalars['uuid']['output'];
  id: Scalars['Int']['output'];
  /** An array relationship */
  textBlocks: Array<Image_Analysis_Text_Blocks>;
  /** An aggregate relationship */
  textBlocks_aggregate: Image_Analysis_Text_Blocks_Aggregate;
  text_extraction_status: Scalars['String']['output'];
  updated_at: Scalars['timestamptz']['output'];
};


/** columns and relationships of "image_analysis" */
export type Image_AnalysisTextBlocksArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Text_Blocks_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Text_Blocks_Order_By>>;
  where?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
};


/** columns and relationships of "image_analysis" */
export type Image_AnalysisTextBlocks_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Text_Blocks_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Text_Blocks_Order_By>>;
  where?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
};

/** aggregated selection of "image_analysis" */
export type Image_Analysis_Aggregate = {
  __typename: 'image_analysis_aggregate';
  aggregate?: Maybe<Image_Analysis_Aggregate_Fields>;
  nodes: Array<Image_Analysis>;
};

/** aggregate fields of "image_analysis" */
export type Image_Analysis_Aggregate_Fields = {
  __typename: 'image_analysis_aggregate_fields';
  avg?: Maybe<Image_Analysis_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Image_Analysis_Max_Fields>;
  min?: Maybe<Image_Analysis_Min_Fields>;
  stddev?: Maybe<Image_Analysis_Stddev_Fields>;
  stddev_pop?: Maybe<Image_Analysis_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Image_Analysis_Stddev_Samp_Fields>;
  sum?: Maybe<Image_Analysis_Sum_Fields>;
  var_pop?: Maybe<Image_Analysis_Var_Pop_Fields>;
  var_samp?: Maybe<Image_Analysis_Var_Samp_Fields>;
  variance?: Maybe<Image_Analysis_Variance_Fields>;
};


/** aggregate fields of "image_analysis" */
export type Image_Analysis_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Image_Analysis_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** aggregate avg on columns */
export type Image_Analysis_Avg_Fields = {
  __typename: 'image_analysis_avg_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** Boolean expression to filter rows from the table "image_analysis". All fields are combined with a logical 'AND'. */
export type Image_Analysis_Bool_Exp = {
  _and?: InputMaybe<Array<Image_Analysis_Bool_Exp>>;
  _not?: InputMaybe<Image_Analysis_Bool_Exp>;
  _or?: InputMaybe<Array<Image_Analysis_Bool_Exp>>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  file_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Int_Comparison_Exp>;
  textBlocks?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
  textBlocks_aggregate?: InputMaybe<Image_Analysis_Text_Blocks_Aggregate_Bool_Exp>;
  text_extraction_status?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "image_analysis" */
export enum Image_Analysis_Constraint {
  /** unique or primary key constraint on columns "id" */
  ImageAnalysisPkey = 'image_analysis_pkey'
}

/** input type for incrementing numeric columns in table "image_analysis" */
export type Image_Analysis_Inc_Input = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** input type for inserting data into table "image_analysis" */
export type Image_Analysis_Insert_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  file_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  textBlocks?: InputMaybe<Image_Analysis_Text_Blocks_Arr_Rel_Insert_Input>;
  text_extraction_status?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate max on columns */
export type Image_Analysis_Max_Fields = {
  __typename: 'image_analysis_max_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  file_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  text_extraction_status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** aggregate min on columns */
export type Image_Analysis_Min_Fields = {
  __typename: 'image_analysis_min_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  file_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  text_extraction_status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** response of any mutation on the table "image_analysis" */
export type Image_Analysis_Mutation_Response = {
  __typename: 'image_analysis_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Image_Analysis>;
};

/** on_conflict condition type for table "image_analysis" */
export type Image_Analysis_On_Conflict = {
  constraint: Image_Analysis_Constraint;
  update_columns?: Array<Image_Analysis_Update_Column>;
  where?: InputMaybe<Image_Analysis_Bool_Exp>;
};

/** Ordering options when selecting data from "image_analysis". */
export type Image_Analysis_Order_By = {
  created_at?: InputMaybe<Order_By>;
  file_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  textBlocks_aggregate?: InputMaybe<Image_Analysis_Text_Blocks_Aggregate_Order_By>;
  text_extraction_status?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** primary key columns input for table: image_analysis */
export type Image_Analysis_Pk_Columns_Input = {
  id: Scalars['Int']['input'];
};

/** select columns of table "image_analysis" */
export enum Image_Analysis_Select_Column {
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  FileId = 'file_id',
  /** column name */
  Id = 'id',
  /** column name */
  TextExtractionStatus = 'text_extraction_status',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** input type for updating data in table "image_analysis" */
export type Image_Analysis_Set_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  file_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  text_extraction_status?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate stddev on columns */
export type Image_Analysis_Stddev_Fields = {
  __typename: 'image_analysis_stddev_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** aggregate stddev_pop on columns */
export type Image_Analysis_Stddev_Pop_Fields = {
  __typename: 'image_analysis_stddev_pop_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** aggregate stddev_samp on columns */
export type Image_Analysis_Stddev_Samp_Fields = {
  __typename: 'image_analysis_stddev_samp_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** Streaming cursor of the table "image_analysis" */
export type Image_Analysis_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Image_Analysis_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Image_Analysis_Stream_Cursor_Value_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  file_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  text_extraction_status?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate sum on columns */
export type Image_Analysis_Sum_Fields = {
  __typename: 'image_analysis_sum_fields';
  id?: Maybe<Scalars['Int']['output']>;
};

/** columns and relationships of "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks = {
  __typename: 'image_analysis_text_blocks';
  bounding_box: Scalars['polygon']['output'];
  enhanced_text: Scalars['String']['output'];
  id: Scalars['Int']['output'];
  image_analysis_id: Scalars['Int']['output'];
  raw_text: Scalars['String']['output'];
};

/** aggregated selection of "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Aggregate = {
  __typename: 'image_analysis_text_blocks_aggregate';
  aggregate?: Maybe<Image_Analysis_Text_Blocks_Aggregate_Fields>;
  nodes: Array<Image_Analysis_Text_Blocks>;
};

export type Image_Analysis_Text_Blocks_Aggregate_Bool_Exp = {
  count?: InputMaybe<Image_Analysis_Text_Blocks_Aggregate_Bool_Exp_Count>;
};

export type Image_Analysis_Text_Blocks_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Image_Analysis_Text_Blocks_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Aggregate_Fields = {
  __typename: 'image_analysis_text_blocks_aggregate_fields';
  avg?: Maybe<Image_Analysis_Text_Blocks_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Image_Analysis_Text_Blocks_Max_Fields>;
  min?: Maybe<Image_Analysis_Text_Blocks_Min_Fields>;
  stddev?: Maybe<Image_Analysis_Text_Blocks_Stddev_Fields>;
  stddev_pop?: Maybe<Image_Analysis_Text_Blocks_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Image_Analysis_Text_Blocks_Stddev_Samp_Fields>;
  sum?: Maybe<Image_Analysis_Text_Blocks_Sum_Fields>;
  var_pop?: Maybe<Image_Analysis_Text_Blocks_Var_Pop_Fields>;
  var_samp?: Maybe<Image_Analysis_Text_Blocks_Var_Samp_Fields>;
  variance?: Maybe<Image_Analysis_Text_Blocks_Variance_Fields>;
};


/** aggregate fields of "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Image_Analysis_Text_Blocks_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Aggregate_Order_By = {
  avg?: InputMaybe<Image_Analysis_Text_Blocks_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Image_Analysis_Text_Blocks_Max_Order_By>;
  min?: InputMaybe<Image_Analysis_Text_Blocks_Min_Order_By>;
  stddev?: InputMaybe<Image_Analysis_Text_Blocks_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Image_Analysis_Text_Blocks_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Image_Analysis_Text_Blocks_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Image_Analysis_Text_Blocks_Sum_Order_By>;
  var_pop?: InputMaybe<Image_Analysis_Text_Blocks_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Image_Analysis_Text_Blocks_Var_Samp_Order_By>;
  variance?: InputMaybe<Image_Analysis_Text_Blocks_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Arr_Rel_Insert_Input = {
  data: Array<Image_Analysis_Text_Blocks_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Image_Analysis_Text_Blocks_On_Conflict>;
};

/** aggregate avg on columns */
export type Image_Analysis_Text_Blocks_Avg_Fields = {
  __typename: 'image_analysis_text_blocks_avg_fields';
  id?: Maybe<Scalars['Float']['output']>;
  image_analysis_id?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Avg_Order_By = {
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "image_analysis_text_blocks". All fields are combined with a logical 'AND'. */
export type Image_Analysis_Text_Blocks_Bool_Exp = {
  _and?: InputMaybe<Array<Image_Analysis_Text_Blocks_Bool_Exp>>;
  _not?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
  _or?: InputMaybe<Array<Image_Analysis_Text_Blocks_Bool_Exp>>;
  bounding_box?: InputMaybe<Polygon_Comparison_Exp>;
  enhanced_text?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Int_Comparison_Exp>;
  image_analysis_id?: InputMaybe<Int_Comparison_Exp>;
  raw_text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "image_analysis_text_blocks" */
export enum Image_Analysis_Text_Blocks_Constraint {
  /** unique or primary key constraint on columns "id" */
  ImageAnalysisTextBlocksPkey = 'image_analysis_text_blocks_pkey'
}

/** input type for incrementing numeric columns in table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Inc_Input = {
  id?: InputMaybe<Scalars['Int']['input']>;
  image_analysis_id?: InputMaybe<Scalars['Int']['input']>;
};

/** input type for inserting data into table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Insert_Input = {
  bounding_box?: InputMaybe<Scalars['polygon']['input']>;
  enhanced_text?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  image_analysis_id?: InputMaybe<Scalars['Int']['input']>;
  raw_text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Image_Analysis_Text_Blocks_Max_Fields = {
  __typename: 'image_analysis_text_blocks_max_fields';
  enhanced_text?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  image_analysis_id?: Maybe<Scalars['Int']['output']>;
  raw_text?: Maybe<Scalars['String']['output']>;
};

/** order by max() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Max_Order_By = {
  enhanced_text?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
  raw_text?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Image_Analysis_Text_Blocks_Min_Fields = {
  __typename: 'image_analysis_text_blocks_min_fields';
  enhanced_text?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  image_analysis_id?: Maybe<Scalars['Int']['output']>;
  raw_text?: Maybe<Scalars['String']['output']>;
};

/** order by min() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Min_Order_By = {
  enhanced_text?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
  raw_text?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Mutation_Response = {
  __typename: 'image_analysis_text_blocks_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Image_Analysis_Text_Blocks>;
};

/** on_conflict condition type for table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_On_Conflict = {
  constraint: Image_Analysis_Text_Blocks_Constraint;
  update_columns?: Array<Image_Analysis_Text_Blocks_Update_Column>;
  where?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
};

/** Ordering options when selecting data from "image_analysis_text_blocks". */
export type Image_Analysis_Text_Blocks_Order_By = {
  bounding_box?: InputMaybe<Order_By>;
  enhanced_text?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
  raw_text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: image_analysis_text_blocks */
export type Image_Analysis_Text_Blocks_Pk_Columns_Input = {
  id: Scalars['Int']['input'];
};

/** select columns of table "image_analysis_text_blocks" */
export enum Image_Analysis_Text_Blocks_Select_Column {
  /** column name */
  BoundingBox = 'bounding_box',
  /** column name */
  EnhancedText = 'enhanced_text',
  /** column name */
  Id = 'id',
  /** column name */
  ImageAnalysisId = 'image_analysis_id',
  /** column name */
  RawText = 'raw_text'
}

/** input type for updating data in table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Set_Input = {
  bounding_box?: InputMaybe<Scalars['polygon']['input']>;
  enhanced_text?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  image_analysis_id?: InputMaybe<Scalars['Int']['input']>;
  raw_text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate stddev on columns */
export type Image_Analysis_Text_Blocks_Stddev_Fields = {
  __typename: 'image_analysis_text_blocks_stddev_fields';
  id?: Maybe<Scalars['Float']['output']>;
  image_analysis_id?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Stddev_Order_By = {
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Image_Analysis_Text_Blocks_Stddev_Pop_Fields = {
  __typename: 'image_analysis_text_blocks_stddev_pop_fields';
  id?: Maybe<Scalars['Float']['output']>;
  image_analysis_id?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Stddev_Pop_Order_By = {
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Image_Analysis_Text_Blocks_Stddev_Samp_Fields = {
  __typename: 'image_analysis_text_blocks_stddev_samp_fields';
  id?: Maybe<Scalars['Float']['output']>;
  image_analysis_id?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Stddev_Samp_Order_By = {
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Image_Analysis_Text_Blocks_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Image_Analysis_Text_Blocks_Stream_Cursor_Value_Input = {
  bounding_box?: InputMaybe<Scalars['polygon']['input']>;
  enhanced_text?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  image_analysis_id?: InputMaybe<Scalars['Int']['input']>;
  raw_text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate sum on columns */
export type Image_Analysis_Text_Blocks_Sum_Fields = {
  __typename: 'image_analysis_text_blocks_sum_fields';
  id?: Maybe<Scalars['Int']['output']>;
  image_analysis_id?: Maybe<Scalars['Int']['output']>;
};

/** order by sum() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Sum_Order_By = {
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
};

/** update columns of table "image_analysis_text_blocks" */
export enum Image_Analysis_Text_Blocks_Update_Column {
  /** column name */
  BoundingBox = 'bounding_box',
  /** column name */
  EnhancedText = 'enhanced_text',
  /** column name */
  Id = 'id',
  /** column name */
  ImageAnalysisId = 'image_analysis_id',
  /** column name */
  RawText = 'raw_text'
}

export type Image_Analysis_Text_Blocks_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Image_Analysis_Text_Blocks_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Image_Analysis_Text_Blocks_Set_Input>;
  /** filter the rows which have to be updated */
  where: Image_Analysis_Text_Blocks_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Image_Analysis_Text_Blocks_Var_Pop_Fields = {
  __typename: 'image_analysis_text_blocks_var_pop_fields';
  id?: Maybe<Scalars['Float']['output']>;
  image_analysis_id?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Var_Pop_Order_By = {
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Image_Analysis_Text_Blocks_Var_Samp_Fields = {
  __typename: 'image_analysis_text_blocks_var_samp_fields';
  id?: Maybe<Scalars['Float']['output']>;
  image_analysis_id?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Var_Samp_Order_By = {
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Image_Analysis_Text_Blocks_Variance_Fields = {
  __typename: 'image_analysis_text_blocks_variance_fields';
  id?: Maybe<Scalars['Float']['output']>;
  image_analysis_id?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "image_analysis_text_blocks" */
export type Image_Analysis_Text_Blocks_Variance_Order_By = {
  id?: InputMaybe<Order_By>;
  image_analysis_id?: InputMaybe<Order_By>;
};

/** update columns of table "image_analysis" */
export enum Image_Analysis_Update_Column {
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  FileId = 'file_id',
  /** column name */
  Id = 'id',
  /** column name */
  TextExtractionStatus = 'text_extraction_status',
  /** column name */
  UpdatedAt = 'updated_at'
}

export type Image_Analysis_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Image_Analysis_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Image_Analysis_Set_Input>;
  /** filter the rows which have to be updated */
  where: Image_Analysis_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Image_Analysis_Var_Pop_Fields = {
  __typename: 'image_analysis_var_pop_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** aggregate var_samp on columns */
export type Image_Analysis_Var_Samp_Fields = {
  __typename: 'image_analysis_var_samp_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

/** aggregate variance on columns */
export type Image_Analysis_Variance_Fields = {
  __typename: 'image_analysis_variance_fields';
  id?: Maybe<Scalars['Float']['output']>;
};

export type Item_Defaults_Hint = {
  backLabelFileId?: InputMaybe<Scalars['uuid']['input']>;
  barcode?: InputMaybe<Scalars['String']['input']>;
  barcodeType?: InputMaybe<Scalars['String']['input']>;
  frontLabelFileId?: InputMaybe<Scalars['uuid']['input']>;
};

/** columns and relationships of "item_onboardings" */
export type Item_Onboardings = {
  __typename: 'item_onboardings';
  back_label_image_id?: Maybe<Scalars['uuid']['output']>;
  barcode?: Maybe<Scalars['String']['output']>;
  barcode_type?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['timestamptz']['output'];
  defaults?: Maybe<Scalars['jsonb']['output']>;
  front_label_image_id?: Maybe<Scalars['uuid']['output']>;
  id: Scalars['uuid']['output'];
  item_type: Scalars['String']['output'];
  raw_defaults?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  updated_at: Scalars['timestamptz']['output'];
  user_id: Scalars['uuid']['output'];
};


/** columns and relationships of "item_onboardings" */
export type Item_OnboardingsDefaultsArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};

/** aggregated selection of "item_onboardings" */
export type Item_Onboardings_Aggregate = {
  __typename: 'item_onboardings_aggregate';
  aggregate?: Maybe<Item_Onboardings_Aggregate_Fields>;
  nodes: Array<Item_Onboardings>;
};

/** aggregate fields of "item_onboardings" */
export type Item_Onboardings_Aggregate_Fields = {
  __typename: 'item_onboardings_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Item_Onboardings_Max_Fields>;
  min?: Maybe<Item_Onboardings_Min_Fields>;
};


/** aggregate fields of "item_onboardings" */
export type Item_Onboardings_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Item_Onboardings_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type Item_Onboardings_Append_Input = {
  defaults?: InputMaybe<Scalars['jsonb']['input']>;
};

/** Boolean expression to filter rows from the table "item_onboardings". All fields are combined with a logical 'AND'. */
export type Item_Onboardings_Bool_Exp = {
  _and?: InputMaybe<Array<Item_Onboardings_Bool_Exp>>;
  _not?: InputMaybe<Item_Onboardings_Bool_Exp>;
  _or?: InputMaybe<Array<Item_Onboardings_Bool_Exp>>;
  back_label_image_id?: InputMaybe<Uuid_Comparison_Exp>;
  barcode?: InputMaybe<String_Comparison_Exp>;
  barcode_type?: InputMaybe<String_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  defaults?: InputMaybe<Jsonb_Comparison_Exp>;
  front_label_image_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  item_type?: InputMaybe<String_Comparison_Exp>;
  raw_defaults?: InputMaybe<String_Comparison_Exp>;
  status?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  user_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "item_onboardings" */
export enum Item_Onboardings_Constraint {
  /** unique or primary key constraint on columns "id" */
  ItemOnboardingsPkey = 'item_onboardings_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type Item_Onboardings_Delete_At_Path_Input = {
  defaults?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type Item_Onboardings_Delete_Elem_Input = {
  defaults?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type Item_Onboardings_Delete_Key_Input = {
  defaults?: InputMaybe<Scalars['String']['input']>;
};

/** input type for inserting data into table "item_onboardings" */
export type Item_Onboardings_Insert_Input = {
  back_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  barcode?: InputMaybe<Scalars['String']['input']>;
  barcode_type?: InputMaybe<Scalars['String']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  defaults?: InputMaybe<Scalars['jsonb']['input']>;
  front_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_type?: InputMaybe<Scalars['String']['input']>;
  raw_defaults?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Item_Onboardings_Max_Fields = {
  __typename: 'item_onboardings_max_fields';
  back_label_image_id?: Maybe<Scalars['uuid']['output']>;
  barcode?: Maybe<Scalars['String']['output']>;
  barcode_type?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  front_label_image_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  item_type?: Maybe<Scalars['String']['output']>;
  raw_defaults?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** aggregate min on columns */
export type Item_Onboardings_Min_Fields = {
  __typename: 'item_onboardings_min_fields';
  back_label_image_id?: Maybe<Scalars['uuid']['output']>;
  barcode?: Maybe<Scalars['String']['output']>;
  barcode_type?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  front_label_image_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  item_type?: Maybe<Scalars['String']['output']>;
  raw_defaults?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** response of any mutation on the table "item_onboardings" */
export type Item_Onboardings_Mutation_Response = {
  __typename: 'item_onboardings_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Item_Onboardings>;
};

/** on_conflict condition type for table "item_onboardings" */
export type Item_Onboardings_On_Conflict = {
  constraint: Item_Onboardings_Constraint;
  update_columns?: Array<Item_Onboardings_Update_Column>;
  where?: InputMaybe<Item_Onboardings_Bool_Exp>;
};

/** Ordering options when selecting data from "item_onboardings". */
export type Item_Onboardings_Order_By = {
  back_label_image_id?: InputMaybe<Order_By>;
  barcode?: InputMaybe<Order_By>;
  barcode_type?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  defaults?: InputMaybe<Order_By>;
  front_label_image_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_type?: InputMaybe<Order_By>;
  raw_defaults?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: item_onboardings */
export type Item_Onboardings_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type Item_Onboardings_Prepend_Input = {
  defaults?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "item_onboardings" */
export enum Item_Onboardings_Select_Column {
  /** column name */
  BackLabelImageId = 'back_label_image_id',
  /** column name */
  Barcode = 'barcode',
  /** column name */
  BarcodeType = 'barcode_type',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Defaults = 'defaults',
  /** column name */
  FrontLabelImageId = 'front_label_image_id',
  /** column name */
  Id = 'id',
  /** column name */
  ItemType = 'item_type',
  /** column name */
  RawDefaults = 'raw_defaults',
  /** column name */
  Status = 'status',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id'
}

/** input type for updating data in table "item_onboardings" */
export type Item_Onboardings_Set_Input = {
  back_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  barcode?: InputMaybe<Scalars['String']['input']>;
  barcode_type?: InputMaybe<Scalars['String']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  defaults?: InputMaybe<Scalars['jsonb']['input']>;
  front_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_type?: InputMaybe<Scalars['String']['input']>;
  raw_defaults?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "item_onboardings" */
export type Item_Onboardings_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Item_Onboardings_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Item_Onboardings_Stream_Cursor_Value_Input = {
  back_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  barcode?: InputMaybe<Scalars['String']['input']>;
  barcode_type?: InputMaybe<Scalars['String']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  defaults?: InputMaybe<Scalars['jsonb']['input']>;
  front_label_image_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_type?: InputMaybe<Scalars['String']['input']>;
  raw_defaults?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "item_onboardings" */
export enum Item_Onboardings_Update_Column {
  /** column name */
  BackLabelImageId = 'back_label_image_id',
  /** column name */
  Barcode = 'barcode',
  /** column name */
  BarcodeType = 'barcode_type',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Defaults = 'defaults',
  /** column name */
  FrontLabelImageId = 'front_label_image_id',
  /** column name */
  Id = 'id',
  /** column name */
  ItemType = 'item_type',
  /** column name */
  RawDefaults = 'raw_defaults',
  /** column name */
  Status = 'status',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id'
}

export type Item_Onboardings_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<Item_Onboardings_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<Item_Onboardings_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<Item_Onboardings_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<Item_Onboardings_Delete_Key_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<Item_Onboardings_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Item_Onboardings_Set_Input>;
  /** filter the rows which have to be updated */
  where: Item_Onboardings_Bool_Exp;
};

export type Jsonb_Cast_Exp = {
  String?: InputMaybe<String_Comparison_Exp>;
};

/** Boolean expression to compare columns of type "jsonb". All fields are combined with logical 'AND'. */
export type Jsonb_Comparison_Exp = {
  _cast?: InputMaybe<Jsonb_Cast_Exp>;
  /** is the column contained in the given json value */
  _contained_in?: InputMaybe<Scalars['jsonb']['input']>;
  /** does the column contain the given json value at the top level */
  _contains?: InputMaybe<Scalars['jsonb']['input']>;
  _eq?: InputMaybe<Scalars['jsonb']['input']>;
  _gt?: InputMaybe<Scalars['jsonb']['input']>;
  _gte?: InputMaybe<Scalars['jsonb']['input']>;
  /** does the string exist as a top-level key in the column */
  _has_key?: InputMaybe<Scalars['String']['input']>;
  /** do all of these strings exist as top-level keys in the column */
  _has_keys_all?: InputMaybe<Array<Scalars['String']['input']>>;
  /** do any of these strings exist as top-level keys in the column */
  _has_keys_any?: InputMaybe<Array<Scalars['String']['input']>>;
  _in?: InputMaybe<Array<Scalars['jsonb']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['jsonb']['input']>;
  _lte?: InputMaybe<Scalars['jsonb']['input']>;
  _neq?: InputMaybe<Scalars['jsonb']['input']>;
  _nin?: InputMaybe<Array<Scalars['jsonb']['input']>>;
};

/** Boolean expression to compare columns of type "money". All fields are combined with logical 'AND'. */
export type Money_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['money']['input']>;
  _gt?: InputMaybe<Scalars['money']['input']>;
  _gte?: InputMaybe<Scalars['money']['input']>;
  _in?: InputMaybe<Array<Scalars['money']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['money']['input']>;
  _lte?: InputMaybe<Scalars['money']['input']>;
  _neq?: InputMaybe<Scalars['money']['input']>;
  _nin?: InputMaybe<Array<Scalars['money']['input']>>;
};

/** mutation root */
export type Mutation_Root = {
  __typename: 'mutation_root';
  /** delete single row from the table: "auth.providers" */
  deleteAuthProvider?: Maybe<AuthProviders>;
  /** delete single row from the table: "auth.provider_requests" */
  deleteAuthProviderRequest?: Maybe<AuthProviderRequests>;
  /** delete data from the table: "auth.provider_requests" */
  deleteAuthProviderRequests?: Maybe<AuthProviderRequests_Mutation_Response>;
  /** delete data from the table: "auth.providers" */
  deleteAuthProviders?: Maybe<AuthProviders_Mutation_Response>;
  /** delete single row from the table: "auth.refresh_tokens" */
  deleteAuthRefreshToken?: Maybe<AuthRefreshTokens>;
  /** delete single row from the table: "auth.refresh_token_types" */
  deleteAuthRefreshTokenType?: Maybe<AuthRefreshTokenTypes>;
  /** delete data from the table: "auth.refresh_token_types" */
  deleteAuthRefreshTokenTypes?: Maybe<AuthRefreshTokenTypes_Mutation_Response>;
  /** delete data from the table: "auth.refresh_tokens" */
  deleteAuthRefreshTokens?: Maybe<AuthRefreshTokens_Mutation_Response>;
  /** delete single row from the table: "auth.roles" */
  deleteAuthRole?: Maybe<AuthRoles>;
  /** delete data from the table: "auth.roles" */
  deleteAuthRoles?: Maybe<AuthRoles_Mutation_Response>;
  /** delete single row from the table: "auth.user_providers" */
  deleteAuthUserProvider?: Maybe<AuthUserProviders>;
  /** delete data from the table: "auth.user_providers" */
  deleteAuthUserProviders?: Maybe<AuthUserProviders_Mutation_Response>;
  /** delete single row from the table: "auth.user_roles" */
  deleteAuthUserRole?: Maybe<AuthUserRoles>;
  /** delete data from the table: "auth.user_roles" */
  deleteAuthUserRoles?: Maybe<AuthUserRoles_Mutation_Response>;
  /** delete single row from the table: "auth.user_security_keys" */
  deleteAuthUserSecurityKey?: Maybe<AuthUserSecurityKeys>;
  /** delete data from the table: "auth.user_security_keys" */
  deleteAuthUserSecurityKeys?: Maybe<AuthUserSecurityKeys_Mutation_Response>;
  /** delete single row from the table: "storage.buckets" */
  deleteBucket?: Maybe<Buckets>;
  /** delete data from the table: "storage.buckets" */
  deleteBuckets?: Maybe<Buckets_Mutation_Response>;
  /** delete single row from the table: "storage.files" */
  deleteFile?: Maybe<Files>;
  /** delete data from the table: "storage.files" */
  deleteFiles?: Maybe<Files_Mutation_Response>;
  /** delete single row from the table: "auth.users" */
  deleteUser?: Maybe<Users>;
  /** delete data from the table: "auth.users" */
  deleteUsers?: Maybe<Users_Mutation_Response>;
  /** delete single row from the table: "storage.virus" */
  deleteVirus?: Maybe<Virus>;
  /** delete data from the table: "storage.virus" */
  deleteViruses?: Maybe<Virus_Mutation_Response>;
  /** delete data from the table: "barcodes" */
  delete_barcodes?: Maybe<Barcodes_Mutation_Response>;
  /** delete single row from the table: "barcodes" */
  delete_barcodes_by_pk?: Maybe<Barcodes>;
  /** delete data from the table: "beers" */
  delete_beers?: Maybe<Beers_Mutation_Response>;
  /** delete single row from the table: "beers" */
  delete_beers_by_pk?: Maybe<Beers>;
  /** delete data from the table: "cellar_user" */
  delete_cellar_user?: Maybe<Cellar_User_Mutation_Response>;
  /** delete single row from the table: "cellar_user" */
  delete_cellar_user_by_pk?: Maybe<Cellar_User>;
  /** delete data from the table: "cellars" */
  delete_cellars?: Maybe<Cellars_Mutation_Response>;
  /** delete single row from the table: "cellars" */
  delete_cellars_by_pk?: Maybe<Cellars>;
  /** delete data from the table: "image_analysis" */
  delete_image_analysis?: Maybe<Image_Analysis_Mutation_Response>;
  /** delete single row from the table: "image_analysis" */
  delete_image_analysis_by_pk?: Maybe<Image_Analysis>;
  /** delete data from the table: "image_analysis_text_blocks" */
  delete_image_analysis_text_blocks?: Maybe<Image_Analysis_Text_Blocks_Mutation_Response>;
  /** delete single row from the table: "image_analysis_text_blocks" */
  delete_image_analysis_text_blocks_by_pk?: Maybe<Image_Analysis_Text_Blocks>;
  /** delete data from the table: "item_onboardings" */
  delete_item_onboardings?: Maybe<Item_Onboardings_Mutation_Response>;
  /** delete single row from the table: "item_onboardings" */
  delete_item_onboardings_by_pk?: Maybe<Item_Onboardings>;
  /** delete data from the table: "spirit_type" */
  delete_spirit_type?: Maybe<Spirit_Type_Mutation_Response>;
  /** delete single row from the table: "spirit_type" */
  delete_spirit_type_by_pk?: Maybe<Spirit_Type>;
  /** delete data from the table: "spirits" */
  delete_spirits?: Maybe<Spirits_Mutation_Response>;
  /** delete single row from the table: "spirits" */
  delete_spirits_by_pk?: Maybe<Spirits>;
  /** delete data from the table: "wines" */
  delete_wines?: Maybe<Wines_Mutation_Response>;
  /** delete single row from the table: "wines" */
  delete_wines_by_pk?: Maybe<Wines>;
  /** insert a single row into the table: "auth.providers" */
  insertAuthProvider?: Maybe<AuthProviders>;
  /** insert a single row into the table: "auth.provider_requests" */
  insertAuthProviderRequest?: Maybe<AuthProviderRequests>;
  /** insert data into the table: "auth.provider_requests" */
  insertAuthProviderRequests?: Maybe<AuthProviderRequests_Mutation_Response>;
  /** insert data into the table: "auth.providers" */
  insertAuthProviders?: Maybe<AuthProviders_Mutation_Response>;
  /** insert a single row into the table: "auth.refresh_tokens" */
  insertAuthRefreshToken?: Maybe<AuthRefreshTokens>;
  /** insert a single row into the table: "auth.refresh_token_types" */
  insertAuthRefreshTokenType?: Maybe<AuthRefreshTokenTypes>;
  /** insert data into the table: "auth.refresh_token_types" */
  insertAuthRefreshTokenTypes?: Maybe<AuthRefreshTokenTypes_Mutation_Response>;
  /** insert data into the table: "auth.refresh_tokens" */
  insertAuthRefreshTokens?: Maybe<AuthRefreshTokens_Mutation_Response>;
  /** insert a single row into the table: "auth.roles" */
  insertAuthRole?: Maybe<AuthRoles>;
  /** insert data into the table: "auth.roles" */
  insertAuthRoles?: Maybe<AuthRoles_Mutation_Response>;
  /** insert a single row into the table: "auth.user_providers" */
  insertAuthUserProvider?: Maybe<AuthUserProviders>;
  /** insert data into the table: "auth.user_providers" */
  insertAuthUserProviders?: Maybe<AuthUserProviders_Mutation_Response>;
  /** insert a single row into the table: "auth.user_roles" */
  insertAuthUserRole?: Maybe<AuthUserRoles>;
  /** insert data into the table: "auth.user_roles" */
  insertAuthUserRoles?: Maybe<AuthUserRoles_Mutation_Response>;
  /** insert a single row into the table: "auth.user_security_keys" */
  insertAuthUserSecurityKey?: Maybe<AuthUserSecurityKeys>;
  /** insert data into the table: "auth.user_security_keys" */
  insertAuthUserSecurityKeys?: Maybe<AuthUserSecurityKeys_Mutation_Response>;
  /** insert a single row into the table: "storage.buckets" */
  insertBucket?: Maybe<Buckets>;
  /** insert data into the table: "storage.buckets" */
  insertBuckets?: Maybe<Buckets_Mutation_Response>;
  /** insert a single row into the table: "storage.files" */
  insertFile?: Maybe<Files>;
  /** insert data into the table: "storage.files" */
  insertFiles?: Maybe<Files_Mutation_Response>;
  /** insert a single row into the table: "auth.users" */
  insertUser?: Maybe<Users>;
  /** insert data into the table: "auth.users" */
  insertUsers?: Maybe<Users_Mutation_Response>;
  /** insert a single row into the table: "storage.virus" */
  insertVirus?: Maybe<Virus>;
  /** insert data into the table: "storage.virus" */
  insertViruses?: Maybe<Virus_Mutation_Response>;
  /** insert data into the table: "barcodes" */
  insert_barcodes?: Maybe<Barcodes_Mutation_Response>;
  /** insert a single row into the table: "barcodes" */
  insert_barcodes_one?: Maybe<Barcodes>;
  /** insert data into the table: "beers" */
  insert_beers?: Maybe<Beers_Mutation_Response>;
  /** insert a single row into the table: "beers" */
  insert_beers_one?: Maybe<Beers>;
  /** insert data into the table: "cellar_user" */
  insert_cellar_user?: Maybe<Cellar_User_Mutation_Response>;
  /** insert a single row into the table: "cellar_user" */
  insert_cellar_user_one?: Maybe<Cellar_User>;
  /** insert data into the table: "cellars" */
  insert_cellars?: Maybe<Cellars_Mutation_Response>;
  /** insert a single row into the table: "cellars" */
  insert_cellars_one?: Maybe<Cellars>;
  /** insert data into the table: "image_analysis" */
  insert_image_analysis?: Maybe<Image_Analysis_Mutation_Response>;
  /** insert a single row into the table: "image_analysis" */
  insert_image_analysis_one?: Maybe<Image_Analysis>;
  /** insert data into the table: "image_analysis_text_blocks" */
  insert_image_analysis_text_blocks?: Maybe<Image_Analysis_Text_Blocks_Mutation_Response>;
  /** insert a single row into the table: "image_analysis_text_blocks" */
  insert_image_analysis_text_blocks_one?: Maybe<Image_Analysis_Text_Blocks>;
  /** insert data into the table: "item_onboardings" */
  insert_item_onboardings?: Maybe<Item_Onboardings_Mutation_Response>;
  /** insert a single row into the table: "item_onboardings" */
  insert_item_onboardings_one?: Maybe<Item_Onboardings>;
  /** insert data into the table: "spirit_type" */
  insert_spirit_type?: Maybe<Spirit_Type_Mutation_Response>;
  /** insert a single row into the table: "spirit_type" */
  insert_spirit_type_one?: Maybe<Spirit_Type>;
  /** insert data into the table: "spirits" */
  insert_spirits?: Maybe<Spirits_Mutation_Response>;
  /** insert a single row into the table: "spirits" */
  insert_spirits_one?: Maybe<Spirits>;
  /** insert data into the table: "wines" */
  insert_wines?: Maybe<Wines_Mutation_Response>;
  /** insert a single row into the table: "wines" */
  insert_wines_one?: Maybe<Wines>;
  /** update single row of the table: "auth.providers" */
  updateAuthProvider?: Maybe<AuthProviders>;
  /** update single row of the table: "auth.provider_requests" */
  updateAuthProviderRequest?: Maybe<AuthProviderRequests>;
  /** update data of the table: "auth.provider_requests" */
  updateAuthProviderRequests?: Maybe<AuthProviderRequests_Mutation_Response>;
  /** update data of the table: "auth.providers" */
  updateAuthProviders?: Maybe<AuthProviders_Mutation_Response>;
  /** update single row of the table: "auth.refresh_tokens" */
  updateAuthRefreshToken?: Maybe<AuthRefreshTokens>;
  /** update single row of the table: "auth.refresh_token_types" */
  updateAuthRefreshTokenType?: Maybe<AuthRefreshTokenTypes>;
  /** update data of the table: "auth.refresh_token_types" */
  updateAuthRefreshTokenTypes?: Maybe<AuthRefreshTokenTypes_Mutation_Response>;
  /** update data of the table: "auth.refresh_tokens" */
  updateAuthRefreshTokens?: Maybe<AuthRefreshTokens_Mutation_Response>;
  /** update single row of the table: "auth.roles" */
  updateAuthRole?: Maybe<AuthRoles>;
  /** update data of the table: "auth.roles" */
  updateAuthRoles?: Maybe<AuthRoles_Mutation_Response>;
  /** update single row of the table: "auth.user_providers" */
  updateAuthUserProvider?: Maybe<AuthUserProviders>;
  /** update data of the table: "auth.user_providers" */
  updateAuthUserProviders?: Maybe<AuthUserProviders_Mutation_Response>;
  /** update single row of the table: "auth.user_roles" */
  updateAuthUserRole?: Maybe<AuthUserRoles>;
  /** update data of the table: "auth.user_roles" */
  updateAuthUserRoles?: Maybe<AuthUserRoles_Mutation_Response>;
  /** update single row of the table: "auth.user_security_keys" */
  updateAuthUserSecurityKey?: Maybe<AuthUserSecurityKeys>;
  /** update data of the table: "auth.user_security_keys" */
  updateAuthUserSecurityKeys?: Maybe<AuthUserSecurityKeys_Mutation_Response>;
  /** update single row of the table: "storage.buckets" */
  updateBucket?: Maybe<Buckets>;
  /** update data of the table: "storage.buckets" */
  updateBuckets?: Maybe<Buckets_Mutation_Response>;
  /** update single row of the table: "storage.files" */
  updateFile?: Maybe<Files>;
  /** update data of the table: "storage.files" */
  updateFiles?: Maybe<Files_Mutation_Response>;
  /** update single row of the table: "auth.users" */
  updateUser?: Maybe<Users>;
  /** update data of the table: "auth.users" */
  updateUsers?: Maybe<Users_Mutation_Response>;
  /** update single row of the table: "storage.virus" */
  updateVirus?: Maybe<Virus>;
  /** update data of the table: "storage.virus" */
  updateViruses?: Maybe<Virus_Mutation_Response>;
  /** update multiples rows of table: "auth.provider_requests" */
  update_authProviderRequests_many?: Maybe<Array<Maybe<AuthProviderRequests_Mutation_Response>>>;
  /** update multiples rows of table: "auth.providers" */
  update_authProviders_many?: Maybe<Array<Maybe<AuthProviders_Mutation_Response>>>;
  /** update multiples rows of table: "auth.refresh_token_types" */
  update_authRefreshTokenTypes_many?: Maybe<Array<Maybe<AuthRefreshTokenTypes_Mutation_Response>>>;
  /** update multiples rows of table: "auth.refresh_tokens" */
  update_authRefreshTokens_many?: Maybe<Array<Maybe<AuthRefreshTokens_Mutation_Response>>>;
  /** update multiples rows of table: "auth.roles" */
  update_authRoles_many?: Maybe<Array<Maybe<AuthRoles_Mutation_Response>>>;
  /** update multiples rows of table: "auth.user_providers" */
  update_authUserProviders_many?: Maybe<Array<Maybe<AuthUserProviders_Mutation_Response>>>;
  /** update multiples rows of table: "auth.user_roles" */
  update_authUserRoles_many?: Maybe<Array<Maybe<AuthUserRoles_Mutation_Response>>>;
  /** update multiples rows of table: "auth.user_security_keys" */
  update_authUserSecurityKeys_many?: Maybe<Array<Maybe<AuthUserSecurityKeys_Mutation_Response>>>;
  /** update data of the table: "barcodes" */
  update_barcodes?: Maybe<Barcodes_Mutation_Response>;
  /** update single row of the table: "barcodes" */
  update_barcodes_by_pk?: Maybe<Barcodes>;
  /** update multiples rows of table: "barcodes" */
  update_barcodes_many?: Maybe<Array<Maybe<Barcodes_Mutation_Response>>>;
  /** update data of the table: "beers" */
  update_beers?: Maybe<Beers_Mutation_Response>;
  /** update single row of the table: "beers" */
  update_beers_by_pk?: Maybe<Beers>;
  /** update multiples rows of table: "beers" */
  update_beers_many?: Maybe<Array<Maybe<Beers_Mutation_Response>>>;
  /** update multiples rows of table: "storage.buckets" */
  update_buckets_many?: Maybe<Array<Maybe<Buckets_Mutation_Response>>>;
  /** update data of the table: "cellar_user" */
  update_cellar_user?: Maybe<Cellar_User_Mutation_Response>;
  /** update single row of the table: "cellar_user" */
  update_cellar_user_by_pk?: Maybe<Cellar_User>;
  /** update multiples rows of table: "cellar_user" */
  update_cellar_user_many?: Maybe<Array<Maybe<Cellar_User_Mutation_Response>>>;
  /** update data of the table: "cellars" */
  update_cellars?: Maybe<Cellars_Mutation_Response>;
  /** update single row of the table: "cellars" */
  update_cellars_by_pk?: Maybe<Cellars>;
  /** update multiples rows of table: "cellars" */
  update_cellars_many?: Maybe<Array<Maybe<Cellars_Mutation_Response>>>;
  /** update multiples rows of table: "storage.files" */
  update_files_many?: Maybe<Array<Maybe<Files_Mutation_Response>>>;
  /** update data of the table: "image_analysis" */
  update_image_analysis?: Maybe<Image_Analysis_Mutation_Response>;
  /** update single row of the table: "image_analysis" */
  update_image_analysis_by_pk?: Maybe<Image_Analysis>;
  /** update multiples rows of table: "image_analysis" */
  update_image_analysis_many?: Maybe<Array<Maybe<Image_Analysis_Mutation_Response>>>;
  /** update data of the table: "image_analysis_text_blocks" */
  update_image_analysis_text_blocks?: Maybe<Image_Analysis_Text_Blocks_Mutation_Response>;
  /** update single row of the table: "image_analysis_text_blocks" */
  update_image_analysis_text_blocks_by_pk?: Maybe<Image_Analysis_Text_Blocks>;
  /** update multiples rows of table: "image_analysis_text_blocks" */
  update_image_analysis_text_blocks_many?: Maybe<Array<Maybe<Image_Analysis_Text_Blocks_Mutation_Response>>>;
  /** update data of the table: "item_onboardings" */
  update_item_onboardings?: Maybe<Item_Onboardings_Mutation_Response>;
  /** update single row of the table: "item_onboardings" */
  update_item_onboardings_by_pk?: Maybe<Item_Onboardings>;
  /** update multiples rows of table: "item_onboardings" */
  update_item_onboardings_many?: Maybe<Array<Maybe<Item_Onboardings_Mutation_Response>>>;
  /** update data of the table: "spirit_type" */
  update_spirit_type?: Maybe<Spirit_Type_Mutation_Response>;
  /** update single row of the table: "spirit_type" */
  update_spirit_type_by_pk?: Maybe<Spirit_Type>;
  /** update multiples rows of table: "spirit_type" */
  update_spirit_type_many?: Maybe<Array<Maybe<Spirit_Type_Mutation_Response>>>;
  /** update data of the table: "spirits" */
  update_spirits?: Maybe<Spirits_Mutation_Response>;
  /** update single row of the table: "spirits" */
  update_spirits_by_pk?: Maybe<Spirits>;
  /** update multiples rows of table: "spirits" */
  update_spirits_many?: Maybe<Array<Maybe<Spirits_Mutation_Response>>>;
  /** update multiples rows of table: "auth.users" */
  update_users_many?: Maybe<Array<Maybe<Users_Mutation_Response>>>;
  /** update multiples rows of table: "storage.virus" */
  update_virus_many?: Maybe<Array<Maybe<Virus_Mutation_Response>>>;
  /** update data of the table: "wines" */
  update_wines?: Maybe<Wines_Mutation_Response>;
  /** update single row of the table: "wines" */
  update_wines_by_pk?: Maybe<Wines>;
  /** update multiples rows of table: "wines" */
  update_wines_many?: Maybe<Array<Maybe<Wines_Mutation_Response>>>;
};


/** mutation root */
export type Mutation_RootDeleteAuthProviderArgs = {
  id: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDeleteAuthProviderRequestArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDeleteAuthProviderRequestsArgs = {
  where: AuthProviderRequests_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteAuthProvidersArgs = {
  where: AuthProviders_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteAuthRefreshTokenArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDeleteAuthRefreshTokenTypeArgs = {
  value: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDeleteAuthRefreshTokenTypesArgs = {
  where: AuthRefreshTokenTypes_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteAuthRefreshTokensArgs = {
  where: AuthRefreshTokens_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteAuthRoleArgs = {
  role: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDeleteAuthRolesArgs = {
  where: AuthRoles_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteAuthUserProviderArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDeleteAuthUserProvidersArgs = {
  where: AuthUserProviders_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteAuthUserRoleArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDeleteAuthUserRolesArgs = {
  where: AuthUserRoles_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteAuthUserSecurityKeyArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDeleteAuthUserSecurityKeysArgs = {
  where: AuthUserSecurityKeys_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteBucketArgs = {
  id: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDeleteBucketsArgs = {
  where: Buckets_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteFileArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDeleteFilesArgs = {
  where: Files_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteUserArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDeleteUsersArgs = {
  where: Users_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDeleteVirusArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDeleteVirusesArgs = {
  where: Virus_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_BarcodesArgs = {
  where: Barcodes_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Barcodes_By_PkArgs = {
  code: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_BeersArgs = {
  where: Beers_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Beers_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Cellar_UserArgs = {
  where: Cellar_User_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Cellar_User_By_PkArgs = {
  id: Scalars['Int']['input'];
};


/** mutation root */
export type Mutation_RootDelete_CellarsArgs = {
  where: Cellars_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Cellars_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Image_AnalysisArgs = {
  where: Image_Analysis_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Image_Analysis_By_PkArgs = {
  id: Scalars['Int']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Image_Analysis_Text_BlocksArgs = {
  where: Image_Analysis_Text_Blocks_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Image_Analysis_Text_Blocks_By_PkArgs = {
  id: Scalars['Int']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Item_OnboardingsArgs = {
  where: Item_Onboardings_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Item_Onboardings_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Spirit_TypeArgs = {
  where: Spirit_Type_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Spirit_Type_By_PkArgs = {
  text: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_SpiritsArgs = {
  where: Spirits_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Spirits_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_WinesArgs = {
  where: Wines_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Wines_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootInsertAuthProviderArgs = {
  object: AuthProviders_Insert_Input;
  on_conflict?: InputMaybe<AuthProviders_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthProviderRequestArgs = {
  object: AuthProviderRequests_Insert_Input;
  on_conflict?: InputMaybe<AuthProviderRequests_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthProviderRequestsArgs = {
  objects: Array<AuthProviderRequests_Insert_Input>;
  on_conflict?: InputMaybe<AuthProviderRequests_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthProvidersArgs = {
  objects: Array<AuthProviders_Insert_Input>;
  on_conflict?: InputMaybe<AuthProviders_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthRefreshTokenArgs = {
  object: AuthRefreshTokens_Insert_Input;
  on_conflict?: InputMaybe<AuthRefreshTokens_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthRefreshTokenTypeArgs = {
  object: AuthRefreshTokenTypes_Insert_Input;
  on_conflict?: InputMaybe<AuthRefreshTokenTypes_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthRefreshTokenTypesArgs = {
  objects: Array<AuthRefreshTokenTypes_Insert_Input>;
  on_conflict?: InputMaybe<AuthRefreshTokenTypes_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthRefreshTokensArgs = {
  objects: Array<AuthRefreshTokens_Insert_Input>;
  on_conflict?: InputMaybe<AuthRefreshTokens_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthRoleArgs = {
  object: AuthRoles_Insert_Input;
  on_conflict?: InputMaybe<AuthRoles_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthRolesArgs = {
  objects: Array<AuthRoles_Insert_Input>;
  on_conflict?: InputMaybe<AuthRoles_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthUserProviderArgs = {
  object: AuthUserProviders_Insert_Input;
  on_conflict?: InputMaybe<AuthUserProviders_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthUserProvidersArgs = {
  objects: Array<AuthUserProviders_Insert_Input>;
  on_conflict?: InputMaybe<AuthUserProviders_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthUserRoleArgs = {
  object: AuthUserRoles_Insert_Input;
  on_conflict?: InputMaybe<AuthUserRoles_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthUserRolesArgs = {
  objects: Array<AuthUserRoles_Insert_Input>;
  on_conflict?: InputMaybe<AuthUserRoles_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthUserSecurityKeyArgs = {
  object: AuthUserSecurityKeys_Insert_Input;
  on_conflict?: InputMaybe<AuthUserSecurityKeys_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertAuthUserSecurityKeysArgs = {
  objects: Array<AuthUserSecurityKeys_Insert_Input>;
  on_conflict?: InputMaybe<AuthUserSecurityKeys_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertBucketArgs = {
  object: Buckets_Insert_Input;
  on_conflict?: InputMaybe<Buckets_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertBucketsArgs = {
  objects: Array<Buckets_Insert_Input>;
  on_conflict?: InputMaybe<Buckets_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertFileArgs = {
  object: Files_Insert_Input;
  on_conflict?: InputMaybe<Files_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertFilesArgs = {
  objects: Array<Files_Insert_Input>;
  on_conflict?: InputMaybe<Files_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertUserArgs = {
  object: Users_Insert_Input;
  on_conflict?: InputMaybe<Users_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertUsersArgs = {
  objects: Array<Users_Insert_Input>;
  on_conflict?: InputMaybe<Users_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertVirusArgs = {
  object: Virus_Insert_Input;
  on_conflict?: InputMaybe<Virus_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsertVirusesArgs = {
  objects: Array<Virus_Insert_Input>;
  on_conflict?: InputMaybe<Virus_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_BarcodesArgs = {
  objects: Array<Barcodes_Insert_Input>;
  on_conflict?: InputMaybe<Barcodes_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Barcodes_OneArgs = {
  object: Barcodes_Insert_Input;
  on_conflict?: InputMaybe<Barcodes_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_BeersArgs = {
  objects: Array<Beers_Insert_Input>;
  on_conflict?: InputMaybe<Beers_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Beers_OneArgs = {
  object: Beers_Insert_Input;
  on_conflict?: InputMaybe<Beers_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Cellar_UserArgs = {
  objects: Array<Cellar_User_Insert_Input>;
  on_conflict?: InputMaybe<Cellar_User_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Cellar_User_OneArgs = {
  object: Cellar_User_Insert_Input;
  on_conflict?: InputMaybe<Cellar_User_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_CellarsArgs = {
  objects: Array<Cellars_Insert_Input>;
  on_conflict?: InputMaybe<Cellars_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Cellars_OneArgs = {
  object: Cellars_Insert_Input;
  on_conflict?: InputMaybe<Cellars_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Image_AnalysisArgs = {
  objects: Array<Image_Analysis_Insert_Input>;
  on_conflict?: InputMaybe<Image_Analysis_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Image_Analysis_OneArgs = {
  object: Image_Analysis_Insert_Input;
  on_conflict?: InputMaybe<Image_Analysis_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Image_Analysis_Text_BlocksArgs = {
  objects: Array<Image_Analysis_Text_Blocks_Insert_Input>;
  on_conflict?: InputMaybe<Image_Analysis_Text_Blocks_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Image_Analysis_Text_Blocks_OneArgs = {
  object: Image_Analysis_Text_Blocks_Insert_Input;
  on_conflict?: InputMaybe<Image_Analysis_Text_Blocks_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_OnboardingsArgs = {
  objects: Array<Item_Onboardings_Insert_Input>;
  on_conflict?: InputMaybe<Item_Onboardings_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_Onboardings_OneArgs = {
  object: Item_Onboardings_Insert_Input;
  on_conflict?: InputMaybe<Item_Onboardings_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Spirit_TypeArgs = {
  objects: Array<Spirit_Type_Insert_Input>;
  on_conflict?: InputMaybe<Spirit_Type_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Spirit_Type_OneArgs = {
  object: Spirit_Type_Insert_Input;
  on_conflict?: InputMaybe<Spirit_Type_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_SpiritsArgs = {
  objects: Array<Spirits_Insert_Input>;
  on_conflict?: InputMaybe<Spirits_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Spirits_OneArgs = {
  object: Spirits_Insert_Input;
  on_conflict?: InputMaybe<Spirits_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_WinesArgs = {
  objects: Array<Wines_Insert_Input>;
  on_conflict?: InputMaybe<Wines_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Wines_OneArgs = {
  object: Wines_Insert_Input;
  on_conflict?: InputMaybe<Wines_On_Conflict>;
};


/** mutation root */
export type Mutation_RootUpdateAuthProviderArgs = {
  _set?: InputMaybe<AuthProviders_Set_Input>;
  pk_columns: AuthProviders_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateAuthProviderRequestArgs = {
  _append?: InputMaybe<AuthProviderRequests_Append_Input>;
  _delete_at_path?: InputMaybe<AuthProviderRequests_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<AuthProviderRequests_Delete_Elem_Input>;
  _delete_key?: InputMaybe<AuthProviderRequests_Delete_Key_Input>;
  _prepend?: InputMaybe<AuthProviderRequests_Prepend_Input>;
  _set?: InputMaybe<AuthProviderRequests_Set_Input>;
  pk_columns: AuthProviderRequests_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateAuthProviderRequestsArgs = {
  _append?: InputMaybe<AuthProviderRequests_Append_Input>;
  _delete_at_path?: InputMaybe<AuthProviderRequests_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<AuthProviderRequests_Delete_Elem_Input>;
  _delete_key?: InputMaybe<AuthProviderRequests_Delete_Key_Input>;
  _prepend?: InputMaybe<AuthProviderRequests_Prepend_Input>;
  _set?: InputMaybe<AuthProviderRequests_Set_Input>;
  where: AuthProviderRequests_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateAuthProvidersArgs = {
  _set?: InputMaybe<AuthProviders_Set_Input>;
  where: AuthProviders_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateAuthRefreshTokenArgs = {
  _append?: InputMaybe<AuthRefreshTokens_Append_Input>;
  _delete_at_path?: InputMaybe<AuthRefreshTokens_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<AuthRefreshTokens_Delete_Elem_Input>;
  _delete_key?: InputMaybe<AuthRefreshTokens_Delete_Key_Input>;
  _prepend?: InputMaybe<AuthRefreshTokens_Prepend_Input>;
  _set?: InputMaybe<AuthRefreshTokens_Set_Input>;
  pk_columns: AuthRefreshTokens_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateAuthRefreshTokenTypeArgs = {
  _set?: InputMaybe<AuthRefreshTokenTypes_Set_Input>;
  pk_columns: AuthRefreshTokenTypes_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateAuthRefreshTokenTypesArgs = {
  _set?: InputMaybe<AuthRefreshTokenTypes_Set_Input>;
  where: AuthRefreshTokenTypes_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateAuthRefreshTokensArgs = {
  _append?: InputMaybe<AuthRefreshTokens_Append_Input>;
  _delete_at_path?: InputMaybe<AuthRefreshTokens_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<AuthRefreshTokens_Delete_Elem_Input>;
  _delete_key?: InputMaybe<AuthRefreshTokens_Delete_Key_Input>;
  _prepend?: InputMaybe<AuthRefreshTokens_Prepend_Input>;
  _set?: InputMaybe<AuthRefreshTokens_Set_Input>;
  where: AuthRefreshTokens_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateAuthRoleArgs = {
  _set?: InputMaybe<AuthRoles_Set_Input>;
  pk_columns: AuthRoles_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateAuthRolesArgs = {
  _set?: InputMaybe<AuthRoles_Set_Input>;
  where: AuthRoles_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateAuthUserProviderArgs = {
  _set?: InputMaybe<AuthUserProviders_Set_Input>;
  pk_columns: AuthUserProviders_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateAuthUserProvidersArgs = {
  _set?: InputMaybe<AuthUserProviders_Set_Input>;
  where: AuthUserProviders_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateAuthUserRoleArgs = {
  _set?: InputMaybe<AuthUserRoles_Set_Input>;
  pk_columns: AuthUserRoles_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateAuthUserRolesArgs = {
  _set?: InputMaybe<AuthUserRoles_Set_Input>;
  where: AuthUserRoles_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateAuthUserSecurityKeyArgs = {
  _inc?: InputMaybe<AuthUserSecurityKeys_Inc_Input>;
  _set?: InputMaybe<AuthUserSecurityKeys_Set_Input>;
  pk_columns: AuthUserSecurityKeys_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateAuthUserSecurityKeysArgs = {
  _inc?: InputMaybe<AuthUserSecurityKeys_Inc_Input>;
  _set?: InputMaybe<AuthUserSecurityKeys_Set_Input>;
  where: AuthUserSecurityKeys_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateBucketArgs = {
  _inc?: InputMaybe<Buckets_Inc_Input>;
  _set?: InputMaybe<Buckets_Set_Input>;
  pk_columns: Buckets_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateBucketsArgs = {
  _inc?: InputMaybe<Buckets_Inc_Input>;
  _set?: InputMaybe<Buckets_Set_Input>;
  where: Buckets_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateFileArgs = {
  _append?: InputMaybe<Files_Append_Input>;
  _delete_at_path?: InputMaybe<Files_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Files_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Files_Delete_Key_Input>;
  _inc?: InputMaybe<Files_Inc_Input>;
  _prepend?: InputMaybe<Files_Prepend_Input>;
  _set?: InputMaybe<Files_Set_Input>;
  pk_columns: Files_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateFilesArgs = {
  _append?: InputMaybe<Files_Append_Input>;
  _delete_at_path?: InputMaybe<Files_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Files_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Files_Delete_Key_Input>;
  _inc?: InputMaybe<Files_Inc_Input>;
  _prepend?: InputMaybe<Files_Prepend_Input>;
  _set?: InputMaybe<Files_Set_Input>;
  where: Files_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateUserArgs = {
  _append?: InputMaybe<Users_Append_Input>;
  _delete_at_path?: InputMaybe<Users_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Users_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Users_Delete_Key_Input>;
  _prepend?: InputMaybe<Users_Prepend_Input>;
  _set?: InputMaybe<Users_Set_Input>;
  pk_columns: Users_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateUsersArgs = {
  _append?: InputMaybe<Users_Append_Input>;
  _delete_at_path?: InputMaybe<Users_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Users_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Users_Delete_Key_Input>;
  _prepend?: InputMaybe<Users_Prepend_Input>;
  _set?: InputMaybe<Users_Set_Input>;
  where: Users_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdateVirusArgs = {
  _append?: InputMaybe<Virus_Append_Input>;
  _delete_at_path?: InputMaybe<Virus_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Virus_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Virus_Delete_Key_Input>;
  _prepend?: InputMaybe<Virus_Prepend_Input>;
  _set?: InputMaybe<Virus_Set_Input>;
  pk_columns: Virus_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdateVirusesArgs = {
  _append?: InputMaybe<Virus_Append_Input>;
  _delete_at_path?: InputMaybe<Virus_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Virus_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Virus_Delete_Key_Input>;
  _prepend?: InputMaybe<Virus_Prepend_Input>;
  _set?: InputMaybe<Virus_Set_Input>;
  where: Virus_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_AuthProviderRequests_ManyArgs = {
  updates: Array<AuthProviderRequests_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_AuthProviders_ManyArgs = {
  updates: Array<AuthProviders_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_AuthRefreshTokenTypes_ManyArgs = {
  updates: Array<AuthRefreshTokenTypes_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_AuthRefreshTokens_ManyArgs = {
  updates: Array<AuthRefreshTokens_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_AuthRoles_ManyArgs = {
  updates: Array<AuthRoles_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_AuthUserProviders_ManyArgs = {
  updates: Array<AuthUserProviders_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_AuthUserRoles_ManyArgs = {
  updates: Array<AuthUserRoles_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_AuthUserSecurityKeys_ManyArgs = {
  updates: Array<AuthUserSecurityKeys_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_BarcodesArgs = {
  _set?: InputMaybe<Barcodes_Set_Input>;
  where: Barcodes_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Barcodes_By_PkArgs = {
  _set?: InputMaybe<Barcodes_Set_Input>;
  pk_columns: Barcodes_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Barcodes_ManyArgs = {
  updates: Array<Barcodes_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_BeersArgs = {
  _inc?: InputMaybe<Beers_Inc_Input>;
  _set?: InputMaybe<Beers_Set_Input>;
  where: Beers_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Beers_By_PkArgs = {
  _inc?: InputMaybe<Beers_Inc_Input>;
  _set?: InputMaybe<Beers_Set_Input>;
  pk_columns: Beers_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Beers_ManyArgs = {
  updates: Array<Beers_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Buckets_ManyArgs = {
  updates: Array<Buckets_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Cellar_UserArgs = {
  _set?: InputMaybe<Cellar_User_Set_Input>;
  where: Cellar_User_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Cellar_User_By_PkArgs = {
  _set?: InputMaybe<Cellar_User_Set_Input>;
  pk_columns: Cellar_User_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Cellar_User_ManyArgs = {
  updates: Array<Cellar_User_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_CellarsArgs = {
  _set?: InputMaybe<Cellars_Set_Input>;
  where: Cellars_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Cellars_By_PkArgs = {
  _set?: InputMaybe<Cellars_Set_Input>;
  pk_columns: Cellars_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Cellars_ManyArgs = {
  updates: Array<Cellars_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Files_ManyArgs = {
  updates: Array<Files_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Image_AnalysisArgs = {
  _inc?: InputMaybe<Image_Analysis_Inc_Input>;
  _set?: InputMaybe<Image_Analysis_Set_Input>;
  where: Image_Analysis_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Image_Analysis_By_PkArgs = {
  _inc?: InputMaybe<Image_Analysis_Inc_Input>;
  _set?: InputMaybe<Image_Analysis_Set_Input>;
  pk_columns: Image_Analysis_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Image_Analysis_ManyArgs = {
  updates: Array<Image_Analysis_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Image_Analysis_Text_BlocksArgs = {
  _inc?: InputMaybe<Image_Analysis_Text_Blocks_Inc_Input>;
  _set?: InputMaybe<Image_Analysis_Text_Blocks_Set_Input>;
  where: Image_Analysis_Text_Blocks_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Image_Analysis_Text_Blocks_By_PkArgs = {
  _inc?: InputMaybe<Image_Analysis_Text_Blocks_Inc_Input>;
  _set?: InputMaybe<Image_Analysis_Text_Blocks_Set_Input>;
  pk_columns: Image_Analysis_Text_Blocks_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Image_Analysis_Text_Blocks_ManyArgs = {
  updates: Array<Image_Analysis_Text_Blocks_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Item_OnboardingsArgs = {
  _append?: InputMaybe<Item_Onboardings_Append_Input>;
  _delete_at_path?: InputMaybe<Item_Onboardings_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Item_Onboardings_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Item_Onboardings_Delete_Key_Input>;
  _prepend?: InputMaybe<Item_Onboardings_Prepend_Input>;
  _set?: InputMaybe<Item_Onboardings_Set_Input>;
  where: Item_Onboardings_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Onboardings_By_PkArgs = {
  _append?: InputMaybe<Item_Onboardings_Append_Input>;
  _delete_at_path?: InputMaybe<Item_Onboardings_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Item_Onboardings_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Item_Onboardings_Delete_Key_Input>;
  _prepend?: InputMaybe<Item_Onboardings_Prepend_Input>;
  _set?: InputMaybe<Item_Onboardings_Set_Input>;
  pk_columns: Item_Onboardings_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Onboardings_ManyArgs = {
  updates: Array<Item_Onboardings_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Spirit_TypeArgs = {
  _set?: InputMaybe<Spirit_Type_Set_Input>;
  where: Spirit_Type_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Spirit_Type_By_PkArgs = {
  _set?: InputMaybe<Spirit_Type_Set_Input>;
  pk_columns: Spirit_Type_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Spirit_Type_ManyArgs = {
  updates: Array<Spirit_Type_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_SpiritsArgs = {
  _inc?: InputMaybe<Spirits_Inc_Input>;
  _set?: InputMaybe<Spirits_Set_Input>;
  where: Spirits_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Spirits_By_PkArgs = {
  _inc?: InputMaybe<Spirits_Inc_Input>;
  _set?: InputMaybe<Spirits_Set_Input>;
  pk_columns: Spirits_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Spirits_ManyArgs = {
  updates: Array<Spirits_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Users_ManyArgs = {
  updates: Array<Users_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Virus_ManyArgs = {
  updates: Array<Virus_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_WinesArgs = {
  _inc?: InputMaybe<Wines_Inc_Input>;
  _set?: InputMaybe<Wines_Set_Input>;
  where: Wines_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Wines_By_PkArgs = {
  _inc?: InputMaybe<Wines_Inc_Input>;
  _set?: InputMaybe<Wines_Set_Input>;
  pk_columns: Wines_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Wines_ManyArgs = {
  updates: Array<Wines_Updates>;
};

/** Boolean expression to compare columns of type "numeric". All fields are combined with logical 'AND'. */
export type Numeric_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['numeric']['input']>;
  _gt?: InputMaybe<Scalars['numeric']['input']>;
  _gte?: InputMaybe<Scalars['numeric']['input']>;
  _in?: InputMaybe<Array<Scalars['numeric']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['numeric']['input']>;
  _lte?: InputMaybe<Scalars['numeric']['input']>;
  _neq?: InputMaybe<Scalars['numeric']['input']>;
  _nin?: InputMaybe<Array<Scalars['numeric']['input']>>;
};

/** column ordering options */
export enum Order_By {
  /** in ascending order, nulls last */
  Asc = 'asc',
  /** in ascending order, nulls first */
  AscNullsFirst = 'asc_nulls_first',
  /** in ascending order, nulls last */
  AscNullsLast = 'asc_nulls_last',
  /** in descending order, nulls first */
  Desc = 'desc',
  /** in descending order, nulls first */
  DescNullsFirst = 'desc_nulls_first',
  /** in descending order, nulls last */
  DescNullsLast = 'desc_nulls_last'
}

/** Boolean expression to compare columns of type "polygon". All fields are combined with logical 'AND'. */
export type Polygon_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['polygon']['input']>;
  _gt?: InputMaybe<Scalars['polygon']['input']>;
  _gte?: InputMaybe<Scalars['polygon']['input']>;
  _in?: InputMaybe<Array<Scalars['polygon']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['polygon']['input']>;
  _lte?: InputMaybe<Scalars['polygon']['input']>;
  _neq?: InputMaybe<Scalars['polygon']['input']>;
  _nin?: InputMaybe<Array<Scalars['polygon']['input']>>;
};

export type Query_Root = {
  __typename: 'query_root';
  /** fetch data from the table: "auth.providers" using primary key columns */
  authProvider?: Maybe<AuthProviders>;
  /** fetch data from the table: "auth.provider_requests" using primary key columns */
  authProviderRequest?: Maybe<AuthProviderRequests>;
  /** fetch data from the table: "auth.provider_requests" */
  authProviderRequests: Array<AuthProviderRequests>;
  /** fetch aggregated fields from the table: "auth.provider_requests" */
  authProviderRequestsAggregate: AuthProviderRequests_Aggregate;
  /** fetch data from the table: "auth.providers" */
  authProviders: Array<AuthProviders>;
  /** fetch aggregated fields from the table: "auth.providers" */
  authProvidersAggregate: AuthProviders_Aggregate;
  /** fetch data from the table: "auth.refresh_tokens" using primary key columns */
  authRefreshToken?: Maybe<AuthRefreshTokens>;
  /** fetch data from the table: "auth.refresh_token_types" using primary key columns */
  authRefreshTokenType?: Maybe<AuthRefreshTokenTypes>;
  /** fetch data from the table: "auth.refresh_token_types" */
  authRefreshTokenTypes: Array<AuthRefreshTokenTypes>;
  /** fetch aggregated fields from the table: "auth.refresh_token_types" */
  authRefreshTokenTypesAggregate: AuthRefreshTokenTypes_Aggregate;
  /** fetch data from the table: "auth.refresh_tokens" */
  authRefreshTokens: Array<AuthRefreshTokens>;
  /** fetch aggregated fields from the table: "auth.refresh_tokens" */
  authRefreshTokensAggregate: AuthRefreshTokens_Aggregate;
  /** fetch data from the table: "auth.roles" using primary key columns */
  authRole?: Maybe<AuthRoles>;
  /** fetch data from the table: "auth.roles" */
  authRoles: Array<AuthRoles>;
  /** fetch aggregated fields from the table: "auth.roles" */
  authRolesAggregate: AuthRoles_Aggregate;
  /** fetch data from the table: "auth.user_providers" using primary key columns */
  authUserProvider?: Maybe<AuthUserProviders>;
  /** fetch data from the table: "auth.user_providers" */
  authUserProviders: Array<AuthUserProviders>;
  /** fetch aggregated fields from the table: "auth.user_providers" */
  authUserProvidersAggregate: AuthUserProviders_Aggregate;
  /** fetch data from the table: "auth.user_roles" using primary key columns */
  authUserRole?: Maybe<AuthUserRoles>;
  /** fetch data from the table: "auth.user_roles" */
  authUserRoles: Array<AuthUserRoles>;
  /** fetch aggregated fields from the table: "auth.user_roles" */
  authUserRolesAggregate: AuthUserRoles_Aggregate;
  /** fetch data from the table: "auth.user_security_keys" using primary key columns */
  authUserSecurityKey?: Maybe<AuthUserSecurityKeys>;
  /** fetch data from the table: "auth.user_security_keys" */
  authUserSecurityKeys: Array<AuthUserSecurityKeys>;
  /** fetch aggregated fields from the table: "auth.user_security_keys" */
  authUserSecurityKeysAggregate: AuthUserSecurityKeys_Aggregate;
  /** fetch data from the table: "barcodes" */
  barcodes: Array<Barcodes>;
  /** fetch aggregated fields from the table: "barcodes" */
  barcodes_aggregate: Barcodes_Aggregate;
  /** fetch data from the table: "barcodes" using primary key columns */
  barcodes_by_pk?: Maybe<Barcodes>;
  /** beer_defaults */
  beer_defaults?: Maybe<Beer_Defaults_Result>;
  /** An array relationship */
  beers: Array<Beers>;
  /** An aggregate relationship */
  beers_aggregate: Beers_Aggregate;
  /** fetch data from the table: "beers" using primary key columns */
  beers_by_pk?: Maybe<Beers>;
  /** fetch data from the table: "storage.buckets" using primary key columns */
  bucket?: Maybe<Buckets>;
  /** fetch data from the table: "storage.buckets" */
  buckets: Array<Buckets>;
  /** fetch aggregated fields from the table: "storage.buckets" */
  bucketsAggregate: Buckets_Aggregate;
  /** fetch data from the table: "cellar_user" */
  cellar_user: Array<Cellar_User>;
  /** fetch aggregated fields from the table: "cellar_user" */
  cellar_user_aggregate: Cellar_User_Aggregate;
  /** fetch data from the table: "cellar_user" using primary key columns */
  cellar_user_by_pk?: Maybe<Cellar_User>;
  /** fetch data from the table: "cellars" */
  cellars: Array<Cellars>;
  /** fetch aggregated fields from the table: "cellars" */
  cellars_aggregate: Cellars_Aggregate;
  /** fetch data from the table: "cellars" using primary key columns */
  cellars_by_pk?: Maybe<Cellars>;
  /** fetch data from the table: "storage.files" using primary key columns */
  file?: Maybe<Files>;
  /** An array relationship */
  files: Array<Files>;
  /** fetch aggregated fields from the table: "storage.files" */
  filesAggregate: Files_Aggregate;
  /** fetch data from the table: "image_analysis" */
  image_analysis: Array<Image_Analysis>;
  /** fetch aggregated fields from the table: "image_analysis" */
  image_analysis_aggregate: Image_Analysis_Aggregate;
  /** fetch data from the table: "image_analysis" using primary key columns */
  image_analysis_by_pk?: Maybe<Image_Analysis>;
  /** fetch data from the table: "image_analysis_text_blocks" */
  image_analysis_text_blocks: Array<Image_Analysis_Text_Blocks>;
  /** fetch aggregated fields from the table: "image_analysis_text_blocks" */
  image_analysis_text_blocks_aggregate: Image_Analysis_Text_Blocks_Aggregate;
  /** fetch data from the table: "image_analysis_text_blocks" using primary key columns */
  image_analysis_text_blocks_by_pk?: Maybe<Image_Analysis_Text_Blocks>;
  /** fetch data from the table: "item_onboardings" */
  item_onboardings: Array<Item_Onboardings>;
  /** fetch aggregated fields from the table: "item_onboardings" */
  item_onboardings_aggregate: Item_Onboardings_Aggregate;
  /** fetch data from the table: "item_onboardings" using primary key columns */
  item_onboardings_by_pk?: Maybe<Item_Onboardings>;
  /** spirit_defaults */
  spirit_defaults?: Maybe<Spirit_Defaults_Result>;
  /** fetch data from the table: "spirit_type" */
  spirit_type: Array<Spirit_Type>;
  /** fetch aggregated fields from the table: "spirit_type" */
  spirit_type_aggregate: Spirit_Type_Aggregate;
  /** fetch data from the table: "spirit_type" using primary key columns */
  spirit_type_by_pk?: Maybe<Spirit_Type>;
  /** An array relationship */
  spirits: Array<Spirits>;
  /** An aggregate relationship */
  spirits_aggregate: Spirits_Aggregate;
  /** fetch data from the table: "spirits" using primary key columns */
  spirits_by_pk?: Maybe<Spirits>;
  /** fetch data from the table: "auth.users" using primary key columns */
  user?: Maybe<Users>;
  /** fetch data from the table: "auth.users" */
  users: Array<Users>;
  /** fetch aggregated fields from the table: "auth.users" */
  usersAggregate: Users_Aggregate;
  /** fetch data from the table: "storage.virus" using primary key columns */
  virus?: Maybe<Virus>;
  /** fetch data from the table: "storage.virus" */
  viruses: Array<Virus>;
  /** fetch aggregated fields from the table: "storage.virus" */
  virusesAggregate: Virus_Aggregate;
  wine_defaults?: Maybe<Wine_Defaults_Result>;
  /** An array relationship */
  wines: Array<Wines>;
  /** An aggregate relationship */
  wines_aggregate: Wines_Aggregate;
  /** fetch data from the table: "wines" using primary key columns */
  wines_by_pk?: Maybe<Wines>;
};


export type Query_RootAuthProviderArgs = {
  id: Scalars['String']['input'];
};


export type Query_RootAuthProviderRequestArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootAuthProviderRequestsArgs = {
  distinct_on?: InputMaybe<Array<AuthProviderRequests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthProviderRequests_Order_By>>;
  where?: InputMaybe<AuthProviderRequests_Bool_Exp>;
};


export type Query_RootAuthProviderRequestsAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthProviderRequests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthProviderRequests_Order_By>>;
  where?: InputMaybe<AuthProviderRequests_Bool_Exp>;
};


export type Query_RootAuthProvidersArgs = {
  distinct_on?: InputMaybe<Array<AuthProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthProviders_Order_By>>;
  where?: InputMaybe<AuthProviders_Bool_Exp>;
};


export type Query_RootAuthProvidersAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthProviders_Order_By>>;
  where?: InputMaybe<AuthProviders_Bool_Exp>;
};


export type Query_RootAuthRefreshTokenArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootAuthRefreshTokenTypeArgs = {
  value: Scalars['String']['input'];
};


export type Query_RootAuthRefreshTokenTypesArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokenTypes_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokenTypes_Order_By>>;
  where?: InputMaybe<AuthRefreshTokenTypes_Bool_Exp>;
};


export type Query_RootAuthRefreshTokenTypesAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokenTypes_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokenTypes_Order_By>>;
  where?: InputMaybe<AuthRefreshTokenTypes_Bool_Exp>;
};


export type Query_RootAuthRefreshTokensArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokens_Order_By>>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};


export type Query_RootAuthRefreshTokensAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokens_Order_By>>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};


export type Query_RootAuthRoleArgs = {
  role: Scalars['String']['input'];
};


export type Query_RootAuthRolesArgs = {
  distinct_on?: InputMaybe<Array<AuthRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRoles_Order_By>>;
  where?: InputMaybe<AuthRoles_Bool_Exp>;
};


export type Query_RootAuthRolesAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRoles_Order_By>>;
  where?: InputMaybe<AuthRoles_Bool_Exp>;
};


export type Query_RootAuthUserProviderArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootAuthUserProvidersArgs = {
  distinct_on?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserProviders_Order_By>>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};


export type Query_RootAuthUserProvidersAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserProviders_Order_By>>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};


export type Query_RootAuthUserRoleArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootAuthUserRolesArgs = {
  distinct_on?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserRoles_Order_By>>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};


export type Query_RootAuthUserRolesAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserRoles_Order_By>>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};


export type Query_RootAuthUserSecurityKeyArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootAuthUserSecurityKeysArgs = {
  distinct_on?: InputMaybe<Array<AuthUserSecurityKeys_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserSecurityKeys_Order_By>>;
  where?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
};


export type Query_RootAuthUserSecurityKeysAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserSecurityKeys_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserSecurityKeys_Order_By>>;
  where?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
};


export type Query_RootBarcodesArgs = {
  distinct_on?: InputMaybe<Array<Barcodes_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Barcodes_Order_By>>;
  where?: InputMaybe<Barcodes_Bool_Exp>;
};


export type Query_RootBarcodes_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Barcodes_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Barcodes_Order_By>>;
  where?: InputMaybe<Barcodes_Bool_Exp>;
};


export type Query_RootBarcodes_By_PkArgs = {
  code: Scalars['String']['input'];
};


export type Query_RootBeer_DefaultsArgs = {
  hint: Item_Defaults_Hint;
};


export type Query_RootBeersArgs = {
  distinct_on?: InputMaybe<Array<Beers_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beers_Order_By>>;
  where?: InputMaybe<Beers_Bool_Exp>;
};


export type Query_RootBeers_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Beers_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beers_Order_By>>;
  where?: InputMaybe<Beers_Bool_Exp>;
};


export type Query_RootBeers_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootBucketArgs = {
  id: Scalars['String']['input'];
};


export type Query_RootBucketsArgs = {
  distinct_on?: InputMaybe<Array<Buckets_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Buckets_Order_By>>;
  where?: InputMaybe<Buckets_Bool_Exp>;
};


export type Query_RootBucketsAggregateArgs = {
  distinct_on?: InputMaybe<Array<Buckets_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Buckets_Order_By>>;
  where?: InputMaybe<Buckets_Bool_Exp>;
};


export type Query_RootCellar_UserArgs = {
  distinct_on?: InputMaybe<Array<Cellar_User_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_User_Order_By>>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};


export type Query_RootCellar_User_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_User_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_User_Order_By>>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};


export type Query_RootCellar_User_By_PkArgs = {
  id: Scalars['Int']['input'];
};


export type Query_RootCellarsArgs = {
  distinct_on?: InputMaybe<Array<Cellars_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellars_Order_By>>;
  where?: InputMaybe<Cellars_Bool_Exp>;
};


export type Query_RootCellars_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellars_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellars_Order_By>>;
  where?: InputMaybe<Cellars_Bool_Exp>;
};


export type Query_RootCellars_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootFileArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootFilesArgs = {
  distinct_on?: InputMaybe<Array<Files_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Files_Order_By>>;
  where?: InputMaybe<Files_Bool_Exp>;
};


export type Query_RootFilesAggregateArgs = {
  distinct_on?: InputMaybe<Array<Files_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Files_Order_By>>;
  where?: InputMaybe<Files_Bool_Exp>;
};


export type Query_RootImage_AnalysisArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Order_By>>;
  where?: InputMaybe<Image_Analysis_Bool_Exp>;
};


export type Query_RootImage_Analysis_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Order_By>>;
  where?: InputMaybe<Image_Analysis_Bool_Exp>;
};


export type Query_RootImage_Analysis_By_PkArgs = {
  id: Scalars['Int']['input'];
};


export type Query_RootImage_Analysis_Text_BlocksArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Text_Blocks_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Text_Blocks_Order_By>>;
  where?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
};


export type Query_RootImage_Analysis_Text_Blocks_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Text_Blocks_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Text_Blocks_Order_By>>;
  where?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
};


export type Query_RootImage_Analysis_Text_Blocks_By_PkArgs = {
  id: Scalars['Int']['input'];
};


export type Query_RootItem_OnboardingsArgs = {
  distinct_on?: InputMaybe<Array<Item_Onboardings_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Onboardings_Order_By>>;
  where?: InputMaybe<Item_Onboardings_Bool_Exp>;
};


export type Query_RootItem_Onboardings_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Onboardings_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Onboardings_Order_By>>;
  where?: InputMaybe<Item_Onboardings_Bool_Exp>;
};


export type Query_RootItem_Onboardings_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootSpirit_DefaultsArgs = {
  hint: Item_Defaults_Hint;
};


export type Query_RootSpirit_TypeArgs = {
  distinct_on?: InputMaybe<Array<Spirit_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirit_Type_Order_By>>;
  where?: InputMaybe<Spirit_Type_Bool_Exp>;
};


export type Query_RootSpirit_Type_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Spirit_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirit_Type_Order_By>>;
  where?: InputMaybe<Spirit_Type_Bool_Exp>;
};


export type Query_RootSpirit_Type_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Query_RootSpiritsArgs = {
  distinct_on?: InputMaybe<Array<Spirits_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirits_Order_By>>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};


export type Query_RootSpirits_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Spirits_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirits_Order_By>>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};


export type Query_RootSpirits_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootUserArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootUsersArgs = {
  distinct_on?: InputMaybe<Array<Users_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Users_Order_By>>;
  where?: InputMaybe<Users_Bool_Exp>;
};


export type Query_RootUsersAggregateArgs = {
  distinct_on?: InputMaybe<Array<Users_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Users_Order_By>>;
  where?: InputMaybe<Users_Bool_Exp>;
};


export type Query_RootVirusArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootVirusesArgs = {
  distinct_on?: InputMaybe<Array<Virus_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Virus_Order_By>>;
  where?: InputMaybe<Virus_Bool_Exp>;
};


export type Query_RootVirusesAggregateArgs = {
  distinct_on?: InputMaybe<Array<Virus_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Virus_Order_By>>;
  where?: InputMaybe<Virus_Bool_Exp>;
};


export type Query_RootWine_DefaultsArgs = {
  hint: Item_Defaults_Hint;
};


export type Query_RootWinesArgs = {
  distinct_on?: InputMaybe<Array<Wines_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wines_Order_By>>;
  where?: InputMaybe<Wines_Bool_Exp>;
};


export type Query_RootWines_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Wines_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wines_Order_By>>;
  where?: InputMaybe<Wines_Bool_Exp>;
};


export type Query_RootWines_By_PkArgs = {
  id: Scalars['uuid']['input'];
};

export type Spirit_Defaults_Result = {
  __typename: 'spirit_defaults_result';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  barcode_type?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  distillery?: Maybe<Scalars['String']['output']>;
  item_onboarding_id: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** columns and relationships of "spirit_type" */
export type Spirit_Type = {
  __typename: 'spirit_type';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "spirit_type" */
export type Spirit_Type_Aggregate = {
  __typename: 'spirit_type_aggregate';
  aggregate?: Maybe<Spirit_Type_Aggregate_Fields>;
  nodes: Array<Spirit_Type>;
};

/** aggregate fields of "spirit_type" */
export type Spirit_Type_Aggregate_Fields = {
  __typename: 'spirit_type_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Spirit_Type_Max_Fields>;
  min?: Maybe<Spirit_Type_Min_Fields>;
};


/** aggregate fields of "spirit_type" */
export type Spirit_Type_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Spirit_Type_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "spirit_type". All fields are combined with a logical 'AND'. */
export type Spirit_Type_Bool_Exp = {
  _and?: InputMaybe<Array<Spirit_Type_Bool_Exp>>;
  _not?: InputMaybe<Spirit_Type_Bool_Exp>;
  _or?: InputMaybe<Array<Spirit_Type_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "spirit_type" */
export enum Spirit_Type_Constraint {
  /** unique or primary key constraint on columns "text" */
  SpiritTypePkey = 'spirit_type_pkey'
}

export enum Spirit_Type_Enum {
  AmaroAperitifVermouth = 'AMARO_APERITIF_VERMOUTH',
  Baijiu = 'BAIJIU',
  Bourbon = 'BOURBON',
  BrandyCognac = 'BRANDY_COGNAC',
  Gin = 'GIN',
  Liqueurs = 'LIQUEURS',
  Mezcal = 'MEZCAL',
  Moonshine = 'MOONSHINE',
  Rum = 'RUM',
  Scotch = 'SCOTCH',
  Soju = 'SOJU',
  Tequila = 'TEQUILA',
  Vodka = 'VODKA',
  Whiskey = 'WHISKEY'
}

/** Boolean expression to compare columns of type "spirit_type_enum". All fields are combined with logical 'AND'. */
export type Spirit_Type_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Spirit_Type_Enum>;
  _in?: InputMaybe<Array<Spirit_Type_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Spirit_Type_Enum>;
  _nin?: InputMaybe<Array<Spirit_Type_Enum>>;
};

/** input type for inserting data into table "spirit_type" */
export type Spirit_Type_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Spirit_Type_Max_Fields = {
  __typename: 'spirit_type_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Spirit_Type_Min_Fields = {
  __typename: 'spirit_type_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "spirit_type" */
export type Spirit_Type_Mutation_Response = {
  __typename: 'spirit_type_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Spirit_Type>;
};

/** on_conflict condition type for table "spirit_type" */
export type Spirit_Type_On_Conflict = {
  constraint: Spirit_Type_Constraint;
  update_columns?: Array<Spirit_Type_Update_Column>;
  where?: InputMaybe<Spirit_Type_Bool_Exp>;
};

/** Ordering options when selecting data from "spirit_type". */
export type Spirit_Type_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: spirit_type */
export type Spirit_Type_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "spirit_type" */
export enum Spirit_Type_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "spirit_type" */
export type Spirit_Type_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "spirit_type" */
export type Spirit_Type_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Spirit_Type_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Spirit_Type_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "spirit_type" */
export enum Spirit_Type_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Spirit_Type_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Spirit_Type_Set_Input>;
  /** filter the rows which have to be updated */
  where: Spirit_Type_Bool_Exp;
};

/** columns and relationships of "spirits" */
export type Spirits = {
  __typename: 'spirits';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  /** An object relationship */
  barcode?: Maybe<Barcodes>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  /** An object relationship */
  cellar: Cellars;
  cellar_id: Scalars['uuid']['output'];
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by_id: Scalars['uuid']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['uuid']['output'];
  name: Scalars['String']['output'];
  price?: Maybe<Scalars['money']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  type: Spirit_Type_Enum;
  updated_at: Scalars['timestamptz']['output'];
  vintage?: Maybe<Scalars['date']['output']>;
};

/** aggregated selection of "spirits" */
export type Spirits_Aggregate = {
  __typename: 'spirits_aggregate';
  aggregate?: Maybe<Spirits_Aggregate_Fields>;
  nodes: Array<Spirits>;
};

export type Spirits_Aggregate_Bool_Exp = {
  count?: InputMaybe<Spirits_Aggregate_Bool_Exp_Count>;
};

export type Spirits_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Spirits_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Spirits_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "spirits" */
export type Spirits_Aggregate_Fields = {
  __typename: 'spirits_aggregate_fields';
  avg?: Maybe<Spirits_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Spirits_Max_Fields>;
  min?: Maybe<Spirits_Min_Fields>;
  stddev?: Maybe<Spirits_Stddev_Fields>;
  stddev_pop?: Maybe<Spirits_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Spirits_Stddev_Samp_Fields>;
  sum?: Maybe<Spirits_Sum_Fields>;
  var_pop?: Maybe<Spirits_Var_Pop_Fields>;
  var_samp?: Maybe<Spirits_Var_Samp_Fields>;
  variance?: Maybe<Spirits_Variance_Fields>;
};


/** aggregate fields of "spirits" */
export type Spirits_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Spirits_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "spirits" */
export type Spirits_Aggregate_Order_By = {
  avg?: InputMaybe<Spirits_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Spirits_Max_Order_By>;
  min?: InputMaybe<Spirits_Min_Order_By>;
  stddev?: InputMaybe<Spirits_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Spirits_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Spirits_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Spirits_Sum_Order_By>;
  var_pop?: InputMaybe<Spirits_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Spirits_Var_Samp_Order_By>;
  variance?: InputMaybe<Spirits_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "spirits" */
export type Spirits_Arr_Rel_Insert_Input = {
  data: Array<Spirits_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Spirits_On_Conflict>;
};

/** aggregate avg on columns */
export type Spirits_Avg_Fields = {
  __typename: 'spirits_avg_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "spirits" */
export type Spirits_Avg_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "spirits". All fields are combined with a logical 'AND'. */
export type Spirits_Bool_Exp = {
  _and?: InputMaybe<Array<Spirits_Bool_Exp>>;
  _not?: InputMaybe<Spirits_Bool_Exp>;
  _or?: InputMaybe<Array<Spirits_Bool_Exp>>;
  alcohol_content_percentage?: InputMaybe<Numeric_Comparison_Exp>;
  barcode?: InputMaybe<Barcodes_Bool_Exp>;
  barcode_code?: InputMaybe<String_Comparison_Exp>;
  cellar?: InputMaybe<Cellars_Bool_Exp>;
  cellar_id?: InputMaybe<Uuid_Comparison_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by_id?: InputMaybe<Uuid_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  price?: InputMaybe<Money_Comparison_Exp>;
  style?: InputMaybe<String_Comparison_Exp>;
  type?: InputMaybe<Spirit_Type_Enum_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  vintage?: InputMaybe<Date_Comparison_Exp>;
};

/** unique or primary key constraints on table "spirits" */
export enum Spirits_Constraint {
  /** unique or primary key constraint on columns "id" */
  SpiritsPkey = 'spirits_pkey'
}

/** input type for incrementing numeric columns in table "spirits" */
export type Spirits_Inc_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
};

/** input type for inserting data into table "spirits" */
export type Spirits_Insert_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  barcode?: InputMaybe<Barcodes_Obj_Rel_Insert_Input>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar?: InputMaybe<Cellars_Obj_Rel_Insert_Input>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
  style?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Spirit_Type_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate max on columns */
export type Spirits_Max_Fields = {
  __typename: 'spirits_max_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  price?: Maybe<Scalars['money']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** order by max() on columns of table "spirits" */
export type Spirits_Max_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
  style?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Spirits_Min_Fields = {
  __typename: 'spirits_min_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  price?: Maybe<Scalars['money']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** order by min() on columns of table "spirits" */
export type Spirits_Min_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
  style?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "spirits" */
export type Spirits_Mutation_Response = {
  __typename: 'spirits_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Spirits>;
};

/** on_conflict condition type for table "spirits" */
export type Spirits_On_Conflict = {
  constraint: Spirits_Constraint;
  update_columns?: Array<Spirits_Update_Column>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};

/** Ordering options when selecting data from "spirits". */
export type Spirits_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode?: InputMaybe<Barcodes_Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar?: InputMaybe<Cellars_Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
  style?: InputMaybe<Order_By>;
  type?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
};

/** primary key columns input for table: spirits */
export type Spirits_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "spirits" */
export enum Spirits_Select_Column {
  /** column name */
  AlcoholContentPercentage = 'alcohol_content_percentage',
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  Name = 'name',
  /** column name */
  Price = 'price',
  /** column name */
  Style = 'style',
  /** column name */
  Type = 'type',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  Vintage = 'vintage'
}

/** input type for updating data in table "spirits" */
export type Spirits_Set_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
  style?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Spirit_Type_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate stddev on columns */
export type Spirits_Stddev_Fields = {
  __typename: 'spirits_stddev_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "spirits" */
export type Spirits_Stddev_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Spirits_Stddev_Pop_Fields = {
  __typename: 'spirits_stddev_pop_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "spirits" */
export type Spirits_Stddev_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Spirits_Stddev_Samp_Fields = {
  __typename: 'spirits_stddev_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "spirits" */
export type Spirits_Stddev_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "spirits" */
export type Spirits_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Spirits_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Spirits_Stream_Cursor_Value_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
  style?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Spirit_Type_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate sum on columns */
export type Spirits_Sum_Fields = {
  __typename: 'spirits_sum_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  price?: Maybe<Scalars['money']['output']>;
};

/** order by sum() on columns of table "spirits" */
export type Spirits_Sum_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** update columns of table "spirits" */
export enum Spirits_Update_Column {
  /** column name */
  AlcoholContentPercentage = 'alcohol_content_percentage',
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  Name = 'name',
  /** column name */
  Price = 'price',
  /** column name */
  Style = 'style',
  /** column name */
  Type = 'type',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  Vintage = 'vintage'
}

export type Spirits_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Spirits_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Spirits_Set_Input>;
  /** filter the rows which have to be updated */
  where: Spirits_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Spirits_Var_Pop_Fields = {
  __typename: 'spirits_var_pop_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "spirits" */
export type Spirits_Var_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Spirits_Var_Samp_Fields = {
  __typename: 'spirits_var_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "spirits" */
export type Spirits_Var_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Spirits_Variance_Fields = {
  __typename: 'spirits_variance_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "spirits" */
export type Spirits_Variance_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

export type Subscription_Root = {
  __typename: 'subscription_root';
  /** fetch data from the table: "auth.providers" using primary key columns */
  authProvider?: Maybe<AuthProviders>;
  /** fetch data from the table: "auth.provider_requests" using primary key columns */
  authProviderRequest?: Maybe<AuthProviderRequests>;
  /** fetch data from the table: "auth.provider_requests" */
  authProviderRequests: Array<AuthProviderRequests>;
  /** fetch aggregated fields from the table: "auth.provider_requests" */
  authProviderRequestsAggregate: AuthProviderRequests_Aggregate;
  /** fetch data from the table in a streaming manner: "auth.provider_requests" */
  authProviderRequests_stream: Array<AuthProviderRequests>;
  /** fetch data from the table: "auth.providers" */
  authProviders: Array<AuthProviders>;
  /** fetch aggregated fields from the table: "auth.providers" */
  authProvidersAggregate: AuthProviders_Aggregate;
  /** fetch data from the table in a streaming manner: "auth.providers" */
  authProviders_stream: Array<AuthProviders>;
  /** fetch data from the table: "auth.refresh_tokens" using primary key columns */
  authRefreshToken?: Maybe<AuthRefreshTokens>;
  /** fetch data from the table: "auth.refresh_token_types" using primary key columns */
  authRefreshTokenType?: Maybe<AuthRefreshTokenTypes>;
  /** fetch data from the table: "auth.refresh_token_types" */
  authRefreshTokenTypes: Array<AuthRefreshTokenTypes>;
  /** fetch aggregated fields from the table: "auth.refresh_token_types" */
  authRefreshTokenTypesAggregate: AuthRefreshTokenTypes_Aggregate;
  /** fetch data from the table in a streaming manner: "auth.refresh_token_types" */
  authRefreshTokenTypes_stream: Array<AuthRefreshTokenTypes>;
  /** fetch data from the table: "auth.refresh_tokens" */
  authRefreshTokens: Array<AuthRefreshTokens>;
  /** fetch aggregated fields from the table: "auth.refresh_tokens" */
  authRefreshTokensAggregate: AuthRefreshTokens_Aggregate;
  /** fetch data from the table in a streaming manner: "auth.refresh_tokens" */
  authRefreshTokens_stream: Array<AuthRefreshTokens>;
  /** fetch data from the table: "auth.roles" using primary key columns */
  authRole?: Maybe<AuthRoles>;
  /** fetch data from the table: "auth.roles" */
  authRoles: Array<AuthRoles>;
  /** fetch aggregated fields from the table: "auth.roles" */
  authRolesAggregate: AuthRoles_Aggregate;
  /** fetch data from the table in a streaming manner: "auth.roles" */
  authRoles_stream: Array<AuthRoles>;
  /** fetch data from the table: "auth.user_providers" using primary key columns */
  authUserProvider?: Maybe<AuthUserProviders>;
  /** fetch data from the table: "auth.user_providers" */
  authUserProviders: Array<AuthUserProviders>;
  /** fetch aggregated fields from the table: "auth.user_providers" */
  authUserProvidersAggregate: AuthUserProviders_Aggregate;
  /** fetch data from the table in a streaming manner: "auth.user_providers" */
  authUserProviders_stream: Array<AuthUserProviders>;
  /** fetch data from the table: "auth.user_roles" using primary key columns */
  authUserRole?: Maybe<AuthUserRoles>;
  /** fetch data from the table: "auth.user_roles" */
  authUserRoles: Array<AuthUserRoles>;
  /** fetch aggregated fields from the table: "auth.user_roles" */
  authUserRolesAggregate: AuthUserRoles_Aggregate;
  /** fetch data from the table in a streaming manner: "auth.user_roles" */
  authUserRoles_stream: Array<AuthUserRoles>;
  /** fetch data from the table: "auth.user_security_keys" using primary key columns */
  authUserSecurityKey?: Maybe<AuthUserSecurityKeys>;
  /** fetch data from the table: "auth.user_security_keys" */
  authUserSecurityKeys: Array<AuthUserSecurityKeys>;
  /** fetch aggregated fields from the table: "auth.user_security_keys" */
  authUserSecurityKeysAggregate: AuthUserSecurityKeys_Aggregate;
  /** fetch data from the table in a streaming manner: "auth.user_security_keys" */
  authUserSecurityKeys_stream: Array<AuthUserSecurityKeys>;
  /** fetch data from the table: "barcodes" */
  barcodes: Array<Barcodes>;
  /** fetch aggregated fields from the table: "barcodes" */
  barcodes_aggregate: Barcodes_Aggregate;
  /** fetch data from the table: "barcodes" using primary key columns */
  barcodes_by_pk?: Maybe<Barcodes>;
  /** fetch data from the table in a streaming manner: "barcodes" */
  barcodes_stream: Array<Barcodes>;
  /** An array relationship */
  beers: Array<Beers>;
  /** An aggregate relationship */
  beers_aggregate: Beers_Aggregate;
  /** fetch data from the table: "beers" using primary key columns */
  beers_by_pk?: Maybe<Beers>;
  /** fetch data from the table in a streaming manner: "beers" */
  beers_stream: Array<Beers>;
  /** fetch data from the table: "storage.buckets" using primary key columns */
  bucket?: Maybe<Buckets>;
  /** fetch data from the table: "storage.buckets" */
  buckets: Array<Buckets>;
  /** fetch aggregated fields from the table: "storage.buckets" */
  bucketsAggregate: Buckets_Aggregate;
  /** fetch data from the table in a streaming manner: "storage.buckets" */
  buckets_stream: Array<Buckets>;
  /** fetch data from the table: "cellar_user" */
  cellar_user: Array<Cellar_User>;
  /** fetch aggregated fields from the table: "cellar_user" */
  cellar_user_aggregate: Cellar_User_Aggregate;
  /** fetch data from the table: "cellar_user" using primary key columns */
  cellar_user_by_pk?: Maybe<Cellar_User>;
  /** fetch data from the table in a streaming manner: "cellar_user" */
  cellar_user_stream: Array<Cellar_User>;
  /** fetch data from the table: "cellars" */
  cellars: Array<Cellars>;
  /** fetch aggregated fields from the table: "cellars" */
  cellars_aggregate: Cellars_Aggregate;
  /** fetch data from the table: "cellars" using primary key columns */
  cellars_by_pk?: Maybe<Cellars>;
  /** fetch data from the table in a streaming manner: "cellars" */
  cellars_stream: Array<Cellars>;
  /** fetch data from the table: "storage.files" using primary key columns */
  file?: Maybe<Files>;
  /** An array relationship */
  files: Array<Files>;
  /** fetch aggregated fields from the table: "storage.files" */
  filesAggregate: Files_Aggregate;
  /** fetch data from the table in a streaming manner: "storage.files" */
  files_stream: Array<Files>;
  /** fetch data from the table: "image_analysis" */
  image_analysis: Array<Image_Analysis>;
  /** fetch aggregated fields from the table: "image_analysis" */
  image_analysis_aggregate: Image_Analysis_Aggregate;
  /** fetch data from the table: "image_analysis" using primary key columns */
  image_analysis_by_pk?: Maybe<Image_Analysis>;
  /** fetch data from the table in a streaming manner: "image_analysis" */
  image_analysis_stream: Array<Image_Analysis>;
  /** fetch data from the table: "image_analysis_text_blocks" */
  image_analysis_text_blocks: Array<Image_Analysis_Text_Blocks>;
  /** fetch aggregated fields from the table: "image_analysis_text_blocks" */
  image_analysis_text_blocks_aggregate: Image_Analysis_Text_Blocks_Aggregate;
  /** fetch data from the table: "image_analysis_text_blocks" using primary key columns */
  image_analysis_text_blocks_by_pk?: Maybe<Image_Analysis_Text_Blocks>;
  /** fetch data from the table in a streaming manner: "image_analysis_text_blocks" */
  image_analysis_text_blocks_stream: Array<Image_Analysis_Text_Blocks>;
  /** fetch data from the table: "item_onboardings" */
  item_onboardings: Array<Item_Onboardings>;
  /** fetch aggregated fields from the table: "item_onboardings" */
  item_onboardings_aggregate: Item_Onboardings_Aggregate;
  /** fetch data from the table: "item_onboardings" using primary key columns */
  item_onboardings_by_pk?: Maybe<Item_Onboardings>;
  /** fetch data from the table in a streaming manner: "item_onboardings" */
  item_onboardings_stream: Array<Item_Onboardings>;
  /** fetch data from the table: "spirit_type" */
  spirit_type: Array<Spirit_Type>;
  /** fetch aggregated fields from the table: "spirit_type" */
  spirit_type_aggregate: Spirit_Type_Aggregate;
  /** fetch data from the table: "spirit_type" using primary key columns */
  spirit_type_by_pk?: Maybe<Spirit_Type>;
  /** fetch data from the table in a streaming manner: "spirit_type" */
  spirit_type_stream: Array<Spirit_Type>;
  /** An array relationship */
  spirits: Array<Spirits>;
  /** An aggregate relationship */
  spirits_aggregate: Spirits_Aggregate;
  /** fetch data from the table: "spirits" using primary key columns */
  spirits_by_pk?: Maybe<Spirits>;
  /** fetch data from the table in a streaming manner: "spirits" */
  spirits_stream: Array<Spirits>;
  /** fetch data from the table: "auth.users" using primary key columns */
  user?: Maybe<Users>;
  /** fetch data from the table: "auth.users" */
  users: Array<Users>;
  /** fetch aggregated fields from the table: "auth.users" */
  usersAggregate: Users_Aggregate;
  /** fetch data from the table in a streaming manner: "auth.users" */
  users_stream: Array<Users>;
  /** fetch data from the table: "storage.virus" using primary key columns */
  virus?: Maybe<Virus>;
  /** fetch data from the table in a streaming manner: "storage.virus" */
  virus_stream: Array<Virus>;
  /** fetch data from the table: "storage.virus" */
  viruses: Array<Virus>;
  /** fetch aggregated fields from the table: "storage.virus" */
  virusesAggregate: Virus_Aggregate;
  /** An array relationship */
  wines: Array<Wines>;
  /** An aggregate relationship */
  wines_aggregate: Wines_Aggregate;
  /** fetch data from the table: "wines" using primary key columns */
  wines_by_pk?: Maybe<Wines>;
  /** fetch data from the table in a streaming manner: "wines" */
  wines_stream: Array<Wines>;
};


export type Subscription_RootAuthProviderArgs = {
  id: Scalars['String']['input'];
};


export type Subscription_RootAuthProviderRequestArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootAuthProviderRequestsArgs = {
  distinct_on?: InputMaybe<Array<AuthProviderRequests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthProviderRequests_Order_By>>;
  where?: InputMaybe<AuthProviderRequests_Bool_Exp>;
};


export type Subscription_RootAuthProviderRequestsAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthProviderRequests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthProviderRequests_Order_By>>;
  where?: InputMaybe<AuthProviderRequests_Bool_Exp>;
};


export type Subscription_RootAuthProviderRequests_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<AuthProviderRequests_Stream_Cursor_Input>>;
  where?: InputMaybe<AuthProviderRequests_Bool_Exp>;
};


export type Subscription_RootAuthProvidersArgs = {
  distinct_on?: InputMaybe<Array<AuthProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthProviders_Order_By>>;
  where?: InputMaybe<AuthProviders_Bool_Exp>;
};


export type Subscription_RootAuthProvidersAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthProviders_Order_By>>;
  where?: InputMaybe<AuthProviders_Bool_Exp>;
};


export type Subscription_RootAuthProviders_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<AuthProviders_Stream_Cursor_Input>>;
  where?: InputMaybe<AuthProviders_Bool_Exp>;
};


export type Subscription_RootAuthRefreshTokenArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootAuthRefreshTokenTypeArgs = {
  value: Scalars['String']['input'];
};


export type Subscription_RootAuthRefreshTokenTypesArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokenTypes_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokenTypes_Order_By>>;
  where?: InputMaybe<AuthRefreshTokenTypes_Bool_Exp>;
};


export type Subscription_RootAuthRefreshTokenTypesAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokenTypes_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokenTypes_Order_By>>;
  where?: InputMaybe<AuthRefreshTokenTypes_Bool_Exp>;
};


export type Subscription_RootAuthRefreshTokenTypes_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<AuthRefreshTokenTypes_Stream_Cursor_Input>>;
  where?: InputMaybe<AuthRefreshTokenTypes_Bool_Exp>;
};


export type Subscription_RootAuthRefreshTokensArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokens_Order_By>>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};


export type Subscription_RootAuthRefreshTokensAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokens_Order_By>>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};


export type Subscription_RootAuthRefreshTokens_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<AuthRefreshTokens_Stream_Cursor_Input>>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};


export type Subscription_RootAuthRoleArgs = {
  role: Scalars['String']['input'];
};


export type Subscription_RootAuthRolesArgs = {
  distinct_on?: InputMaybe<Array<AuthRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRoles_Order_By>>;
  where?: InputMaybe<AuthRoles_Bool_Exp>;
};


export type Subscription_RootAuthRolesAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRoles_Order_By>>;
  where?: InputMaybe<AuthRoles_Bool_Exp>;
};


export type Subscription_RootAuthRoles_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<AuthRoles_Stream_Cursor_Input>>;
  where?: InputMaybe<AuthRoles_Bool_Exp>;
};


export type Subscription_RootAuthUserProviderArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootAuthUserProvidersArgs = {
  distinct_on?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserProviders_Order_By>>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};


export type Subscription_RootAuthUserProvidersAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserProviders_Order_By>>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};


export type Subscription_RootAuthUserProviders_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<AuthUserProviders_Stream_Cursor_Input>>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};


export type Subscription_RootAuthUserRoleArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootAuthUserRolesArgs = {
  distinct_on?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserRoles_Order_By>>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};


export type Subscription_RootAuthUserRolesAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserRoles_Order_By>>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};


export type Subscription_RootAuthUserRoles_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<AuthUserRoles_Stream_Cursor_Input>>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};


export type Subscription_RootAuthUserSecurityKeyArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootAuthUserSecurityKeysArgs = {
  distinct_on?: InputMaybe<Array<AuthUserSecurityKeys_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserSecurityKeys_Order_By>>;
  where?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
};


export type Subscription_RootAuthUserSecurityKeysAggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserSecurityKeys_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserSecurityKeys_Order_By>>;
  where?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
};


export type Subscription_RootAuthUserSecurityKeys_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<AuthUserSecurityKeys_Stream_Cursor_Input>>;
  where?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
};


export type Subscription_RootBarcodesArgs = {
  distinct_on?: InputMaybe<Array<Barcodes_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Barcodes_Order_By>>;
  where?: InputMaybe<Barcodes_Bool_Exp>;
};


export type Subscription_RootBarcodes_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Barcodes_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Barcodes_Order_By>>;
  where?: InputMaybe<Barcodes_Bool_Exp>;
};


export type Subscription_RootBarcodes_By_PkArgs = {
  code: Scalars['String']['input'];
};


export type Subscription_RootBarcodes_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Barcodes_Stream_Cursor_Input>>;
  where?: InputMaybe<Barcodes_Bool_Exp>;
};


export type Subscription_RootBeersArgs = {
  distinct_on?: InputMaybe<Array<Beers_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beers_Order_By>>;
  where?: InputMaybe<Beers_Bool_Exp>;
};


export type Subscription_RootBeers_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Beers_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beers_Order_By>>;
  where?: InputMaybe<Beers_Bool_Exp>;
};


export type Subscription_RootBeers_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootBeers_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Beers_Stream_Cursor_Input>>;
  where?: InputMaybe<Beers_Bool_Exp>;
};


export type Subscription_RootBucketArgs = {
  id: Scalars['String']['input'];
};


export type Subscription_RootBucketsArgs = {
  distinct_on?: InputMaybe<Array<Buckets_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Buckets_Order_By>>;
  where?: InputMaybe<Buckets_Bool_Exp>;
};


export type Subscription_RootBucketsAggregateArgs = {
  distinct_on?: InputMaybe<Array<Buckets_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Buckets_Order_By>>;
  where?: InputMaybe<Buckets_Bool_Exp>;
};


export type Subscription_RootBuckets_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Buckets_Stream_Cursor_Input>>;
  where?: InputMaybe<Buckets_Bool_Exp>;
};


export type Subscription_RootCellar_UserArgs = {
  distinct_on?: InputMaybe<Array<Cellar_User_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_User_Order_By>>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};


export type Subscription_RootCellar_User_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_User_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_User_Order_By>>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};


export type Subscription_RootCellar_User_By_PkArgs = {
  id: Scalars['Int']['input'];
};


export type Subscription_RootCellar_User_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Cellar_User_Stream_Cursor_Input>>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};


export type Subscription_RootCellarsArgs = {
  distinct_on?: InputMaybe<Array<Cellars_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellars_Order_By>>;
  where?: InputMaybe<Cellars_Bool_Exp>;
};


export type Subscription_RootCellars_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellars_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellars_Order_By>>;
  where?: InputMaybe<Cellars_Bool_Exp>;
};


export type Subscription_RootCellars_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootCellars_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Cellars_Stream_Cursor_Input>>;
  where?: InputMaybe<Cellars_Bool_Exp>;
};


export type Subscription_RootFileArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootFilesArgs = {
  distinct_on?: InputMaybe<Array<Files_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Files_Order_By>>;
  where?: InputMaybe<Files_Bool_Exp>;
};


export type Subscription_RootFilesAggregateArgs = {
  distinct_on?: InputMaybe<Array<Files_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Files_Order_By>>;
  where?: InputMaybe<Files_Bool_Exp>;
};


export type Subscription_RootFiles_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Files_Stream_Cursor_Input>>;
  where?: InputMaybe<Files_Bool_Exp>;
};


export type Subscription_RootImage_AnalysisArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Order_By>>;
  where?: InputMaybe<Image_Analysis_Bool_Exp>;
};


export type Subscription_RootImage_Analysis_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Order_By>>;
  where?: InputMaybe<Image_Analysis_Bool_Exp>;
};


export type Subscription_RootImage_Analysis_By_PkArgs = {
  id: Scalars['Int']['input'];
};


export type Subscription_RootImage_Analysis_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Image_Analysis_Stream_Cursor_Input>>;
  where?: InputMaybe<Image_Analysis_Bool_Exp>;
};


export type Subscription_RootImage_Analysis_Text_BlocksArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Text_Blocks_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Text_Blocks_Order_By>>;
  where?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
};


export type Subscription_RootImage_Analysis_Text_Blocks_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Image_Analysis_Text_Blocks_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Analysis_Text_Blocks_Order_By>>;
  where?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
};


export type Subscription_RootImage_Analysis_Text_Blocks_By_PkArgs = {
  id: Scalars['Int']['input'];
};


export type Subscription_RootImage_Analysis_Text_Blocks_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Image_Analysis_Text_Blocks_Stream_Cursor_Input>>;
  where?: InputMaybe<Image_Analysis_Text_Blocks_Bool_Exp>;
};


export type Subscription_RootItem_OnboardingsArgs = {
  distinct_on?: InputMaybe<Array<Item_Onboardings_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Onboardings_Order_By>>;
  where?: InputMaybe<Item_Onboardings_Bool_Exp>;
};


export type Subscription_RootItem_Onboardings_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Onboardings_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Onboardings_Order_By>>;
  where?: InputMaybe<Item_Onboardings_Bool_Exp>;
};


export type Subscription_RootItem_Onboardings_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItem_Onboardings_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Item_Onboardings_Stream_Cursor_Input>>;
  where?: InputMaybe<Item_Onboardings_Bool_Exp>;
};


export type Subscription_RootSpirit_TypeArgs = {
  distinct_on?: InputMaybe<Array<Spirit_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirit_Type_Order_By>>;
  where?: InputMaybe<Spirit_Type_Bool_Exp>;
};


export type Subscription_RootSpirit_Type_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Spirit_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirit_Type_Order_By>>;
  where?: InputMaybe<Spirit_Type_Bool_Exp>;
};


export type Subscription_RootSpirit_Type_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootSpirit_Type_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Spirit_Type_Stream_Cursor_Input>>;
  where?: InputMaybe<Spirit_Type_Bool_Exp>;
};


export type Subscription_RootSpiritsArgs = {
  distinct_on?: InputMaybe<Array<Spirits_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirits_Order_By>>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};


export type Subscription_RootSpirits_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Spirits_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirits_Order_By>>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};


export type Subscription_RootSpirits_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootSpirits_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Spirits_Stream_Cursor_Input>>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};


export type Subscription_RootUserArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootUsersArgs = {
  distinct_on?: InputMaybe<Array<Users_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Users_Order_By>>;
  where?: InputMaybe<Users_Bool_Exp>;
};


export type Subscription_RootUsersAggregateArgs = {
  distinct_on?: InputMaybe<Array<Users_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Users_Order_By>>;
  where?: InputMaybe<Users_Bool_Exp>;
};


export type Subscription_RootUsers_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Users_Stream_Cursor_Input>>;
  where?: InputMaybe<Users_Bool_Exp>;
};


export type Subscription_RootVirusArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootVirus_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Virus_Stream_Cursor_Input>>;
  where?: InputMaybe<Virus_Bool_Exp>;
};


export type Subscription_RootVirusesArgs = {
  distinct_on?: InputMaybe<Array<Virus_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Virus_Order_By>>;
  where?: InputMaybe<Virus_Bool_Exp>;
};


export type Subscription_RootVirusesAggregateArgs = {
  distinct_on?: InputMaybe<Array<Virus_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Virus_Order_By>>;
  where?: InputMaybe<Virus_Bool_Exp>;
};


export type Subscription_RootWinesArgs = {
  distinct_on?: InputMaybe<Array<Wines_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wines_Order_By>>;
  where?: InputMaybe<Wines_Bool_Exp>;
};


export type Subscription_RootWines_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Wines_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wines_Order_By>>;
  where?: InputMaybe<Wines_Bool_Exp>;
};


export type Subscription_RootWines_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootWines_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Wines_Stream_Cursor_Input>>;
  where?: InputMaybe<Wines_Bool_Exp>;
};

/** Boolean expression to compare columns of type "timestamptz". All fields are combined with logical 'AND'. */
export type Timestamptz_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['timestamptz']['input']>;
  _gt?: InputMaybe<Scalars['timestamptz']['input']>;
  _gte?: InputMaybe<Scalars['timestamptz']['input']>;
  _in?: InputMaybe<Array<Scalars['timestamptz']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['timestamptz']['input']>;
  _lte?: InputMaybe<Scalars['timestamptz']['input']>;
  _neq?: InputMaybe<Scalars['timestamptz']['input']>;
  _nin?: InputMaybe<Array<Scalars['timestamptz']['input']>>;
};

/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type Users = {
  __typename: 'users';
  activeMfaType?: Maybe<Scalars['String']['output']>;
  avatarUrl: Scalars['String']['output'];
  /** An array relationship */
  cellarsOwned: Array<Cellars>;
  /** An aggregate relationship */
  cellarsOwned_aggregate: Cellars_Aggregate;
  /** An array relationship */
  cellarsShared: Array<Cellar_User>;
  /** An aggregate relationship */
  cellarsShared_aggregate: Cellar_User_Aggregate;
  createdAt: Scalars['timestamptz']['output'];
  currentChallenge?: Maybe<Scalars['String']['output']>;
  defaultRole: Scalars['String']['output'];
  /** An object relationship */
  defaultRoleByRole: AuthRoles;
  disabled: Scalars['Boolean']['output'];
  displayName: Scalars['String']['output'];
  email?: Maybe<Scalars['citext']['output']>;
  emailVerified: Scalars['Boolean']['output'];
  id: Scalars['uuid']['output'];
  isAnonymous: Scalars['Boolean']['output'];
  lastSeen?: Maybe<Scalars['timestamptz']['output']>;
  locale: Scalars['String']['output'];
  metadata?: Maybe<Scalars['jsonb']['output']>;
  newEmail?: Maybe<Scalars['citext']['output']>;
  otpHash?: Maybe<Scalars['String']['output']>;
  otpHashExpiresAt: Scalars['timestamptz']['output'];
  otpMethodLastUsed?: Maybe<Scalars['String']['output']>;
  passwordHash?: Maybe<Scalars['String']['output']>;
  phoneNumber?: Maybe<Scalars['String']['output']>;
  phoneNumberVerified: Scalars['Boolean']['output'];
  /** An array relationship */
  refreshTokens: Array<AuthRefreshTokens>;
  /** An aggregate relationship */
  refreshTokens_aggregate: AuthRefreshTokens_Aggregate;
  /** An array relationship */
  roles: Array<AuthUserRoles>;
  /** An aggregate relationship */
  roles_aggregate: AuthUserRoles_Aggregate;
  /** An array relationship */
  securityKeys: Array<AuthUserSecurityKeys>;
  /** An aggregate relationship */
  securityKeys_aggregate: AuthUserSecurityKeys_Aggregate;
  ticket?: Maybe<Scalars['String']['output']>;
  ticketExpiresAt: Scalars['timestamptz']['output'];
  totpSecret?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['timestamptz']['output'];
  /** An array relationship */
  userProviders: Array<AuthUserProviders>;
  /** An aggregate relationship */
  userProviders_aggregate: AuthUserProviders_Aggregate;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersCellarsOwnedArgs = {
  distinct_on?: InputMaybe<Array<Cellars_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellars_Order_By>>;
  where?: InputMaybe<Cellars_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersCellarsOwned_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellars_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellars_Order_By>>;
  where?: InputMaybe<Cellars_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersCellarsSharedArgs = {
  distinct_on?: InputMaybe<Array<Cellar_User_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_User_Order_By>>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersCellarsShared_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_User_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_User_Order_By>>;
  where?: InputMaybe<Cellar_User_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersMetadataArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersRefreshTokensArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokens_Order_By>>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersRefreshTokens_AggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthRefreshTokens_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthRefreshTokens_Order_By>>;
  where?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersRolesArgs = {
  distinct_on?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserRoles_Order_By>>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersRoles_AggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserRoles_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserRoles_Order_By>>;
  where?: InputMaybe<AuthUserRoles_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersSecurityKeysArgs = {
  distinct_on?: InputMaybe<Array<AuthUserSecurityKeys_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserSecurityKeys_Order_By>>;
  where?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersSecurityKeys_AggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserSecurityKeys_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserSecurityKeys_Order_By>>;
  where?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersUserProvidersArgs = {
  distinct_on?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserProviders_Order_By>>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersUserProviders_AggregateArgs = {
  distinct_on?: InputMaybe<Array<AuthUserProviders_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<AuthUserProviders_Order_By>>;
  where?: InputMaybe<AuthUserProviders_Bool_Exp>;
};

/** aggregated selection of "auth.users" */
export type Users_Aggregate = {
  __typename: 'users_aggregate';
  aggregate?: Maybe<Users_Aggregate_Fields>;
  nodes: Array<Users>;
};

export type Users_Aggregate_Bool_Exp = {
  bool_and?: InputMaybe<Users_Aggregate_Bool_Exp_Bool_And>;
  bool_or?: InputMaybe<Users_Aggregate_Bool_Exp_Bool_Or>;
  count?: InputMaybe<Users_Aggregate_Bool_Exp_Count>;
};

export type Users_Aggregate_Bool_Exp_Bool_And = {
  arguments: Users_Select_Column_Users_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Users_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Users_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Users_Select_Column_Users_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Users_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Users_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Users_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Users_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "auth.users" */
export type Users_Aggregate_Fields = {
  __typename: 'users_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Users_Max_Fields>;
  min?: Maybe<Users_Min_Fields>;
};


/** aggregate fields of "auth.users" */
export type Users_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Users_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "auth.users" */
export type Users_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Users_Max_Order_By>;
  min?: InputMaybe<Users_Min_Order_By>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type Users_Append_Input = {
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
};

/** input type for inserting array relation for remote table "auth.users" */
export type Users_Arr_Rel_Insert_Input = {
  data: Array<Users_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Users_On_Conflict>;
};

/** Boolean expression to filter rows from the table "auth.users". All fields are combined with a logical 'AND'. */
export type Users_Bool_Exp = {
  _and?: InputMaybe<Array<Users_Bool_Exp>>;
  _not?: InputMaybe<Users_Bool_Exp>;
  _or?: InputMaybe<Array<Users_Bool_Exp>>;
  activeMfaType?: InputMaybe<String_Comparison_Exp>;
  avatarUrl?: InputMaybe<String_Comparison_Exp>;
  cellarsOwned?: InputMaybe<Cellars_Bool_Exp>;
  cellarsOwned_aggregate?: InputMaybe<Cellars_Aggregate_Bool_Exp>;
  cellarsShared?: InputMaybe<Cellar_User_Bool_Exp>;
  cellarsShared_aggregate?: InputMaybe<Cellar_User_Aggregate_Bool_Exp>;
  createdAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  currentChallenge?: InputMaybe<String_Comparison_Exp>;
  defaultRole?: InputMaybe<String_Comparison_Exp>;
  defaultRoleByRole?: InputMaybe<AuthRoles_Bool_Exp>;
  disabled?: InputMaybe<Boolean_Comparison_Exp>;
  displayName?: InputMaybe<String_Comparison_Exp>;
  email?: InputMaybe<Citext_Comparison_Exp>;
  emailVerified?: InputMaybe<Boolean_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  isAnonymous?: InputMaybe<Boolean_Comparison_Exp>;
  lastSeen?: InputMaybe<Timestamptz_Comparison_Exp>;
  locale?: InputMaybe<String_Comparison_Exp>;
  metadata?: InputMaybe<Jsonb_Comparison_Exp>;
  newEmail?: InputMaybe<Citext_Comparison_Exp>;
  otpHash?: InputMaybe<String_Comparison_Exp>;
  otpHashExpiresAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  otpMethodLastUsed?: InputMaybe<String_Comparison_Exp>;
  passwordHash?: InputMaybe<String_Comparison_Exp>;
  phoneNumber?: InputMaybe<String_Comparison_Exp>;
  phoneNumberVerified?: InputMaybe<Boolean_Comparison_Exp>;
  refreshTokens?: InputMaybe<AuthRefreshTokens_Bool_Exp>;
  refreshTokens_aggregate?: InputMaybe<AuthRefreshTokens_Aggregate_Bool_Exp>;
  roles?: InputMaybe<AuthUserRoles_Bool_Exp>;
  roles_aggregate?: InputMaybe<AuthUserRoles_Aggregate_Bool_Exp>;
  securityKeys?: InputMaybe<AuthUserSecurityKeys_Bool_Exp>;
  securityKeys_aggregate?: InputMaybe<AuthUserSecurityKeys_Aggregate_Bool_Exp>;
  ticket?: InputMaybe<String_Comparison_Exp>;
  ticketExpiresAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  totpSecret?: InputMaybe<String_Comparison_Exp>;
  updatedAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  userProviders?: InputMaybe<AuthUserProviders_Bool_Exp>;
  userProviders_aggregate?: InputMaybe<AuthUserProviders_Aggregate_Bool_Exp>;
};

/** unique or primary key constraints on table "auth.users" */
export enum Users_Constraint {
  /** unique or primary key constraint on columns "email" */
  UsersEmailKey = 'users_email_key',
  /** unique or primary key constraint on columns "phone_number" */
  UsersPhoneNumberKey = 'users_phone_number_key',
  /** unique or primary key constraint on columns "id" */
  UsersPkey = 'users_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type Users_Delete_At_Path_Input = {
  metadata?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type Users_Delete_Elem_Input = {
  metadata?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type Users_Delete_Key_Input = {
  metadata?: InputMaybe<Scalars['String']['input']>;
};

/** input type for inserting data into table "auth.users" */
export type Users_Insert_Input = {
  activeMfaType?: InputMaybe<Scalars['String']['input']>;
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  cellarsOwned?: InputMaybe<Cellars_Arr_Rel_Insert_Input>;
  cellarsShared?: InputMaybe<Cellar_User_Arr_Rel_Insert_Input>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  currentChallenge?: InputMaybe<Scalars['String']['input']>;
  defaultRole?: InputMaybe<Scalars['String']['input']>;
  defaultRoleByRole?: InputMaybe<AuthRoles_Obj_Rel_Insert_Input>;
  disabled?: InputMaybe<Scalars['Boolean']['input']>;
  displayName?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['citext']['input']>;
  emailVerified?: InputMaybe<Scalars['Boolean']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  isAnonymous?: InputMaybe<Scalars['Boolean']['input']>;
  lastSeen?: InputMaybe<Scalars['timestamptz']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  newEmail?: InputMaybe<Scalars['citext']['input']>;
  otpHash?: InputMaybe<Scalars['String']['input']>;
  otpHashExpiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  otpMethodLastUsed?: InputMaybe<Scalars['String']['input']>;
  passwordHash?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  phoneNumberVerified?: InputMaybe<Scalars['Boolean']['input']>;
  refreshTokens?: InputMaybe<AuthRefreshTokens_Arr_Rel_Insert_Input>;
  roles?: InputMaybe<AuthUserRoles_Arr_Rel_Insert_Input>;
  securityKeys?: InputMaybe<AuthUserSecurityKeys_Arr_Rel_Insert_Input>;
  ticket?: InputMaybe<Scalars['String']['input']>;
  ticketExpiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  totpSecret?: InputMaybe<Scalars['String']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  userProviders?: InputMaybe<AuthUserProviders_Arr_Rel_Insert_Input>;
};

/** aggregate max on columns */
export type Users_Max_Fields = {
  __typename: 'users_max_fields';
  activeMfaType?: Maybe<Scalars['String']['output']>;
  avatarUrl?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  currentChallenge?: Maybe<Scalars['String']['output']>;
  defaultRole?: Maybe<Scalars['String']['output']>;
  displayName?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['citext']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  lastSeen?: Maybe<Scalars['timestamptz']['output']>;
  locale?: Maybe<Scalars['String']['output']>;
  newEmail?: Maybe<Scalars['citext']['output']>;
  otpHash?: Maybe<Scalars['String']['output']>;
  otpHashExpiresAt?: Maybe<Scalars['timestamptz']['output']>;
  otpMethodLastUsed?: Maybe<Scalars['String']['output']>;
  passwordHash?: Maybe<Scalars['String']['output']>;
  phoneNumber?: Maybe<Scalars['String']['output']>;
  ticket?: Maybe<Scalars['String']['output']>;
  ticketExpiresAt?: Maybe<Scalars['timestamptz']['output']>;
  totpSecret?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by max() on columns of table "auth.users" */
export type Users_Max_Order_By = {
  activeMfaType?: InputMaybe<Order_By>;
  avatarUrl?: InputMaybe<Order_By>;
  createdAt?: InputMaybe<Order_By>;
  currentChallenge?: InputMaybe<Order_By>;
  defaultRole?: InputMaybe<Order_By>;
  displayName?: InputMaybe<Order_By>;
  email?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  lastSeen?: InputMaybe<Order_By>;
  locale?: InputMaybe<Order_By>;
  newEmail?: InputMaybe<Order_By>;
  otpHash?: InputMaybe<Order_By>;
  otpHashExpiresAt?: InputMaybe<Order_By>;
  otpMethodLastUsed?: InputMaybe<Order_By>;
  passwordHash?: InputMaybe<Order_By>;
  phoneNumber?: InputMaybe<Order_By>;
  ticket?: InputMaybe<Order_By>;
  ticketExpiresAt?: InputMaybe<Order_By>;
  totpSecret?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Users_Min_Fields = {
  __typename: 'users_min_fields';
  activeMfaType?: Maybe<Scalars['String']['output']>;
  avatarUrl?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  currentChallenge?: Maybe<Scalars['String']['output']>;
  defaultRole?: Maybe<Scalars['String']['output']>;
  displayName?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['citext']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  lastSeen?: Maybe<Scalars['timestamptz']['output']>;
  locale?: Maybe<Scalars['String']['output']>;
  newEmail?: Maybe<Scalars['citext']['output']>;
  otpHash?: Maybe<Scalars['String']['output']>;
  otpHashExpiresAt?: Maybe<Scalars['timestamptz']['output']>;
  otpMethodLastUsed?: Maybe<Scalars['String']['output']>;
  passwordHash?: Maybe<Scalars['String']['output']>;
  phoneNumber?: Maybe<Scalars['String']['output']>;
  ticket?: Maybe<Scalars['String']['output']>;
  ticketExpiresAt?: Maybe<Scalars['timestamptz']['output']>;
  totpSecret?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by min() on columns of table "auth.users" */
export type Users_Min_Order_By = {
  activeMfaType?: InputMaybe<Order_By>;
  avatarUrl?: InputMaybe<Order_By>;
  createdAt?: InputMaybe<Order_By>;
  currentChallenge?: InputMaybe<Order_By>;
  defaultRole?: InputMaybe<Order_By>;
  displayName?: InputMaybe<Order_By>;
  email?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  lastSeen?: InputMaybe<Order_By>;
  locale?: InputMaybe<Order_By>;
  newEmail?: InputMaybe<Order_By>;
  otpHash?: InputMaybe<Order_By>;
  otpHashExpiresAt?: InputMaybe<Order_By>;
  otpMethodLastUsed?: InputMaybe<Order_By>;
  passwordHash?: InputMaybe<Order_By>;
  phoneNumber?: InputMaybe<Order_By>;
  ticket?: InputMaybe<Order_By>;
  ticketExpiresAt?: InputMaybe<Order_By>;
  totpSecret?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "auth.users" */
export type Users_Mutation_Response = {
  __typename: 'users_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Users>;
};

/** input type for inserting object relation for remote table "auth.users" */
export type Users_Obj_Rel_Insert_Input = {
  data: Users_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Users_On_Conflict>;
};

/** on_conflict condition type for table "auth.users" */
export type Users_On_Conflict = {
  constraint: Users_Constraint;
  update_columns?: Array<Users_Update_Column>;
  where?: InputMaybe<Users_Bool_Exp>;
};

/** Ordering options when selecting data from "auth.users". */
export type Users_Order_By = {
  activeMfaType?: InputMaybe<Order_By>;
  avatarUrl?: InputMaybe<Order_By>;
  cellarsOwned_aggregate?: InputMaybe<Cellars_Aggregate_Order_By>;
  cellarsShared_aggregate?: InputMaybe<Cellar_User_Aggregate_Order_By>;
  createdAt?: InputMaybe<Order_By>;
  currentChallenge?: InputMaybe<Order_By>;
  defaultRole?: InputMaybe<Order_By>;
  defaultRoleByRole?: InputMaybe<AuthRoles_Order_By>;
  disabled?: InputMaybe<Order_By>;
  displayName?: InputMaybe<Order_By>;
  email?: InputMaybe<Order_By>;
  emailVerified?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  isAnonymous?: InputMaybe<Order_By>;
  lastSeen?: InputMaybe<Order_By>;
  locale?: InputMaybe<Order_By>;
  metadata?: InputMaybe<Order_By>;
  newEmail?: InputMaybe<Order_By>;
  otpHash?: InputMaybe<Order_By>;
  otpHashExpiresAt?: InputMaybe<Order_By>;
  otpMethodLastUsed?: InputMaybe<Order_By>;
  passwordHash?: InputMaybe<Order_By>;
  phoneNumber?: InputMaybe<Order_By>;
  phoneNumberVerified?: InputMaybe<Order_By>;
  refreshTokens_aggregate?: InputMaybe<AuthRefreshTokens_Aggregate_Order_By>;
  roles_aggregate?: InputMaybe<AuthUserRoles_Aggregate_Order_By>;
  securityKeys_aggregate?: InputMaybe<AuthUserSecurityKeys_Aggregate_Order_By>;
  ticket?: InputMaybe<Order_By>;
  ticketExpiresAt?: InputMaybe<Order_By>;
  totpSecret?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
  userProviders_aggregate?: InputMaybe<AuthUserProviders_Aggregate_Order_By>;
};

/** primary key columns input for table: auth.users */
export type Users_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type Users_Prepend_Input = {
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "auth.users" */
export enum Users_Select_Column {
  /** column name */
  ActiveMfaType = 'activeMfaType',
  /** column name */
  AvatarUrl = 'avatarUrl',
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  CurrentChallenge = 'currentChallenge',
  /** column name */
  DefaultRole = 'defaultRole',
  /** column name */
  Disabled = 'disabled',
  /** column name */
  DisplayName = 'displayName',
  /** column name */
  Email = 'email',
  /** column name */
  EmailVerified = 'emailVerified',
  /** column name */
  Id = 'id',
  /** column name */
  IsAnonymous = 'isAnonymous',
  /** column name */
  LastSeen = 'lastSeen',
  /** column name */
  Locale = 'locale',
  /** column name */
  Metadata = 'metadata',
  /** column name */
  NewEmail = 'newEmail',
  /** column name */
  OtpHash = 'otpHash',
  /** column name */
  OtpHashExpiresAt = 'otpHashExpiresAt',
  /** column name */
  OtpMethodLastUsed = 'otpMethodLastUsed',
  /** column name */
  PasswordHash = 'passwordHash',
  /** column name */
  PhoneNumber = 'phoneNumber',
  /** column name */
  PhoneNumberVerified = 'phoneNumberVerified',
  /** column name */
  Ticket = 'ticket',
  /** column name */
  TicketExpiresAt = 'ticketExpiresAt',
  /** column name */
  TotpSecret = 'totpSecret',
  /** column name */
  UpdatedAt = 'updatedAt'
}

/** select "users_aggregate_bool_exp_bool_and_arguments_columns" columns of table "auth.users" */
export enum Users_Select_Column_Users_Aggregate_Bool_Exp_Bool_And_Arguments_Columns {
  /** column name */
  Disabled = 'disabled',
  /** column name */
  EmailVerified = 'emailVerified',
  /** column name */
  IsAnonymous = 'isAnonymous',
  /** column name */
  PhoneNumberVerified = 'phoneNumberVerified'
}

/** select "users_aggregate_bool_exp_bool_or_arguments_columns" columns of table "auth.users" */
export enum Users_Select_Column_Users_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns {
  /** column name */
  Disabled = 'disabled',
  /** column name */
  EmailVerified = 'emailVerified',
  /** column name */
  IsAnonymous = 'isAnonymous',
  /** column name */
  PhoneNumberVerified = 'phoneNumberVerified'
}

/** input type for updating data in table "auth.users" */
export type Users_Set_Input = {
  activeMfaType?: InputMaybe<Scalars['String']['input']>;
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  currentChallenge?: InputMaybe<Scalars['String']['input']>;
  defaultRole?: InputMaybe<Scalars['String']['input']>;
  disabled?: InputMaybe<Scalars['Boolean']['input']>;
  displayName?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['citext']['input']>;
  emailVerified?: InputMaybe<Scalars['Boolean']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  isAnonymous?: InputMaybe<Scalars['Boolean']['input']>;
  lastSeen?: InputMaybe<Scalars['timestamptz']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  newEmail?: InputMaybe<Scalars['citext']['input']>;
  otpHash?: InputMaybe<Scalars['String']['input']>;
  otpHashExpiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  otpMethodLastUsed?: InputMaybe<Scalars['String']['input']>;
  passwordHash?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  phoneNumberVerified?: InputMaybe<Scalars['Boolean']['input']>;
  ticket?: InputMaybe<Scalars['String']['input']>;
  ticketExpiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  totpSecret?: InputMaybe<Scalars['String']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** Streaming cursor of the table "users" */
export type Users_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Users_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Users_Stream_Cursor_Value_Input = {
  activeMfaType?: InputMaybe<Scalars['String']['input']>;
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  currentChallenge?: InputMaybe<Scalars['String']['input']>;
  defaultRole?: InputMaybe<Scalars['String']['input']>;
  disabled?: InputMaybe<Scalars['Boolean']['input']>;
  displayName?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['citext']['input']>;
  emailVerified?: InputMaybe<Scalars['Boolean']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  isAnonymous?: InputMaybe<Scalars['Boolean']['input']>;
  lastSeen?: InputMaybe<Scalars['timestamptz']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  newEmail?: InputMaybe<Scalars['citext']['input']>;
  otpHash?: InputMaybe<Scalars['String']['input']>;
  otpHashExpiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  otpMethodLastUsed?: InputMaybe<Scalars['String']['input']>;
  passwordHash?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  phoneNumberVerified?: InputMaybe<Scalars['Boolean']['input']>;
  ticket?: InputMaybe<Scalars['String']['input']>;
  ticketExpiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  totpSecret?: InputMaybe<Scalars['String']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** update columns of table "auth.users" */
export enum Users_Update_Column {
  /** column name */
  ActiveMfaType = 'activeMfaType',
  /** column name */
  AvatarUrl = 'avatarUrl',
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  CurrentChallenge = 'currentChallenge',
  /** column name */
  DefaultRole = 'defaultRole',
  /** column name */
  Disabled = 'disabled',
  /** column name */
  DisplayName = 'displayName',
  /** column name */
  Email = 'email',
  /** column name */
  EmailVerified = 'emailVerified',
  /** column name */
  Id = 'id',
  /** column name */
  IsAnonymous = 'isAnonymous',
  /** column name */
  LastSeen = 'lastSeen',
  /** column name */
  Locale = 'locale',
  /** column name */
  Metadata = 'metadata',
  /** column name */
  NewEmail = 'newEmail',
  /** column name */
  OtpHash = 'otpHash',
  /** column name */
  OtpHashExpiresAt = 'otpHashExpiresAt',
  /** column name */
  OtpMethodLastUsed = 'otpMethodLastUsed',
  /** column name */
  PasswordHash = 'passwordHash',
  /** column name */
  PhoneNumber = 'phoneNumber',
  /** column name */
  PhoneNumberVerified = 'phoneNumberVerified',
  /** column name */
  Ticket = 'ticket',
  /** column name */
  TicketExpiresAt = 'ticketExpiresAt',
  /** column name */
  TotpSecret = 'totpSecret',
  /** column name */
  UpdatedAt = 'updatedAt'
}

export type Users_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<Users_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<Users_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<Users_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<Users_Delete_Key_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<Users_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Users_Set_Input>;
  /** filter the rows which have to be updated */
  where: Users_Bool_Exp;
};

/** Boolean expression to compare columns of type "uuid". All fields are combined with logical 'AND'. */
export type Uuid_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['uuid']['input']>;
  _gt?: InputMaybe<Scalars['uuid']['input']>;
  _gte?: InputMaybe<Scalars['uuid']['input']>;
  _in?: InputMaybe<Array<Scalars['uuid']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['uuid']['input']>;
  _lte?: InputMaybe<Scalars['uuid']['input']>;
  _neq?: InputMaybe<Scalars['uuid']['input']>;
  _nin?: InputMaybe<Array<Scalars['uuid']['input']>>;
};

/** columns and relationships of "storage.virus" */
export type Virus = {
  __typename: 'virus';
  createdAt: Scalars['timestamptz']['output'];
  /** An object relationship */
  file: Files;
  fileId: Scalars['uuid']['output'];
  filename: Scalars['String']['output'];
  id: Scalars['uuid']['output'];
  updatedAt: Scalars['timestamptz']['output'];
  userSession: Scalars['jsonb']['output'];
  virus: Scalars['String']['output'];
};


/** columns and relationships of "storage.virus" */
export type VirusUserSessionArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};

/** aggregated selection of "storage.virus" */
export type Virus_Aggregate = {
  __typename: 'virus_aggregate';
  aggregate?: Maybe<Virus_Aggregate_Fields>;
  nodes: Array<Virus>;
};

/** aggregate fields of "storage.virus" */
export type Virus_Aggregate_Fields = {
  __typename: 'virus_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Virus_Max_Fields>;
  min?: Maybe<Virus_Min_Fields>;
};


/** aggregate fields of "storage.virus" */
export type Virus_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Virus_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type Virus_Append_Input = {
  userSession?: InputMaybe<Scalars['jsonb']['input']>;
};

/** Boolean expression to filter rows from the table "storage.virus". All fields are combined with a logical 'AND'. */
export type Virus_Bool_Exp = {
  _and?: InputMaybe<Array<Virus_Bool_Exp>>;
  _not?: InputMaybe<Virus_Bool_Exp>;
  _or?: InputMaybe<Array<Virus_Bool_Exp>>;
  createdAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  file?: InputMaybe<Files_Bool_Exp>;
  fileId?: InputMaybe<Uuid_Comparison_Exp>;
  filename?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  updatedAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  userSession?: InputMaybe<Jsonb_Comparison_Exp>;
  virus?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "storage.virus" */
export enum Virus_Constraint {
  /** unique or primary key constraint on columns "id" */
  VirusPkey = 'virus_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type Virus_Delete_At_Path_Input = {
  userSession?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type Virus_Delete_Elem_Input = {
  userSession?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type Virus_Delete_Key_Input = {
  userSession?: InputMaybe<Scalars['String']['input']>;
};

/** input type for inserting data into table "storage.virus" */
export type Virus_Insert_Input = {
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  file?: InputMaybe<Files_Obj_Rel_Insert_Input>;
  fileId?: InputMaybe<Scalars['uuid']['input']>;
  filename?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  userSession?: InputMaybe<Scalars['jsonb']['input']>;
  virus?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Virus_Max_Fields = {
  __typename: 'virus_max_fields';
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  fileId?: Maybe<Scalars['uuid']['output']>;
  filename?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
  virus?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Virus_Min_Fields = {
  __typename: 'virus_min_fields';
  createdAt?: Maybe<Scalars['timestamptz']['output']>;
  fileId?: Maybe<Scalars['uuid']['output']>;
  filename?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  updatedAt?: Maybe<Scalars['timestamptz']['output']>;
  virus?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "storage.virus" */
export type Virus_Mutation_Response = {
  __typename: 'virus_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Virus>;
};

/** on_conflict condition type for table "storage.virus" */
export type Virus_On_Conflict = {
  constraint: Virus_Constraint;
  update_columns?: Array<Virus_Update_Column>;
  where?: InputMaybe<Virus_Bool_Exp>;
};

/** Ordering options when selecting data from "storage.virus". */
export type Virus_Order_By = {
  createdAt?: InputMaybe<Order_By>;
  file?: InputMaybe<Files_Order_By>;
  fileId?: InputMaybe<Order_By>;
  filename?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  updatedAt?: InputMaybe<Order_By>;
  userSession?: InputMaybe<Order_By>;
  virus?: InputMaybe<Order_By>;
};

/** primary key columns input for table: storage.virus */
export type Virus_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type Virus_Prepend_Input = {
  userSession?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "storage.virus" */
export enum Virus_Select_Column {
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  FileId = 'fileId',
  /** column name */
  Filename = 'filename',
  /** column name */
  Id = 'id',
  /** column name */
  UpdatedAt = 'updatedAt',
  /** column name */
  UserSession = 'userSession',
  /** column name */
  Virus = 'virus'
}

/** input type for updating data in table "storage.virus" */
export type Virus_Set_Input = {
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  fileId?: InputMaybe<Scalars['uuid']['input']>;
  filename?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  userSession?: InputMaybe<Scalars['jsonb']['input']>;
  virus?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "virus" */
export type Virus_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Virus_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Virus_Stream_Cursor_Value_Input = {
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  fileId?: InputMaybe<Scalars['uuid']['input']>;
  filename?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  updatedAt?: InputMaybe<Scalars['timestamptz']['input']>;
  userSession?: InputMaybe<Scalars['jsonb']['input']>;
  virus?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "storage.virus" */
export enum Virus_Update_Column {
  /** column name */
  CreatedAt = 'createdAt',
  /** column name */
  FileId = 'fileId',
  /** column name */
  Filename = 'filename',
  /** column name */
  Id = 'id',
  /** column name */
  UpdatedAt = 'updatedAt',
  /** column name */
  UserSession = 'userSession',
  /** column name */
  Virus = 'virus'
}

export type Virus_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<Virus_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<Virus_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<Virus_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<Virus_Delete_Key_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<Virus_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Virus_Set_Input>;
  /** filter the rows which have to be updated */
  where: Virus_Bool_Exp;
};

export type Wine_Defaults_Result = {
  __typename: 'wine_defaults_result';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  barcode_type?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  item_onboarding_id: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  special_designation?: Maybe<Scalars['String']['output']>;
  variety?: Maybe<Scalars['String']['output']>;
  vineyard_designation?: Maybe<Scalars['String']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** columns and relationships of "wines" */
export type Wines = {
  __typename: 'wines';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  /** An object relationship */
  barcode?: Maybe<Barcodes>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  /** An object relationship */
  cellar: Cellars;
  cellar_id: Scalars['uuid']['output'];
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by_id: Scalars['uuid']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['uuid']['output'];
  name: Scalars['String']['output'];
  price?: Maybe<Scalars['money']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  special_designation?: Maybe<Scalars['String']['output']>;
  updated_at: Scalars['timestamptz']['output'];
  variety?: Maybe<Scalars['String']['output']>;
  vineyard_designation?: Maybe<Scalars['String']['output']>;
  vintage: Scalars['date']['output'];
  winery_id?: Maybe<Scalars['uuid']['output']>;
};

/** aggregated selection of "wines" */
export type Wines_Aggregate = {
  __typename: 'wines_aggregate';
  aggregate?: Maybe<Wines_Aggregate_Fields>;
  nodes: Array<Wines>;
};

export type Wines_Aggregate_Bool_Exp = {
  count?: InputMaybe<Wines_Aggregate_Bool_Exp_Count>;
};

export type Wines_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Wines_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Wines_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "wines" */
export type Wines_Aggregate_Fields = {
  __typename: 'wines_aggregate_fields';
  avg?: Maybe<Wines_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Wines_Max_Fields>;
  min?: Maybe<Wines_Min_Fields>;
  stddev?: Maybe<Wines_Stddev_Fields>;
  stddev_pop?: Maybe<Wines_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Wines_Stddev_Samp_Fields>;
  sum?: Maybe<Wines_Sum_Fields>;
  var_pop?: Maybe<Wines_Var_Pop_Fields>;
  var_samp?: Maybe<Wines_Var_Samp_Fields>;
  variance?: Maybe<Wines_Variance_Fields>;
};


/** aggregate fields of "wines" */
export type Wines_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Wines_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "wines" */
export type Wines_Aggregate_Order_By = {
  avg?: InputMaybe<Wines_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Wines_Max_Order_By>;
  min?: InputMaybe<Wines_Min_Order_By>;
  stddev?: InputMaybe<Wines_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Wines_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Wines_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Wines_Sum_Order_By>;
  var_pop?: InputMaybe<Wines_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Wines_Var_Samp_Order_By>;
  variance?: InputMaybe<Wines_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "wines" */
export type Wines_Arr_Rel_Insert_Input = {
  data: Array<Wines_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Wines_On_Conflict>;
};

/** aggregate avg on columns */
export type Wines_Avg_Fields = {
  __typename: 'wines_avg_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "wines" */
export type Wines_Avg_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "wines". All fields are combined with a logical 'AND'. */
export type Wines_Bool_Exp = {
  _and?: InputMaybe<Array<Wines_Bool_Exp>>;
  _not?: InputMaybe<Wines_Bool_Exp>;
  _or?: InputMaybe<Array<Wines_Bool_Exp>>;
  alcohol_content_percentage?: InputMaybe<Numeric_Comparison_Exp>;
  barcode?: InputMaybe<Barcodes_Bool_Exp>;
  barcode_code?: InputMaybe<String_Comparison_Exp>;
  cellar?: InputMaybe<Cellars_Bool_Exp>;
  cellar_id?: InputMaybe<Uuid_Comparison_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by_id?: InputMaybe<Uuid_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  price?: InputMaybe<Money_Comparison_Exp>;
  region?: InputMaybe<String_Comparison_Exp>;
  special_designation?: InputMaybe<String_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  variety?: InputMaybe<String_Comparison_Exp>;
  vineyard_designation?: InputMaybe<String_Comparison_Exp>;
  vintage?: InputMaybe<Date_Comparison_Exp>;
  winery_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "wines" */
export enum Wines_Constraint {
  /** unique or primary key constraint on columns "id" */
  WinesPkey = 'wines_pkey'
}

/** input type for incrementing numeric columns in table "wines" */
export type Wines_Inc_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
};

/** input type for inserting data into table "wines" */
export type Wines_Insert_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  barcode?: InputMaybe<Barcodes_Obj_Rel_Insert_Input>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar?: InputMaybe<Cellars_Obj_Rel_Insert_Input>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  special_designation?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  variety?: InputMaybe<Scalars['String']['input']>;
  vineyard_designation?: InputMaybe<Scalars['String']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
  winery_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Wines_Max_Fields = {
  __typename: 'wines_max_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  price?: Maybe<Scalars['money']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  special_designation?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  variety?: Maybe<Scalars['String']['output']>;
  vineyard_designation?: Maybe<Scalars['String']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
  winery_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "wines" */
export type Wines_Max_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
  region?: InputMaybe<Order_By>;
  special_designation?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  variety?: InputMaybe<Order_By>;
  vineyard_designation?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
  winery_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Wines_Min_Fields = {
  __typename: 'wines_min_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  price?: Maybe<Scalars['money']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  special_designation?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  variety?: Maybe<Scalars['String']['output']>;
  vineyard_designation?: Maybe<Scalars['String']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
  winery_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "wines" */
export type Wines_Min_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
  region?: InputMaybe<Order_By>;
  special_designation?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  variety?: InputMaybe<Order_By>;
  vineyard_designation?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
  winery_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "wines" */
export type Wines_Mutation_Response = {
  __typename: 'wines_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Wines>;
};

/** on_conflict condition type for table "wines" */
export type Wines_On_Conflict = {
  constraint: Wines_Constraint;
  update_columns?: Array<Wines_Update_Column>;
  where?: InputMaybe<Wines_Bool_Exp>;
};

/** Ordering options when selecting data from "wines". */
export type Wines_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode?: InputMaybe<Barcodes_Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar?: InputMaybe<Cellars_Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
  region?: InputMaybe<Order_By>;
  special_designation?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  variety?: InputMaybe<Order_By>;
  vineyard_designation?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
  winery_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: wines */
export type Wines_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "wines" */
export enum Wines_Select_Column {
  /** column name */
  AlcoholContentPercentage = 'alcohol_content_percentage',
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  Name = 'name',
  /** column name */
  Price = 'price',
  /** column name */
  Region = 'region',
  /** column name */
  SpecialDesignation = 'special_designation',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  Variety = 'variety',
  /** column name */
  VineyardDesignation = 'vineyard_designation',
  /** column name */
  Vintage = 'vintage',
  /** column name */
  WineryId = 'winery_id'
}

/** input type for updating data in table "wines" */
export type Wines_Set_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  special_designation?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  variety?: InputMaybe<Scalars['String']['input']>;
  vineyard_designation?: InputMaybe<Scalars['String']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
  winery_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate stddev on columns */
export type Wines_Stddev_Fields = {
  __typename: 'wines_stddev_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "wines" */
export type Wines_Stddev_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Wines_Stddev_Pop_Fields = {
  __typename: 'wines_stddev_pop_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "wines" */
export type Wines_Stddev_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Wines_Stddev_Samp_Fields = {
  __typename: 'wines_stddev_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "wines" */
export type Wines_Stddev_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "wines" */
export type Wines_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Wines_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Wines_Stream_Cursor_Value_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['money']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  special_designation?: InputMaybe<Scalars['String']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  variety?: InputMaybe<Scalars['String']['input']>;
  vineyard_designation?: InputMaybe<Scalars['String']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
  winery_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate sum on columns */
export type Wines_Sum_Fields = {
  __typename: 'wines_sum_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  price?: Maybe<Scalars['money']['output']>;
};

/** order by sum() on columns of table "wines" */
export type Wines_Sum_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** update columns of table "wines" */
export enum Wines_Update_Column {
  /** column name */
  AlcoholContentPercentage = 'alcohol_content_percentage',
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  Name = 'name',
  /** column name */
  Price = 'price',
  /** column name */
  Region = 'region',
  /** column name */
  SpecialDesignation = 'special_designation',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  Variety = 'variety',
  /** column name */
  VineyardDesignation = 'vineyard_designation',
  /** column name */
  Vintage = 'vintage',
  /** column name */
  WineryId = 'winery_id'
}

export type Wines_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Wines_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Wines_Set_Input>;
  /** filter the rows which have to be updated */
  where: Wines_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Wines_Var_Pop_Fields = {
  __typename: 'wines_var_pop_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "wines" */
export type Wines_Var_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Wines_Var_Samp_Fields = {
  __typename: 'wines_var_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "wines" */
export type Wines_Var_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Wines_Variance_Fields = {
  __typename: 'wines_variance_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "wines" */
export type Wines_Variance_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  price?: InputMaybe<Order_By>;
};

export type AddItemOnboardingMutationVariables = Exact<{
  onboarding: Item_Onboardings_Insert_Input;
}>;


export type AddItemOnboardingMutation = { __typename: 'mutation_root', insert_item_onboardings_one?: { __typename: 'item_onboardings', id: string } | null };

export type GetFileQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type GetFileQuery = { __typename: 'query_root', file?: { __typename: 'files', id: string, mimeType?: string | null, size?: number | null, bucket: { __typename: 'buckets', id: string } } | null };

export type AddTextExtractionResultsMutationVariables = Exact<{
  analysis: Image_Analysis_Insert_Input;
}>;


export type AddTextExtractionResultsMutation = { __typename: 'mutation_root', insert_image_analysis_one?: { __typename: 'image_analysis', id: number } | null };


export const AddItemOnboardingDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddItemOnboarding"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"onboarding"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_onboardings_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_item_onboardings_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"onboarding"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddItemOnboardingMutation, AddItemOnboardingMutationVariables>;
export const GetFileDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetFile"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"bucket"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"mimeType"}},{"kind":"Field","name":{"kind":"Name","value":"size"}}]}}]}}]} as unknown as DocumentNode<GetFileQuery, GetFileQueryVariables>;
export const AddTextExtractionResultsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddTextExtractionResults"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"analysis"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"image_analysis_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_image_analysis_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"analysis"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddTextExtractionResultsMutation, AddTextExtractionResultsMutationVariables>;