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
  float8: { input: number; output: number; }
  json: { input: string; output: string; }
  jsonb: { input: any; output: any; }
  numeric: { input: any; output: any; }
  polygon: { input: any; output: any; }
  timestamptz: { input: string; output: string; }
  uuid: { input: string; output: string; }
  vector: { input: string; output: string; }
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

/** Boolean expression to compare columns of type "Float". All fields are combined with logical 'AND'. */
export type Float_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['Float']['input']>;
  _gt?: InputMaybe<Scalars['Float']['input']>;
  _gte?: InputMaybe<Scalars['Float']['input']>;
  _in?: InputMaybe<Array<Scalars['Float']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['Float']['input']>;
  _lte?: InputMaybe<Scalars['Float']['input']>;
  _neq?: InputMaybe<Scalars['Float']['input']>;
  _nin?: InputMaybe<Array<Scalars['Float']['input']>>;
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

export enum ItemType {
  Beer = 'BEER',
  Coffee = 'COFFEE',
  Spirit = 'SPIRIT',
  Wine = 'WINE'
}

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

/** columns and relationships of "admin.credentials" */
export type Admin_Credentials = {
  __typename: 'admin_credentials';
  credentials: Scalars['jsonb']['output'];
  id: Scalars['String']['output'];
};


/** columns and relationships of "admin.credentials" */
export type Admin_CredentialsCredentialsArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};

/** aggregated selection of "admin.credentials" */
export type Admin_Credentials_Aggregate = {
  __typename: 'admin_credentials_aggregate';
  aggregate?: Maybe<Admin_Credentials_Aggregate_Fields>;
  nodes: Array<Admin_Credentials>;
};

/** aggregate fields of "admin.credentials" */
export type Admin_Credentials_Aggregate_Fields = {
  __typename: 'admin_credentials_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Admin_Credentials_Max_Fields>;
  min?: Maybe<Admin_Credentials_Min_Fields>;
};


/** aggregate fields of "admin.credentials" */
export type Admin_Credentials_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Admin_Credentials_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** append existing jsonb value of filtered columns with new jsonb value */
export type Admin_Credentials_Append_Input = {
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
};

/** Boolean expression to filter rows from the table "admin.credentials". All fields are combined with a logical 'AND'. */
export type Admin_Credentials_Bool_Exp = {
  _and?: InputMaybe<Array<Admin_Credentials_Bool_Exp>>;
  _not?: InputMaybe<Admin_Credentials_Bool_Exp>;
  _or?: InputMaybe<Array<Admin_Credentials_Bool_Exp>>;
  credentials?: InputMaybe<Jsonb_Comparison_Exp>;
  id?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "admin.credentials" */
export enum Admin_Credentials_Constraint {
  /** unique or primary key constraint on columns "id" */
  CredentialsPkey = 'credentials_pkey'
}

/** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
export type Admin_Credentials_Delete_At_Path_Input = {
  credentials?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
export type Admin_Credentials_Delete_Elem_Input = {
  credentials?: InputMaybe<Scalars['Int']['input']>;
};

/** delete key/value pair or string element. key/value pairs are matched based on their key value */
export type Admin_Credentials_Delete_Key_Input = {
  credentials?: InputMaybe<Scalars['String']['input']>;
};

/** input type for inserting data into table "admin.credentials" */
export type Admin_Credentials_Insert_Input = {
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Admin_Credentials_Max_Fields = {
  __typename: 'admin_credentials_max_fields';
  id?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Admin_Credentials_Min_Fields = {
  __typename: 'admin_credentials_min_fields';
  id?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "admin.credentials" */
export type Admin_Credentials_Mutation_Response = {
  __typename: 'admin_credentials_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Admin_Credentials>;
};

/** on_conflict condition type for table "admin.credentials" */
export type Admin_Credentials_On_Conflict = {
  constraint: Admin_Credentials_Constraint;
  update_columns?: Array<Admin_Credentials_Update_Column>;
  where?: InputMaybe<Admin_Credentials_Bool_Exp>;
};

/** Ordering options when selecting data from "admin.credentials". */
export type Admin_Credentials_Order_By = {
  credentials?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: admin.credentials */
export type Admin_Credentials_Pk_Columns_Input = {
  id: Scalars['String']['input'];
};

/** prepend existing jsonb value of filtered columns with new jsonb value */
export type Admin_Credentials_Prepend_Input = {
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
};

/** select columns of table "admin.credentials" */
export enum Admin_Credentials_Select_Column {
  /** column name */
  Credentials = 'credentials',
  /** column name */
  Id = 'id'
}

/** input type for updating data in table "admin.credentials" */
export type Admin_Credentials_Set_Input = {
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "admin_credentials" */
export type Admin_Credentials_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Admin_Credentials_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Admin_Credentials_Stream_Cursor_Value_Input = {
  credentials?: InputMaybe<Scalars['jsonb']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "admin.credentials" */
export enum Admin_Credentials_Update_Column {
  /** column name */
  Credentials = 'credentials',
  /** column name */
  Id = 'id'
}

export type Admin_Credentials_Updates = {
  /** append existing jsonb value of filtered columns with new jsonb value */
  _append?: InputMaybe<Admin_Credentials_Append_Input>;
  /** delete the field or element with specified path (for JSON arrays, negative integers count from the end) */
  _delete_at_path?: InputMaybe<Admin_Credentials_Delete_At_Path_Input>;
  /** delete the array element with specified index (negative integers count from the end). throws an error if top level container is not an array */
  _delete_elem?: InputMaybe<Admin_Credentials_Delete_Elem_Input>;
  /** delete key/value pair or string element. key/value pairs are matched based on their key value */
  _delete_key?: InputMaybe<Admin_Credentials_Delete_Key_Input>;
  /** prepend existing jsonb value of filtered columns with new jsonb value */
  _prepend?: InputMaybe<Admin_Credentials_Prepend_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Admin_Credentials_Set_Input>;
  /** filter the rows which have to be updated */
  where: Admin_Credentials_Bool_Exp;
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
  /** An array relationship */
  beers: Array<Beers>;
  /** An aggregate relationship */
  beers_aggregate: Beers_Aggregate;
  code: Scalars['String']['output'];
  /** An array relationship */
  coffees: Array<Coffees>;
  /** An aggregate relationship */
  coffees_aggregate: Coffees_Aggregate;
  /** An array relationship */
  spirits: Array<Spirits>;
  /** An aggregate relationship */
  spirits_aggregate: Spirits_Aggregate;
  type?: Maybe<Scalars['String']['output']>;
  /** An array relationship */
  wines: Array<Wines>;
  /** An aggregate relationship */
  wines_aggregate: Wines_Aggregate;
};


/** columns and relationships of "barcodes" */
export type BarcodesBeersArgs = {
  distinct_on?: InputMaybe<Array<Beers_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beers_Order_By>>;
  where?: InputMaybe<Beers_Bool_Exp>;
};


/** columns and relationships of "barcodes" */
export type BarcodesBeers_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Beers_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beers_Order_By>>;
  where?: InputMaybe<Beers_Bool_Exp>;
};


/** columns and relationships of "barcodes" */
export type BarcodesCoffeesArgs = {
  distinct_on?: InputMaybe<Array<Coffees_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffees_Order_By>>;
  where?: InputMaybe<Coffees_Bool_Exp>;
};


/** columns and relationships of "barcodes" */
export type BarcodesCoffees_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffees_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffees_Order_By>>;
  where?: InputMaybe<Coffees_Bool_Exp>;
};


/** columns and relationships of "barcodes" */
export type BarcodesSpiritsArgs = {
  distinct_on?: InputMaybe<Array<Spirits_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirits_Order_By>>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};


/** columns and relationships of "barcodes" */
export type BarcodesSpirits_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Spirits_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Spirits_Order_By>>;
  where?: InputMaybe<Spirits_Bool_Exp>;
};


/** columns and relationships of "barcodes" */
export type BarcodesWinesArgs = {
  distinct_on?: InputMaybe<Array<Wines_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wines_Order_By>>;
  where?: InputMaybe<Wines_Bool_Exp>;
};


/** columns and relationships of "barcodes" */
export type BarcodesWines_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Wines_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wines_Order_By>>;
  where?: InputMaybe<Wines_Bool_Exp>;
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
  beers?: InputMaybe<Beers_Bool_Exp>;
  beers_aggregate?: InputMaybe<Beers_Aggregate_Bool_Exp>;
  code?: InputMaybe<String_Comparison_Exp>;
  coffees?: InputMaybe<Coffees_Bool_Exp>;
  coffees_aggregate?: InputMaybe<Coffees_Aggregate_Bool_Exp>;
  spirits?: InputMaybe<Spirits_Bool_Exp>;
  spirits_aggregate?: InputMaybe<Spirits_Aggregate_Bool_Exp>;
  type?: InputMaybe<String_Comparison_Exp>;
  wines?: InputMaybe<Wines_Bool_Exp>;
  wines_aggregate?: InputMaybe<Wines_Aggregate_Bool_Exp>;
};

/** unique or primary key constraints on table "barcodes" */
export enum Barcodes_Constraint {
  /** unique or primary key constraint on columns "code" */
  BarcodesPkey = 'barcodes_pkey'
}

/** input type for inserting data into table "barcodes" */
export type Barcodes_Insert_Input = {
  beers?: InputMaybe<Beers_Arr_Rel_Insert_Input>;
  code?: InputMaybe<Scalars['String']['input']>;
  coffees?: InputMaybe<Coffees_Arr_Rel_Insert_Input>;
  spirits?: InputMaybe<Spirits_Arr_Rel_Insert_Input>;
  type?: InputMaybe<Scalars['String']['input']>;
  wines?: InputMaybe<Wines_Arr_Rel_Insert_Input>;
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
  beers_aggregate?: InputMaybe<Beers_Aggregate_Order_By>;
  code?: InputMaybe<Order_By>;
  coffees_aggregate?: InputMaybe<Coffees_Aggregate_Order_By>;
  spirits_aggregate?: InputMaybe<Spirits_Aggregate_Order_By>;
  type?: InputMaybe<Order_By>;
  wines_aggregate?: InputMaybe<Wines_Aggregate_Order_By>;
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

/** columns and relationships of "beer_style" */
export type Beer_Style = {
  __typename: 'beer_style';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "beer_style" */
export type Beer_Style_Aggregate = {
  __typename: 'beer_style_aggregate';
  aggregate?: Maybe<Beer_Style_Aggregate_Fields>;
  nodes: Array<Beer_Style>;
};

/** aggregate fields of "beer_style" */
export type Beer_Style_Aggregate_Fields = {
  __typename: 'beer_style_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Beer_Style_Max_Fields>;
  min?: Maybe<Beer_Style_Min_Fields>;
};


/** aggregate fields of "beer_style" */
export type Beer_Style_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Beer_Style_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "beer_style". All fields are combined with a logical 'AND'. */
export type Beer_Style_Bool_Exp = {
  _and?: InputMaybe<Array<Beer_Style_Bool_Exp>>;
  _not?: InputMaybe<Beer_Style_Bool_Exp>;
  _or?: InputMaybe<Array<Beer_Style_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "beer_style" */
export enum Beer_Style_Constraint {
  /** unique or primary key constraint on columns "text" */
  BeerStylePkey = 'beer_style_pkey'
}

export enum Beer_Style_Enum {
  Altbier = 'ALTBIER',
  AmberAle = 'AMBER_ALE',
  BarleyWine = 'BARLEY_WINE',
  BerlinerWeisse = 'BERLINER_WEISSE',
  BiereDeGarde = 'BIERE_DE_GARDE',
  Bitter = 'BITTER',
  BlondeAle = 'BLONDE_ALE',
  Bock = 'BOCK',
  BrownAle = 'BROWN_ALE',
  CreamAle = 'CREAM_ALE',
  Doppelbock = 'DOPPELBOCK',
  DortmunderExport = 'DORTMUNDER_EXPORT',
  Dunkel = 'DUNKEL',
  Dunkelweizen = 'DUNKELWEIZEN',
  Eisbock = 'EISBOCK',
  FlandersRedAle = 'FLANDERS_RED_ALE',
  FruitBeer = 'FRUIT_BEER',
  Geuze = 'GEUZE',
  GoldenSummerAle = 'GOLDEN_SUMMER_ALE',
  Gose = 'GOSE',
  Hefeweizen = 'HEFEWEIZEN',
  Helles = 'HELLES',
  HerbAndSpicedBeer = 'HERB_AND_SPICED_BEER',
  HoneyBeer = 'HONEY_BEER',
  IndiaPaleAle = 'INDIA_PALE_ALE',
  Kolsch = 'KOLSCH',
  Lambic = 'LAMBIC',
  LightAle = 'LIGHT_ALE',
  MaibockHellesBock = 'MAIBOCK_HELLES_BOCK',
  MaltLiquor = 'MALT_LIQUOR',
  Mild = 'MILD',
  OktoberfestbierMarzendbier = 'OKTOBERFESTBIER_MARZENDBIER',
  OldAle = 'OLD_ALE',
  OudBruin = 'OUD_BRUIN',
  PaleAle = 'PALE_ALE',
  PilsenerPilsnerPils = 'PILSENER_PILSNER_PILS',
  Porter = 'PORTER',
  RedAle = 'RED_ALE',
  Roggenbier = 'ROGGENBIER',
  RyeBeer = 'RYE_BEER',
  Saison = 'SAISON',
  Schwarzbier = 'SCHWARZBIER',
  ScotchAle = 'SCOTCH_ALE',
  SmokedBeer = 'SMOKED_BEER',
  SteamBeer = 'STEAM_BEER',
  Stout = 'STOUT',
  VegetableBeer = 'VEGETABLE_BEER',
  ViennaLager = 'VIENNA_LAGER',
  Weissbier = 'WEISSBIER',
  Weizenbock = 'WEIZENBOCK',
  WildBeer = 'WILD_BEER',
  Witbier = 'WITBIER',
  WoodAgedBeer = 'WOOD_AGED_BEER'
}

/** Boolean expression to compare columns of type "beer_style_enum". All fields are combined with logical 'AND'. */
export type Beer_Style_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Beer_Style_Enum>;
  _in?: InputMaybe<Array<Beer_Style_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Beer_Style_Enum>;
  _nin?: InputMaybe<Array<Beer_Style_Enum>>;
};

/** input type for inserting data into table "beer_style" */
export type Beer_Style_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Beer_Style_Max_Fields = {
  __typename: 'beer_style_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Beer_Style_Min_Fields = {
  __typename: 'beer_style_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "beer_style" */
export type Beer_Style_Mutation_Response = {
  __typename: 'beer_style_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Beer_Style>;
};

/** on_conflict condition type for table "beer_style" */
export type Beer_Style_On_Conflict = {
  constraint: Beer_Style_Constraint;
  update_columns?: Array<Beer_Style_Update_Column>;
  where?: InputMaybe<Beer_Style_Bool_Exp>;
};

/** Ordering options when selecting data from "beer_style". */
export type Beer_Style_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: beer_style */
export type Beer_Style_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "beer_style" */
export enum Beer_Style_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "beer_style" */
export type Beer_Style_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "beer_style" */
export type Beer_Style_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Beer_Style_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Beer_Style_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "beer_style" */
export enum Beer_Style_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Beer_Style_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Beer_Style_Set_Input>;
  /** filter the rows which have to be updated */
  where: Beer_Style_Bool_Exp;
};

/** columns and relationships of "beers" */
export type Beers = {
  __typename: 'beers';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  /** An object relationship */
  barcode?: Maybe<Barcodes>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  /** An array relationship */
  cellar_items: Array<Cellar_Items>;
  /** An aggregate relationship */
  cellar_items_aggregate: Cellar_Items_Aggregate;
  country?: Maybe<Country_Enum>;
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by_id: Scalars['uuid']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['uuid']['output'];
  international_bitterness_unit?: Maybe<Scalars['Int']['output']>;
  /** An array relationship */
  item_favorites: Array<Item_Favorites>;
  /** An aggregate relationship */
  item_favorites_aggregate: Item_Favorites_Aggregate;
  /** An array relationship */
  item_images: Array<Item_Image>;
  /** An aggregate relationship */
  item_images_aggregate: Item_Image_Aggregate;
  item_onboarding_id: Scalars['uuid']['output'];
  /** An array relationship */
  item_vectors: Array<Item_Vectors>;
  /** An aggregate relationship */
  item_vectors_aggregate: Item_Vectors_Aggregate;
  name: Scalars['String']['output'];
  /** An array relationship */
  reviews: Array<Item_Reviews>;
  /** An aggregate relationship */
  reviews_aggregate: Item_Reviews_Aggregate;
  style?: Maybe<Beer_Style_Enum>;
  updated_at: Scalars['timestamptz']['output'];
  vintage?: Maybe<Scalars['date']['output']>;
};


/** columns and relationships of "beers" */
export type BeersCellar_ItemsArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


/** columns and relationships of "beers" */
export type BeersCellar_Items_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


/** columns and relationships of "beers" */
export type BeersItem_FavoritesArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** columns and relationships of "beers" */
export type BeersItem_Favorites_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** columns and relationships of "beers" */
export type BeersItem_ImagesArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


/** columns and relationships of "beers" */
export type BeersItem_Images_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


/** columns and relationships of "beers" */
export type BeersItem_VectorsArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


/** columns and relationships of "beers" */
export type BeersItem_Vectors_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


/** columns and relationships of "beers" */
export type BeersReviewsArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};


/** columns and relationships of "beers" */
export type BeersReviews_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
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
};

/** order by avg() on columns of table "beers" */
export type Beers_Avg_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "beers". All fields are combined with a logical 'AND'. */
export type Beers_Bool_Exp = {
  _and?: InputMaybe<Array<Beers_Bool_Exp>>;
  _not?: InputMaybe<Beers_Bool_Exp>;
  _or?: InputMaybe<Array<Beers_Bool_Exp>>;
  alcohol_content_percentage?: InputMaybe<Numeric_Comparison_Exp>;
  barcode?: InputMaybe<Barcodes_Bool_Exp>;
  barcode_code?: InputMaybe<String_Comparison_Exp>;
  cellar_items?: InputMaybe<Cellar_Items_Bool_Exp>;
  cellar_items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Bool_Exp>;
  country?: InputMaybe<Country_Enum_Comparison_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by_id?: InputMaybe<Uuid_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  international_bitterness_unit?: InputMaybe<Int_Comparison_Exp>;
  item_favorites?: InputMaybe<Item_Favorites_Bool_Exp>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Bool_Exp>;
  item_images?: InputMaybe<Item_Image_Bool_Exp>;
  item_images_aggregate?: InputMaybe<Item_Image_Aggregate_Bool_Exp>;
  item_onboarding_id?: InputMaybe<Uuid_Comparison_Exp>;
  item_vectors?: InputMaybe<Item_Vectors_Bool_Exp>;
  item_vectors_aggregate?: InputMaybe<Item_Vectors_Aggregate_Bool_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  reviews?: InputMaybe<Item_Reviews_Bool_Exp>;
  reviews_aggregate?: InputMaybe<Item_Reviews_Aggregate_Bool_Exp>;
  style?: InputMaybe<Beer_Style_Enum_Comparison_Exp>;
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
};

/** input type for inserting data into table "beers" */
export type Beers_Insert_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  barcode?: InputMaybe<Barcodes_Obj_Rel_Insert_Input>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_items?: InputMaybe<Cellar_Items_Arr_Rel_Insert_Input>;
  country?: InputMaybe<Country_Enum>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  international_bitterness_unit?: InputMaybe<Scalars['Int']['input']>;
  item_favorites?: InputMaybe<Item_Favorites_Arr_Rel_Insert_Input>;
  item_images?: InputMaybe<Item_Image_Arr_Rel_Insert_Input>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  item_vectors?: InputMaybe<Item_Vectors_Arr_Rel_Insert_Input>;
  name?: InputMaybe<Scalars['String']['input']>;
  reviews?: InputMaybe<Item_Reviews_Arr_Rel_Insert_Input>;
  style?: InputMaybe<Beer_Style_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate max on columns */
export type Beers_Max_Fields = {
  __typename: 'beers_max_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Int']['output']>;
  item_onboarding_id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** order by max() on columns of table "beers" */
export type Beers_Max_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Beers_Min_Fields = {
  __typename: 'beers_min_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Int']['output']>;
  item_onboarding_id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** order by min() on columns of table "beers" */
export type Beers_Min_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
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

/** input type for inserting object relation for remote table "beers" */
export type Beers_Obj_Rel_Insert_Input = {
  data: Beers_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Beers_On_Conflict>;
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
  barcode?: InputMaybe<Barcodes_Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar_items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Order_By>;
  country?: InputMaybe<Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Order_By>;
  item_images_aggregate?: InputMaybe<Item_Image_Aggregate_Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  item_vectors_aggregate?: InputMaybe<Item_Vectors_Aggregate_Order_By>;
  name?: InputMaybe<Order_By>;
  reviews_aggregate?: InputMaybe<Item_Reviews_Aggregate_Order_By>;
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
  BarcodeCode = 'barcode_code',
  /** column name */
  Country = 'country',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  InternationalBitternessUnit = 'international_bitterness_unit',
  /** column name */
  ItemOnboardingId = 'item_onboarding_id',
  /** column name */
  Name = 'name',
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
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  country?: InputMaybe<Country_Enum>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  international_bitterness_unit?: InputMaybe<Scalars['Int']['input']>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  style?: InputMaybe<Beer_Style_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate stddev on columns */
export type Beers_Stddev_Fields = {
  __typename: 'beers_stddev_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "beers" */
export type Beers_Stddev_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Beers_Stddev_Pop_Fields = {
  __typename: 'beers_stddev_pop_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "beers" */
export type Beers_Stddev_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Beers_Stddev_Samp_Fields = {
  __typename: 'beers_stddev_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "beers" */
export type Beers_Stddev_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
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
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  country?: InputMaybe<Country_Enum>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  international_bitterness_unit?: InputMaybe<Scalars['Int']['input']>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  style?: InputMaybe<Beer_Style_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate sum on columns */
export type Beers_Sum_Fields = {
  __typename: 'beers_sum_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Int']['output']>;
};

/** order by sum() on columns of table "beers" */
export type Beers_Sum_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
};

/** update columns of table "beers" */
export enum Beers_Update_Column {
  /** column name */
  AlcoholContentPercentage = 'alcohol_content_percentage',
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  Country = 'country',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  InternationalBitternessUnit = 'international_bitterness_unit',
  /** column name */
  ItemOnboardingId = 'item_onboarding_id',
  /** column name */
  Name = 'name',
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
};

/** order by var_pop() on columns of table "beers" */
export type Beers_Var_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Beers_Var_Samp_Fields = {
  __typename: 'beers_var_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "beers" */
export type Beers_Var_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Beers_Variance_Fields = {
  __typename: 'beers_variance_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
  international_bitterness_unit?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "beers" */
export type Beers_Variance_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  international_bitterness_unit?: InputMaybe<Order_By>;
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

/** columns and relationships of "cellar_items" */
export type Cellar_Items = {
  __typename: 'cellar_items';
  /** An object relationship */
  beer?: Maybe<Beers>;
  beer_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  cellar: Cellars;
  cellar_id: Scalars['uuid']['output'];
  /** An array relationship */
  check_ins: Array<Check_Ins>;
  /** An aggregate relationship */
  check_ins_aggregate: Check_Ins_Aggregate;
  /** An object relationship */
  coffee?: Maybe<Coffees>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by: Scalars['uuid']['output'];
  /** An object relationship */
  display_image?: Maybe<Item_Image>;
  display_image_id?: Maybe<Scalars['uuid']['output']>;
  empty_at?: Maybe<Scalars['timestamptz']['output']>;
  id: Scalars['uuid']['output'];
  open_at?: Maybe<Scalars['timestamptz']['output']>;
  percentage_remaining: Scalars['numeric']['output'];
  /** An object relationship */
  spirit?: Maybe<Spirits>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  type: Item_Type_Enum;
  updated_at: Scalars['timestamptz']['output'];
  /** An object relationship */
  wine?: Maybe<Wines>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};


/** columns and relationships of "cellar_items" */
export type Cellar_ItemsCheck_InsArgs = {
  distinct_on?: InputMaybe<Array<Check_Ins_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Check_Ins_Order_By>>;
  where?: InputMaybe<Check_Ins_Bool_Exp>;
};


/** columns and relationships of "cellar_items" */
export type Cellar_ItemsCheck_Ins_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Check_Ins_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Check_Ins_Order_By>>;
  where?: InputMaybe<Check_Ins_Bool_Exp>;
};

/** aggregated selection of "cellar_items" */
export type Cellar_Items_Aggregate = {
  __typename: 'cellar_items_aggregate';
  aggregate?: Maybe<Cellar_Items_Aggregate_Fields>;
  nodes: Array<Cellar_Items>;
};

export type Cellar_Items_Aggregate_Bool_Exp = {
  count?: InputMaybe<Cellar_Items_Aggregate_Bool_Exp_Count>;
};

export type Cellar_Items_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Cellar_Items_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "cellar_items" */
export type Cellar_Items_Aggregate_Fields = {
  __typename: 'cellar_items_aggregate_fields';
  avg?: Maybe<Cellar_Items_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Cellar_Items_Max_Fields>;
  min?: Maybe<Cellar_Items_Min_Fields>;
  stddev?: Maybe<Cellar_Items_Stddev_Fields>;
  stddev_pop?: Maybe<Cellar_Items_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Cellar_Items_Stddev_Samp_Fields>;
  sum?: Maybe<Cellar_Items_Sum_Fields>;
  var_pop?: Maybe<Cellar_Items_Var_Pop_Fields>;
  var_samp?: Maybe<Cellar_Items_Var_Samp_Fields>;
  variance?: Maybe<Cellar_Items_Variance_Fields>;
};


/** aggregate fields of "cellar_items" */
export type Cellar_Items_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "cellar_items" */
export type Cellar_Items_Aggregate_Order_By = {
  avg?: InputMaybe<Cellar_Items_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Cellar_Items_Max_Order_By>;
  min?: InputMaybe<Cellar_Items_Min_Order_By>;
  stddev?: InputMaybe<Cellar_Items_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Cellar_Items_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Cellar_Items_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Cellar_Items_Sum_Order_By>;
  var_pop?: InputMaybe<Cellar_Items_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Cellar_Items_Var_Samp_Order_By>;
  variance?: InputMaybe<Cellar_Items_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "cellar_items" */
export type Cellar_Items_Arr_Rel_Insert_Input = {
  data: Array<Cellar_Items_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Cellar_Items_On_Conflict>;
};

/** aggregate avg on columns */
export type Cellar_Items_Avg_Fields = {
  __typename: 'cellar_items_avg_fields';
  percentage_remaining?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "cellar_items" */
export type Cellar_Items_Avg_Order_By = {
  percentage_remaining?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "cellar_items". All fields are combined with a logical 'AND'. */
export type Cellar_Items_Bool_Exp = {
  _and?: InputMaybe<Array<Cellar_Items_Bool_Exp>>;
  _not?: InputMaybe<Cellar_Items_Bool_Exp>;
  _or?: InputMaybe<Array<Cellar_Items_Bool_Exp>>;
  beer?: InputMaybe<Beers_Bool_Exp>;
  beer_id?: InputMaybe<Uuid_Comparison_Exp>;
  cellar?: InputMaybe<Cellars_Bool_Exp>;
  cellar_id?: InputMaybe<Uuid_Comparison_Exp>;
  check_ins?: InputMaybe<Check_Ins_Bool_Exp>;
  check_ins_aggregate?: InputMaybe<Check_Ins_Aggregate_Bool_Exp>;
  coffee?: InputMaybe<Coffees_Bool_Exp>;
  coffee_id?: InputMaybe<Uuid_Comparison_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by?: InputMaybe<Uuid_Comparison_Exp>;
  display_image?: InputMaybe<Item_Image_Bool_Exp>;
  display_image_id?: InputMaybe<Uuid_Comparison_Exp>;
  empty_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  open_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  percentage_remaining?: InputMaybe<Numeric_Comparison_Exp>;
  spirit?: InputMaybe<Spirits_Bool_Exp>;
  spirit_id?: InputMaybe<Uuid_Comparison_Exp>;
  type?: InputMaybe<Item_Type_Enum_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  wine?: InputMaybe<Wines_Bool_Exp>;
  wine_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "cellar_items" */
export enum Cellar_Items_Constraint {
  /** unique or primary key constraint on columns "id" */
  CellarItemsPkey = 'cellar_items_pkey'
}

/** input type for incrementing numeric columns in table "cellar_items" */
export type Cellar_Items_Inc_Input = {
  percentage_remaining?: InputMaybe<Scalars['numeric']['input']>;
};

/** input type for inserting data into table "cellar_items" */
export type Cellar_Items_Insert_Input = {
  beer?: InputMaybe<Beers_Obj_Rel_Insert_Input>;
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  cellar?: InputMaybe<Cellars_Obj_Rel_Insert_Input>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  check_ins?: InputMaybe<Check_Ins_Arr_Rel_Insert_Input>;
  coffee?: InputMaybe<Coffees_Obj_Rel_Insert_Input>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by?: InputMaybe<Scalars['uuid']['input']>;
  display_image?: InputMaybe<Item_Image_Obj_Rel_Insert_Input>;
  display_image_id?: InputMaybe<Scalars['uuid']['input']>;
  empty_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  open_at?: InputMaybe<Scalars['timestamptz']['input']>;
  percentage_remaining?: InputMaybe<Scalars['numeric']['input']>;
  spirit?: InputMaybe<Spirits_Obj_Rel_Insert_Input>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  wine?: InputMaybe<Wines_Obj_Rel_Insert_Input>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Cellar_Items_Max_Fields = {
  __typename: 'cellar_items_max_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by?: Maybe<Scalars['uuid']['output']>;
  display_image_id?: Maybe<Scalars['uuid']['output']>;
  empty_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  open_at?: Maybe<Scalars['timestamptz']['output']>;
  percentage_remaining?: Maybe<Scalars['numeric']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "cellar_items" */
export type Cellar_Items_Max_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by?: InputMaybe<Order_By>;
  display_image_id?: InputMaybe<Order_By>;
  empty_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  open_at?: InputMaybe<Order_By>;
  percentage_remaining?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Cellar_Items_Min_Fields = {
  __typename: 'cellar_items_min_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by?: Maybe<Scalars['uuid']['output']>;
  display_image_id?: Maybe<Scalars['uuid']['output']>;
  empty_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  open_at?: Maybe<Scalars['timestamptz']['output']>;
  percentage_remaining?: Maybe<Scalars['numeric']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "cellar_items" */
export type Cellar_Items_Min_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by?: InputMaybe<Order_By>;
  display_image_id?: InputMaybe<Order_By>;
  empty_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  open_at?: InputMaybe<Order_By>;
  percentage_remaining?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "cellar_items" */
export type Cellar_Items_Mutation_Response = {
  __typename: 'cellar_items_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Cellar_Items>;
};

/** input type for inserting object relation for remote table "cellar_items" */
export type Cellar_Items_Obj_Rel_Insert_Input = {
  data: Cellar_Items_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Cellar_Items_On_Conflict>;
};

/** on_conflict condition type for table "cellar_items" */
export type Cellar_Items_On_Conflict = {
  constraint: Cellar_Items_Constraint;
  update_columns?: Array<Cellar_Items_Update_Column>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};

/** Ordering options when selecting data from "cellar_items". */
export type Cellar_Items_Order_By = {
  beer?: InputMaybe<Beers_Order_By>;
  beer_id?: InputMaybe<Order_By>;
  cellar?: InputMaybe<Cellars_Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  check_ins_aggregate?: InputMaybe<Check_Ins_Aggregate_Order_By>;
  coffee?: InputMaybe<Coffees_Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by?: InputMaybe<Order_By>;
  display_image?: InputMaybe<Item_Image_Order_By>;
  display_image_id?: InputMaybe<Order_By>;
  empty_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  open_at?: InputMaybe<Order_By>;
  percentage_remaining?: InputMaybe<Order_By>;
  spirit?: InputMaybe<Spirits_Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  type?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  wine?: InputMaybe<Wines_Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: cellar_items */
export type Cellar_Items_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "cellar_items" */
export enum Cellar_Items_Select_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedBy = 'created_by',
  /** column name */
  DisplayImageId = 'display_image_id',
  /** column name */
  EmptyAt = 'empty_at',
  /** column name */
  Id = 'id',
  /** column name */
  OpenAt = 'open_at',
  /** column name */
  PercentageRemaining = 'percentage_remaining',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  Type = 'type',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  WineId = 'wine_id'
}

/** input type for updating data in table "cellar_items" */
export type Cellar_Items_Set_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by?: InputMaybe<Scalars['uuid']['input']>;
  display_image_id?: InputMaybe<Scalars['uuid']['input']>;
  empty_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  open_at?: InputMaybe<Scalars['timestamptz']['input']>;
  percentage_remaining?: InputMaybe<Scalars['numeric']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate stddev on columns */
export type Cellar_Items_Stddev_Fields = {
  __typename: 'cellar_items_stddev_fields';
  percentage_remaining?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "cellar_items" */
export type Cellar_Items_Stddev_Order_By = {
  percentage_remaining?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Cellar_Items_Stddev_Pop_Fields = {
  __typename: 'cellar_items_stddev_pop_fields';
  percentage_remaining?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "cellar_items" */
export type Cellar_Items_Stddev_Pop_Order_By = {
  percentage_remaining?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Cellar_Items_Stddev_Samp_Fields = {
  __typename: 'cellar_items_stddev_samp_fields';
  percentage_remaining?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "cellar_items" */
export type Cellar_Items_Stddev_Samp_Order_By = {
  percentage_remaining?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "cellar_items" */
export type Cellar_Items_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Cellar_Items_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Cellar_Items_Stream_Cursor_Value_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by?: InputMaybe<Scalars['uuid']['input']>;
  display_image_id?: InputMaybe<Scalars['uuid']['input']>;
  empty_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  open_at?: InputMaybe<Scalars['timestamptz']['input']>;
  percentage_remaining?: InputMaybe<Scalars['numeric']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  type?: InputMaybe<Item_Type_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate sum on columns */
export type Cellar_Items_Sum_Fields = {
  __typename: 'cellar_items_sum_fields';
  percentage_remaining?: Maybe<Scalars['numeric']['output']>;
};

/** order by sum() on columns of table "cellar_items" */
export type Cellar_Items_Sum_Order_By = {
  percentage_remaining?: InputMaybe<Order_By>;
};

/** update columns of table "cellar_items" */
export enum Cellar_Items_Update_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedBy = 'created_by',
  /** column name */
  DisplayImageId = 'display_image_id',
  /** column name */
  EmptyAt = 'empty_at',
  /** column name */
  Id = 'id',
  /** column name */
  OpenAt = 'open_at',
  /** column name */
  PercentageRemaining = 'percentage_remaining',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  WineId = 'wine_id'
}

export type Cellar_Items_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Cellar_Items_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Cellar_Items_Set_Input>;
  /** filter the rows which have to be updated */
  where: Cellar_Items_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Cellar_Items_Var_Pop_Fields = {
  __typename: 'cellar_items_var_pop_fields';
  percentage_remaining?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "cellar_items" */
export type Cellar_Items_Var_Pop_Order_By = {
  percentage_remaining?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Cellar_Items_Var_Samp_Fields = {
  __typename: 'cellar_items_var_samp_fields';
  percentage_remaining?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "cellar_items" */
export type Cellar_Items_Var_Samp_Order_By = {
  percentage_remaining?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Cellar_Items_Variance_Fields = {
  __typename: 'cellar_items_variance_fields';
  percentage_remaining?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "cellar_items" */
export type Cellar_Items_Variance_Order_By = {
  percentage_remaining?: InputMaybe<Order_By>;
};

/** A cellars co-owners */
export type Cellar_Owners = {
  __typename: 'cellar_owners';
  /** An object relationship */
  cellar: Cellars;
  cellar_id: Scalars['uuid']['output'];
  created_at: Scalars['timestamptz']['output'];
  updated_at: Scalars['timestamptz']['output'];
  /** An object relationship */
  user: Users;
  user_id: Scalars['uuid']['output'];
};

/** aggregated selection of "cellar_owners" */
export type Cellar_Owners_Aggregate = {
  __typename: 'cellar_owners_aggregate';
  aggregate?: Maybe<Cellar_Owners_Aggregate_Fields>;
  nodes: Array<Cellar_Owners>;
};

export type Cellar_Owners_Aggregate_Bool_Exp = {
  count?: InputMaybe<Cellar_Owners_Aggregate_Bool_Exp_Count>;
};

export type Cellar_Owners_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Cellar_Owners_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Cellar_Owners_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "cellar_owners" */
export type Cellar_Owners_Aggregate_Fields = {
  __typename: 'cellar_owners_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Cellar_Owners_Max_Fields>;
  min?: Maybe<Cellar_Owners_Min_Fields>;
};


/** aggregate fields of "cellar_owners" */
export type Cellar_Owners_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Cellar_Owners_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "cellar_owners" */
export type Cellar_Owners_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Cellar_Owners_Max_Order_By>;
  min?: InputMaybe<Cellar_Owners_Min_Order_By>;
};

/** input type for inserting array relation for remote table "cellar_owners" */
export type Cellar_Owners_Arr_Rel_Insert_Input = {
  data: Array<Cellar_Owners_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Cellar_Owners_On_Conflict>;
};

/** Boolean expression to filter rows from the table "cellar_owners". All fields are combined with a logical 'AND'. */
export type Cellar_Owners_Bool_Exp = {
  _and?: InputMaybe<Array<Cellar_Owners_Bool_Exp>>;
  _not?: InputMaybe<Cellar_Owners_Bool_Exp>;
  _or?: InputMaybe<Array<Cellar_Owners_Bool_Exp>>;
  cellar?: InputMaybe<Cellars_Bool_Exp>;
  cellar_id?: InputMaybe<Uuid_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  user_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "cellar_owners" */
export enum Cellar_Owners_Constraint {
  /** unique or primary key constraint on columns "user_id", "cellar_id" */
  CellarOwnersPkey = 'cellar_owners_pkey'
}

/** input type for inserting data into table "cellar_owners" */
export type Cellar_Owners_Insert_Input = {
  cellar?: InputMaybe<Cellars_Obj_Rel_Insert_Input>;
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Cellar_Owners_Max_Fields = {
  __typename: 'cellar_owners_max_fields';
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "cellar_owners" */
export type Cellar_Owners_Max_Order_By = {
  cellar_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Cellar_Owners_Min_Fields = {
  __typename: 'cellar_owners_min_fields';
  cellar_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "cellar_owners" */
export type Cellar_Owners_Min_Order_By = {
  cellar_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "cellar_owners" */
export type Cellar_Owners_Mutation_Response = {
  __typename: 'cellar_owners_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Cellar_Owners>;
};

/** on_conflict condition type for table "cellar_owners" */
export type Cellar_Owners_On_Conflict = {
  constraint: Cellar_Owners_Constraint;
  update_columns?: Array<Cellar_Owners_Update_Column>;
  where?: InputMaybe<Cellar_Owners_Bool_Exp>;
};

/** Ordering options when selecting data from "cellar_owners". */
export type Cellar_Owners_Order_By = {
  cellar?: InputMaybe<Cellars_Order_By>;
  cellar_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user?: InputMaybe<Users_Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: cellar_owners */
export type Cellar_Owners_Pk_Columns_Input = {
  cellar_id: Scalars['uuid']['input'];
  user_id: Scalars['uuid']['input'];
};

/** select columns of table "cellar_owners" */
export enum Cellar_Owners_Select_Column {
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id'
}

/** input type for updating data in table "cellar_owners" */
export type Cellar_Owners_Set_Input = {
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "cellar_owners" */
export type Cellar_Owners_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Cellar_Owners_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Cellar_Owners_Stream_Cursor_Value_Input = {
  cellar_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "cellar_owners" */
export enum Cellar_Owners_Update_Column {
  /** column name */
  CellarId = 'cellar_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id'
}

export type Cellar_Owners_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Cellar_Owners_Set_Input>;
  /** filter the rows which have to be updated */
  where: Cellar_Owners_Bool_Exp;
};

/** columns and relationships of "cellars" */
export type Cellars = {
  __typename: 'cellars';
  /** An array relationship */
  co_owners: Array<Cellar_Owners>;
  /** An aggregate relationship */
  co_owners_aggregate: Cellar_Owners_Aggregate;
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by_id: Scalars['uuid']['output'];
  id: Scalars['uuid']['output'];
  /** An array relationship */
  items: Array<Cellar_Items>;
  /** An aggregate relationship */
  items_aggregate: Cellar_Items_Aggregate;
  name: Scalars['String']['output'];
  privacy: Permission_Type_Enum;
  updated_at: Scalars['timestamptz']['output'];
};


/** columns and relationships of "cellars" */
export type CellarsCo_OwnersArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Owners_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Owners_Order_By>>;
  where?: InputMaybe<Cellar_Owners_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsCo_Owners_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Owners_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Owners_Order_By>>;
  where?: InputMaybe<Cellar_Owners_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsItemsArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


/** columns and relationships of "cellars" */
export type CellarsItems_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};

/** aggregated selection of "cellars" */
export type Cellars_Aggregate = {
  __typename: 'cellars_aggregate';
  aggregate?: Maybe<Cellars_Aggregate_Fields>;
  nodes: Array<Cellars>;
};

export type Cellars_Aggregate_Bool_Exp = {
  count?: InputMaybe<Cellars_Aggregate_Bool_Exp_Count>;
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
  co_owners?: InputMaybe<Cellar_Owners_Bool_Exp>;
  co_owners_aggregate?: InputMaybe<Cellar_Owners_Aggregate_Bool_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  items?: InputMaybe<Cellar_Items_Bool_Exp>;
  items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Bool_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  privacy?: InputMaybe<Permission_Type_Enum_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "cellars" */
export enum Cellars_Constraint {
  /** unique or primary key constraint on columns "id" */
  CellarsPkey = 'cellars_pkey'
}

/** input type for inserting data into table "cellars" */
export type Cellars_Insert_Input = {
  co_owners?: InputMaybe<Cellar_Owners_Arr_Rel_Insert_Input>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  items?: InputMaybe<Cellar_Items_Arr_Rel_Insert_Input>;
  name?: InputMaybe<Scalars['String']['input']>;
  privacy?: InputMaybe<Permission_Type_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
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
  co_owners_aggregate?: InputMaybe<Cellar_Owners_Aggregate_Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Order_By>;
  name?: InputMaybe<Order_By>;
  privacy?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
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
  Name = 'name',
  /** column name */
  Privacy = 'privacy',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** input type for updating data in table "cellars" */
export type Cellars_Set_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  privacy?: InputMaybe<Permission_Type_Enum>;
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
  name?: InputMaybe<Scalars['String']['input']>;
  privacy?: InputMaybe<Permission_Type_Enum>;
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
  Name = 'name',
  /** column name */
  Privacy = 'privacy',
  /** column name */
  UpdatedAt = 'updated_at'
}

export type Cellars_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Cellars_Set_Input>;
  /** filter the rows which have to be updated */
  where: Cellars_Bool_Exp;
};

/** columns and relationships of "check_ins" */
export type Check_Ins = {
  __typename: 'check_ins';
  /** An object relationship */
  cellar_item: Cellar_Items;
  cellar_item_id: Scalars['uuid']['output'];
  created_at: Scalars['timestamptz']['output'];
  id: Scalars['uuid']['output'];
  updated_at: Scalars['timestamptz']['output'];
  /** An object relationship */
  user: Users;
  user_id: Scalars['uuid']['output'];
};

/** aggregated selection of "check_ins" */
export type Check_Ins_Aggregate = {
  __typename: 'check_ins_aggregate';
  aggregate?: Maybe<Check_Ins_Aggregate_Fields>;
  nodes: Array<Check_Ins>;
};

export type Check_Ins_Aggregate_Bool_Exp = {
  count?: InputMaybe<Check_Ins_Aggregate_Bool_Exp_Count>;
};

export type Check_Ins_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Check_Ins_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Check_Ins_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "check_ins" */
export type Check_Ins_Aggregate_Fields = {
  __typename: 'check_ins_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Check_Ins_Max_Fields>;
  min?: Maybe<Check_Ins_Min_Fields>;
};


/** aggregate fields of "check_ins" */
export type Check_Ins_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Check_Ins_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "check_ins" */
export type Check_Ins_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Check_Ins_Max_Order_By>;
  min?: InputMaybe<Check_Ins_Min_Order_By>;
};

/** input type for inserting array relation for remote table "check_ins" */
export type Check_Ins_Arr_Rel_Insert_Input = {
  data: Array<Check_Ins_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Check_Ins_On_Conflict>;
};

/** Boolean expression to filter rows from the table "check_ins". All fields are combined with a logical 'AND'. */
export type Check_Ins_Bool_Exp = {
  _and?: InputMaybe<Array<Check_Ins_Bool_Exp>>;
  _not?: InputMaybe<Check_Ins_Bool_Exp>;
  _or?: InputMaybe<Array<Check_Ins_Bool_Exp>>;
  cellar_item?: InputMaybe<Cellar_Items_Bool_Exp>;
  cellar_item_id?: InputMaybe<Uuid_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  user_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "check_ins" */
export enum Check_Ins_Constraint {
  /** unique or primary key constraint on columns "id" */
  CheckInsPkey = 'check_ins_pkey'
}

/** input type for inserting data into table "check_ins" */
export type Check_Ins_Insert_Input = {
  cellar_item?: InputMaybe<Cellar_Items_Obj_Rel_Insert_Input>;
  cellar_item_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Check_Ins_Max_Fields = {
  __typename: 'check_ins_max_fields';
  cellar_item_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "check_ins" */
export type Check_Ins_Max_Order_By = {
  cellar_item_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Check_Ins_Min_Fields = {
  __typename: 'check_ins_min_fields';
  cellar_item_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "check_ins" */
export type Check_Ins_Min_Order_By = {
  cellar_item_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "check_ins" */
export type Check_Ins_Mutation_Response = {
  __typename: 'check_ins_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Check_Ins>;
};

/** on_conflict condition type for table "check_ins" */
export type Check_Ins_On_Conflict = {
  constraint: Check_Ins_Constraint;
  update_columns?: Array<Check_Ins_Update_Column>;
  where?: InputMaybe<Check_Ins_Bool_Exp>;
};

/** Ordering options when selecting data from "check_ins". */
export type Check_Ins_Order_By = {
  cellar_item?: InputMaybe<Cellar_Items_Order_By>;
  cellar_item_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user?: InputMaybe<Users_Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: check_ins */
export type Check_Ins_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "check_ins" */
export enum Check_Ins_Select_Column {
  /** column name */
  CellarItemId = 'cellar_item_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Id = 'id',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id'
}

/** input type for updating data in table "check_ins" */
export type Check_Ins_Set_Input = {
  cellar_item_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "check_ins" */
export type Check_Ins_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Check_Ins_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Check_Ins_Stream_Cursor_Value_Input = {
  cellar_item_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "check_ins" */
export enum Check_Ins_Update_Column {
  /** column name */
  CellarItemId = 'cellar_item_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Id = 'id',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id'
}

export type Check_Ins_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Check_Ins_Set_Input>;
  /** filter the rows which have to be updated */
  where: Check_Ins_Bool_Exp;
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

/** columns and relationships of "coffee_cultivar" */
export type Coffee_Cultivar = {
  __typename: 'coffee_cultivar';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "coffee_cultivar" */
export type Coffee_Cultivar_Aggregate = {
  __typename: 'coffee_cultivar_aggregate';
  aggregate?: Maybe<Coffee_Cultivar_Aggregate_Fields>;
  nodes: Array<Coffee_Cultivar>;
};

/** aggregate fields of "coffee_cultivar" */
export type Coffee_Cultivar_Aggregate_Fields = {
  __typename: 'coffee_cultivar_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Coffee_Cultivar_Max_Fields>;
  min?: Maybe<Coffee_Cultivar_Min_Fields>;
};


/** aggregate fields of "coffee_cultivar" */
export type Coffee_Cultivar_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Coffee_Cultivar_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "coffee_cultivar". All fields are combined with a logical 'AND'. */
export type Coffee_Cultivar_Bool_Exp = {
  _and?: InputMaybe<Array<Coffee_Cultivar_Bool_Exp>>;
  _not?: InputMaybe<Coffee_Cultivar_Bool_Exp>;
  _or?: InputMaybe<Array<Coffee_Cultivar_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "coffee_cultivar" */
export enum Coffee_Cultivar_Constraint {
  /** unique or primary key constraint on columns "text" */
  CoffeeCultivarPkey = 'coffee_cultivar_pkey'
}

export enum Coffee_Cultivar_Enum {
  Arushan = 'ARUSHAN',
  Benguet = 'BENGUET',
  BergendalSidikalang = 'BERGENDAL_SIDIKALANG',
  Bernardina = 'BERNARDINA',
  BlueMountain = 'BLUE_MOUNTAIN',
  Bonifieur = 'BONIFIEUR',
  Bourbon = 'BOURBON',
  Brutte = 'BRUTTE',
  Bugishu = 'BUGISHU',
  Catimor = 'CATIMOR',
  Catuai = 'CATUAI',
  Caturra = 'CATURRA',
  Charrier = 'CHARRIER',
  FrenchMission = 'FRENCH_MISSION',
  Geisha = 'GEISHA',
  Harar = 'HARAR',
  Java = 'JAVA',
  K7 = 'K7',
  Kona = 'KONA',
  Maracaturra = 'MARACATURRA',
  Maragogipe = 'MARAGOGIPE',
  Mayaguez = 'MAYAGUEZ',
  Mocha = 'MOCHA',
  MundoNovo = 'MUNDO_NOVO',
  OrangeYellowBourbon = 'ORANGE_YELLOW_BOURBON',
  Pacamara = 'PACAMARA',
  Pacas = 'PACAS',
  PacheColis = 'PACHE_COLIS',
  PacheComum = 'PACHE_COMUM',
  Ruiru_11 = 'RUIRU_11',
  S795 = 'S795',
  Sagada = 'SAGADA',
  Santos = 'SANTOS',
  Sarchimor = 'SARCHIMOR',
  Selection_9 = 'SELECTION_9',
  Sidamo = 'SIDAMO',
  Sl28 = 'SL28',
  Sl34 = 'SL34',
  Starmaya = 'STARMAYA',
  SulawesiToraja = 'SULAWESI_TORAJA',
  Sumatra = 'SUMATRA',
  TimorArabusta = 'TIMOR_ARABUSTA',
  Typica = 'TYPICA',
  Yirgacheffe = 'YIRGACHEFFE'
}

/** Boolean expression to compare columns of type "coffee_cultivar_enum". All fields are combined with logical 'AND'. */
export type Coffee_Cultivar_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Coffee_Cultivar_Enum>;
  _in?: InputMaybe<Array<Coffee_Cultivar_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Coffee_Cultivar_Enum>;
  _nin?: InputMaybe<Array<Coffee_Cultivar_Enum>>;
};

/** input type for inserting data into table "coffee_cultivar" */
export type Coffee_Cultivar_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Coffee_Cultivar_Max_Fields = {
  __typename: 'coffee_cultivar_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Coffee_Cultivar_Min_Fields = {
  __typename: 'coffee_cultivar_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "coffee_cultivar" */
export type Coffee_Cultivar_Mutation_Response = {
  __typename: 'coffee_cultivar_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Coffee_Cultivar>;
};

/** on_conflict condition type for table "coffee_cultivar" */
export type Coffee_Cultivar_On_Conflict = {
  constraint: Coffee_Cultivar_Constraint;
  update_columns?: Array<Coffee_Cultivar_Update_Column>;
  where?: InputMaybe<Coffee_Cultivar_Bool_Exp>;
};

/** Ordering options when selecting data from "coffee_cultivar". */
export type Coffee_Cultivar_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: coffee_cultivar */
export type Coffee_Cultivar_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "coffee_cultivar" */
export enum Coffee_Cultivar_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "coffee_cultivar" */
export type Coffee_Cultivar_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "coffee_cultivar" */
export type Coffee_Cultivar_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Coffee_Cultivar_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Coffee_Cultivar_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "coffee_cultivar" */
export enum Coffee_Cultivar_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Coffee_Cultivar_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Coffee_Cultivar_Set_Input>;
  /** filter the rows which have to be updated */
  where: Coffee_Cultivar_Bool_Exp;
};

export type Coffee_Defaults_Result = {
  __typename: 'coffee_defaults_result';
  barcode_code?: Maybe<Scalars['String']['output']>;
  barcode_type?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  cultivar?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  item_onboarding_id: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  process?: Maybe<Scalars['String']['output']>;
  roast_level?: Maybe<Scalars['String']['output']>;
  species?: Maybe<Scalars['String']['output']>;
};

/** columns and relationships of "coffee_process" */
export type Coffee_Process = {
  __typename: 'coffee_process';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "coffee_process" */
export type Coffee_Process_Aggregate = {
  __typename: 'coffee_process_aggregate';
  aggregate?: Maybe<Coffee_Process_Aggregate_Fields>;
  nodes: Array<Coffee_Process>;
};

/** aggregate fields of "coffee_process" */
export type Coffee_Process_Aggregate_Fields = {
  __typename: 'coffee_process_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Coffee_Process_Max_Fields>;
  min?: Maybe<Coffee_Process_Min_Fields>;
};


/** aggregate fields of "coffee_process" */
export type Coffee_Process_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Coffee_Process_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "coffee_process". All fields are combined with a logical 'AND'. */
export type Coffee_Process_Bool_Exp = {
  _and?: InputMaybe<Array<Coffee_Process_Bool_Exp>>;
  _not?: InputMaybe<Coffee_Process_Bool_Exp>;
  _or?: InputMaybe<Array<Coffee_Process_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "coffee_process" */
export enum Coffee_Process_Constraint {
  /** unique or primary key constraint on columns "text" */
  CoffeeProcessPkey = 'coffee_process_pkey'
}

export enum Coffee_Process_Enum {
  Honey = 'HONEY',
  NaturalDry = 'NATURAL_DRY',
  PulpedNatural = 'PULPED_NATURAL',
  PulpedNaturalHoney = 'PULPED_NATURAL_HONEY',
  Washed = 'WASHED',
  WetHulled = 'WET_HULLED'
}

/** Boolean expression to compare columns of type "coffee_process_enum". All fields are combined with logical 'AND'. */
export type Coffee_Process_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Coffee_Process_Enum>;
  _in?: InputMaybe<Array<Coffee_Process_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Coffee_Process_Enum>;
  _nin?: InputMaybe<Array<Coffee_Process_Enum>>;
};

/** input type for inserting data into table "coffee_process" */
export type Coffee_Process_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Coffee_Process_Max_Fields = {
  __typename: 'coffee_process_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Coffee_Process_Min_Fields = {
  __typename: 'coffee_process_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "coffee_process" */
export type Coffee_Process_Mutation_Response = {
  __typename: 'coffee_process_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Coffee_Process>;
};

/** on_conflict condition type for table "coffee_process" */
export type Coffee_Process_On_Conflict = {
  constraint: Coffee_Process_Constraint;
  update_columns?: Array<Coffee_Process_Update_Column>;
  where?: InputMaybe<Coffee_Process_Bool_Exp>;
};

/** Ordering options when selecting data from "coffee_process". */
export type Coffee_Process_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: coffee_process */
export type Coffee_Process_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "coffee_process" */
export enum Coffee_Process_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "coffee_process" */
export type Coffee_Process_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "coffee_process" */
export type Coffee_Process_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Coffee_Process_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Coffee_Process_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "coffee_process" */
export enum Coffee_Process_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Coffee_Process_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Coffee_Process_Set_Input>;
  /** filter the rows which have to be updated */
  where: Coffee_Process_Bool_Exp;
};

/** columns and relationships of "coffee_roast_level" */
export type Coffee_Roast_Level = {
  __typename: 'coffee_roast_level';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "coffee_roast_level" */
export type Coffee_Roast_Level_Aggregate = {
  __typename: 'coffee_roast_level_aggregate';
  aggregate?: Maybe<Coffee_Roast_Level_Aggregate_Fields>;
  nodes: Array<Coffee_Roast_Level>;
};

/** aggregate fields of "coffee_roast_level" */
export type Coffee_Roast_Level_Aggregate_Fields = {
  __typename: 'coffee_roast_level_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Coffee_Roast_Level_Max_Fields>;
  min?: Maybe<Coffee_Roast_Level_Min_Fields>;
};


/** aggregate fields of "coffee_roast_level" */
export type Coffee_Roast_Level_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Coffee_Roast_Level_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "coffee_roast_level". All fields are combined with a logical 'AND'. */
export type Coffee_Roast_Level_Bool_Exp = {
  _and?: InputMaybe<Array<Coffee_Roast_Level_Bool_Exp>>;
  _not?: InputMaybe<Coffee_Roast_Level_Bool_Exp>;
  _or?: InputMaybe<Array<Coffee_Roast_Level_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "coffee_roast_level" */
export enum Coffee_Roast_Level_Constraint {
  /** unique or primary key constraint on columns "text" */
  CoffeeRoastLevelPkey = 'coffee_roast_level_pkey'
}

export enum Coffee_Roast_Level_Enum {
  Dark = 'DARK',
  ExtraDark = 'EXTRA_DARK',
  Light = 'LIGHT',
  LightMedium = 'LIGHT_MEDIUM',
  Medium = 'MEDIUM',
  MediumDark = 'MEDIUM_DARK'
}

/** Boolean expression to compare columns of type "coffee_roast_level_enum". All fields are combined with logical 'AND'. */
export type Coffee_Roast_Level_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Coffee_Roast_Level_Enum>;
  _in?: InputMaybe<Array<Coffee_Roast_Level_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Coffee_Roast_Level_Enum>;
  _nin?: InputMaybe<Array<Coffee_Roast_Level_Enum>>;
};

/** input type for inserting data into table "coffee_roast_level" */
export type Coffee_Roast_Level_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Coffee_Roast_Level_Max_Fields = {
  __typename: 'coffee_roast_level_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Coffee_Roast_Level_Min_Fields = {
  __typename: 'coffee_roast_level_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "coffee_roast_level" */
export type Coffee_Roast_Level_Mutation_Response = {
  __typename: 'coffee_roast_level_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Coffee_Roast_Level>;
};

/** on_conflict condition type for table "coffee_roast_level" */
export type Coffee_Roast_Level_On_Conflict = {
  constraint: Coffee_Roast_Level_Constraint;
  update_columns?: Array<Coffee_Roast_Level_Update_Column>;
  where?: InputMaybe<Coffee_Roast_Level_Bool_Exp>;
};

/** Ordering options when selecting data from "coffee_roast_level". */
export type Coffee_Roast_Level_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: coffee_roast_level */
export type Coffee_Roast_Level_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "coffee_roast_level" */
export enum Coffee_Roast_Level_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "coffee_roast_level" */
export type Coffee_Roast_Level_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "coffee_roast_level" */
export type Coffee_Roast_Level_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Coffee_Roast_Level_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Coffee_Roast_Level_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "coffee_roast_level" */
export enum Coffee_Roast_Level_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Coffee_Roast_Level_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Coffee_Roast_Level_Set_Input>;
  /** filter the rows which have to be updated */
  where: Coffee_Roast_Level_Bool_Exp;
};

/** columns and relationships of "coffee_species" */
export type Coffee_Species = {
  __typename: 'coffee_species';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "coffee_species" */
export type Coffee_Species_Aggregate = {
  __typename: 'coffee_species_aggregate';
  aggregate?: Maybe<Coffee_Species_Aggregate_Fields>;
  nodes: Array<Coffee_Species>;
};

/** aggregate fields of "coffee_species" */
export type Coffee_Species_Aggregate_Fields = {
  __typename: 'coffee_species_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Coffee_Species_Max_Fields>;
  min?: Maybe<Coffee_Species_Min_Fields>;
};


/** aggregate fields of "coffee_species" */
export type Coffee_Species_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Coffee_Species_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "coffee_species". All fields are combined with a logical 'AND'. */
export type Coffee_Species_Bool_Exp = {
  _and?: InputMaybe<Array<Coffee_Species_Bool_Exp>>;
  _not?: InputMaybe<Coffee_Species_Bool_Exp>;
  _or?: InputMaybe<Array<Coffee_Species_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "coffee_species" */
export enum Coffee_Species_Constraint {
  /** unique or primary key constraint on columns "text" */
  CoffeeSpeciesPkey = 'coffee_species_pkey'
}

export enum Coffee_Species_Enum {
  Arabica = 'ARABICA',
  Charrieriana = 'CHARRIERIANA',
  Liberica = 'LIBERICA',
  Robusta = 'ROBUSTA',
  Stenophylla = 'STENOPHYLLA'
}

/** Boolean expression to compare columns of type "coffee_species_enum". All fields are combined with logical 'AND'. */
export type Coffee_Species_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Coffee_Species_Enum>;
  _in?: InputMaybe<Array<Coffee_Species_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Coffee_Species_Enum>;
  _nin?: InputMaybe<Array<Coffee_Species_Enum>>;
};

/** input type for inserting data into table "coffee_species" */
export type Coffee_Species_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Coffee_Species_Max_Fields = {
  __typename: 'coffee_species_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Coffee_Species_Min_Fields = {
  __typename: 'coffee_species_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "coffee_species" */
export type Coffee_Species_Mutation_Response = {
  __typename: 'coffee_species_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Coffee_Species>;
};

/** on_conflict condition type for table "coffee_species" */
export type Coffee_Species_On_Conflict = {
  constraint: Coffee_Species_Constraint;
  update_columns?: Array<Coffee_Species_Update_Column>;
  where?: InputMaybe<Coffee_Species_Bool_Exp>;
};

/** Ordering options when selecting data from "coffee_species". */
export type Coffee_Species_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: coffee_species */
export type Coffee_Species_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "coffee_species" */
export enum Coffee_Species_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "coffee_species" */
export type Coffee_Species_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "coffee_species" */
export type Coffee_Species_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Coffee_Species_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Coffee_Species_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "coffee_species" */
export enum Coffee_Species_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Coffee_Species_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Coffee_Species_Set_Input>;
  /** filter the rows which have to be updated */
  where: Coffee_Species_Bool_Exp;
};

/** columns and relationships of "coffees" */
export type Coffees = {
  __typename: 'coffees';
  /** An object relationship */
  barcode?: Maybe<Barcodes>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  /** An array relationship */
  cellar_items: Array<Cellar_Items>;
  /** An aggregate relationship */
  cellar_items_aggregate: Cellar_Items_Aggregate;
  country?: Maybe<Country_Enum>;
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by_id: Scalars['uuid']['output'];
  cultivar?: Maybe<Coffee_Cultivar_Enum>;
  description: Scalars['String']['output'];
  id: Scalars['uuid']['output'];
  /** An array relationship */
  item_favorites: Array<Item_Favorites>;
  /** An aggregate relationship */
  item_favorites_aggregate: Item_Favorites_Aggregate;
  /** An array relationship */
  item_images: Array<Item_Image>;
  /** An aggregate relationship */
  item_images_aggregate: Item_Image_Aggregate;
  item_onboarding_id: Scalars['uuid']['output'];
  /** An array relationship */
  item_vectors: Array<Item_Vectors>;
  /** An aggregate relationship */
  item_vectors_aggregate: Item_Vectors_Aggregate;
  name: Scalars['String']['output'];
  process?: Maybe<Coffee_Process_Enum>;
  /** An array relationship */
  reviews: Array<Item_Reviews>;
  /** An aggregate relationship */
  reviews_aggregate: Item_Reviews_Aggregate;
  roast_level?: Maybe<Coffee_Roast_Level_Enum>;
  species?: Maybe<Coffee_Species_Enum>;
  updated_at: Scalars['timestamptz']['output'];
};


/** columns and relationships of "coffees" */
export type CoffeesCellar_ItemsArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


/** columns and relationships of "coffees" */
export type CoffeesCellar_Items_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


/** columns and relationships of "coffees" */
export type CoffeesItem_FavoritesArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** columns and relationships of "coffees" */
export type CoffeesItem_Favorites_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** columns and relationships of "coffees" */
export type CoffeesItem_ImagesArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


/** columns and relationships of "coffees" */
export type CoffeesItem_Images_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


/** columns and relationships of "coffees" */
export type CoffeesItem_VectorsArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


/** columns and relationships of "coffees" */
export type CoffeesItem_Vectors_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


/** columns and relationships of "coffees" */
export type CoffeesReviewsArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};


/** columns and relationships of "coffees" */
export type CoffeesReviews_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};

/** aggregated selection of "coffees" */
export type Coffees_Aggregate = {
  __typename: 'coffees_aggregate';
  aggregate?: Maybe<Coffees_Aggregate_Fields>;
  nodes: Array<Coffees>;
};

export type Coffees_Aggregate_Bool_Exp = {
  count?: InputMaybe<Coffees_Aggregate_Bool_Exp_Count>;
};

export type Coffees_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Coffees_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Coffees_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "coffees" */
export type Coffees_Aggregate_Fields = {
  __typename: 'coffees_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Coffees_Max_Fields>;
  min?: Maybe<Coffees_Min_Fields>;
};


/** aggregate fields of "coffees" */
export type Coffees_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Coffees_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "coffees" */
export type Coffees_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Coffees_Max_Order_By>;
  min?: InputMaybe<Coffees_Min_Order_By>;
};

/** input type for inserting array relation for remote table "coffees" */
export type Coffees_Arr_Rel_Insert_Input = {
  data: Array<Coffees_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Coffees_On_Conflict>;
};

/** Boolean expression to filter rows from the table "coffees". All fields are combined with a logical 'AND'. */
export type Coffees_Bool_Exp = {
  _and?: InputMaybe<Array<Coffees_Bool_Exp>>;
  _not?: InputMaybe<Coffees_Bool_Exp>;
  _or?: InputMaybe<Array<Coffees_Bool_Exp>>;
  barcode?: InputMaybe<Barcodes_Bool_Exp>;
  barcode_code?: InputMaybe<String_Comparison_Exp>;
  cellar_items?: InputMaybe<Cellar_Items_Bool_Exp>;
  cellar_items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Bool_Exp>;
  country?: InputMaybe<Country_Enum_Comparison_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by_id?: InputMaybe<Uuid_Comparison_Exp>;
  cultivar?: InputMaybe<Coffee_Cultivar_Enum_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  item_favorites?: InputMaybe<Item_Favorites_Bool_Exp>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Bool_Exp>;
  item_images?: InputMaybe<Item_Image_Bool_Exp>;
  item_images_aggregate?: InputMaybe<Item_Image_Aggregate_Bool_Exp>;
  item_onboarding_id?: InputMaybe<Uuid_Comparison_Exp>;
  item_vectors?: InputMaybe<Item_Vectors_Bool_Exp>;
  item_vectors_aggregate?: InputMaybe<Item_Vectors_Aggregate_Bool_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  process?: InputMaybe<Coffee_Process_Enum_Comparison_Exp>;
  reviews?: InputMaybe<Item_Reviews_Bool_Exp>;
  reviews_aggregate?: InputMaybe<Item_Reviews_Aggregate_Bool_Exp>;
  roast_level?: InputMaybe<Coffee_Roast_Level_Enum_Comparison_Exp>;
  species?: InputMaybe<Coffee_Species_Enum_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
};

/** unique or primary key constraints on table "coffees" */
export enum Coffees_Constraint {
  /** unique or primary key constraint on columns "id" */
  CoffeePkey = 'coffee_pkey'
}

/** input type for inserting data into table "coffees" */
export type Coffees_Insert_Input = {
  barcode?: InputMaybe<Barcodes_Obj_Rel_Insert_Input>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_items?: InputMaybe<Cellar_Items_Arr_Rel_Insert_Input>;
  country?: InputMaybe<Country_Enum>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  cultivar?: InputMaybe<Coffee_Cultivar_Enum>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_favorites?: InputMaybe<Item_Favorites_Arr_Rel_Insert_Input>;
  item_images?: InputMaybe<Item_Image_Arr_Rel_Insert_Input>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  item_vectors?: InputMaybe<Item_Vectors_Arr_Rel_Insert_Input>;
  name?: InputMaybe<Scalars['String']['input']>;
  process?: InputMaybe<Coffee_Process_Enum>;
  reviews?: InputMaybe<Item_Reviews_Arr_Rel_Insert_Input>;
  roast_level?: InputMaybe<Coffee_Roast_Level_Enum>;
  species?: InputMaybe<Coffee_Species_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** aggregate max on columns */
export type Coffees_Max_Fields = {
  __typename: 'coffees_max_fields';
  barcode_code?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  item_onboarding_id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by max() on columns of table "coffees" */
export type Coffees_Max_Order_By = {
  barcode_code?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Coffees_Min_Fields = {
  __typename: 'coffees_min_fields';
  barcode_code?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  item_onboarding_id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
};

/** order by min() on columns of table "coffees" */
export type Coffees_Min_Order_By = {
  barcode_code?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "coffees" */
export type Coffees_Mutation_Response = {
  __typename: 'coffees_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Coffees>;
};

/** input type for inserting object relation for remote table "coffees" */
export type Coffees_Obj_Rel_Insert_Input = {
  data: Coffees_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Coffees_On_Conflict>;
};

/** on_conflict condition type for table "coffees" */
export type Coffees_On_Conflict = {
  constraint: Coffees_Constraint;
  update_columns?: Array<Coffees_Update_Column>;
  where?: InputMaybe<Coffees_Bool_Exp>;
};

/** Ordering options when selecting data from "coffees". */
export type Coffees_Order_By = {
  barcode?: InputMaybe<Barcodes_Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  cellar_items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Order_By>;
  country?: InputMaybe<Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  cultivar?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Order_By>;
  item_images_aggregate?: InputMaybe<Item_Image_Aggregate_Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  item_vectors_aggregate?: InputMaybe<Item_Vectors_Aggregate_Order_By>;
  name?: InputMaybe<Order_By>;
  process?: InputMaybe<Order_By>;
  reviews_aggregate?: InputMaybe<Item_Reviews_Aggregate_Order_By>;
  roast_level?: InputMaybe<Order_By>;
  species?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
};

/** primary key columns input for table: coffees */
export type Coffees_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "coffees" */
export enum Coffees_Select_Column {
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  Country = 'country',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Cultivar = 'cultivar',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  ItemOnboardingId = 'item_onboarding_id',
  /** column name */
  Name = 'name',
  /** column name */
  Process = 'process',
  /** column name */
  RoastLevel = 'roast_level',
  /** column name */
  Species = 'species',
  /** column name */
  UpdatedAt = 'updated_at'
}

/** input type for updating data in table "coffees" */
export type Coffees_Set_Input = {
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  country?: InputMaybe<Country_Enum>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  cultivar?: InputMaybe<Coffee_Cultivar_Enum>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  process?: InputMaybe<Coffee_Process_Enum>;
  roast_level?: InputMaybe<Coffee_Roast_Level_Enum>;
  species?: InputMaybe<Coffee_Species_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** Streaming cursor of the table "coffees" */
export type Coffees_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Coffees_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Coffees_Stream_Cursor_Value_Input = {
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  country?: InputMaybe<Country_Enum>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  cultivar?: InputMaybe<Coffee_Cultivar_Enum>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  process?: InputMaybe<Coffee_Process_Enum>;
  roast_level?: InputMaybe<Coffee_Roast_Level_Enum>;
  species?: InputMaybe<Coffee_Species_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
};

/** update columns of table "coffees" */
export enum Coffees_Update_Column {
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  Country = 'country',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Cultivar = 'cultivar',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  ItemOnboardingId = 'item_onboarding_id',
  /** column name */
  Name = 'name',
  /** column name */
  Process = 'process',
  /** column name */
  RoastLevel = 'roast_level',
  /** column name */
  Species = 'species',
  /** column name */
  UpdatedAt = 'updated_at'
}

export type Coffees_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Coffees_Set_Input>;
  /** filter the rows which have to be updated */
  where: Coffees_Bool_Exp;
};

/** columns and relationships of "country" */
export type Country = {
  __typename: 'country';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "country" */
export type Country_Aggregate = {
  __typename: 'country_aggregate';
  aggregate?: Maybe<Country_Aggregate_Fields>;
  nodes: Array<Country>;
};

/** aggregate fields of "country" */
export type Country_Aggregate_Fields = {
  __typename: 'country_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Country_Max_Fields>;
  min?: Maybe<Country_Min_Fields>;
};


/** aggregate fields of "country" */
export type Country_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Country_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "country". All fields are combined with a logical 'AND'. */
export type Country_Bool_Exp = {
  _and?: InputMaybe<Array<Country_Bool_Exp>>;
  _not?: InputMaybe<Country_Bool_Exp>;
  _or?: InputMaybe<Array<Country_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "country" */
export enum Country_Constraint {
  /** unique or primary key constraint on columns "text" */
  CountryPkey = 'country_pkey'
}

export enum Country_Enum {
  Afghanistan = 'AFGHANISTAN',
  Albania = 'ALBANIA',
  Algeria = 'ALGERIA',
  Andorra = 'ANDORRA',
  Angola = 'ANGOLA',
  AntiguaAndBarbuda = 'ANTIGUA_AND_BARBUDA',
  Argentina = 'ARGENTINA',
  Armenia = 'ARMENIA',
  Australia = 'AUSTRALIA',
  Austria = 'AUSTRIA',
  Azerbaijan = 'AZERBAIJAN',
  Bahamas = 'BAHAMAS',
  Bahrain = 'BAHRAIN',
  Bangladesh = 'BANGLADESH',
  Barbados = 'BARBADOS',
  Belarus = 'BELARUS',
  Belgium = 'BELGIUM',
  Belize = 'BELIZE',
  Benin = 'BENIN',
  Bhutan = 'BHUTAN',
  Bolivia = 'BOLIVIA',
  BosniaAndHerzegovina = 'BOSNIA_AND_HERZEGOVINA',
  Botswana = 'BOTSWANA',
  Brazil = 'BRAZIL',
  Brunei = 'BRUNEI',
  Bulgaria = 'BULGARIA',
  BurkinaFaso = 'BURKINA_FASO',
  Burundi = 'BURUNDI',
  Cambodia = 'CAMBODIA',
  Cameroon = 'CAMEROON',
  Canada = 'CANADA',
  CapeVerdeCaboVerde = 'CAPE_VERDE_CABO_VERDE',
  CentralAfricanRepublic = 'CENTRAL_AFRICAN_REPUBLIC',
  Chad = 'CHAD',
  Chile = 'CHILE',
  China = 'CHINA',
  Colombia = 'COLOMBIA',
  Comoros = 'COMOROS',
  CongoDemocraticRepublicOfThe = 'CONGO_DEMOCRATIC_REPUBLIC_OF_THE',
  CongoRepublicOfThe = 'CONGO_REPUBLIC_OF_THE',
  CostaRica = 'COSTA_RICA',
  CoteDivoire = 'COTE_DIVOIRE',
  Croatia = 'CROATIA',
  Cuba = 'CUBA',
  Cyprus = 'CYPRUS',
  CzechRepublic = 'CZECH_REPUBLIC',
  Denmark = 'DENMARK',
  Djibouti = 'DJIBOUTI',
  Dominica = 'DOMINICA',
  DominicanRepublic = 'DOMINICAN_REPUBLIC',
  Ecuador = 'ECUADOR',
  Egypt = 'EGYPT',
  ElSalvador = 'EL_SALVADOR',
  EquatorialGuinea = 'EQUATORIAL_GUINEA',
  Eritrea = 'ERITREA',
  Estonia = 'ESTONIA',
  Eswatini = 'ESWATINI',
  Ethiopia = 'ETHIOPIA',
  Fiji = 'FIJI',
  Finland = 'FINLAND',
  France = 'FRANCE',
  Gabon = 'GABON',
  Gambia = 'GAMBIA',
  Georgia = 'GEORGIA',
  Germany = 'GERMANY',
  Ghana = 'GHANA',
  Greece = 'GREECE',
  Grenada = 'GRENADA',
  Guatemala = 'GUATEMALA',
  Guinea = 'GUINEA',
  GuineaBissau = 'GUINEA_BISSAU',
  Guyana = 'GUYANA',
  Haiti = 'HAITI',
  Honduras = 'HONDURAS',
  Hungary = 'HUNGARY',
  Iceland = 'ICELAND',
  India = 'INDIA',
  Indonesia = 'INDONESIA',
  Iran = 'IRAN',
  Iraq = 'IRAQ',
  Ireland = 'IRELAND',
  Israel = 'ISRAEL',
  Italy = 'ITALY',
  Jamaica = 'JAMAICA',
  Japan = 'JAPAN',
  Jordan = 'JORDAN',
  Kazakhstan = 'KAZAKHSTAN',
  Kenya = 'KENYA',
  Kiribati = 'KIRIBATI',
  Kosovo = 'KOSOVO',
  Kuwait = 'KUWAIT',
  Kyrgyzstan = 'KYRGYZSTAN',
  Laos = 'LAOS',
  Latvia = 'LATVIA',
  Lebanon = 'LEBANON',
  Lesotho = 'LESOTHO',
  Liberia = 'LIBERIA',
  Libya = 'LIBYA',
  Liechtenstein = 'LIECHTENSTEIN',
  Lithuania = 'LITHUANIA',
  Luxembourg = 'LUXEMBOURG',
  Madagascar = 'MADAGASCAR',
  Malawi = 'MALAWI',
  Malaysia = 'MALAYSIA',
  Maldives = 'MALDIVES',
  Mali = 'MALI',
  Malta = 'MALTA',
  MarshallIslands = 'MARSHALL_ISLANDS',
  Mauritania = 'MAURITANIA',
  Mauritius = 'MAURITIUS',
  Mexico = 'MEXICO',
  Micronesia = 'MICRONESIA',
  Moldova = 'MOLDOVA',
  Monaco = 'MONACO',
  Mongolia = 'MONGOLIA',
  Montenegro = 'MONTENEGRO',
  Morocco = 'MOROCCO',
  Mozambique = 'MOZAMBIQUE',
  Myanmar = 'MYANMAR',
  Namibia = 'NAMIBIA',
  Nauru = 'NAURU',
  Nepal = 'NEPAL',
  Netherlands = 'NETHERLANDS',
  NewZealand = 'NEW_ZEALAND',
  Nicaragua = 'NICARAGUA',
  Niger = 'NIGER',
  Nigeria = 'NIGERIA',
  NorthKorea = 'NORTH_KOREA',
  NorthMacedonia = 'NORTH_MACEDONIA',
  Norway = 'NORWAY',
  Oman = 'OMAN',
  Pakistan = 'PAKISTAN',
  Palau = 'PALAU',
  Panama = 'PANAMA',
  PapuaNewGuinea = 'PAPUA_NEW_GUINEA',
  Paraguay = 'PARAGUAY',
  Peru = 'PERU',
  Philippines = 'PHILIPPINES',
  Poland = 'POLAND',
  Portugal = 'PORTUGAL',
  Qatar = 'QATAR',
  Romania = 'ROMANIA',
  Russia = 'RUSSIA',
  Rwanda = 'RWANDA',
  SaintKittsAndNevis = 'SAINT_KITTS_AND_NEVIS',
  SaintLucia = 'SAINT_LUCIA',
  SaintVincentAndTheGrenadines = 'SAINT_VINCENT_AND_THE_GRENADINES',
  Samoa = 'SAMOA',
  SanMarino = 'SAN_MARINO',
  SaoTomeAndPrincipe = 'SAO_TOME_AND_PRINCIPE',
  SaudiArabia = 'SAUDI_ARABIA',
  Scotland = 'SCOTLAND',
  Senegal = 'SENEGAL',
  Serbia = 'SERBIA',
  Seychelles = 'SEYCHELLES',
  SierraLeone = 'SIERRA_LEONE',
  Singapore = 'SINGAPORE',
  Slovakia = 'SLOVAKIA',
  Slovenia = 'SLOVENIA',
  SolomonIslands = 'SOLOMON_ISLANDS',
  Somalia = 'SOMALIA',
  SouthAfrica = 'SOUTH_AFRICA',
  SouthKorea = 'SOUTH_KOREA',
  SouthSudan = 'SOUTH_SUDAN',
  Spain = 'SPAIN',
  SriLanka = 'SRI_LANKA',
  Sudan = 'SUDAN',
  Suriname = 'SURINAME',
  Sweden = 'SWEDEN',
  Switzerland = 'SWITZERLAND',
  Syria = 'SYRIA',
  Tajikistan = 'TAJIKISTAN',
  Tanzania = 'TANZANIA',
  Thailand = 'THAILAND',
  TimorLeste = 'TIMOR_LESTE',
  Togo = 'TOGO',
  Tonga = 'TONGA',
  TrinidadAndTobago = 'TRINIDAD_AND_TOBAGO',
  Tunisia = 'TUNISIA',
  Turkey = 'TURKEY',
  Turkmenistan = 'TURKMENISTAN',
  Tuvalu = 'TUVALU',
  Uganda = 'UGANDA',
  Ukraine = 'UKRAINE',
  UnitedArabEmirates = 'UNITED_ARAB_EMIRATES',
  UnitedKingdom = 'UNITED_KINGDOM',
  UnitedStates = 'UNITED_STATES',
  Uruguay = 'URUGUAY',
  Uzbekistan = 'UZBEKISTAN',
  Vanuatu = 'VANUATU',
  VaticanCity = 'VATICAN_CITY',
  Venezuela = 'VENEZUELA',
  Vietnam = 'VIETNAM',
  Wales = 'WALES',
  Yemen = 'YEMEN',
  Zambia = 'ZAMBIA',
  Zimbabwe = 'ZIMBABWE'
}

/** Boolean expression to compare columns of type "country_enum". All fields are combined with logical 'AND'. */
export type Country_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Country_Enum>;
  _in?: InputMaybe<Array<Country_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Country_Enum>;
  _nin?: InputMaybe<Array<Country_Enum>>;
};

/** input type for inserting data into table "country" */
export type Country_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Country_Max_Fields = {
  __typename: 'country_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Country_Min_Fields = {
  __typename: 'country_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "country" */
export type Country_Mutation_Response = {
  __typename: 'country_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Country>;
};

/** on_conflict condition type for table "country" */
export type Country_On_Conflict = {
  constraint: Country_Constraint;
  update_columns?: Array<Country_Update_Column>;
  where?: InputMaybe<Country_Bool_Exp>;
};

/** Ordering options when selecting data from "country". */
export type Country_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: country */
export type Country_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "country" */
export enum Country_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "country" */
export type Country_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "country" */
export type Country_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Country_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Country_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "country" */
export enum Country_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Country_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Country_Set_Input>;
  /** filter the rows which have to be updated */
  where: Country_Bool_Exp;
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

export type Distance_Item_Vectors_Args = {
  search?: InputMaybe<Scalars['vector']['input']>;
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

/** Boolean expression to compare columns of type "float8". All fields are combined with logical 'AND'. */
export type Float8_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['float8']['input']>;
  _gt?: InputMaybe<Scalars['float8']['input']>;
  _gte?: InputMaybe<Scalars['float8']['input']>;
  _in?: InputMaybe<Array<Scalars['float8']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['float8']['input']>;
  _lte?: InputMaybe<Scalars['float8']['input']>;
  _neq?: InputMaybe<Scalars['float8']['input']>;
  _nin?: InputMaybe<Array<Scalars['float8']['input']>>;
};

/** columns and relationships of "friend_request_status" */
export type Friend_Request_Status = {
  __typename: 'friend_request_status';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "friend_request_status" */
export type Friend_Request_Status_Aggregate = {
  __typename: 'friend_request_status_aggregate';
  aggregate?: Maybe<Friend_Request_Status_Aggregate_Fields>;
  nodes: Array<Friend_Request_Status>;
};

/** aggregate fields of "friend_request_status" */
export type Friend_Request_Status_Aggregate_Fields = {
  __typename: 'friend_request_status_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Friend_Request_Status_Max_Fields>;
  min?: Maybe<Friend_Request_Status_Min_Fields>;
};


/** aggregate fields of "friend_request_status" */
export type Friend_Request_Status_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Friend_Request_Status_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "friend_request_status". All fields are combined with a logical 'AND'. */
export type Friend_Request_Status_Bool_Exp = {
  _and?: InputMaybe<Array<Friend_Request_Status_Bool_Exp>>;
  _not?: InputMaybe<Friend_Request_Status_Bool_Exp>;
  _or?: InputMaybe<Array<Friend_Request_Status_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "friend_request_status" */
export enum Friend_Request_Status_Constraint {
  /** unique or primary key constraint on columns "text" */
  FriendRequestStatusPkey = 'friend_request_status_pkey'
}

export enum Friend_Request_Status_Enum {
  Accepted = 'ACCEPTED',
  Pending = 'PENDING'
}

/** Boolean expression to compare columns of type "friend_request_status_enum". All fields are combined with logical 'AND'. */
export type Friend_Request_Status_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Friend_Request_Status_Enum>;
  _in?: InputMaybe<Array<Friend_Request_Status_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Friend_Request_Status_Enum>;
  _nin?: InputMaybe<Array<Friend_Request_Status_Enum>>;
};

/** input type for inserting data into table "friend_request_status" */
export type Friend_Request_Status_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Friend_Request_Status_Max_Fields = {
  __typename: 'friend_request_status_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Friend_Request_Status_Min_Fields = {
  __typename: 'friend_request_status_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "friend_request_status" */
export type Friend_Request_Status_Mutation_Response = {
  __typename: 'friend_request_status_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Friend_Request_Status>;
};

/** on_conflict condition type for table "friend_request_status" */
export type Friend_Request_Status_On_Conflict = {
  constraint: Friend_Request_Status_Constraint;
  update_columns?: Array<Friend_Request_Status_Update_Column>;
  where?: InputMaybe<Friend_Request_Status_Bool_Exp>;
};

/** Ordering options when selecting data from "friend_request_status". */
export type Friend_Request_Status_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: friend_request_status */
export type Friend_Request_Status_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "friend_request_status" */
export enum Friend_Request_Status_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "friend_request_status" */
export type Friend_Request_Status_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "friend_request_status" */
export type Friend_Request_Status_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Friend_Request_Status_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Friend_Request_Status_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "friend_request_status" */
export enum Friend_Request_Status_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Friend_Request_Status_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Friend_Request_Status_Set_Input>;
  /** filter the rows which have to be updated */
  where: Friend_Request_Status_Bool_Exp;
};

/** columns and relationships of "friend_requests" */
export type Friend_Requests = {
  __typename: 'friend_requests';
  /** An object relationship */
  friend: Users;
  friend_id: Scalars['uuid']['output'];
  id: Scalars['uuid']['output'];
  status: Friend_Request_Status_Enum;
  /** An object relationship */
  user: Users;
  user_id: Scalars['uuid']['output'];
};

/** aggregated selection of "friend_requests" */
export type Friend_Requests_Aggregate = {
  __typename: 'friend_requests_aggregate';
  aggregate?: Maybe<Friend_Requests_Aggregate_Fields>;
  nodes: Array<Friend_Requests>;
};

export type Friend_Requests_Aggregate_Bool_Exp = {
  count?: InputMaybe<Friend_Requests_Aggregate_Bool_Exp_Count>;
};

export type Friend_Requests_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Friend_Requests_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "friend_requests" */
export type Friend_Requests_Aggregate_Fields = {
  __typename: 'friend_requests_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Friend_Requests_Max_Fields>;
  min?: Maybe<Friend_Requests_Min_Fields>;
};


/** aggregate fields of "friend_requests" */
export type Friend_Requests_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "friend_requests" */
export type Friend_Requests_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Friend_Requests_Max_Order_By>;
  min?: InputMaybe<Friend_Requests_Min_Order_By>;
};

/** input type for inserting array relation for remote table "friend_requests" */
export type Friend_Requests_Arr_Rel_Insert_Input = {
  data: Array<Friend_Requests_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Friend_Requests_On_Conflict>;
};

/** Boolean expression to filter rows from the table "friend_requests". All fields are combined with a logical 'AND'. */
export type Friend_Requests_Bool_Exp = {
  _and?: InputMaybe<Array<Friend_Requests_Bool_Exp>>;
  _not?: InputMaybe<Friend_Requests_Bool_Exp>;
  _or?: InputMaybe<Array<Friend_Requests_Bool_Exp>>;
  friend?: InputMaybe<Users_Bool_Exp>;
  friend_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  status?: InputMaybe<Friend_Request_Status_Enum_Comparison_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  user_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "friend_requests" */
export enum Friend_Requests_Constraint {
  /** unique or primary key constraint on columns "id" */
  FriendRequestsPkey = 'friend_requests_pkey',
  /** unique or primary key constraint on columns "user_id", "friend_id" */
  FriendRequestsUserIdFriendIdKey = 'friend_requests_user_id_friend_id_key'
}

/** input type for inserting data into table "friend_requests" */
export type Friend_Requests_Insert_Input = {
  friend?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  friend_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  status?: InputMaybe<Friend_Request_Status_Enum>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Friend_Requests_Max_Fields = {
  __typename: 'friend_requests_max_fields';
  friend_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "friend_requests" */
export type Friend_Requests_Max_Order_By = {
  friend_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Friend_Requests_Min_Fields = {
  __typename: 'friend_requests_min_fields';
  friend_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "friend_requests" */
export type Friend_Requests_Min_Order_By = {
  friend_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "friend_requests" */
export type Friend_Requests_Mutation_Response = {
  __typename: 'friend_requests_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Friend_Requests>;
};

/** on_conflict condition type for table "friend_requests" */
export type Friend_Requests_On_Conflict = {
  constraint: Friend_Requests_Constraint;
  update_columns?: Array<Friend_Requests_Update_Column>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
};

/** Ordering options when selecting data from "friend_requests". */
export type Friend_Requests_Order_By = {
  friend?: InputMaybe<Users_Order_By>;
  friend_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  status?: InputMaybe<Order_By>;
  user?: InputMaybe<Users_Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: friend_requests */
export type Friend_Requests_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "friend_requests" */
export enum Friend_Requests_Select_Column {
  /** column name */
  FriendId = 'friend_id',
  /** column name */
  Id = 'id',
  /** column name */
  Status = 'status',
  /** column name */
  UserId = 'user_id'
}

/** input type for updating data in table "friend_requests" */
export type Friend_Requests_Set_Input = {
  friend_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  status?: InputMaybe<Friend_Request_Status_Enum>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "friend_requests" */
export type Friend_Requests_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Friend_Requests_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Friend_Requests_Stream_Cursor_Value_Input = {
  friend_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  status?: InputMaybe<Friend_Request_Status_Enum>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "friend_requests" */
export enum Friend_Requests_Update_Column {
  /** column name */
  FriendId = 'friend_id',
  /** column name */
  Id = 'id',
  /** column name */
  Status = 'status',
  /** column name */
  UserId = 'user_id'
}

export type Friend_Requests_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Friend_Requests_Set_Input>;
  /** filter the rows which have to be updated */
  where: Friend_Requests_Bool_Exp;
};

/** columns and relationships of "friends" */
export type Friends = {
  __typename: 'friends';
  created_at: Scalars['timestamptz']['output'];
  /** An object relationship */
  friend: Users;
  friend_id: Scalars['uuid']['output'];
  updated_at: Scalars['timestamptz']['output'];
  user_id: Scalars['uuid']['output'];
};

/** aggregated selection of "friends" */
export type Friends_Aggregate = {
  __typename: 'friends_aggregate';
  aggregate?: Maybe<Friends_Aggregate_Fields>;
  nodes: Array<Friends>;
};

export type Friends_Aggregate_Bool_Exp = {
  count?: InputMaybe<Friends_Aggregate_Bool_Exp_Count>;
};

export type Friends_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Friends_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Friends_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "friends" */
export type Friends_Aggregate_Fields = {
  __typename: 'friends_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Friends_Max_Fields>;
  min?: Maybe<Friends_Min_Fields>;
};


/** aggregate fields of "friends" */
export type Friends_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Friends_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "friends" */
export type Friends_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Friends_Max_Order_By>;
  min?: InputMaybe<Friends_Min_Order_By>;
};

/** input type for inserting array relation for remote table "friends" */
export type Friends_Arr_Rel_Insert_Input = {
  data: Array<Friends_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Friends_On_Conflict>;
};

/** Boolean expression to filter rows from the table "friends". All fields are combined with a logical 'AND'. */
export type Friends_Bool_Exp = {
  _and?: InputMaybe<Array<Friends_Bool_Exp>>;
  _not?: InputMaybe<Friends_Bool_Exp>;
  _or?: InputMaybe<Array<Friends_Bool_Exp>>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  friend?: InputMaybe<Users_Bool_Exp>;
  friend_id?: InputMaybe<Uuid_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  user_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "friends" */
export enum Friends_Constraint {
  /** unique or primary key constraint on columns "user_id", "friend_id" */
  FriendsPkey = 'friends_pkey'
}

/** input type for inserting data into table "friends" */
export type Friends_Insert_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  friend?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  friend_id?: InputMaybe<Scalars['uuid']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Friends_Max_Fields = {
  __typename: 'friends_max_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  friend_id?: Maybe<Scalars['uuid']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "friends" */
export type Friends_Max_Order_By = {
  created_at?: InputMaybe<Order_By>;
  friend_id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Friends_Min_Fields = {
  __typename: 'friends_min_fields';
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  friend_id?: Maybe<Scalars['uuid']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "friends" */
export type Friends_Min_Order_By = {
  created_at?: InputMaybe<Order_By>;
  friend_id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "friends" */
export type Friends_Mutation_Response = {
  __typename: 'friends_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Friends>;
};

/** on_conflict condition type for table "friends" */
export type Friends_On_Conflict = {
  constraint: Friends_Constraint;
  update_columns?: Array<Friends_Update_Column>;
  where?: InputMaybe<Friends_Bool_Exp>;
};

/** Ordering options when selecting data from "friends". */
export type Friends_Order_By = {
  created_at?: InputMaybe<Order_By>;
  friend?: InputMaybe<Users_Order_By>;
  friend_id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: friends */
export type Friends_Pk_Columns_Input = {
  friend_id: Scalars['uuid']['input'];
  user_id: Scalars['uuid']['input'];
};

/** select columns of table "friends" */
export enum Friends_Select_Column {
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  FriendId = 'friend_id',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id'
}

/** input type for updating data in table "friends" */
export type Friends_Set_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  friend_id?: InputMaybe<Scalars['uuid']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "friends" */
export type Friends_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Friends_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Friends_Stream_Cursor_Value_Input = {
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  friend_id?: InputMaybe<Scalars['uuid']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "friends" */
export enum Friends_Update_Column {
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  FriendId = 'friend_id',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id'
}

export type Friends_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Friends_Set_Input>;
  /** filter the rows which have to be updated */
  where: Friends_Bool_Exp;
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

export type Image_Search = {
  __typename: 'image_search';
  /** An object relationship */
  beer?: Maybe<Beers>;
  beer_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  coffee?: Maybe<Coffees>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  distance?: Maybe<Scalars['float8']['output']>;
  /** An object relationship */
  spirit?: Maybe<Spirits>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  wine?: Maybe<Wines>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** image_searchNative Query Arguments */
export type Image_Search_Arguments = {
  image: Scalars['String']['input'];
};

/** Boolean expression to filter rows from the logical model for "image_search_result". All fields are combined with a logical 'AND'. */
export type Image_Search_Result_Bool_Exp_Bool_Exp = {
  _and?: InputMaybe<Array<Image_Search_Result_Bool_Exp_Bool_Exp>>;
  _not?: InputMaybe<Image_Search_Result_Bool_Exp_Bool_Exp>;
  _or?: InputMaybe<Array<Image_Search_Result_Bool_Exp_Bool_Exp>>;
  beer_id?: InputMaybe<Uuid_Comparison_Exp>;
  coffee_id?: InputMaybe<Uuid_Comparison_Exp>;
  distance?: InputMaybe<Float8_Comparison_Exp>;
  spirit_id?: InputMaybe<Uuid_Comparison_Exp>;
  wine_id?: InputMaybe<Uuid_Comparison_Exp>;
};

export enum Image_Search_Result_Enum_Name {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  Distance = 'distance',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  WineId = 'wine_id'
}

/** Ordering options when selecting data from "image_search_result". */
export type Image_Search_Result_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  distance?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

export type Item_Defaults_Hint = {
  backLabelFileId?: InputMaybe<Scalars['uuid']['input']>;
  barcode?: InputMaybe<Scalars['String']['input']>;
  barcodeType?: InputMaybe<Scalars['String']['input']>;
  frontLabelFileId?: InputMaybe<Scalars['uuid']['input']>;
};

/** columns and relationships of "item_favorites" */
export type Item_Favorites = {
  __typename: 'item_favorites';
  /** An object relationship */
  beer?: Maybe<Beers>;
  beer_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  coffee?: Maybe<Coffees>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at: Scalars['timestamptz']['output'];
  id: Scalars['uuid']['output'];
  /** An object relationship */
  spirit?: Maybe<Spirits>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  type: Item_Type_Enum;
  /** An object relationship */
  user: Users;
  user_id: Scalars['uuid']['output'];
  /** An object relationship */
  wine?: Maybe<Wines>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** aggregated selection of "item_favorites" */
export type Item_Favorites_Aggregate = {
  __typename: 'item_favorites_aggregate';
  aggregate?: Maybe<Item_Favorites_Aggregate_Fields>;
  nodes: Array<Item_Favorites>;
};

export type Item_Favorites_Aggregate_Bool_Exp = {
  count?: InputMaybe<Item_Favorites_Aggregate_Bool_Exp_Count>;
};

export type Item_Favorites_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Item_Favorites_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "item_favorites" */
export type Item_Favorites_Aggregate_Fields = {
  __typename: 'item_favorites_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Item_Favorites_Max_Fields>;
  min?: Maybe<Item_Favorites_Min_Fields>;
};


/** aggregate fields of "item_favorites" */
export type Item_Favorites_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "item_favorites" */
export type Item_Favorites_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Item_Favorites_Max_Order_By>;
  min?: InputMaybe<Item_Favorites_Min_Order_By>;
};

/** input type for inserting array relation for remote table "item_favorites" */
export type Item_Favorites_Arr_Rel_Insert_Input = {
  data: Array<Item_Favorites_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Item_Favorites_On_Conflict>;
};

/** Boolean expression to filter rows from the table "item_favorites". All fields are combined with a logical 'AND'. */
export type Item_Favorites_Bool_Exp = {
  _and?: InputMaybe<Array<Item_Favorites_Bool_Exp>>;
  _not?: InputMaybe<Item_Favorites_Bool_Exp>;
  _or?: InputMaybe<Array<Item_Favorites_Bool_Exp>>;
  beer?: InputMaybe<Beers_Bool_Exp>;
  beer_id?: InputMaybe<Uuid_Comparison_Exp>;
  coffee?: InputMaybe<Coffees_Bool_Exp>;
  coffee_id?: InputMaybe<Uuid_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  spirit?: InputMaybe<Spirits_Bool_Exp>;
  spirit_id?: InputMaybe<Uuid_Comparison_Exp>;
  type?: InputMaybe<Item_Type_Enum_Comparison_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  user_id?: InputMaybe<Uuid_Comparison_Exp>;
  wine?: InputMaybe<Wines_Bool_Exp>;
  wine_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "item_favorites" */
export enum Item_Favorites_Constraint {
  /** unique or primary key constraint on columns "id" */
  ItemFavoritesPkey = 'item_favorites_pkey',
  /** unique or primary key constraint on columns "beer_id", "user_id" */
  ItemFavoritesUserIdBeerIdKey = 'item_favorites_user_id_beer_id_key',
  /** unique or primary key constraint on columns "coffee_id", "user_id" */
  ItemFavoritesUserIdCoffeeIdKey = 'item_favorites_user_id_coffee_id_key',
  /** unique or primary key constraint on columns "user_id", "spirit_id" */
  ItemFavoritesUserIdSpiritIdKey = 'item_favorites_user_id_spirit_id_key',
  /** unique or primary key constraint on columns "wine_id", "user_id" */
  ItemFavoritesUserIdWineIdKey = 'item_favorites_user_id_wine_id_key'
}

/** input type for inserting data into table "item_favorites" */
export type Item_Favorites_Insert_Input = {
  beer?: InputMaybe<Beers_Obj_Rel_Insert_Input>;
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee?: InputMaybe<Coffees_Obj_Rel_Insert_Input>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  spirit?: InputMaybe<Spirits_Obj_Rel_Insert_Input>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
  wine?: InputMaybe<Wines_Obj_Rel_Insert_Input>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Item_Favorites_Max_Fields = {
  __typename: 'item_favorites_max_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "item_favorites" */
export type Item_Favorites_Max_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Item_Favorites_Min_Fields = {
  __typename: 'item_favorites_min_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "item_favorites" */
export type Item_Favorites_Min_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "item_favorites" */
export type Item_Favorites_Mutation_Response = {
  __typename: 'item_favorites_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Item_Favorites>;
};

/** on_conflict condition type for table "item_favorites" */
export type Item_Favorites_On_Conflict = {
  constraint: Item_Favorites_Constraint;
  update_columns?: Array<Item_Favorites_Update_Column>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};

/** Ordering options when selecting data from "item_favorites". */
export type Item_Favorites_Order_By = {
  beer?: InputMaybe<Beers_Order_By>;
  beer_id?: InputMaybe<Order_By>;
  coffee?: InputMaybe<Coffees_Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  spirit?: InputMaybe<Spirits_Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  type?: InputMaybe<Order_By>;
  user?: InputMaybe<Users_Order_By>;
  user_id?: InputMaybe<Order_By>;
  wine?: InputMaybe<Wines_Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: item_favorites */
export type Item_Favorites_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "item_favorites" */
export enum Item_Favorites_Select_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Id = 'id',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  Type = 'type',
  /** column name */
  UserId = 'user_id',
  /** column name */
  WineId = 'wine_id'
}

/** input type for updating data in table "item_favorites" */
export type Item_Favorites_Set_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "item_favorites" */
export type Item_Favorites_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Item_Favorites_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Item_Favorites_Stream_Cursor_Value_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  type?: InputMaybe<Item_Type_Enum>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "item_favorites" */
export enum Item_Favorites_Update_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Id = 'id',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  UserId = 'user_id',
  /** column name */
  WineId = 'wine_id'
}

export type Item_Favorites_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Item_Favorites_Set_Input>;
  /** filter the rows which have to be updated */
  where: Item_Favorites_Bool_Exp;
};

/** columns and relationships of "item_image" */
export type Item_Image = {
  __typename: 'item_image';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  file_id: Scalars['uuid']['output'];
  id: Scalars['uuid']['output'];
  is_public: Scalars['Boolean']['output'];
  placeholder?: Maybe<Scalars['String']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  user_id: Scalars['uuid']['output'];
  vector?: Maybe<Scalars['vector']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** aggregated selection of "item_image" */
export type Item_Image_Aggregate = {
  __typename: 'item_image_aggregate';
  aggregate?: Maybe<Item_Image_Aggregate_Fields>;
  nodes: Array<Item_Image>;
};

export type Item_Image_Aggregate_Bool_Exp = {
  bool_and?: InputMaybe<Item_Image_Aggregate_Bool_Exp_Bool_And>;
  bool_or?: InputMaybe<Item_Image_Aggregate_Bool_Exp_Bool_Or>;
  count?: InputMaybe<Item_Image_Aggregate_Bool_Exp_Count>;
};

export type Item_Image_Aggregate_Bool_Exp_Bool_And = {
  arguments: Item_Image_Select_Column_Item_Image_Aggregate_Bool_Exp_Bool_And_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Item_Image_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Item_Image_Aggregate_Bool_Exp_Bool_Or = {
  arguments: Item_Image_Select_Column_Item_Image_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Item_Image_Bool_Exp>;
  predicate: Boolean_Comparison_Exp;
};

export type Item_Image_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Item_Image_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Item_Image_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "item_image" */
export type Item_Image_Aggregate_Fields = {
  __typename: 'item_image_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Item_Image_Max_Fields>;
  min?: Maybe<Item_Image_Min_Fields>;
};


/** aggregate fields of "item_image" */
export type Item_Image_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Item_Image_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "item_image" */
export type Item_Image_Aggregate_Order_By = {
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Item_Image_Max_Order_By>;
  min?: InputMaybe<Item_Image_Min_Order_By>;
};

/** input type for inserting array relation for remote table "item_image" */
export type Item_Image_Arr_Rel_Insert_Input = {
  data: Array<Item_Image_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Item_Image_On_Conflict>;
};

/** Boolean expression to filter rows from the table "item_image". All fields are combined with a logical 'AND'. */
export type Item_Image_Bool_Exp = {
  _and?: InputMaybe<Array<Item_Image_Bool_Exp>>;
  _not?: InputMaybe<Item_Image_Bool_Exp>;
  _or?: InputMaybe<Array<Item_Image_Bool_Exp>>;
  beer_id?: InputMaybe<Uuid_Comparison_Exp>;
  coffee_id?: InputMaybe<Uuid_Comparison_Exp>;
  file_id?: InputMaybe<Uuid_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  is_public?: InputMaybe<Boolean_Comparison_Exp>;
  placeholder?: InputMaybe<String_Comparison_Exp>;
  spirit_id?: InputMaybe<Uuid_Comparison_Exp>;
  user_id?: InputMaybe<Uuid_Comparison_Exp>;
  vector?: InputMaybe<Vector_Comparison_Exp>;
  wine_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "item_image" */
export enum Item_Image_Constraint {
  /** unique or primary key constraint on columns "id" */
  ItemImagePkey = 'item_image_pkey'
}

/** input type for inserting data into table "item_image" */
export type Item_Image_Insert_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  file_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  is_public?: InputMaybe<Scalars['Boolean']['input']>;
  placeholder?: InputMaybe<Scalars['String']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
  vector?: InputMaybe<Scalars['vector']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Item_Image_Max_Fields = {
  __typename: 'item_image_max_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  file_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  placeholder?: Maybe<Scalars['String']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "item_image" */
export type Item_Image_Max_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  file_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  placeholder?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Item_Image_Min_Fields = {
  __typename: 'item_image_min_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  file_id?: Maybe<Scalars['uuid']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  placeholder?: Maybe<Scalars['String']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "item_image" */
export type Item_Image_Min_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  file_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  placeholder?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "item_image" */
export type Item_Image_Mutation_Response = {
  __typename: 'item_image_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Item_Image>;
};

/** input type for inserting object relation for remote table "item_image" */
export type Item_Image_Obj_Rel_Insert_Input = {
  data: Item_Image_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Item_Image_On_Conflict>;
};

/** on_conflict condition type for table "item_image" */
export type Item_Image_On_Conflict = {
  constraint: Item_Image_Constraint;
  update_columns?: Array<Item_Image_Update_Column>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};

/** Ordering options when selecting data from "item_image". */
export type Item_Image_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  file_id?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  is_public?: InputMaybe<Order_By>;
  placeholder?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
  vector?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: item_image */
export type Item_Image_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "item_image" */
export enum Item_Image_Select_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  FileId = 'file_id',
  /** column name */
  Id = 'id',
  /** column name */
  IsPublic = 'is_public',
  /** column name */
  Placeholder = 'placeholder',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  UserId = 'user_id',
  /** column name */
  Vector = 'vector',
  /** column name */
  WineId = 'wine_id'
}

/** select "item_image_aggregate_bool_exp_bool_and_arguments_columns" columns of table "item_image" */
export enum Item_Image_Select_Column_Item_Image_Aggregate_Bool_Exp_Bool_And_Arguments_Columns {
  /** column name */
  IsPublic = 'is_public'
}

/** select "item_image_aggregate_bool_exp_bool_or_arguments_columns" columns of table "item_image" */
export enum Item_Image_Select_Column_Item_Image_Aggregate_Bool_Exp_Bool_Or_Arguments_Columns {
  /** column name */
  IsPublic = 'is_public'
}

/** input type for updating data in table "item_image" */
export type Item_Image_Set_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  file_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  is_public?: InputMaybe<Scalars['Boolean']['input']>;
  placeholder?: InputMaybe<Scalars['String']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
  vector?: InputMaybe<Scalars['vector']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** Streaming cursor of the table "item_image" */
export type Item_Image_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Item_Image_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Item_Image_Stream_Cursor_Value_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  file_id?: InputMaybe<Scalars['uuid']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  is_public?: InputMaybe<Scalars['Boolean']['input']>;
  placeholder?: InputMaybe<Scalars['String']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
  vector?: InputMaybe<Scalars['vector']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** update columns of table "item_image" */
export enum Item_Image_Update_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  FileId = 'file_id',
  /** column name */
  Id = 'id',
  /** column name */
  IsPublic = 'is_public',
  /** column name */
  Placeholder = 'placeholder',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  UserId = 'user_id',
  /** column name */
  Vector = 'vector',
  /** column name */
  WineId = 'wine_id'
}

export type Item_Image_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Item_Image_Set_Input>;
  /** filter the rows which have to be updated */
  where: Item_Image_Bool_Exp;
};

export type Item_Image_Upload_Input = {
  image: Scalars['String']['input'];
  item_id: Scalars['uuid']['input'];
  item_type: ItemType;
};

export type Item_Image_Upload_Result = {
  __typename: 'item_image_upload_result';
  id: Scalars['uuid']['output'];
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

/** columns and relationships of "item_reviews" */
export type Item_Reviews = {
  __typename: 'item_reviews';
  /** An object relationship */
  beer?: Maybe<Beers>;
  beer_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  coffee?: Maybe<Coffees>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at: Scalars['timestamptz']['output'];
  id: Scalars['uuid']['output'];
  score: Scalars['Float']['output'];
  /** An object relationship */
  spirit?: Maybe<Spirits>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  text?: Maybe<Scalars['json']['output']>;
  updated_at: Scalars['timestamptz']['output'];
  /** An object relationship */
  user: Users;
  user_id: Scalars['uuid']['output'];
  /** An object relationship */
  wine?: Maybe<Wines>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};


/** columns and relationships of "item_reviews" */
export type Item_ReviewsTextArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};

/** aggregated selection of "item_reviews" */
export type Item_Reviews_Aggregate = {
  __typename: 'item_reviews_aggregate';
  aggregate?: Maybe<Item_Reviews_Aggregate_Fields>;
  nodes: Array<Item_Reviews>;
};

export type Item_Reviews_Aggregate_Bool_Exp = {
  count?: InputMaybe<Item_Reviews_Aggregate_Bool_Exp_Count>;
};

export type Item_Reviews_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Item_Reviews_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "item_reviews" */
export type Item_Reviews_Aggregate_Fields = {
  __typename: 'item_reviews_aggregate_fields';
  avg?: Maybe<Item_Reviews_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Item_Reviews_Max_Fields>;
  min?: Maybe<Item_Reviews_Min_Fields>;
  stddev?: Maybe<Item_Reviews_Stddev_Fields>;
  stddev_pop?: Maybe<Item_Reviews_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Item_Reviews_Stddev_Samp_Fields>;
  sum?: Maybe<Item_Reviews_Sum_Fields>;
  var_pop?: Maybe<Item_Reviews_Var_Pop_Fields>;
  var_samp?: Maybe<Item_Reviews_Var_Samp_Fields>;
  variance?: Maybe<Item_Reviews_Variance_Fields>;
};


/** aggregate fields of "item_reviews" */
export type Item_Reviews_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "item_reviews" */
export type Item_Reviews_Aggregate_Order_By = {
  avg?: InputMaybe<Item_Reviews_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Item_Reviews_Max_Order_By>;
  min?: InputMaybe<Item_Reviews_Min_Order_By>;
  stddev?: InputMaybe<Item_Reviews_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Item_Reviews_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Item_Reviews_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Item_Reviews_Sum_Order_By>;
  var_pop?: InputMaybe<Item_Reviews_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Item_Reviews_Var_Samp_Order_By>;
  variance?: InputMaybe<Item_Reviews_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "item_reviews" */
export type Item_Reviews_Arr_Rel_Insert_Input = {
  data: Array<Item_Reviews_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Item_Reviews_On_Conflict>;
};

/** aggregate avg on columns */
export type Item_Reviews_Avg_Fields = {
  __typename: 'item_reviews_avg_fields';
  score?: Maybe<Scalars['Float']['output']>;
};

/** order by avg() on columns of table "item_reviews" */
export type Item_Reviews_Avg_Order_By = {
  score?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "item_reviews". All fields are combined with a logical 'AND'. */
export type Item_Reviews_Bool_Exp = {
  _and?: InputMaybe<Array<Item_Reviews_Bool_Exp>>;
  _not?: InputMaybe<Item_Reviews_Bool_Exp>;
  _or?: InputMaybe<Array<Item_Reviews_Bool_Exp>>;
  beer?: InputMaybe<Beers_Bool_Exp>;
  beer_id?: InputMaybe<Uuid_Comparison_Exp>;
  coffee?: InputMaybe<Coffees_Bool_Exp>;
  coffee_id?: InputMaybe<Uuid_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  score?: InputMaybe<Float_Comparison_Exp>;
  spirit?: InputMaybe<Spirits_Bool_Exp>;
  spirit_id?: InputMaybe<Uuid_Comparison_Exp>;
  text?: InputMaybe<Json_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  user?: InputMaybe<Users_Bool_Exp>;
  user_id?: InputMaybe<Uuid_Comparison_Exp>;
  wine?: InputMaybe<Wines_Bool_Exp>;
  wine_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "item_reviews" */
export enum Item_Reviews_Constraint {
  /** unique or primary key constraint on columns "id" */
  ItemReviewsPkey = 'item_reviews_pkey'
}

/** input type for incrementing numeric columns in table "item_reviews" */
export type Item_Reviews_Inc_Input = {
  score?: InputMaybe<Scalars['Float']['input']>;
};

/** input type for inserting data into table "item_reviews" */
export type Item_Reviews_Insert_Input = {
  beer?: InputMaybe<Beers_Obj_Rel_Insert_Input>;
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee?: InputMaybe<Coffees_Obj_Rel_Insert_Input>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  score?: InputMaybe<Scalars['Float']['input']>;
  spirit?: InputMaybe<Spirits_Obj_Rel_Insert_Input>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  text?: InputMaybe<Scalars['json']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
  wine?: InputMaybe<Wines_Obj_Rel_Insert_Input>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Item_Reviews_Max_Fields = {
  __typename: 'item_reviews_max_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "item_reviews" */
export type Item_Reviews_Max_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  score?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Item_Reviews_Min_Fields = {
  __typename: 'item_reviews_min_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  user_id?: Maybe<Scalars['uuid']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "item_reviews" */
export type Item_Reviews_Min_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  score?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user_id?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "item_reviews" */
export type Item_Reviews_Mutation_Response = {
  __typename: 'item_reviews_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Item_Reviews>;
};

/** on_conflict condition type for table "item_reviews" */
export type Item_Reviews_On_Conflict = {
  constraint: Item_Reviews_Constraint;
  update_columns?: Array<Item_Reviews_Update_Column>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};

/** Ordering options when selecting data from "item_reviews". */
export type Item_Reviews_Order_By = {
  beer?: InputMaybe<Beers_Order_By>;
  beer_id?: InputMaybe<Order_By>;
  coffee?: InputMaybe<Coffees_Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  score?: InputMaybe<Order_By>;
  spirit?: InputMaybe<Spirits_Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  user?: InputMaybe<Users_Order_By>;
  user_id?: InputMaybe<Order_By>;
  wine?: InputMaybe<Wines_Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: item_reviews */
export type Item_Reviews_Pk_Columns_Input = {
  id: Scalars['uuid']['input'];
};

/** select columns of table "item_reviews" */
export enum Item_Reviews_Select_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Id = 'id',
  /** column name */
  Score = 'score',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  Text = 'text',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id',
  /** column name */
  WineId = 'wine_id'
}

/** input type for updating data in table "item_reviews" */
export type Item_Reviews_Set_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  score?: InputMaybe<Scalars['Float']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  text?: InputMaybe<Scalars['json']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate stddev on columns */
export type Item_Reviews_Stddev_Fields = {
  __typename: 'item_reviews_stddev_fields';
  score?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "item_reviews" */
export type Item_Reviews_Stddev_Order_By = {
  score?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Item_Reviews_Stddev_Pop_Fields = {
  __typename: 'item_reviews_stddev_pop_fields';
  score?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "item_reviews" */
export type Item_Reviews_Stddev_Pop_Order_By = {
  score?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Item_Reviews_Stddev_Samp_Fields = {
  __typename: 'item_reviews_stddev_samp_fields';
  score?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "item_reviews" */
export type Item_Reviews_Stddev_Samp_Order_By = {
  score?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "item_reviews" */
export type Item_Reviews_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Item_Reviews_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Item_Reviews_Stream_Cursor_Value_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  score?: InputMaybe<Scalars['Float']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  text?: InputMaybe<Scalars['json']['input']>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  user_id?: InputMaybe<Scalars['uuid']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate sum on columns */
export type Item_Reviews_Sum_Fields = {
  __typename: 'item_reviews_sum_fields';
  score?: Maybe<Scalars['Float']['output']>;
};

/** order by sum() on columns of table "item_reviews" */
export type Item_Reviews_Sum_Order_By = {
  score?: InputMaybe<Order_By>;
};

/** update columns of table "item_reviews" */
export enum Item_Reviews_Update_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Id = 'id',
  /** column name */
  Score = 'score',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  Text = 'text',
  /** column name */
  UpdatedAt = 'updated_at',
  /** column name */
  UserId = 'user_id',
  /** column name */
  WineId = 'wine_id'
}

export type Item_Reviews_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Item_Reviews_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Item_Reviews_Set_Input>;
  /** filter the rows which have to be updated */
  where: Item_Reviews_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Item_Reviews_Var_Pop_Fields = {
  __typename: 'item_reviews_var_pop_fields';
  score?: Maybe<Scalars['Float']['output']>;
};

/** order by var_pop() on columns of table "item_reviews" */
export type Item_Reviews_Var_Pop_Order_By = {
  score?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Item_Reviews_Var_Samp_Fields = {
  __typename: 'item_reviews_var_samp_fields';
  score?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "item_reviews" */
export type Item_Reviews_Var_Samp_Order_By = {
  score?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Item_Reviews_Variance_Fields = {
  __typename: 'item_reviews_variance_fields';
  score?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "item_reviews" */
export type Item_Reviews_Variance_Order_By = {
  score?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the logical model for "item_score". All fields are combined with a logical 'AND'. */
export type Item_Score_Bool_Exp_Bool_Exp = {
  _and?: InputMaybe<Array<Item_Score_Bool_Exp_Bool_Exp>>;
  _not?: InputMaybe<Item_Score_Bool_Exp_Bool_Exp>;
  _or?: InputMaybe<Array<Item_Score_Bool_Exp_Bool_Exp>>;
  beer_id?: InputMaybe<Uuid_Comparison_Exp>;
  coffee_id?: InputMaybe<Uuid_Comparison_Exp>;
  count?: InputMaybe<Bigint_Comparison_Exp>;
  score?: InputMaybe<Float8_Comparison_Exp>;
  spirit_id?: InputMaybe<Uuid_Comparison_Exp>;
  type?: InputMaybe<String_Comparison_Exp>;
  wine_id?: InputMaybe<Uuid_Comparison_Exp>;
};

export enum Item_Score_Enum_Name {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  Count = 'count',
  /** column name */
  Score = 'score',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  Type = 'type',
  /** column name */
  WineId = 'wine_id'
}

/** Ordering options when selecting data from "item_score". */
export type Item_Score_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  count?: InputMaybe<Order_By>;
  score?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  type?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

export type Item_Scores = {
  __typename: 'item_scores';
  /** An object relationship */
  beer?: Maybe<Beers>;
  beer_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  coffee?: Maybe<Coffees>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  count: Scalars['bigint']['output'];
  score?: Maybe<Scalars['float8']['output']>;
  /** An object relationship */
  spirit?: Maybe<Spirits>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  type: Scalars['String']['output'];
  /** An object relationship */
  wine?: Maybe<Wines>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** item_scoresNative Query Arguments */
export type Item_Scores_Arguments = {
  reviewers?: InputMaybe<Scalars['String']['input']>;
};

/** columns and relationships of "item_type" */
export type Item_Type = {
  __typename: 'item_type';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "item_type" */
export type Item_Type_Aggregate = {
  __typename: 'item_type_aggregate';
  aggregate?: Maybe<Item_Type_Aggregate_Fields>;
  nodes: Array<Item_Type>;
};

/** aggregate fields of "item_type" */
export type Item_Type_Aggregate_Fields = {
  __typename: 'item_type_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Item_Type_Max_Fields>;
  min?: Maybe<Item_Type_Min_Fields>;
};


/** aggregate fields of "item_type" */
export type Item_Type_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Item_Type_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "item_type". All fields are combined with a logical 'AND'. */
export type Item_Type_Bool_Exp = {
  _and?: InputMaybe<Array<Item_Type_Bool_Exp>>;
  _not?: InputMaybe<Item_Type_Bool_Exp>;
  _or?: InputMaybe<Array<Item_Type_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "item_type" */
export enum Item_Type_Constraint {
  /** unique or primary key constraint on columns "text" */
  ItemTypePkey = 'item_type_pkey'
}

export enum Item_Type_Enum {
  Beer = 'BEER',
  Coffee = 'COFFEE',
  Spirit = 'SPIRIT',
  Wine = 'WINE'
}

/** Boolean expression to compare columns of type "item_type_enum". All fields are combined with logical 'AND'. */
export type Item_Type_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Item_Type_Enum>;
  _in?: InputMaybe<Array<Item_Type_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Item_Type_Enum>;
  _nin?: InputMaybe<Array<Item_Type_Enum>>;
};

/** input type for inserting data into table "item_type" */
export type Item_Type_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Item_Type_Max_Fields = {
  __typename: 'item_type_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Item_Type_Min_Fields = {
  __typename: 'item_type_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "item_type" */
export type Item_Type_Mutation_Response = {
  __typename: 'item_type_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Item_Type>;
};

/** on_conflict condition type for table "item_type" */
export type Item_Type_On_Conflict = {
  constraint: Item_Type_Constraint;
  update_columns?: Array<Item_Type_Update_Column>;
  where?: InputMaybe<Item_Type_Bool_Exp>;
};

/** Ordering options when selecting data from "item_type". */
export type Item_Type_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: item_type */
export type Item_Type_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "item_type" */
export enum Item_Type_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "item_type" */
export type Item_Type_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "item_type" */
export type Item_Type_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Item_Type_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Item_Type_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "item_type" */
export enum Item_Type_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Item_Type_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Item_Type_Set_Input>;
  /** filter the rows which have to be updated */
  where: Item_Type_Bool_Exp;
};

/** columns and relationships of "item_vectors" */
export type Item_Vectors = {
  __typename: 'item_vectors';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id: Scalars['Int']['output'];
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  vector: Scalars['vector']['output'];
  wine_id?: Maybe<Scalars['uuid']['output']>;
};


/** columns and relationships of "item_vectors" */
export type Item_VectorsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** aggregated selection of "item_vectors" */
export type Item_Vectors_Aggregate = {
  __typename: 'item_vectors_aggregate';
  aggregate?: Maybe<Item_Vectors_Aggregate_Fields>;
  nodes: Array<Item_Vectors>;
};

export type Item_Vectors_Aggregate_Bool_Exp = {
  count?: InputMaybe<Item_Vectors_Aggregate_Bool_Exp_Count>;
};

export type Item_Vectors_Aggregate_Bool_Exp_Count = {
  arguments?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
  filter?: InputMaybe<Item_Vectors_Bool_Exp>;
  predicate: Int_Comparison_Exp;
};

/** aggregate fields of "item_vectors" */
export type Item_Vectors_Aggregate_Fields = {
  __typename: 'item_vectors_aggregate_fields';
  avg?: Maybe<Item_Vectors_Avg_Fields>;
  count: Scalars['Int']['output'];
  max?: Maybe<Item_Vectors_Max_Fields>;
  min?: Maybe<Item_Vectors_Min_Fields>;
  stddev?: Maybe<Item_Vectors_Stddev_Fields>;
  stddev_pop?: Maybe<Item_Vectors_Stddev_Pop_Fields>;
  stddev_samp?: Maybe<Item_Vectors_Stddev_Samp_Fields>;
  sum?: Maybe<Item_Vectors_Sum_Fields>;
  var_pop?: Maybe<Item_Vectors_Var_Pop_Fields>;
  var_samp?: Maybe<Item_Vectors_Var_Samp_Fields>;
  variance?: Maybe<Item_Vectors_Variance_Fields>;
};


/** aggregate fields of "item_vectors" */
export type Item_Vectors_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** order by aggregate values of table "item_vectors" */
export type Item_Vectors_Aggregate_Order_By = {
  avg?: InputMaybe<Item_Vectors_Avg_Order_By>;
  count?: InputMaybe<Order_By>;
  max?: InputMaybe<Item_Vectors_Max_Order_By>;
  min?: InputMaybe<Item_Vectors_Min_Order_By>;
  stddev?: InputMaybe<Item_Vectors_Stddev_Order_By>;
  stddev_pop?: InputMaybe<Item_Vectors_Stddev_Pop_Order_By>;
  stddev_samp?: InputMaybe<Item_Vectors_Stddev_Samp_Order_By>;
  sum?: InputMaybe<Item_Vectors_Sum_Order_By>;
  var_pop?: InputMaybe<Item_Vectors_Var_Pop_Order_By>;
  var_samp?: InputMaybe<Item_Vectors_Var_Samp_Order_By>;
  variance?: InputMaybe<Item_Vectors_Variance_Order_By>;
};

/** input type for inserting array relation for remote table "item_vectors" */
export type Item_Vectors_Arr_Rel_Insert_Input = {
  data: Array<Item_Vectors_Insert_Input>;
  /** upsert condition */
  on_conflict?: InputMaybe<Item_Vectors_On_Conflict>;
};

/** aggregate avg on columns */
export type Item_Vectors_Avg_Fields = {
  __typename: 'item_vectors_avg_fields';
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
};


/** aggregate avg on columns */
export type Item_Vectors_Avg_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by avg() on columns of table "item_vectors" */
export type Item_Vectors_Avg_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "item_vectors". All fields are combined with a logical 'AND'. */
export type Item_Vectors_Bool_Exp = {
  _and?: InputMaybe<Array<Item_Vectors_Bool_Exp>>;
  _not?: InputMaybe<Item_Vectors_Bool_Exp>;
  _or?: InputMaybe<Array<Item_Vectors_Bool_Exp>>;
  beer_id?: InputMaybe<Uuid_Comparison_Exp>;
  coffee_id?: InputMaybe<Uuid_Comparison_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  id?: InputMaybe<Int_Comparison_Exp>;
  spirit_id?: InputMaybe<Uuid_Comparison_Exp>;
  vector?: InputMaybe<Vector_Comparison_Exp>;
  wine_id?: InputMaybe<Uuid_Comparison_Exp>;
};

/** unique or primary key constraints on table "item_vectors" */
export enum Item_Vectors_Constraint {
  /** unique or primary key constraint on columns "id" */
  ItemVectorsPkey = 'item_vectors_pkey'
}

/** input type for incrementing numeric columns in table "item_vectors" */
export type Item_Vectors_Inc_Input = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** input type for inserting data into table "item_vectors" */
export type Item_Vectors_Insert_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  vector?: InputMaybe<Scalars['vector']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Item_Vectors_Max_Fields = {
  __typename: 'item_vectors_max_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};


/** aggregate max on columns */
export type Item_Vectors_Max_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by max() on columns of table "item_vectors" */
export type Item_Vectors_Max_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Item_Vectors_Min_Fields = {
  __typename: 'item_vectors_min_fields';
  beer_id?: Maybe<Scalars['uuid']['output']>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};


/** aggregate min on columns */
export type Item_Vectors_Min_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by min() on columns of table "item_vectors" */
export type Item_Vectors_Min_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** response of any mutation on the table "item_vectors" */
export type Item_Vectors_Mutation_Response = {
  __typename: 'item_vectors_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Item_Vectors>;
};

/** on_conflict condition type for table "item_vectors" */
export type Item_Vectors_On_Conflict = {
  constraint: Item_Vectors_Constraint;
  update_columns?: Array<Item_Vectors_Update_Column>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};

/** Ordering options when selecting data from "item_vectors". */
export type Item_Vectors_Order_By = {
  beer_id?: InputMaybe<Order_By>;
  coffee_id?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  spirit_id?: InputMaybe<Order_By>;
  vector?: InputMaybe<Order_By>;
  wine_id?: InputMaybe<Order_By>;
};

/** primary key columns input for table: item_vectors */
export type Item_Vectors_Pk_Columns_Input = {
  id: Scalars['Int']['input'];
};

/** select columns of table "item_vectors" */
export enum Item_Vectors_Select_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Id = 'id',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  Vector = 'vector',
  /** column name */
  WineId = 'wine_id'
}

/** input type for updating data in table "item_vectors" */
export type Item_Vectors_Set_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  vector?: InputMaybe<Scalars['vector']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate stddev on columns */
export type Item_Vectors_Stddev_Fields = {
  __typename: 'item_vectors_stddev_fields';
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
};


/** aggregate stddev on columns */
export type Item_Vectors_Stddev_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by stddev() on columns of table "item_vectors" */
export type Item_Vectors_Stddev_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Item_Vectors_Stddev_Pop_Fields = {
  __typename: 'item_vectors_stddev_pop_fields';
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
};


/** aggregate stddev_pop on columns */
export type Item_Vectors_Stddev_Pop_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by stddev_pop() on columns of table "item_vectors" */
export type Item_Vectors_Stddev_Pop_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Item_Vectors_Stddev_Samp_Fields = {
  __typename: 'item_vectors_stddev_samp_fields';
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
};


/** aggregate stddev_samp on columns */
export type Item_Vectors_Stddev_Samp_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by stddev_samp() on columns of table "item_vectors" */
export type Item_Vectors_Stddev_Samp_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** Streaming cursor of the table "item_vectors" */
export type Item_Vectors_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Item_Vectors_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Item_Vectors_Stream_Cursor_Value_Input = {
  beer_id?: InputMaybe<Scalars['uuid']['input']>;
  coffee_id?: InputMaybe<Scalars['uuid']['input']>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  spirit_id?: InputMaybe<Scalars['uuid']['input']>;
  vector?: InputMaybe<Scalars['vector']['input']>;
  wine_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate sum on columns */
export type Item_Vectors_Sum_Fields = {
  __typename: 'item_vectors_sum_fields';
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Int']['output']>;
};


/** aggregate sum on columns */
export type Item_Vectors_Sum_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by sum() on columns of table "item_vectors" */
export type Item_Vectors_Sum_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** update columns of table "item_vectors" */
export enum Item_Vectors_Update_Column {
  /** column name */
  BeerId = 'beer_id',
  /** column name */
  CoffeeId = 'coffee_id',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  Id = 'id',
  /** column name */
  SpiritId = 'spirit_id',
  /** column name */
  Vector = 'vector',
  /** column name */
  WineId = 'wine_id'
}

export type Item_Vectors_Updates = {
  /** increments the numeric columns with given value of the filtered values */
  _inc?: InputMaybe<Item_Vectors_Inc_Input>;
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Item_Vectors_Set_Input>;
  /** filter the rows which have to be updated */
  where: Item_Vectors_Bool_Exp;
};

/** aggregate var_pop on columns */
export type Item_Vectors_Var_Pop_Fields = {
  __typename: 'item_vectors_var_pop_fields';
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
};


/** aggregate var_pop on columns */
export type Item_Vectors_Var_Pop_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by var_pop() on columns of table "item_vectors" */
export type Item_Vectors_Var_Pop_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Item_Vectors_Var_Samp_Fields = {
  __typename: 'item_vectors_var_samp_fields';
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
};


/** aggregate var_samp on columns */
export type Item_Vectors_Var_Samp_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by var_samp() on columns of table "item_vectors" */
export type Item_Vectors_Var_Samp_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Item_Vectors_Variance_Fields = {
  __typename: 'item_vectors_variance_fields';
  /** A computed field, executes function "calculate_vector_distance" */
  distance?: Maybe<Scalars['float8']['output']>;
  id?: Maybe<Scalars['Float']['output']>;
};


/** aggregate variance on columns */
export type Item_Vectors_Variance_FieldsDistanceArgs = {
  args: Distance_Item_Vectors_Args;
};

/** order by variance() on columns of table "item_vectors" */
export type Item_Vectors_Variance_Order_By = {
  id?: InputMaybe<Order_By>;
};

/** Boolean expression to compare columns of type "json". All fields are combined with logical 'AND'. */
export type Json_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['json']['input']>;
  _gt?: InputMaybe<Scalars['json']['input']>;
  _gte?: InputMaybe<Scalars['json']['input']>;
  _in?: InputMaybe<Array<Scalars['json']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['json']['input']>;
  _lte?: InputMaybe<Scalars['json']['input']>;
  _neq?: InputMaybe<Scalars['json']['input']>;
  _nin?: InputMaybe<Array<Scalars['json']['input']>>;
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
  /** delete data from the table: "admin.credentials" */
  delete_admin_credentials?: Maybe<Admin_Credentials_Mutation_Response>;
  /** delete single row from the table: "admin.credentials" */
  delete_admin_credentials_by_pk?: Maybe<Admin_Credentials>;
  /** delete data from the table: "barcodes" */
  delete_barcodes?: Maybe<Barcodes_Mutation_Response>;
  /** delete single row from the table: "barcodes" */
  delete_barcodes_by_pk?: Maybe<Barcodes>;
  /** delete data from the table: "beer_style" */
  delete_beer_style?: Maybe<Beer_Style_Mutation_Response>;
  /** delete single row from the table: "beer_style" */
  delete_beer_style_by_pk?: Maybe<Beer_Style>;
  /** delete data from the table: "beers" */
  delete_beers?: Maybe<Beers_Mutation_Response>;
  /** delete single row from the table: "beers" */
  delete_beers_by_pk?: Maybe<Beers>;
  /** delete data from the table: "cellar_items" */
  delete_cellar_items?: Maybe<Cellar_Items_Mutation_Response>;
  /** delete single row from the table: "cellar_items" */
  delete_cellar_items_by_pk?: Maybe<Cellar_Items>;
  /** delete data from the table: "cellar_owners" */
  delete_cellar_owners?: Maybe<Cellar_Owners_Mutation_Response>;
  /** delete single row from the table: "cellar_owners" */
  delete_cellar_owners_by_pk?: Maybe<Cellar_Owners>;
  /** delete data from the table: "cellars" */
  delete_cellars?: Maybe<Cellars_Mutation_Response>;
  /** delete single row from the table: "cellars" */
  delete_cellars_by_pk?: Maybe<Cellars>;
  /** delete data from the table: "check_ins" */
  delete_check_ins?: Maybe<Check_Ins_Mutation_Response>;
  /** delete single row from the table: "check_ins" */
  delete_check_ins_by_pk?: Maybe<Check_Ins>;
  /** delete data from the table: "coffee_cultivar" */
  delete_coffee_cultivar?: Maybe<Coffee_Cultivar_Mutation_Response>;
  /** delete single row from the table: "coffee_cultivar" */
  delete_coffee_cultivar_by_pk?: Maybe<Coffee_Cultivar>;
  /** delete data from the table: "coffee_process" */
  delete_coffee_process?: Maybe<Coffee_Process_Mutation_Response>;
  /** delete single row from the table: "coffee_process" */
  delete_coffee_process_by_pk?: Maybe<Coffee_Process>;
  /** delete data from the table: "coffee_roast_level" */
  delete_coffee_roast_level?: Maybe<Coffee_Roast_Level_Mutation_Response>;
  /** delete single row from the table: "coffee_roast_level" */
  delete_coffee_roast_level_by_pk?: Maybe<Coffee_Roast_Level>;
  /** delete data from the table: "coffee_species" */
  delete_coffee_species?: Maybe<Coffee_Species_Mutation_Response>;
  /** delete single row from the table: "coffee_species" */
  delete_coffee_species_by_pk?: Maybe<Coffee_Species>;
  /** delete data from the table: "coffees" */
  delete_coffees?: Maybe<Coffees_Mutation_Response>;
  /** delete single row from the table: "coffees" */
  delete_coffees_by_pk?: Maybe<Coffees>;
  /** delete data from the table: "country" */
  delete_country?: Maybe<Country_Mutation_Response>;
  /** delete single row from the table: "country" */
  delete_country_by_pk?: Maybe<Country>;
  /** delete data from the table: "friend_request_status" */
  delete_friend_request_status?: Maybe<Friend_Request_Status_Mutation_Response>;
  /** delete single row from the table: "friend_request_status" */
  delete_friend_request_status_by_pk?: Maybe<Friend_Request_Status>;
  /** delete data from the table: "friend_requests" */
  delete_friend_requests?: Maybe<Friend_Requests_Mutation_Response>;
  /** delete single row from the table: "friend_requests" */
  delete_friend_requests_by_pk?: Maybe<Friend_Requests>;
  /** delete data from the table: "friends" */
  delete_friends?: Maybe<Friends_Mutation_Response>;
  /** delete single row from the table: "friends" */
  delete_friends_by_pk?: Maybe<Friends>;
  /** delete data from the table: "image_analysis" */
  delete_image_analysis?: Maybe<Image_Analysis_Mutation_Response>;
  /** delete single row from the table: "image_analysis" */
  delete_image_analysis_by_pk?: Maybe<Image_Analysis>;
  /** delete data from the table: "image_analysis_text_blocks" */
  delete_image_analysis_text_blocks?: Maybe<Image_Analysis_Text_Blocks_Mutation_Response>;
  /** delete single row from the table: "image_analysis_text_blocks" */
  delete_image_analysis_text_blocks_by_pk?: Maybe<Image_Analysis_Text_Blocks>;
  /** delete data from the table: "item_favorites" */
  delete_item_favorites?: Maybe<Item_Favorites_Mutation_Response>;
  /** delete single row from the table: "item_favorites" */
  delete_item_favorites_by_pk?: Maybe<Item_Favorites>;
  /** delete data from the table: "item_image" */
  delete_item_image?: Maybe<Item_Image_Mutation_Response>;
  /** delete single row from the table: "item_image" */
  delete_item_image_by_pk?: Maybe<Item_Image>;
  /** delete data from the table: "item_onboardings" */
  delete_item_onboardings?: Maybe<Item_Onboardings_Mutation_Response>;
  /** delete single row from the table: "item_onboardings" */
  delete_item_onboardings_by_pk?: Maybe<Item_Onboardings>;
  /** delete data from the table: "item_reviews" */
  delete_item_reviews?: Maybe<Item_Reviews_Mutation_Response>;
  /** delete single row from the table: "item_reviews" */
  delete_item_reviews_by_pk?: Maybe<Item_Reviews>;
  /** delete data from the table: "item_type" */
  delete_item_type?: Maybe<Item_Type_Mutation_Response>;
  /** delete single row from the table: "item_type" */
  delete_item_type_by_pk?: Maybe<Item_Type>;
  /** delete data from the table: "item_vectors" */
  delete_item_vectors?: Maybe<Item_Vectors_Mutation_Response>;
  /** delete single row from the table: "item_vectors" */
  delete_item_vectors_by_pk?: Maybe<Item_Vectors>;
  /** delete data from the table: "permission_type" */
  delete_permission_type?: Maybe<Permission_Type_Mutation_Response>;
  /** delete single row from the table: "permission_type" */
  delete_permission_type_by_pk?: Maybe<Permission_Type>;
  /** delete data from the table: "spirit_type" */
  delete_spirit_type?: Maybe<Spirit_Type_Mutation_Response>;
  /** delete single row from the table: "spirit_type" */
  delete_spirit_type_by_pk?: Maybe<Spirit_Type>;
  /** delete data from the table: "spirits" */
  delete_spirits?: Maybe<Spirits_Mutation_Response>;
  /** delete single row from the table: "spirits" */
  delete_spirits_by_pk?: Maybe<Spirits>;
  /** delete data from the table: "wine_style" */
  delete_wine_style?: Maybe<Wine_Style_Mutation_Response>;
  /** delete single row from the table: "wine_style" */
  delete_wine_style_by_pk?: Maybe<Wine_Style>;
  /** delete data from the table: "wine_variety" */
  delete_wine_variety?: Maybe<Wine_Variety_Mutation_Response>;
  /** delete single row from the table: "wine_variety" */
  delete_wine_variety_by_pk?: Maybe<Wine_Variety>;
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
  /** insert data into the table: "admin.credentials" */
  insert_admin_credentials?: Maybe<Admin_Credentials_Mutation_Response>;
  /** insert a single row into the table: "admin.credentials" */
  insert_admin_credentials_one?: Maybe<Admin_Credentials>;
  /** insert data into the table: "barcodes" */
  insert_barcodes?: Maybe<Barcodes_Mutation_Response>;
  /** insert a single row into the table: "barcodes" */
  insert_barcodes_one?: Maybe<Barcodes>;
  /** insert data into the table: "beer_style" */
  insert_beer_style?: Maybe<Beer_Style_Mutation_Response>;
  /** insert a single row into the table: "beer_style" */
  insert_beer_style_one?: Maybe<Beer_Style>;
  /** insert data into the table: "beers" */
  insert_beers?: Maybe<Beers_Mutation_Response>;
  /** insert a single row into the table: "beers" */
  insert_beers_one?: Maybe<Beers>;
  /** insert data into the table: "cellar_items" */
  insert_cellar_items?: Maybe<Cellar_Items_Mutation_Response>;
  /** insert a single row into the table: "cellar_items" */
  insert_cellar_items_one?: Maybe<Cellar_Items>;
  /** insert data into the table: "cellar_owners" */
  insert_cellar_owners?: Maybe<Cellar_Owners_Mutation_Response>;
  /** insert a single row into the table: "cellar_owners" */
  insert_cellar_owners_one?: Maybe<Cellar_Owners>;
  /** insert data into the table: "cellars" */
  insert_cellars?: Maybe<Cellars_Mutation_Response>;
  /** insert a single row into the table: "cellars" */
  insert_cellars_one?: Maybe<Cellars>;
  /** insert data into the table: "check_ins" */
  insert_check_ins?: Maybe<Check_Ins_Mutation_Response>;
  /** insert a single row into the table: "check_ins" */
  insert_check_ins_one?: Maybe<Check_Ins>;
  /** insert data into the table: "coffee_cultivar" */
  insert_coffee_cultivar?: Maybe<Coffee_Cultivar_Mutation_Response>;
  /** insert a single row into the table: "coffee_cultivar" */
  insert_coffee_cultivar_one?: Maybe<Coffee_Cultivar>;
  /** insert data into the table: "coffee_process" */
  insert_coffee_process?: Maybe<Coffee_Process_Mutation_Response>;
  /** insert a single row into the table: "coffee_process" */
  insert_coffee_process_one?: Maybe<Coffee_Process>;
  /** insert data into the table: "coffee_roast_level" */
  insert_coffee_roast_level?: Maybe<Coffee_Roast_Level_Mutation_Response>;
  /** insert a single row into the table: "coffee_roast_level" */
  insert_coffee_roast_level_one?: Maybe<Coffee_Roast_Level>;
  /** insert data into the table: "coffee_species" */
  insert_coffee_species?: Maybe<Coffee_Species_Mutation_Response>;
  /** insert a single row into the table: "coffee_species" */
  insert_coffee_species_one?: Maybe<Coffee_Species>;
  /** insert data into the table: "coffees" */
  insert_coffees?: Maybe<Coffees_Mutation_Response>;
  /** insert a single row into the table: "coffees" */
  insert_coffees_one?: Maybe<Coffees>;
  /** insert data into the table: "country" */
  insert_country?: Maybe<Country_Mutation_Response>;
  /** insert a single row into the table: "country" */
  insert_country_one?: Maybe<Country>;
  /** insert data into the table: "friend_request_status" */
  insert_friend_request_status?: Maybe<Friend_Request_Status_Mutation_Response>;
  /** insert a single row into the table: "friend_request_status" */
  insert_friend_request_status_one?: Maybe<Friend_Request_Status>;
  /** insert data into the table: "friend_requests" */
  insert_friend_requests?: Maybe<Friend_Requests_Mutation_Response>;
  /** insert a single row into the table: "friend_requests" */
  insert_friend_requests_one?: Maybe<Friend_Requests>;
  /** insert data into the table: "friends" */
  insert_friends?: Maybe<Friends_Mutation_Response>;
  /** insert a single row into the table: "friends" */
  insert_friends_one?: Maybe<Friends>;
  /** insert data into the table: "image_analysis" */
  insert_image_analysis?: Maybe<Image_Analysis_Mutation_Response>;
  /** insert a single row into the table: "image_analysis" */
  insert_image_analysis_one?: Maybe<Image_Analysis>;
  /** insert data into the table: "image_analysis_text_blocks" */
  insert_image_analysis_text_blocks?: Maybe<Image_Analysis_Text_Blocks_Mutation_Response>;
  /** insert a single row into the table: "image_analysis_text_blocks" */
  insert_image_analysis_text_blocks_one?: Maybe<Image_Analysis_Text_Blocks>;
  /** insert data into the table: "item_favorites" */
  insert_item_favorites?: Maybe<Item_Favorites_Mutation_Response>;
  /** insert a single row into the table: "item_favorites" */
  insert_item_favorites_one?: Maybe<Item_Favorites>;
  /** insert data into the table: "item_image" */
  insert_item_image?: Maybe<Item_Image_Mutation_Response>;
  /** insert a single row into the table: "item_image" */
  insert_item_image_one?: Maybe<Item_Image>;
  /** insert data into the table: "item_onboardings" */
  insert_item_onboardings?: Maybe<Item_Onboardings_Mutation_Response>;
  /** insert a single row into the table: "item_onboardings" */
  insert_item_onboardings_one?: Maybe<Item_Onboardings>;
  /** insert data into the table: "item_reviews" */
  insert_item_reviews?: Maybe<Item_Reviews_Mutation_Response>;
  /** insert a single row into the table: "item_reviews" */
  insert_item_reviews_one?: Maybe<Item_Reviews>;
  /** insert data into the table: "item_type" */
  insert_item_type?: Maybe<Item_Type_Mutation_Response>;
  /** insert a single row into the table: "item_type" */
  insert_item_type_one?: Maybe<Item_Type>;
  /** insert data into the table: "item_vectors" */
  insert_item_vectors?: Maybe<Item_Vectors_Mutation_Response>;
  /** insert a single row into the table: "item_vectors" */
  insert_item_vectors_one?: Maybe<Item_Vectors>;
  /** insert data into the table: "permission_type" */
  insert_permission_type?: Maybe<Permission_Type_Mutation_Response>;
  /** insert a single row into the table: "permission_type" */
  insert_permission_type_one?: Maybe<Permission_Type>;
  /** insert data into the table: "spirit_type" */
  insert_spirit_type?: Maybe<Spirit_Type_Mutation_Response>;
  /** insert a single row into the table: "spirit_type" */
  insert_spirit_type_one?: Maybe<Spirit_Type>;
  /** insert data into the table: "spirits" */
  insert_spirits?: Maybe<Spirits_Mutation_Response>;
  /** insert a single row into the table: "spirits" */
  insert_spirits_one?: Maybe<Spirits>;
  /** insert data into the table: "wine_style" */
  insert_wine_style?: Maybe<Wine_Style_Mutation_Response>;
  /** insert a single row into the table: "wine_style" */
  insert_wine_style_one?: Maybe<Wine_Style>;
  /** insert data into the table: "wine_variety" */
  insert_wine_variety?: Maybe<Wine_Variety_Mutation_Response>;
  /** insert a single row into the table: "wine_variety" */
  insert_wine_variety_one?: Maybe<Wine_Variety>;
  /** insert data into the table: "wines" */
  insert_wines?: Maybe<Wines_Mutation_Response>;
  /** insert a single row into the table: "wines" */
  insert_wines_one?: Maybe<Wines>;
  item_image_upload?: Maybe<Item_Image_Upload_Result>;
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
  /** update data of the table: "admin.credentials" */
  update_admin_credentials?: Maybe<Admin_Credentials_Mutation_Response>;
  /** update single row of the table: "admin.credentials" */
  update_admin_credentials_by_pk?: Maybe<Admin_Credentials>;
  /** update multiples rows of table: "admin.credentials" */
  update_admin_credentials_many?: Maybe<Array<Maybe<Admin_Credentials_Mutation_Response>>>;
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
  /** update data of the table: "beer_style" */
  update_beer_style?: Maybe<Beer_Style_Mutation_Response>;
  /** update single row of the table: "beer_style" */
  update_beer_style_by_pk?: Maybe<Beer_Style>;
  /** update multiples rows of table: "beer_style" */
  update_beer_style_many?: Maybe<Array<Maybe<Beer_Style_Mutation_Response>>>;
  /** update data of the table: "beers" */
  update_beers?: Maybe<Beers_Mutation_Response>;
  /** update single row of the table: "beers" */
  update_beers_by_pk?: Maybe<Beers>;
  /** update multiples rows of table: "beers" */
  update_beers_many?: Maybe<Array<Maybe<Beers_Mutation_Response>>>;
  /** update multiples rows of table: "storage.buckets" */
  update_buckets_many?: Maybe<Array<Maybe<Buckets_Mutation_Response>>>;
  /** update data of the table: "cellar_items" */
  update_cellar_items?: Maybe<Cellar_Items_Mutation_Response>;
  /** update single row of the table: "cellar_items" */
  update_cellar_items_by_pk?: Maybe<Cellar_Items>;
  /** update multiples rows of table: "cellar_items" */
  update_cellar_items_many?: Maybe<Array<Maybe<Cellar_Items_Mutation_Response>>>;
  /** update data of the table: "cellar_owners" */
  update_cellar_owners?: Maybe<Cellar_Owners_Mutation_Response>;
  /** update single row of the table: "cellar_owners" */
  update_cellar_owners_by_pk?: Maybe<Cellar_Owners>;
  /** update multiples rows of table: "cellar_owners" */
  update_cellar_owners_many?: Maybe<Array<Maybe<Cellar_Owners_Mutation_Response>>>;
  /** update data of the table: "cellars" */
  update_cellars?: Maybe<Cellars_Mutation_Response>;
  /** update single row of the table: "cellars" */
  update_cellars_by_pk?: Maybe<Cellars>;
  /** update multiples rows of table: "cellars" */
  update_cellars_many?: Maybe<Array<Maybe<Cellars_Mutation_Response>>>;
  /** update data of the table: "check_ins" */
  update_check_ins?: Maybe<Check_Ins_Mutation_Response>;
  /** update single row of the table: "check_ins" */
  update_check_ins_by_pk?: Maybe<Check_Ins>;
  /** update multiples rows of table: "check_ins" */
  update_check_ins_many?: Maybe<Array<Maybe<Check_Ins_Mutation_Response>>>;
  /** update data of the table: "coffee_cultivar" */
  update_coffee_cultivar?: Maybe<Coffee_Cultivar_Mutation_Response>;
  /** update single row of the table: "coffee_cultivar" */
  update_coffee_cultivar_by_pk?: Maybe<Coffee_Cultivar>;
  /** update multiples rows of table: "coffee_cultivar" */
  update_coffee_cultivar_many?: Maybe<Array<Maybe<Coffee_Cultivar_Mutation_Response>>>;
  /** update data of the table: "coffee_process" */
  update_coffee_process?: Maybe<Coffee_Process_Mutation_Response>;
  /** update single row of the table: "coffee_process" */
  update_coffee_process_by_pk?: Maybe<Coffee_Process>;
  /** update multiples rows of table: "coffee_process" */
  update_coffee_process_many?: Maybe<Array<Maybe<Coffee_Process_Mutation_Response>>>;
  /** update data of the table: "coffee_roast_level" */
  update_coffee_roast_level?: Maybe<Coffee_Roast_Level_Mutation_Response>;
  /** update single row of the table: "coffee_roast_level" */
  update_coffee_roast_level_by_pk?: Maybe<Coffee_Roast_Level>;
  /** update multiples rows of table: "coffee_roast_level" */
  update_coffee_roast_level_many?: Maybe<Array<Maybe<Coffee_Roast_Level_Mutation_Response>>>;
  /** update data of the table: "coffee_species" */
  update_coffee_species?: Maybe<Coffee_Species_Mutation_Response>;
  /** update single row of the table: "coffee_species" */
  update_coffee_species_by_pk?: Maybe<Coffee_Species>;
  /** update multiples rows of table: "coffee_species" */
  update_coffee_species_many?: Maybe<Array<Maybe<Coffee_Species_Mutation_Response>>>;
  /** update data of the table: "coffees" */
  update_coffees?: Maybe<Coffees_Mutation_Response>;
  /** update single row of the table: "coffees" */
  update_coffees_by_pk?: Maybe<Coffees>;
  /** update multiples rows of table: "coffees" */
  update_coffees_many?: Maybe<Array<Maybe<Coffees_Mutation_Response>>>;
  /** update data of the table: "country" */
  update_country?: Maybe<Country_Mutation_Response>;
  /** update single row of the table: "country" */
  update_country_by_pk?: Maybe<Country>;
  /** update multiples rows of table: "country" */
  update_country_many?: Maybe<Array<Maybe<Country_Mutation_Response>>>;
  /** update multiples rows of table: "storage.files" */
  update_files_many?: Maybe<Array<Maybe<Files_Mutation_Response>>>;
  /** update data of the table: "friend_request_status" */
  update_friend_request_status?: Maybe<Friend_Request_Status_Mutation_Response>;
  /** update single row of the table: "friend_request_status" */
  update_friend_request_status_by_pk?: Maybe<Friend_Request_Status>;
  /** update multiples rows of table: "friend_request_status" */
  update_friend_request_status_many?: Maybe<Array<Maybe<Friend_Request_Status_Mutation_Response>>>;
  /** update data of the table: "friend_requests" */
  update_friend_requests?: Maybe<Friend_Requests_Mutation_Response>;
  /** update single row of the table: "friend_requests" */
  update_friend_requests_by_pk?: Maybe<Friend_Requests>;
  /** update multiples rows of table: "friend_requests" */
  update_friend_requests_many?: Maybe<Array<Maybe<Friend_Requests_Mutation_Response>>>;
  /** update data of the table: "friends" */
  update_friends?: Maybe<Friends_Mutation_Response>;
  /** update single row of the table: "friends" */
  update_friends_by_pk?: Maybe<Friends>;
  /** update multiples rows of table: "friends" */
  update_friends_many?: Maybe<Array<Maybe<Friends_Mutation_Response>>>;
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
  /** update data of the table: "item_favorites" */
  update_item_favorites?: Maybe<Item_Favorites_Mutation_Response>;
  /** update single row of the table: "item_favorites" */
  update_item_favorites_by_pk?: Maybe<Item_Favorites>;
  /** update multiples rows of table: "item_favorites" */
  update_item_favorites_many?: Maybe<Array<Maybe<Item_Favorites_Mutation_Response>>>;
  /** update data of the table: "item_image" */
  update_item_image?: Maybe<Item_Image_Mutation_Response>;
  /** update single row of the table: "item_image" */
  update_item_image_by_pk?: Maybe<Item_Image>;
  /** update multiples rows of table: "item_image" */
  update_item_image_many?: Maybe<Array<Maybe<Item_Image_Mutation_Response>>>;
  /** update data of the table: "item_onboardings" */
  update_item_onboardings?: Maybe<Item_Onboardings_Mutation_Response>;
  /** update single row of the table: "item_onboardings" */
  update_item_onboardings_by_pk?: Maybe<Item_Onboardings>;
  /** update multiples rows of table: "item_onboardings" */
  update_item_onboardings_many?: Maybe<Array<Maybe<Item_Onboardings_Mutation_Response>>>;
  /** update data of the table: "item_reviews" */
  update_item_reviews?: Maybe<Item_Reviews_Mutation_Response>;
  /** update single row of the table: "item_reviews" */
  update_item_reviews_by_pk?: Maybe<Item_Reviews>;
  /** update multiples rows of table: "item_reviews" */
  update_item_reviews_many?: Maybe<Array<Maybe<Item_Reviews_Mutation_Response>>>;
  /** update data of the table: "item_type" */
  update_item_type?: Maybe<Item_Type_Mutation_Response>;
  /** update single row of the table: "item_type" */
  update_item_type_by_pk?: Maybe<Item_Type>;
  /** update multiples rows of table: "item_type" */
  update_item_type_many?: Maybe<Array<Maybe<Item_Type_Mutation_Response>>>;
  /** update data of the table: "item_vectors" */
  update_item_vectors?: Maybe<Item_Vectors_Mutation_Response>;
  /** update single row of the table: "item_vectors" */
  update_item_vectors_by_pk?: Maybe<Item_Vectors>;
  /** update multiples rows of table: "item_vectors" */
  update_item_vectors_many?: Maybe<Array<Maybe<Item_Vectors_Mutation_Response>>>;
  /** update data of the table: "permission_type" */
  update_permission_type?: Maybe<Permission_Type_Mutation_Response>;
  /** update single row of the table: "permission_type" */
  update_permission_type_by_pk?: Maybe<Permission_Type>;
  /** update multiples rows of table: "permission_type" */
  update_permission_type_many?: Maybe<Array<Maybe<Permission_Type_Mutation_Response>>>;
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
  /** update data of the table: "wine_style" */
  update_wine_style?: Maybe<Wine_Style_Mutation_Response>;
  /** update single row of the table: "wine_style" */
  update_wine_style_by_pk?: Maybe<Wine_Style>;
  /** update multiples rows of table: "wine_style" */
  update_wine_style_many?: Maybe<Array<Maybe<Wine_Style_Mutation_Response>>>;
  /** update data of the table: "wine_variety" */
  update_wine_variety?: Maybe<Wine_Variety_Mutation_Response>;
  /** update single row of the table: "wine_variety" */
  update_wine_variety_by_pk?: Maybe<Wine_Variety>;
  /** update multiples rows of table: "wine_variety" */
  update_wine_variety_many?: Maybe<Array<Maybe<Wine_Variety_Mutation_Response>>>;
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
export type Mutation_RootDelete_Admin_CredentialsArgs = {
  where: Admin_Credentials_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Admin_Credentials_By_PkArgs = {
  id: Scalars['String']['input'];
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
export type Mutation_RootDelete_Beer_StyleArgs = {
  where: Beer_Style_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Beer_Style_By_PkArgs = {
  text: Scalars['String']['input'];
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
export type Mutation_RootDelete_Cellar_ItemsArgs = {
  where: Cellar_Items_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Cellar_Items_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Cellar_OwnersArgs = {
  where: Cellar_Owners_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Cellar_Owners_By_PkArgs = {
  cellar_id: Scalars['uuid']['input'];
  user_id: Scalars['uuid']['input'];
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
export type Mutation_RootDelete_Check_InsArgs = {
  where: Check_Ins_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Check_Ins_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Coffee_CultivarArgs = {
  where: Coffee_Cultivar_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Coffee_Cultivar_By_PkArgs = {
  text: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Coffee_ProcessArgs = {
  where: Coffee_Process_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Coffee_Process_By_PkArgs = {
  text: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Coffee_Roast_LevelArgs = {
  where: Coffee_Roast_Level_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Coffee_Roast_Level_By_PkArgs = {
  text: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Coffee_SpeciesArgs = {
  where: Coffee_Species_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Coffee_Species_By_PkArgs = {
  text: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_CoffeesArgs = {
  where: Coffees_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Coffees_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_CountryArgs = {
  where: Country_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Country_By_PkArgs = {
  text: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Friend_Request_StatusArgs = {
  where: Friend_Request_Status_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Friend_Request_Status_By_PkArgs = {
  text: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Friend_RequestsArgs = {
  where: Friend_Requests_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Friend_Requests_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_FriendsArgs = {
  where: Friends_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Friends_By_PkArgs = {
  friend_id: Scalars['uuid']['input'];
  user_id: Scalars['uuid']['input'];
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
export type Mutation_RootDelete_Item_FavoritesArgs = {
  where: Item_Favorites_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Item_Favorites_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Item_ImageArgs = {
  where: Item_Image_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Item_Image_By_PkArgs = {
  id: Scalars['uuid']['input'];
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
export type Mutation_RootDelete_Item_ReviewsArgs = {
  where: Item_Reviews_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Item_Reviews_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Item_TypeArgs = {
  where: Item_Type_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Item_Type_By_PkArgs = {
  text: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Item_VectorsArgs = {
  where: Item_Vectors_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Item_Vectors_By_PkArgs = {
  id: Scalars['Int']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Permission_TypeArgs = {
  where: Permission_Type_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Permission_Type_By_PkArgs = {
  text: Scalars['String']['input'];
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
export type Mutation_RootDelete_Wine_StyleArgs = {
  where: Wine_Style_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Wine_Style_By_PkArgs = {
  text: Scalars['String']['input'];
};


/** mutation root */
export type Mutation_RootDelete_Wine_VarietyArgs = {
  where: Wine_Variety_Bool_Exp;
};


/** mutation root */
export type Mutation_RootDelete_Wine_Variety_By_PkArgs = {
  text: Scalars['String']['input'];
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
export type Mutation_RootInsert_Admin_CredentialsArgs = {
  objects: Array<Admin_Credentials_Insert_Input>;
  on_conflict?: InputMaybe<Admin_Credentials_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Admin_Credentials_OneArgs = {
  object: Admin_Credentials_Insert_Input;
  on_conflict?: InputMaybe<Admin_Credentials_On_Conflict>;
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
export type Mutation_RootInsert_Beer_StyleArgs = {
  objects: Array<Beer_Style_Insert_Input>;
  on_conflict?: InputMaybe<Beer_Style_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Beer_Style_OneArgs = {
  object: Beer_Style_Insert_Input;
  on_conflict?: InputMaybe<Beer_Style_On_Conflict>;
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
export type Mutation_RootInsert_Cellar_ItemsArgs = {
  objects: Array<Cellar_Items_Insert_Input>;
  on_conflict?: InputMaybe<Cellar_Items_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Cellar_Items_OneArgs = {
  object: Cellar_Items_Insert_Input;
  on_conflict?: InputMaybe<Cellar_Items_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Cellar_OwnersArgs = {
  objects: Array<Cellar_Owners_Insert_Input>;
  on_conflict?: InputMaybe<Cellar_Owners_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Cellar_Owners_OneArgs = {
  object: Cellar_Owners_Insert_Input;
  on_conflict?: InputMaybe<Cellar_Owners_On_Conflict>;
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
export type Mutation_RootInsert_Check_InsArgs = {
  objects: Array<Check_Ins_Insert_Input>;
  on_conflict?: InputMaybe<Check_Ins_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Check_Ins_OneArgs = {
  object: Check_Ins_Insert_Input;
  on_conflict?: InputMaybe<Check_Ins_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Coffee_CultivarArgs = {
  objects: Array<Coffee_Cultivar_Insert_Input>;
  on_conflict?: InputMaybe<Coffee_Cultivar_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Coffee_Cultivar_OneArgs = {
  object: Coffee_Cultivar_Insert_Input;
  on_conflict?: InputMaybe<Coffee_Cultivar_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Coffee_ProcessArgs = {
  objects: Array<Coffee_Process_Insert_Input>;
  on_conflict?: InputMaybe<Coffee_Process_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Coffee_Process_OneArgs = {
  object: Coffee_Process_Insert_Input;
  on_conflict?: InputMaybe<Coffee_Process_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Coffee_Roast_LevelArgs = {
  objects: Array<Coffee_Roast_Level_Insert_Input>;
  on_conflict?: InputMaybe<Coffee_Roast_Level_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Coffee_Roast_Level_OneArgs = {
  object: Coffee_Roast_Level_Insert_Input;
  on_conflict?: InputMaybe<Coffee_Roast_Level_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Coffee_SpeciesArgs = {
  objects: Array<Coffee_Species_Insert_Input>;
  on_conflict?: InputMaybe<Coffee_Species_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Coffee_Species_OneArgs = {
  object: Coffee_Species_Insert_Input;
  on_conflict?: InputMaybe<Coffee_Species_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_CoffeesArgs = {
  objects: Array<Coffees_Insert_Input>;
  on_conflict?: InputMaybe<Coffees_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Coffees_OneArgs = {
  object: Coffees_Insert_Input;
  on_conflict?: InputMaybe<Coffees_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_CountryArgs = {
  objects: Array<Country_Insert_Input>;
  on_conflict?: InputMaybe<Country_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Country_OneArgs = {
  object: Country_Insert_Input;
  on_conflict?: InputMaybe<Country_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Friend_Request_StatusArgs = {
  objects: Array<Friend_Request_Status_Insert_Input>;
  on_conflict?: InputMaybe<Friend_Request_Status_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Friend_Request_Status_OneArgs = {
  object: Friend_Request_Status_Insert_Input;
  on_conflict?: InputMaybe<Friend_Request_Status_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Friend_RequestsArgs = {
  objects: Array<Friend_Requests_Insert_Input>;
  on_conflict?: InputMaybe<Friend_Requests_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Friend_Requests_OneArgs = {
  object: Friend_Requests_Insert_Input;
  on_conflict?: InputMaybe<Friend_Requests_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_FriendsArgs = {
  objects: Array<Friends_Insert_Input>;
  on_conflict?: InputMaybe<Friends_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Friends_OneArgs = {
  object: Friends_Insert_Input;
  on_conflict?: InputMaybe<Friends_On_Conflict>;
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
export type Mutation_RootInsert_Item_FavoritesArgs = {
  objects: Array<Item_Favorites_Insert_Input>;
  on_conflict?: InputMaybe<Item_Favorites_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_Favorites_OneArgs = {
  object: Item_Favorites_Insert_Input;
  on_conflict?: InputMaybe<Item_Favorites_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_ImageArgs = {
  objects: Array<Item_Image_Insert_Input>;
  on_conflict?: InputMaybe<Item_Image_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_Image_OneArgs = {
  object: Item_Image_Insert_Input;
  on_conflict?: InputMaybe<Item_Image_On_Conflict>;
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
export type Mutation_RootInsert_Item_ReviewsArgs = {
  objects: Array<Item_Reviews_Insert_Input>;
  on_conflict?: InputMaybe<Item_Reviews_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_Reviews_OneArgs = {
  object: Item_Reviews_Insert_Input;
  on_conflict?: InputMaybe<Item_Reviews_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_TypeArgs = {
  objects: Array<Item_Type_Insert_Input>;
  on_conflict?: InputMaybe<Item_Type_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_Type_OneArgs = {
  object: Item_Type_Insert_Input;
  on_conflict?: InputMaybe<Item_Type_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_VectorsArgs = {
  objects: Array<Item_Vectors_Insert_Input>;
  on_conflict?: InputMaybe<Item_Vectors_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Item_Vectors_OneArgs = {
  object: Item_Vectors_Insert_Input;
  on_conflict?: InputMaybe<Item_Vectors_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Permission_TypeArgs = {
  objects: Array<Permission_Type_Insert_Input>;
  on_conflict?: InputMaybe<Permission_Type_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Permission_Type_OneArgs = {
  object: Permission_Type_Insert_Input;
  on_conflict?: InputMaybe<Permission_Type_On_Conflict>;
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
export type Mutation_RootInsert_Wine_StyleArgs = {
  objects: Array<Wine_Style_Insert_Input>;
  on_conflict?: InputMaybe<Wine_Style_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Wine_Style_OneArgs = {
  object: Wine_Style_Insert_Input;
  on_conflict?: InputMaybe<Wine_Style_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Wine_VarietyArgs = {
  objects: Array<Wine_Variety_Insert_Input>;
  on_conflict?: InputMaybe<Wine_Variety_On_Conflict>;
};


/** mutation root */
export type Mutation_RootInsert_Wine_Variety_OneArgs = {
  object: Wine_Variety_Insert_Input;
  on_conflict?: InputMaybe<Wine_Variety_On_Conflict>;
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
export type Mutation_RootItem_Image_UploadArgs = {
  input: Item_Image_Upload_Input;
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
export type Mutation_RootUpdate_Admin_CredentialsArgs = {
  _append?: InputMaybe<Admin_Credentials_Append_Input>;
  _delete_at_path?: InputMaybe<Admin_Credentials_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Admin_Credentials_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Admin_Credentials_Delete_Key_Input>;
  _prepend?: InputMaybe<Admin_Credentials_Prepend_Input>;
  _set?: InputMaybe<Admin_Credentials_Set_Input>;
  where: Admin_Credentials_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Admin_Credentials_By_PkArgs = {
  _append?: InputMaybe<Admin_Credentials_Append_Input>;
  _delete_at_path?: InputMaybe<Admin_Credentials_Delete_At_Path_Input>;
  _delete_elem?: InputMaybe<Admin_Credentials_Delete_Elem_Input>;
  _delete_key?: InputMaybe<Admin_Credentials_Delete_Key_Input>;
  _prepend?: InputMaybe<Admin_Credentials_Prepend_Input>;
  _set?: InputMaybe<Admin_Credentials_Set_Input>;
  pk_columns: Admin_Credentials_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Admin_Credentials_ManyArgs = {
  updates: Array<Admin_Credentials_Updates>;
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
export type Mutation_RootUpdate_Beer_StyleArgs = {
  _set?: InputMaybe<Beer_Style_Set_Input>;
  where: Beer_Style_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Beer_Style_By_PkArgs = {
  _set?: InputMaybe<Beer_Style_Set_Input>;
  pk_columns: Beer_Style_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Beer_Style_ManyArgs = {
  updates: Array<Beer_Style_Updates>;
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
export type Mutation_RootUpdate_Cellar_ItemsArgs = {
  _inc?: InputMaybe<Cellar_Items_Inc_Input>;
  _set?: InputMaybe<Cellar_Items_Set_Input>;
  where: Cellar_Items_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Cellar_Items_By_PkArgs = {
  _inc?: InputMaybe<Cellar_Items_Inc_Input>;
  _set?: InputMaybe<Cellar_Items_Set_Input>;
  pk_columns: Cellar_Items_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Cellar_Items_ManyArgs = {
  updates: Array<Cellar_Items_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Cellar_OwnersArgs = {
  _set?: InputMaybe<Cellar_Owners_Set_Input>;
  where: Cellar_Owners_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Cellar_Owners_By_PkArgs = {
  _set?: InputMaybe<Cellar_Owners_Set_Input>;
  pk_columns: Cellar_Owners_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Cellar_Owners_ManyArgs = {
  updates: Array<Cellar_Owners_Updates>;
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
export type Mutation_RootUpdate_Check_InsArgs = {
  _set?: InputMaybe<Check_Ins_Set_Input>;
  where: Check_Ins_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Check_Ins_By_PkArgs = {
  _set?: InputMaybe<Check_Ins_Set_Input>;
  pk_columns: Check_Ins_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Check_Ins_ManyArgs = {
  updates: Array<Check_Ins_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_CultivarArgs = {
  _set?: InputMaybe<Coffee_Cultivar_Set_Input>;
  where: Coffee_Cultivar_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_Cultivar_By_PkArgs = {
  _set?: InputMaybe<Coffee_Cultivar_Set_Input>;
  pk_columns: Coffee_Cultivar_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_Cultivar_ManyArgs = {
  updates: Array<Coffee_Cultivar_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_ProcessArgs = {
  _set?: InputMaybe<Coffee_Process_Set_Input>;
  where: Coffee_Process_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_Process_By_PkArgs = {
  _set?: InputMaybe<Coffee_Process_Set_Input>;
  pk_columns: Coffee_Process_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_Process_ManyArgs = {
  updates: Array<Coffee_Process_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_Roast_LevelArgs = {
  _set?: InputMaybe<Coffee_Roast_Level_Set_Input>;
  where: Coffee_Roast_Level_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_Roast_Level_By_PkArgs = {
  _set?: InputMaybe<Coffee_Roast_Level_Set_Input>;
  pk_columns: Coffee_Roast_Level_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_Roast_Level_ManyArgs = {
  updates: Array<Coffee_Roast_Level_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_SpeciesArgs = {
  _set?: InputMaybe<Coffee_Species_Set_Input>;
  where: Coffee_Species_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_Species_By_PkArgs = {
  _set?: InputMaybe<Coffee_Species_Set_Input>;
  pk_columns: Coffee_Species_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Coffee_Species_ManyArgs = {
  updates: Array<Coffee_Species_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_CoffeesArgs = {
  _set?: InputMaybe<Coffees_Set_Input>;
  where: Coffees_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Coffees_By_PkArgs = {
  _set?: InputMaybe<Coffees_Set_Input>;
  pk_columns: Coffees_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Coffees_ManyArgs = {
  updates: Array<Coffees_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_CountryArgs = {
  _set?: InputMaybe<Country_Set_Input>;
  where: Country_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Country_By_PkArgs = {
  _set?: InputMaybe<Country_Set_Input>;
  pk_columns: Country_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Country_ManyArgs = {
  updates: Array<Country_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Files_ManyArgs = {
  updates: Array<Files_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Friend_Request_StatusArgs = {
  _set?: InputMaybe<Friend_Request_Status_Set_Input>;
  where: Friend_Request_Status_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Friend_Request_Status_By_PkArgs = {
  _set?: InputMaybe<Friend_Request_Status_Set_Input>;
  pk_columns: Friend_Request_Status_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Friend_Request_Status_ManyArgs = {
  updates: Array<Friend_Request_Status_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Friend_RequestsArgs = {
  _set?: InputMaybe<Friend_Requests_Set_Input>;
  where: Friend_Requests_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Friend_Requests_By_PkArgs = {
  _set?: InputMaybe<Friend_Requests_Set_Input>;
  pk_columns: Friend_Requests_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Friend_Requests_ManyArgs = {
  updates: Array<Friend_Requests_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_FriendsArgs = {
  _set?: InputMaybe<Friends_Set_Input>;
  where: Friends_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Friends_By_PkArgs = {
  _set?: InputMaybe<Friends_Set_Input>;
  pk_columns: Friends_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Friends_ManyArgs = {
  updates: Array<Friends_Updates>;
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
export type Mutation_RootUpdate_Item_FavoritesArgs = {
  _set?: InputMaybe<Item_Favorites_Set_Input>;
  where: Item_Favorites_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Favorites_By_PkArgs = {
  _set?: InputMaybe<Item_Favorites_Set_Input>;
  pk_columns: Item_Favorites_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Favorites_ManyArgs = {
  updates: Array<Item_Favorites_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Item_ImageArgs = {
  _set?: InputMaybe<Item_Image_Set_Input>;
  where: Item_Image_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Image_By_PkArgs = {
  _set?: InputMaybe<Item_Image_Set_Input>;
  pk_columns: Item_Image_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Image_ManyArgs = {
  updates: Array<Item_Image_Updates>;
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
export type Mutation_RootUpdate_Item_ReviewsArgs = {
  _inc?: InputMaybe<Item_Reviews_Inc_Input>;
  _set?: InputMaybe<Item_Reviews_Set_Input>;
  where: Item_Reviews_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Reviews_By_PkArgs = {
  _inc?: InputMaybe<Item_Reviews_Inc_Input>;
  _set?: InputMaybe<Item_Reviews_Set_Input>;
  pk_columns: Item_Reviews_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Reviews_ManyArgs = {
  updates: Array<Item_Reviews_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Item_TypeArgs = {
  _set?: InputMaybe<Item_Type_Set_Input>;
  where: Item_Type_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Type_By_PkArgs = {
  _set?: InputMaybe<Item_Type_Set_Input>;
  pk_columns: Item_Type_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Type_ManyArgs = {
  updates: Array<Item_Type_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Item_VectorsArgs = {
  _inc?: InputMaybe<Item_Vectors_Inc_Input>;
  _set?: InputMaybe<Item_Vectors_Set_Input>;
  where: Item_Vectors_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Vectors_By_PkArgs = {
  _inc?: InputMaybe<Item_Vectors_Inc_Input>;
  _set?: InputMaybe<Item_Vectors_Set_Input>;
  pk_columns: Item_Vectors_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Item_Vectors_ManyArgs = {
  updates: Array<Item_Vectors_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Permission_TypeArgs = {
  _set?: InputMaybe<Permission_Type_Set_Input>;
  where: Permission_Type_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Permission_Type_By_PkArgs = {
  _set?: InputMaybe<Permission_Type_Set_Input>;
  pk_columns: Permission_Type_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Permission_Type_ManyArgs = {
  updates: Array<Permission_Type_Updates>;
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
export type Mutation_RootUpdate_Wine_StyleArgs = {
  _set?: InputMaybe<Wine_Style_Set_Input>;
  where: Wine_Style_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Wine_Style_By_PkArgs = {
  _set?: InputMaybe<Wine_Style_Set_Input>;
  pk_columns: Wine_Style_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Wine_Style_ManyArgs = {
  updates: Array<Wine_Style_Updates>;
};


/** mutation root */
export type Mutation_RootUpdate_Wine_VarietyArgs = {
  _set?: InputMaybe<Wine_Variety_Set_Input>;
  where: Wine_Variety_Bool_Exp;
};


/** mutation root */
export type Mutation_RootUpdate_Wine_Variety_By_PkArgs = {
  _set?: InputMaybe<Wine_Variety_Set_Input>;
  pk_columns: Wine_Variety_Pk_Columns_Input;
};


/** mutation root */
export type Mutation_RootUpdate_Wine_Variety_ManyArgs = {
  updates: Array<Wine_Variety_Updates>;
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

/** columns and relationships of "permission_type" */
export type Permission_Type = {
  __typename: 'permission_type';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "permission_type" */
export type Permission_Type_Aggregate = {
  __typename: 'permission_type_aggregate';
  aggregate?: Maybe<Permission_Type_Aggregate_Fields>;
  nodes: Array<Permission_Type>;
};

/** aggregate fields of "permission_type" */
export type Permission_Type_Aggregate_Fields = {
  __typename: 'permission_type_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Permission_Type_Max_Fields>;
  min?: Maybe<Permission_Type_Min_Fields>;
};


/** aggregate fields of "permission_type" */
export type Permission_Type_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Permission_Type_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "permission_type". All fields are combined with a logical 'AND'. */
export type Permission_Type_Bool_Exp = {
  _and?: InputMaybe<Array<Permission_Type_Bool_Exp>>;
  _not?: InputMaybe<Permission_Type_Bool_Exp>;
  _or?: InputMaybe<Array<Permission_Type_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "permission_type" */
export enum Permission_Type_Constraint {
  /** unique or primary key constraint on columns "text" */
  PermissionTypePkey = 'permission_type_pkey'
}

export enum Permission_Type_Enum {
  Friends = 'FRIENDS',
  Private = 'PRIVATE',
  Public = 'PUBLIC'
}

/** Boolean expression to compare columns of type "permission_type_enum". All fields are combined with logical 'AND'. */
export type Permission_Type_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Permission_Type_Enum>;
  _in?: InputMaybe<Array<Permission_Type_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Permission_Type_Enum>;
  _nin?: InputMaybe<Array<Permission_Type_Enum>>;
};

/** input type for inserting data into table "permission_type" */
export type Permission_Type_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Permission_Type_Max_Fields = {
  __typename: 'permission_type_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Permission_Type_Min_Fields = {
  __typename: 'permission_type_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "permission_type" */
export type Permission_Type_Mutation_Response = {
  __typename: 'permission_type_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Permission_Type>;
};

/** on_conflict condition type for table "permission_type" */
export type Permission_Type_On_Conflict = {
  constraint: Permission_Type_Constraint;
  update_columns?: Array<Permission_Type_Update_Column>;
  where?: InputMaybe<Permission_Type_Bool_Exp>;
};

/** Ordering options when selecting data from "permission_type". */
export type Permission_Type_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: permission_type */
export type Permission_Type_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "permission_type" */
export enum Permission_Type_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "permission_type" */
export type Permission_Type_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "permission_type" */
export type Permission_Type_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Permission_Type_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Permission_Type_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "permission_type" */
export enum Permission_Type_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Permission_Type_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Permission_Type_Set_Input>;
  /** filter the rows which have to be updated */
  where: Permission_Type_Bool_Exp;
};

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
  /** fetch data from the table: "admin.credentials" */
  admin_credentials: Array<Admin_Credentials>;
  /** fetch aggregated fields from the table: "admin.credentials" */
  admin_credentials_aggregate: Admin_Credentials_Aggregate;
  /** fetch data from the table: "admin.credentials" using primary key columns */
  admin_credentials_by_pk?: Maybe<Admin_Credentials>;
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
  /** fetch data from the table: "beer_style" */
  beer_style: Array<Beer_Style>;
  /** fetch aggregated fields from the table: "beer_style" */
  beer_style_aggregate: Beer_Style_Aggregate;
  /** fetch data from the table: "beer_style" using primary key columns */
  beer_style_by_pk?: Maybe<Beer_Style>;
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
  /** An array relationship */
  cellar_items: Array<Cellar_Items>;
  /** An aggregate relationship */
  cellar_items_aggregate: Cellar_Items_Aggregate;
  /** fetch data from the table: "cellar_items" using primary key columns */
  cellar_items_by_pk?: Maybe<Cellar_Items>;
  /** fetch data from the table: "cellar_owners" */
  cellar_owners: Array<Cellar_Owners>;
  /** fetch aggregated fields from the table: "cellar_owners" */
  cellar_owners_aggregate: Cellar_Owners_Aggregate;
  /** fetch data from the table: "cellar_owners" using primary key columns */
  cellar_owners_by_pk?: Maybe<Cellar_Owners>;
  /** fetch data from the table: "cellars" */
  cellars: Array<Cellars>;
  /** fetch aggregated fields from the table: "cellars" */
  cellars_aggregate: Cellars_Aggregate;
  /** fetch data from the table: "cellars" using primary key columns */
  cellars_by_pk?: Maybe<Cellars>;
  /** An array relationship */
  check_ins: Array<Check_Ins>;
  /** An aggregate relationship */
  check_ins_aggregate: Check_Ins_Aggregate;
  /** fetch data from the table: "check_ins" using primary key columns */
  check_ins_by_pk?: Maybe<Check_Ins>;
  /** fetch data from the table: "coffee_cultivar" */
  coffee_cultivar: Array<Coffee_Cultivar>;
  /** fetch aggregated fields from the table: "coffee_cultivar" */
  coffee_cultivar_aggregate: Coffee_Cultivar_Aggregate;
  /** fetch data from the table: "coffee_cultivar" using primary key columns */
  coffee_cultivar_by_pk?: Maybe<Coffee_Cultivar>;
  coffee_defaults?: Maybe<Coffee_Defaults_Result>;
  /** fetch data from the table: "coffee_process" */
  coffee_process: Array<Coffee_Process>;
  /** fetch aggregated fields from the table: "coffee_process" */
  coffee_process_aggregate: Coffee_Process_Aggregate;
  /** fetch data from the table: "coffee_process" using primary key columns */
  coffee_process_by_pk?: Maybe<Coffee_Process>;
  /** fetch data from the table: "coffee_roast_level" */
  coffee_roast_level: Array<Coffee_Roast_Level>;
  /** fetch aggregated fields from the table: "coffee_roast_level" */
  coffee_roast_level_aggregate: Coffee_Roast_Level_Aggregate;
  /** fetch data from the table: "coffee_roast_level" using primary key columns */
  coffee_roast_level_by_pk?: Maybe<Coffee_Roast_Level>;
  /** fetch data from the table: "coffee_species" */
  coffee_species: Array<Coffee_Species>;
  /** fetch aggregated fields from the table: "coffee_species" */
  coffee_species_aggregate: Coffee_Species_Aggregate;
  /** fetch data from the table: "coffee_species" using primary key columns */
  coffee_species_by_pk?: Maybe<Coffee_Species>;
  /** An array relationship */
  coffees: Array<Coffees>;
  /** An aggregate relationship */
  coffees_aggregate: Coffees_Aggregate;
  /** fetch data from the table: "coffees" using primary key columns */
  coffees_by_pk?: Maybe<Coffees>;
  /** fetch data from the table: "country" */
  country: Array<Country>;
  /** fetch aggregated fields from the table: "country" */
  country_aggregate: Country_Aggregate;
  /** fetch data from the table: "country" using primary key columns */
  country_by_pk?: Maybe<Country>;
  create_search_vector: Scalars['vector']['output'];
  /** fetch data from the table: "storage.files" using primary key columns */
  file?: Maybe<Files>;
  /** An array relationship */
  files: Array<Files>;
  /** fetch aggregated fields from the table: "storage.files" */
  filesAggregate: Files_Aggregate;
  /** fetch data from the table: "friend_request_status" */
  friend_request_status: Array<Friend_Request_Status>;
  /** fetch aggregated fields from the table: "friend_request_status" */
  friend_request_status_aggregate: Friend_Request_Status_Aggregate;
  /** fetch data from the table: "friend_request_status" using primary key columns */
  friend_request_status_by_pk?: Maybe<Friend_Request_Status>;
  /** fetch data from the table: "friend_requests" */
  friend_requests: Array<Friend_Requests>;
  /** fetch aggregated fields from the table: "friend_requests" */
  friend_requests_aggregate: Friend_Requests_Aggregate;
  /** fetch data from the table: "friend_requests" using primary key columns */
  friend_requests_by_pk?: Maybe<Friend_Requests>;
  /** An array relationship */
  friends: Array<Friends>;
  /** An aggregate relationship */
  friends_aggregate: Friends_Aggregate;
  /** fetch data from the table: "friends" using primary key columns */
  friends_by_pk?: Maybe<Friends>;
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
  image_search: Array<Image_Search>;
  /** An array relationship */
  item_favorites: Array<Item_Favorites>;
  /** An aggregate relationship */
  item_favorites_aggregate: Item_Favorites_Aggregate;
  /** fetch data from the table: "item_favorites" using primary key columns */
  item_favorites_by_pk?: Maybe<Item_Favorites>;
  /** fetch data from the table: "item_image" */
  item_image: Array<Item_Image>;
  /** fetch aggregated fields from the table: "item_image" */
  item_image_aggregate: Item_Image_Aggregate;
  /** fetch data from the table: "item_image" using primary key columns */
  item_image_by_pk?: Maybe<Item_Image>;
  /** fetch data from the table: "item_onboardings" */
  item_onboardings: Array<Item_Onboardings>;
  /** fetch aggregated fields from the table: "item_onboardings" */
  item_onboardings_aggregate: Item_Onboardings_Aggregate;
  /** fetch data from the table: "item_onboardings" using primary key columns */
  item_onboardings_by_pk?: Maybe<Item_Onboardings>;
  /** fetch data from the table: "item_reviews" */
  item_reviews: Array<Item_Reviews>;
  /** fetch aggregated fields from the table: "item_reviews" */
  item_reviews_aggregate: Item_Reviews_Aggregate;
  /** fetch data from the table: "item_reviews" using primary key columns */
  item_reviews_by_pk?: Maybe<Item_Reviews>;
  item_scores: Array<Item_Scores>;
  /** fetch data from the table: "item_type" */
  item_type: Array<Item_Type>;
  /** fetch aggregated fields from the table: "item_type" */
  item_type_aggregate: Item_Type_Aggregate;
  /** fetch data from the table: "item_type" using primary key columns */
  item_type_by_pk?: Maybe<Item_Type>;
  /** An array relationship */
  item_vectors: Array<Item_Vectors>;
  /** An aggregate relationship */
  item_vectors_aggregate: Item_Vectors_Aggregate;
  /** fetch data from the table: "item_vectors" using primary key columns */
  item_vectors_by_pk?: Maybe<Item_Vectors>;
  /** fetch data from the table: "permission_type" */
  permission_type: Array<Permission_Type>;
  /** fetch aggregated fields from the table: "permission_type" */
  permission_type_aggregate: Permission_Type_Aggregate;
  /** fetch data from the table: "permission_type" using primary key columns */
  permission_type_by_pk?: Maybe<Permission_Type>;
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
  text_search: Array<Text_Search>;
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
  /** fetch data from the table: "wine_style" */
  wine_style: Array<Wine_Style>;
  /** fetch aggregated fields from the table: "wine_style" */
  wine_style_aggregate: Wine_Style_Aggregate;
  /** fetch data from the table: "wine_style" using primary key columns */
  wine_style_by_pk?: Maybe<Wine_Style>;
  /** fetch data from the table: "wine_variety" */
  wine_variety: Array<Wine_Variety>;
  /** fetch aggregated fields from the table: "wine_variety" */
  wine_variety_aggregate: Wine_Variety_Aggregate;
  /** fetch data from the table: "wine_variety" using primary key columns */
  wine_variety_by_pk?: Maybe<Wine_Variety>;
  /** An array relationship */
  wines: Array<Wines>;
  /** An aggregate relationship */
  wines_aggregate: Wines_Aggregate;
  /** fetch data from the table: "wines" using primary key columns */
  wines_by_pk?: Maybe<Wines>;
};


export type Query_RootAdmin_CredentialsArgs = {
  distinct_on?: InputMaybe<Array<Admin_Credentials_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Admin_Credentials_Order_By>>;
  where?: InputMaybe<Admin_Credentials_Bool_Exp>;
};


export type Query_RootAdmin_Credentials_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Admin_Credentials_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Admin_Credentials_Order_By>>;
  where?: InputMaybe<Admin_Credentials_Bool_Exp>;
};


export type Query_RootAdmin_Credentials_By_PkArgs = {
  id: Scalars['String']['input'];
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


export type Query_RootBeer_StyleArgs = {
  distinct_on?: InputMaybe<Array<Beer_Style_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beer_Style_Order_By>>;
  where?: InputMaybe<Beer_Style_Bool_Exp>;
};


export type Query_RootBeer_Style_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Beer_Style_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beer_Style_Order_By>>;
  where?: InputMaybe<Beer_Style_Bool_Exp>;
};


export type Query_RootBeer_Style_By_PkArgs = {
  text: Scalars['String']['input'];
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


export type Query_RootCellar_ItemsArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


export type Query_RootCellar_Items_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


export type Query_RootCellar_Items_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootCellar_OwnersArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Owners_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Owners_Order_By>>;
  where?: InputMaybe<Cellar_Owners_Bool_Exp>;
};


export type Query_RootCellar_Owners_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Owners_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Owners_Order_By>>;
  where?: InputMaybe<Cellar_Owners_Bool_Exp>;
};


export type Query_RootCellar_Owners_By_PkArgs = {
  cellar_id: Scalars['uuid']['input'];
  user_id: Scalars['uuid']['input'];
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


export type Query_RootCheck_InsArgs = {
  distinct_on?: InputMaybe<Array<Check_Ins_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Check_Ins_Order_By>>;
  where?: InputMaybe<Check_Ins_Bool_Exp>;
};


export type Query_RootCheck_Ins_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Check_Ins_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Check_Ins_Order_By>>;
  where?: InputMaybe<Check_Ins_Bool_Exp>;
};


export type Query_RootCheck_Ins_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootCoffee_CultivarArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Cultivar_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Cultivar_Order_By>>;
  where?: InputMaybe<Coffee_Cultivar_Bool_Exp>;
};


export type Query_RootCoffee_Cultivar_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Cultivar_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Cultivar_Order_By>>;
  where?: InputMaybe<Coffee_Cultivar_Bool_Exp>;
};


export type Query_RootCoffee_Cultivar_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Query_RootCoffee_DefaultsArgs = {
  hint: Item_Defaults_Hint;
};


export type Query_RootCoffee_ProcessArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Process_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Process_Order_By>>;
  where?: InputMaybe<Coffee_Process_Bool_Exp>;
};


export type Query_RootCoffee_Process_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Process_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Process_Order_By>>;
  where?: InputMaybe<Coffee_Process_Bool_Exp>;
};


export type Query_RootCoffee_Process_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Query_RootCoffee_Roast_LevelArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Roast_Level_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Roast_Level_Order_By>>;
  where?: InputMaybe<Coffee_Roast_Level_Bool_Exp>;
};


export type Query_RootCoffee_Roast_Level_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Roast_Level_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Roast_Level_Order_By>>;
  where?: InputMaybe<Coffee_Roast_Level_Bool_Exp>;
};


export type Query_RootCoffee_Roast_Level_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Query_RootCoffee_SpeciesArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Species_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Species_Order_By>>;
  where?: InputMaybe<Coffee_Species_Bool_Exp>;
};


export type Query_RootCoffee_Species_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Species_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Species_Order_By>>;
  where?: InputMaybe<Coffee_Species_Bool_Exp>;
};


export type Query_RootCoffee_Species_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Query_RootCoffeesArgs = {
  distinct_on?: InputMaybe<Array<Coffees_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffees_Order_By>>;
  where?: InputMaybe<Coffees_Bool_Exp>;
};


export type Query_RootCoffees_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffees_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffees_Order_By>>;
  where?: InputMaybe<Coffees_Bool_Exp>;
};


export type Query_RootCoffees_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootCountryArgs = {
  distinct_on?: InputMaybe<Array<Country_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Country_Order_By>>;
  where?: InputMaybe<Country_Bool_Exp>;
};


export type Query_RootCountry_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Country_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Country_Order_By>>;
  where?: InputMaybe<Country_Bool_Exp>;
};


export type Query_RootCountry_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Query_RootCreate_Search_VectorArgs = {
  image?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
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


export type Query_RootFriend_Request_StatusArgs = {
  distinct_on?: InputMaybe<Array<Friend_Request_Status_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Request_Status_Order_By>>;
  where?: InputMaybe<Friend_Request_Status_Bool_Exp>;
};


export type Query_RootFriend_Request_Status_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Friend_Request_Status_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Request_Status_Order_By>>;
  where?: InputMaybe<Friend_Request_Status_Bool_Exp>;
};


export type Query_RootFriend_Request_Status_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Query_RootFriend_RequestsArgs = {
  distinct_on?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Requests_Order_By>>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
};


export type Query_RootFriend_Requests_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Requests_Order_By>>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
};


export type Query_RootFriend_Requests_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootFriendsArgs = {
  distinct_on?: InputMaybe<Array<Friends_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friends_Order_By>>;
  where?: InputMaybe<Friends_Bool_Exp>;
};


export type Query_RootFriends_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Friends_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friends_Order_By>>;
  where?: InputMaybe<Friends_Bool_Exp>;
};


export type Query_RootFriends_By_PkArgs = {
  friend_id: Scalars['uuid']['input'];
  user_id: Scalars['uuid']['input'];
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


export type Query_RootImage_SearchArgs = {
  args: Image_Search_Arguments;
  distinct_on?: InputMaybe<Array<Image_Search_Result_Enum_Name>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Search_Result_Order_By>>;
  where?: InputMaybe<Image_Search_Result_Bool_Exp_Bool_Exp>;
};


export type Query_RootItem_FavoritesArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


export type Query_RootItem_Favorites_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


export type Query_RootItem_Favorites_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootItem_ImageArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


export type Query_RootItem_Image_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


export type Query_RootItem_Image_By_PkArgs = {
  id: Scalars['uuid']['input'];
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


export type Query_RootItem_ReviewsArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};


export type Query_RootItem_Reviews_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};


export type Query_RootItem_Reviews_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Query_RootItem_ScoresArgs = {
  args: Item_Scores_Arguments;
  distinct_on?: InputMaybe<Array<Item_Score_Enum_Name>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Score_Order_By>>;
  where?: InputMaybe<Item_Score_Bool_Exp_Bool_Exp>;
};


export type Query_RootItem_TypeArgs = {
  distinct_on?: InputMaybe<Array<Item_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Type_Order_By>>;
  where?: InputMaybe<Item_Type_Bool_Exp>;
};


export type Query_RootItem_Type_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Type_Order_By>>;
  where?: InputMaybe<Item_Type_Bool_Exp>;
};


export type Query_RootItem_Type_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Query_RootItem_VectorsArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


export type Query_RootItem_Vectors_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


export type Query_RootItem_Vectors_By_PkArgs = {
  id: Scalars['Int']['input'];
};


export type Query_RootPermission_TypeArgs = {
  distinct_on?: InputMaybe<Array<Permission_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Permission_Type_Order_By>>;
  where?: InputMaybe<Permission_Type_Bool_Exp>;
};


export type Query_RootPermission_Type_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Permission_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Permission_Type_Order_By>>;
  where?: InputMaybe<Permission_Type_Bool_Exp>;
};


export type Query_RootPermission_Type_By_PkArgs = {
  text: Scalars['String']['input'];
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


export type Query_RootText_SearchArgs = {
  args: Text_Search_Arguments;
  distinct_on?: InputMaybe<Array<Image_Search_Result_Enum_Name>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Search_Result_Order_By>>;
  where?: InputMaybe<Image_Search_Result_Bool_Exp_Bool_Exp>;
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


export type Query_RootWine_StyleArgs = {
  distinct_on?: InputMaybe<Array<Wine_Style_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wine_Style_Order_By>>;
  where?: InputMaybe<Wine_Style_Bool_Exp>;
};


export type Query_RootWine_Style_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Wine_Style_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wine_Style_Order_By>>;
  where?: InputMaybe<Wine_Style_Bool_Exp>;
};


export type Query_RootWine_Style_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Query_RootWine_VarietyArgs = {
  distinct_on?: InputMaybe<Array<Wine_Variety_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wine_Variety_Order_By>>;
  where?: InputMaybe<Wine_Variety_Bool_Exp>;
};


export type Query_RootWine_Variety_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Wine_Variety_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wine_Variety_Order_By>>;
  where?: InputMaybe<Wine_Variety_Bool_Exp>;
};


export type Query_RootWine_Variety_By_PkArgs = {
  text: Scalars['String']['input'];
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
  /** An array relationship */
  cellar_items: Array<Cellar_Items>;
  /** An aggregate relationship */
  cellar_items_aggregate: Cellar_Items_Aggregate;
  country?: Maybe<Country_Enum>;
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by_id: Scalars['uuid']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['uuid']['output'];
  /** An array relationship */
  item_favorites: Array<Item_Favorites>;
  /** An aggregate relationship */
  item_favorites_aggregate: Item_Favorites_Aggregate;
  /** An array relationship */
  item_images: Array<Item_Image>;
  /** An aggregate relationship */
  item_images_aggregate: Item_Image_Aggregate;
  item_onboarding_id: Scalars['uuid']['output'];
  /** An array relationship */
  item_vectors: Array<Item_Vectors>;
  /** An aggregate relationship */
  item_vectors_aggregate: Item_Vectors_Aggregate;
  name: Scalars['String']['output'];
  /** An array relationship */
  reviews: Array<Item_Reviews>;
  /** An aggregate relationship */
  reviews_aggregate: Item_Reviews_Aggregate;
  style?: Maybe<Scalars['String']['output']>;
  type: Spirit_Type_Enum;
  updated_at: Scalars['timestamptz']['output'];
  vintage?: Maybe<Scalars['date']['output']>;
};


/** columns and relationships of "spirits" */
export type SpiritsCellar_ItemsArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


/** columns and relationships of "spirits" */
export type SpiritsCellar_Items_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


/** columns and relationships of "spirits" */
export type SpiritsItem_FavoritesArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** columns and relationships of "spirits" */
export type SpiritsItem_Favorites_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** columns and relationships of "spirits" */
export type SpiritsItem_ImagesArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


/** columns and relationships of "spirits" */
export type SpiritsItem_Images_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


/** columns and relationships of "spirits" */
export type SpiritsItem_VectorsArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


/** columns and relationships of "spirits" */
export type SpiritsItem_Vectors_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


/** columns and relationships of "spirits" */
export type SpiritsReviewsArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};


/** columns and relationships of "spirits" */
export type SpiritsReviews_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
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
};

/** order by avg() on columns of table "spirits" */
export type Spirits_Avg_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "spirits". All fields are combined with a logical 'AND'. */
export type Spirits_Bool_Exp = {
  _and?: InputMaybe<Array<Spirits_Bool_Exp>>;
  _not?: InputMaybe<Spirits_Bool_Exp>;
  _or?: InputMaybe<Array<Spirits_Bool_Exp>>;
  alcohol_content_percentage?: InputMaybe<Numeric_Comparison_Exp>;
  barcode?: InputMaybe<Barcodes_Bool_Exp>;
  barcode_code?: InputMaybe<String_Comparison_Exp>;
  cellar_items?: InputMaybe<Cellar_Items_Bool_Exp>;
  cellar_items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Bool_Exp>;
  country?: InputMaybe<Country_Enum_Comparison_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by_id?: InputMaybe<Uuid_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  item_favorites?: InputMaybe<Item_Favorites_Bool_Exp>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Bool_Exp>;
  item_images?: InputMaybe<Item_Image_Bool_Exp>;
  item_images_aggregate?: InputMaybe<Item_Image_Aggregate_Bool_Exp>;
  item_onboarding_id?: InputMaybe<Uuid_Comparison_Exp>;
  item_vectors?: InputMaybe<Item_Vectors_Bool_Exp>;
  item_vectors_aggregate?: InputMaybe<Item_Vectors_Aggregate_Bool_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  reviews?: InputMaybe<Item_Reviews_Bool_Exp>;
  reviews_aggregate?: InputMaybe<Item_Reviews_Aggregate_Bool_Exp>;
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
};

/** input type for inserting data into table "spirits" */
export type Spirits_Insert_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  barcode?: InputMaybe<Barcodes_Obj_Rel_Insert_Input>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_items?: InputMaybe<Cellar_Items_Arr_Rel_Insert_Input>;
  country?: InputMaybe<Country_Enum>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_favorites?: InputMaybe<Item_Favorites_Arr_Rel_Insert_Input>;
  item_images?: InputMaybe<Item_Image_Arr_Rel_Insert_Input>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  item_vectors?: InputMaybe<Item_Vectors_Arr_Rel_Insert_Input>;
  name?: InputMaybe<Scalars['String']['input']>;
  reviews?: InputMaybe<Item_Reviews_Arr_Rel_Insert_Input>;
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
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  item_onboarding_id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** order by max() on columns of table "spirits" */
export type Spirits_Max_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  style?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Spirits_Min_Fields = {
  __typename: 'spirits_min_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  item_onboarding_id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** order by min() on columns of table "spirits" */
export type Spirits_Min_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
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

/** input type for inserting object relation for remote table "spirits" */
export type Spirits_Obj_Rel_Insert_Input = {
  data: Spirits_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Spirits_On_Conflict>;
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
  cellar_items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Order_By>;
  country?: InputMaybe<Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Order_By>;
  item_images_aggregate?: InputMaybe<Item_Image_Aggregate_Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  item_vectors_aggregate?: InputMaybe<Item_Vectors_Aggregate_Order_By>;
  name?: InputMaybe<Order_By>;
  reviews_aggregate?: InputMaybe<Item_Reviews_Aggregate_Order_By>;
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
  Country = 'country',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  ItemOnboardingId = 'item_onboarding_id',
  /** column name */
  Name = 'name',
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
  country?: InputMaybe<Country_Enum>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  style?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Spirit_Type_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate stddev on columns */
export type Spirits_Stddev_Fields = {
  __typename: 'spirits_stddev_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "spirits" */
export type Spirits_Stddev_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Spirits_Stddev_Pop_Fields = {
  __typename: 'spirits_stddev_pop_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "spirits" */
export type Spirits_Stddev_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Spirits_Stddev_Samp_Fields = {
  __typename: 'spirits_stddev_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "spirits" */
export type Spirits_Stddev_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
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
  country?: InputMaybe<Country_Enum>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  style?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Spirit_Type_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
};

/** aggregate sum on columns */
export type Spirits_Sum_Fields = {
  __typename: 'spirits_sum_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
};

/** order by sum() on columns of table "spirits" */
export type Spirits_Sum_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** update columns of table "spirits" */
export enum Spirits_Update_Column {
  /** column name */
  AlcoholContentPercentage = 'alcohol_content_percentage',
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  Country = 'country',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  ItemOnboardingId = 'item_onboarding_id',
  /** column name */
  Name = 'name',
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
};

/** order by var_pop() on columns of table "spirits" */
export type Spirits_Var_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Spirits_Var_Samp_Fields = {
  __typename: 'spirits_var_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "spirits" */
export type Spirits_Var_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Spirits_Variance_Fields = {
  __typename: 'spirits_variance_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "spirits" */
export type Spirits_Variance_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

export type Subscription_Root = {
  __typename: 'subscription_root';
  /** fetch data from the table: "admin.credentials" */
  admin_credentials: Array<Admin_Credentials>;
  /** fetch aggregated fields from the table: "admin.credentials" */
  admin_credentials_aggregate: Admin_Credentials_Aggregate;
  /** fetch data from the table: "admin.credentials" using primary key columns */
  admin_credentials_by_pk?: Maybe<Admin_Credentials>;
  /** fetch data from the table in a streaming manner: "admin.credentials" */
  admin_credentials_stream: Array<Admin_Credentials>;
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
  /** fetch data from the table: "beer_style" */
  beer_style: Array<Beer_Style>;
  /** fetch aggregated fields from the table: "beer_style" */
  beer_style_aggregate: Beer_Style_Aggregate;
  /** fetch data from the table: "beer_style" using primary key columns */
  beer_style_by_pk?: Maybe<Beer_Style>;
  /** fetch data from the table in a streaming manner: "beer_style" */
  beer_style_stream: Array<Beer_Style>;
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
  /** An array relationship */
  cellar_items: Array<Cellar_Items>;
  /** An aggregate relationship */
  cellar_items_aggregate: Cellar_Items_Aggregate;
  /** fetch data from the table: "cellar_items" using primary key columns */
  cellar_items_by_pk?: Maybe<Cellar_Items>;
  /** fetch data from the table in a streaming manner: "cellar_items" */
  cellar_items_stream: Array<Cellar_Items>;
  /** fetch data from the table: "cellar_owners" */
  cellar_owners: Array<Cellar_Owners>;
  /** fetch aggregated fields from the table: "cellar_owners" */
  cellar_owners_aggregate: Cellar_Owners_Aggregate;
  /** fetch data from the table: "cellar_owners" using primary key columns */
  cellar_owners_by_pk?: Maybe<Cellar_Owners>;
  /** fetch data from the table in a streaming manner: "cellar_owners" */
  cellar_owners_stream: Array<Cellar_Owners>;
  /** fetch data from the table: "cellars" */
  cellars: Array<Cellars>;
  /** fetch aggregated fields from the table: "cellars" */
  cellars_aggregate: Cellars_Aggregate;
  /** fetch data from the table: "cellars" using primary key columns */
  cellars_by_pk?: Maybe<Cellars>;
  /** fetch data from the table in a streaming manner: "cellars" */
  cellars_stream: Array<Cellars>;
  /** An array relationship */
  check_ins: Array<Check_Ins>;
  /** An aggregate relationship */
  check_ins_aggregate: Check_Ins_Aggregate;
  /** fetch data from the table: "check_ins" using primary key columns */
  check_ins_by_pk?: Maybe<Check_Ins>;
  /** fetch data from the table in a streaming manner: "check_ins" */
  check_ins_stream: Array<Check_Ins>;
  /** fetch data from the table: "coffee_cultivar" */
  coffee_cultivar: Array<Coffee_Cultivar>;
  /** fetch aggregated fields from the table: "coffee_cultivar" */
  coffee_cultivar_aggregate: Coffee_Cultivar_Aggregate;
  /** fetch data from the table: "coffee_cultivar" using primary key columns */
  coffee_cultivar_by_pk?: Maybe<Coffee_Cultivar>;
  /** fetch data from the table in a streaming manner: "coffee_cultivar" */
  coffee_cultivar_stream: Array<Coffee_Cultivar>;
  /** fetch data from the table: "coffee_process" */
  coffee_process: Array<Coffee_Process>;
  /** fetch aggregated fields from the table: "coffee_process" */
  coffee_process_aggregate: Coffee_Process_Aggregate;
  /** fetch data from the table: "coffee_process" using primary key columns */
  coffee_process_by_pk?: Maybe<Coffee_Process>;
  /** fetch data from the table in a streaming manner: "coffee_process" */
  coffee_process_stream: Array<Coffee_Process>;
  /** fetch data from the table: "coffee_roast_level" */
  coffee_roast_level: Array<Coffee_Roast_Level>;
  /** fetch aggregated fields from the table: "coffee_roast_level" */
  coffee_roast_level_aggregate: Coffee_Roast_Level_Aggregate;
  /** fetch data from the table: "coffee_roast_level" using primary key columns */
  coffee_roast_level_by_pk?: Maybe<Coffee_Roast_Level>;
  /** fetch data from the table in a streaming manner: "coffee_roast_level" */
  coffee_roast_level_stream: Array<Coffee_Roast_Level>;
  /** fetch data from the table: "coffee_species" */
  coffee_species: Array<Coffee_Species>;
  /** fetch aggregated fields from the table: "coffee_species" */
  coffee_species_aggregate: Coffee_Species_Aggregate;
  /** fetch data from the table: "coffee_species" using primary key columns */
  coffee_species_by_pk?: Maybe<Coffee_Species>;
  /** fetch data from the table in a streaming manner: "coffee_species" */
  coffee_species_stream: Array<Coffee_Species>;
  /** An array relationship */
  coffees: Array<Coffees>;
  /** An aggregate relationship */
  coffees_aggregate: Coffees_Aggregate;
  /** fetch data from the table: "coffees" using primary key columns */
  coffees_by_pk?: Maybe<Coffees>;
  /** fetch data from the table in a streaming manner: "coffees" */
  coffees_stream: Array<Coffees>;
  /** fetch data from the table: "country" */
  country: Array<Country>;
  /** fetch aggregated fields from the table: "country" */
  country_aggregate: Country_Aggregate;
  /** fetch data from the table: "country" using primary key columns */
  country_by_pk?: Maybe<Country>;
  /** fetch data from the table in a streaming manner: "country" */
  country_stream: Array<Country>;
  /** fetch data from the table: "storage.files" using primary key columns */
  file?: Maybe<Files>;
  /** An array relationship */
  files: Array<Files>;
  /** fetch aggregated fields from the table: "storage.files" */
  filesAggregate: Files_Aggregate;
  /** fetch data from the table in a streaming manner: "storage.files" */
  files_stream: Array<Files>;
  /** fetch data from the table: "friend_request_status" */
  friend_request_status: Array<Friend_Request_Status>;
  /** fetch aggregated fields from the table: "friend_request_status" */
  friend_request_status_aggregate: Friend_Request_Status_Aggregate;
  /** fetch data from the table: "friend_request_status" using primary key columns */
  friend_request_status_by_pk?: Maybe<Friend_Request_Status>;
  /** fetch data from the table in a streaming manner: "friend_request_status" */
  friend_request_status_stream: Array<Friend_Request_Status>;
  /** fetch data from the table: "friend_requests" */
  friend_requests: Array<Friend_Requests>;
  /** fetch aggregated fields from the table: "friend_requests" */
  friend_requests_aggregate: Friend_Requests_Aggregate;
  /** fetch data from the table: "friend_requests" using primary key columns */
  friend_requests_by_pk?: Maybe<Friend_Requests>;
  /** fetch data from the table in a streaming manner: "friend_requests" */
  friend_requests_stream: Array<Friend_Requests>;
  /** An array relationship */
  friends: Array<Friends>;
  /** An aggregate relationship */
  friends_aggregate: Friends_Aggregate;
  /** fetch data from the table: "friends" using primary key columns */
  friends_by_pk?: Maybe<Friends>;
  /** fetch data from the table in a streaming manner: "friends" */
  friends_stream: Array<Friends>;
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
  image_search: Array<Image_Search>;
  /** An array relationship */
  item_favorites: Array<Item_Favorites>;
  /** An aggregate relationship */
  item_favorites_aggregate: Item_Favorites_Aggregate;
  /** fetch data from the table: "item_favorites" using primary key columns */
  item_favorites_by_pk?: Maybe<Item_Favorites>;
  /** fetch data from the table in a streaming manner: "item_favorites" */
  item_favorites_stream: Array<Item_Favorites>;
  /** fetch data from the table: "item_image" */
  item_image: Array<Item_Image>;
  /** fetch aggregated fields from the table: "item_image" */
  item_image_aggregate: Item_Image_Aggregate;
  /** fetch data from the table: "item_image" using primary key columns */
  item_image_by_pk?: Maybe<Item_Image>;
  /** fetch data from the table in a streaming manner: "item_image" */
  item_image_stream: Array<Item_Image>;
  /** fetch data from the table: "item_onboardings" */
  item_onboardings: Array<Item_Onboardings>;
  /** fetch aggregated fields from the table: "item_onboardings" */
  item_onboardings_aggregate: Item_Onboardings_Aggregate;
  /** fetch data from the table: "item_onboardings" using primary key columns */
  item_onboardings_by_pk?: Maybe<Item_Onboardings>;
  /** fetch data from the table in a streaming manner: "item_onboardings" */
  item_onboardings_stream: Array<Item_Onboardings>;
  /** fetch data from the table: "item_reviews" */
  item_reviews: Array<Item_Reviews>;
  /** fetch aggregated fields from the table: "item_reviews" */
  item_reviews_aggregate: Item_Reviews_Aggregate;
  /** fetch data from the table: "item_reviews" using primary key columns */
  item_reviews_by_pk?: Maybe<Item_Reviews>;
  /** fetch data from the table in a streaming manner: "item_reviews" */
  item_reviews_stream: Array<Item_Reviews>;
  item_scores: Array<Item_Scores>;
  /** fetch data from the table: "item_type" */
  item_type: Array<Item_Type>;
  /** fetch aggregated fields from the table: "item_type" */
  item_type_aggregate: Item_Type_Aggregate;
  /** fetch data from the table: "item_type" using primary key columns */
  item_type_by_pk?: Maybe<Item_Type>;
  /** fetch data from the table in a streaming manner: "item_type" */
  item_type_stream: Array<Item_Type>;
  /** An array relationship */
  item_vectors: Array<Item_Vectors>;
  /** An aggregate relationship */
  item_vectors_aggregate: Item_Vectors_Aggregate;
  /** fetch data from the table: "item_vectors" using primary key columns */
  item_vectors_by_pk?: Maybe<Item_Vectors>;
  /** fetch data from the table in a streaming manner: "item_vectors" */
  item_vectors_stream: Array<Item_Vectors>;
  /** fetch data from the table: "permission_type" */
  permission_type: Array<Permission_Type>;
  /** fetch aggregated fields from the table: "permission_type" */
  permission_type_aggregate: Permission_Type_Aggregate;
  /** fetch data from the table: "permission_type" using primary key columns */
  permission_type_by_pk?: Maybe<Permission_Type>;
  /** fetch data from the table in a streaming manner: "permission_type" */
  permission_type_stream: Array<Permission_Type>;
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
  text_search: Array<Text_Search>;
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
  /** fetch data from the table: "wine_style" */
  wine_style: Array<Wine_Style>;
  /** fetch aggregated fields from the table: "wine_style" */
  wine_style_aggregate: Wine_Style_Aggregate;
  /** fetch data from the table: "wine_style" using primary key columns */
  wine_style_by_pk?: Maybe<Wine_Style>;
  /** fetch data from the table in a streaming manner: "wine_style" */
  wine_style_stream: Array<Wine_Style>;
  /** fetch data from the table: "wine_variety" */
  wine_variety: Array<Wine_Variety>;
  /** fetch aggregated fields from the table: "wine_variety" */
  wine_variety_aggregate: Wine_Variety_Aggregate;
  /** fetch data from the table: "wine_variety" using primary key columns */
  wine_variety_by_pk?: Maybe<Wine_Variety>;
  /** fetch data from the table in a streaming manner: "wine_variety" */
  wine_variety_stream: Array<Wine_Variety>;
  /** An array relationship */
  wines: Array<Wines>;
  /** An aggregate relationship */
  wines_aggregate: Wines_Aggregate;
  /** fetch data from the table: "wines" using primary key columns */
  wines_by_pk?: Maybe<Wines>;
  /** fetch data from the table in a streaming manner: "wines" */
  wines_stream: Array<Wines>;
};


export type Subscription_RootAdmin_CredentialsArgs = {
  distinct_on?: InputMaybe<Array<Admin_Credentials_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Admin_Credentials_Order_By>>;
  where?: InputMaybe<Admin_Credentials_Bool_Exp>;
};


export type Subscription_RootAdmin_Credentials_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Admin_Credentials_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Admin_Credentials_Order_By>>;
  where?: InputMaybe<Admin_Credentials_Bool_Exp>;
};


export type Subscription_RootAdmin_Credentials_By_PkArgs = {
  id: Scalars['String']['input'];
};


export type Subscription_RootAdmin_Credentials_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Admin_Credentials_Stream_Cursor_Input>>;
  where?: InputMaybe<Admin_Credentials_Bool_Exp>;
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


export type Subscription_RootBeer_StyleArgs = {
  distinct_on?: InputMaybe<Array<Beer_Style_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beer_Style_Order_By>>;
  where?: InputMaybe<Beer_Style_Bool_Exp>;
};


export type Subscription_RootBeer_Style_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Beer_Style_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Beer_Style_Order_By>>;
  where?: InputMaybe<Beer_Style_Bool_Exp>;
};


export type Subscription_RootBeer_Style_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootBeer_Style_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Beer_Style_Stream_Cursor_Input>>;
  where?: InputMaybe<Beer_Style_Bool_Exp>;
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


export type Subscription_RootCellar_ItemsArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


export type Subscription_RootCellar_Items_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


export type Subscription_RootCellar_Items_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootCellar_Items_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Cellar_Items_Stream_Cursor_Input>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


export type Subscription_RootCellar_OwnersArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Owners_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Owners_Order_By>>;
  where?: InputMaybe<Cellar_Owners_Bool_Exp>;
};


export type Subscription_RootCellar_Owners_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Owners_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Owners_Order_By>>;
  where?: InputMaybe<Cellar_Owners_Bool_Exp>;
};


export type Subscription_RootCellar_Owners_By_PkArgs = {
  cellar_id: Scalars['uuid']['input'];
  user_id: Scalars['uuid']['input'];
};


export type Subscription_RootCellar_Owners_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Cellar_Owners_Stream_Cursor_Input>>;
  where?: InputMaybe<Cellar_Owners_Bool_Exp>;
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


export type Subscription_RootCheck_InsArgs = {
  distinct_on?: InputMaybe<Array<Check_Ins_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Check_Ins_Order_By>>;
  where?: InputMaybe<Check_Ins_Bool_Exp>;
};


export type Subscription_RootCheck_Ins_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Check_Ins_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Check_Ins_Order_By>>;
  where?: InputMaybe<Check_Ins_Bool_Exp>;
};


export type Subscription_RootCheck_Ins_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootCheck_Ins_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Check_Ins_Stream_Cursor_Input>>;
  where?: InputMaybe<Check_Ins_Bool_Exp>;
};


export type Subscription_RootCoffee_CultivarArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Cultivar_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Cultivar_Order_By>>;
  where?: InputMaybe<Coffee_Cultivar_Bool_Exp>;
};


export type Subscription_RootCoffee_Cultivar_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Cultivar_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Cultivar_Order_By>>;
  where?: InputMaybe<Coffee_Cultivar_Bool_Exp>;
};


export type Subscription_RootCoffee_Cultivar_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootCoffee_Cultivar_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Coffee_Cultivar_Stream_Cursor_Input>>;
  where?: InputMaybe<Coffee_Cultivar_Bool_Exp>;
};


export type Subscription_RootCoffee_ProcessArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Process_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Process_Order_By>>;
  where?: InputMaybe<Coffee_Process_Bool_Exp>;
};


export type Subscription_RootCoffee_Process_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Process_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Process_Order_By>>;
  where?: InputMaybe<Coffee_Process_Bool_Exp>;
};


export type Subscription_RootCoffee_Process_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootCoffee_Process_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Coffee_Process_Stream_Cursor_Input>>;
  where?: InputMaybe<Coffee_Process_Bool_Exp>;
};


export type Subscription_RootCoffee_Roast_LevelArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Roast_Level_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Roast_Level_Order_By>>;
  where?: InputMaybe<Coffee_Roast_Level_Bool_Exp>;
};


export type Subscription_RootCoffee_Roast_Level_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Roast_Level_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Roast_Level_Order_By>>;
  where?: InputMaybe<Coffee_Roast_Level_Bool_Exp>;
};


export type Subscription_RootCoffee_Roast_Level_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootCoffee_Roast_Level_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Coffee_Roast_Level_Stream_Cursor_Input>>;
  where?: InputMaybe<Coffee_Roast_Level_Bool_Exp>;
};


export type Subscription_RootCoffee_SpeciesArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Species_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Species_Order_By>>;
  where?: InputMaybe<Coffee_Species_Bool_Exp>;
};


export type Subscription_RootCoffee_Species_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffee_Species_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffee_Species_Order_By>>;
  where?: InputMaybe<Coffee_Species_Bool_Exp>;
};


export type Subscription_RootCoffee_Species_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootCoffee_Species_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Coffee_Species_Stream_Cursor_Input>>;
  where?: InputMaybe<Coffee_Species_Bool_Exp>;
};


export type Subscription_RootCoffeesArgs = {
  distinct_on?: InputMaybe<Array<Coffees_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffees_Order_By>>;
  where?: InputMaybe<Coffees_Bool_Exp>;
};


export type Subscription_RootCoffees_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Coffees_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Coffees_Order_By>>;
  where?: InputMaybe<Coffees_Bool_Exp>;
};


export type Subscription_RootCoffees_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootCoffees_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Coffees_Stream_Cursor_Input>>;
  where?: InputMaybe<Coffees_Bool_Exp>;
};


export type Subscription_RootCountryArgs = {
  distinct_on?: InputMaybe<Array<Country_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Country_Order_By>>;
  where?: InputMaybe<Country_Bool_Exp>;
};


export type Subscription_RootCountry_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Country_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Country_Order_By>>;
  where?: InputMaybe<Country_Bool_Exp>;
};


export type Subscription_RootCountry_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootCountry_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Country_Stream_Cursor_Input>>;
  where?: InputMaybe<Country_Bool_Exp>;
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


export type Subscription_RootFriend_Request_StatusArgs = {
  distinct_on?: InputMaybe<Array<Friend_Request_Status_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Request_Status_Order_By>>;
  where?: InputMaybe<Friend_Request_Status_Bool_Exp>;
};


export type Subscription_RootFriend_Request_Status_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Friend_Request_Status_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Request_Status_Order_By>>;
  where?: InputMaybe<Friend_Request_Status_Bool_Exp>;
};


export type Subscription_RootFriend_Request_Status_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootFriend_Request_Status_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Friend_Request_Status_Stream_Cursor_Input>>;
  where?: InputMaybe<Friend_Request_Status_Bool_Exp>;
};


export type Subscription_RootFriend_RequestsArgs = {
  distinct_on?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Requests_Order_By>>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
};


export type Subscription_RootFriend_Requests_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Requests_Order_By>>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
};


export type Subscription_RootFriend_Requests_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootFriend_Requests_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Friend_Requests_Stream_Cursor_Input>>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
};


export type Subscription_RootFriendsArgs = {
  distinct_on?: InputMaybe<Array<Friends_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friends_Order_By>>;
  where?: InputMaybe<Friends_Bool_Exp>;
};


export type Subscription_RootFriends_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Friends_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friends_Order_By>>;
  where?: InputMaybe<Friends_Bool_Exp>;
};


export type Subscription_RootFriends_By_PkArgs = {
  friend_id: Scalars['uuid']['input'];
  user_id: Scalars['uuid']['input'];
};


export type Subscription_RootFriends_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Friends_Stream_Cursor_Input>>;
  where?: InputMaybe<Friends_Bool_Exp>;
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


export type Subscription_RootImage_SearchArgs = {
  args: Image_Search_Arguments;
  distinct_on?: InputMaybe<Array<Image_Search_Result_Enum_Name>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Search_Result_Order_By>>;
  where?: InputMaybe<Image_Search_Result_Bool_Exp_Bool_Exp>;
};


export type Subscription_RootItem_FavoritesArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


export type Subscription_RootItem_Favorites_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


export type Subscription_RootItem_Favorites_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItem_Favorites_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Item_Favorites_Stream_Cursor_Input>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


export type Subscription_RootItem_ImageArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


export type Subscription_RootItem_Image_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


export type Subscription_RootItem_Image_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItem_Image_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Item_Image_Stream_Cursor_Input>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
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


export type Subscription_RootItem_ReviewsArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};


export type Subscription_RootItem_Reviews_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};


export type Subscription_RootItem_Reviews_By_PkArgs = {
  id: Scalars['uuid']['input'];
};


export type Subscription_RootItem_Reviews_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Item_Reviews_Stream_Cursor_Input>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};


export type Subscription_RootItem_ScoresArgs = {
  args: Item_Scores_Arguments;
  distinct_on?: InputMaybe<Array<Item_Score_Enum_Name>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Score_Order_By>>;
  where?: InputMaybe<Item_Score_Bool_Exp_Bool_Exp>;
};


export type Subscription_RootItem_TypeArgs = {
  distinct_on?: InputMaybe<Array<Item_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Type_Order_By>>;
  where?: InputMaybe<Item_Type_Bool_Exp>;
};


export type Subscription_RootItem_Type_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Type_Order_By>>;
  where?: InputMaybe<Item_Type_Bool_Exp>;
};


export type Subscription_RootItem_Type_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootItem_Type_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Item_Type_Stream_Cursor_Input>>;
  where?: InputMaybe<Item_Type_Bool_Exp>;
};


export type Subscription_RootItem_VectorsArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


export type Subscription_RootItem_Vectors_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


export type Subscription_RootItem_Vectors_By_PkArgs = {
  id: Scalars['Int']['input'];
};


export type Subscription_RootItem_Vectors_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Item_Vectors_Stream_Cursor_Input>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


export type Subscription_RootPermission_TypeArgs = {
  distinct_on?: InputMaybe<Array<Permission_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Permission_Type_Order_By>>;
  where?: InputMaybe<Permission_Type_Bool_Exp>;
};


export type Subscription_RootPermission_Type_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Permission_Type_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Permission_Type_Order_By>>;
  where?: InputMaybe<Permission_Type_Bool_Exp>;
};


export type Subscription_RootPermission_Type_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootPermission_Type_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Permission_Type_Stream_Cursor_Input>>;
  where?: InputMaybe<Permission_Type_Bool_Exp>;
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


export type Subscription_RootText_SearchArgs = {
  args: Text_Search_Arguments;
  distinct_on?: InputMaybe<Array<Image_Search_Result_Enum_Name>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Image_Search_Result_Order_By>>;
  where?: InputMaybe<Image_Search_Result_Bool_Exp_Bool_Exp>;
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


export type Subscription_RootWine_StyleArgs = {
  distinct_on?: InputMaybe<Array<Wine_Style_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wine_Style_Order_By>>;
  where?: InputMaybe<Wine_Style_Bool_Exp>;
};


export type Subscription_RootWine_Style_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Wine_Style_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wine_Style_Order_By>>;
  where?: InputMaybe<Wine_Style_Bool_Exp>;
};


export type Subscription_RootWine_Style_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootWine_Style_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Wine_Style_Stream_Cursor_Input>>;
  where?: InputMaybe<Wine_Style_Bool_Exp>;
};


export type Subscription_RootWine_VarietyArgs = {
  distinct_on?: InputMaybe<Array<Wine_Variety_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wine_Variety_Order_By>>;
  where?: InputMaybe<Wine_Variety_Bool_Exp>;
};


export type Subscription_RootWine_Variety_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Wine_Variety_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Wine_Variety_Order_By>>;
  where?: InputMaybe<Wine_Variety_Bool_Exp>;
};


export type Subscription_RootWine_Variety_By_PkArgs = {
  text: Scalars['String']['input'];
};


export type Subscription_RootWine_Variety_StreamArgs = {
  batch_size: Scalars['Int']['input'];
  cursor: Array<InputMaybe<Wine_Variety_Stream_Cursor_Input>>;
  where?: InputMaybe<Wine_Variety_Bool_Exp>;
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

export type Text_Search = {
  __typename: 'text_search';
  /** An object relationship */
  beer?: Maybe<Beers>;
  beer_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  coffee?: Maybe<Coffees>;
  coffee_id?: Maybe<Scalars['uuid']['output']>;
  distance?: Maybe<Scalars['float8']['output']>;
  /** An object relationship */
  spirit?: Maybe<Spirits>;
  spirit_id?: Maybe<Scalars['uuid']['output']>;
  /** An object relationship */
  wine?: Maybe<Wines>;
  wine_id?: Maybe<Scalars['uuid']['output']>;
};

/** text_searchNative Query Arguments */
export type Text_Search_Arguments = {
  text: Scalars['String']['input'];
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
  createdAt: Scalars['timestamptz']['output'];
  currentChallenge?: Maybe<Scalars['String']['output']>;
  defaultRole: Scalars['String']['output'];
  /** An object relationship */
  defaultRoleByRole: AuthRoles;
  disabled: Scalars['Boolean']['output'];
  displayName: Scalars['String']['output'];
  email?: Maybe<Scalars['citext']['output']>;
  emailVerified: Scalars['Boolean']['output'];
  /** An array relationship */
  friends: Array<Friends>;
  /** An aggregate relationship */
  friends_aggregate: Friends_Aggregate;
  id: Scalars['uuid']['output'];
  /** An array relationship */
  incomingFriendRequests: Array<Friend_Requests>;
  /** An aggregate relationship */
  incomingFriendRequests_aggregate: Friend_Requests_Aggregate;
  isAnonymous: Scalars['Boolean']['output'];
  /** An array relationship */
  item_favorites: Array<Item_Favorites>;
  /** An aggregate relationship */
  item_favorites_aggregate: Item_Favorites_Aggregate;
  lastSeen?: Maybe<Scalars['timestamptz']['output']>;
  locale: Scalars['String']['output'];
  metadata?: Maybe<Scalars['jsonb']['output']>;
  newEmail?: Maybe<Scalars['citext']['output']>;
  otpHash?: Maybe<Scalars['String']['output']>;
  otpHashExpiresAt: Scalars['timestamptz']['output'];
  otpMethodLastUsed?: Maybe<Scalars['String']['output']>;
  /** An array relationship */
  outgoingFriendRequests: Array<Friend_Requests>;
  /** An aggregate relationship */
  outgoingFriendRequests_aggregate: Friend_Requests_Aggregate;
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
export type UsersFriendsArgs = {
  distinct_on?: InputMaybe<Array<Friends_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friends_Order_By>>;
  where?: InputMaybe<Friends_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersFriends_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Friends_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friends_Order_By>>;
  where?: InputMaybe<Friends_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersIncomingFriendRequestsArgs = {
  distinct_on?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Requests_Order_By>>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersIncomingFriendRequests_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Requests_Order_By>>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersItem_FavoritesArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersItem_Favorites_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersMetadataArgs = {
  path?: InputMaybe<Scalars['String']['input']>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersOutgoingFriendRequestsArgs = {
  distinct_on?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Requests_Order_By>>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
};


/** User account information. Don't modify its structure as Hasura Auth relies on it to function properly. */
export type UsersOutgoingFriendRequests_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Friend_Requests_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Friend_Requests_Order_By>>;
  where?: InputMaybe<Friend_Requests_Bool_Exp>;
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
  createdAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  currentChallenge?: InputMaybe<String_Comparison_Exp>;
  defaultRole?: InputMaybe<String_Comparison_Exp>;
  defaultRoleByRole?: InputMaybe<AuthRoles_Bool_Exp>;
  disabled?: InputMaybe<Boolean_Comparison_Exp>;
  displayName?: InputMaybe<String_Comparison_Exp>;
  email?: InputMaybe<Citext_Comparison_Exp>;
  emailVerified?: InputMaybe<Boolean_Comparison_Exp>;
  friends?: InputMaybe<Friends_Bool_Exp>;
  friends_aggregate?: InputMaybe<Friends_Aggregate_Bool_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  incomingFriendRequests?: InputMaybe<Friend_Requests_Bool_Exp>;
  incomingFriendRequests_aggregate?: InputMaybe<Friend_Requests_Aggregate_Bool_Exp>;
  isAnonymous?: InputMaybe<Boolean_Comparison_Exp>;
  item_favorites?: InputMaybe<Item_Favorites_Bool_Exp>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Bool_Exp>;
  lastSeen?: InputMaybe<Timestamptz_Comparison_Exp>;
  locale?: InputMaybe<String_Comparison_Exp>;
  metadata?: InputMaybe<Jsonb_Comparison_Exp>;
  newEmail?: InputMaybe<Citext_Comparison_Exp>;
  otpHash?: InputMaybe<String_Comparison_Exp>;
  otpHashExpiresAt?: InputMaybe<Timestamptz_Comparison_Exp>;
  otpMethodLastUsed?: InputMaybe<String_Comparison_Exp>;
  outgoingFriendRequests?: InputMaybe<Friend_Requests_Bool_Exp>;
  outgoingFriendRequests_aggregate?: InputMaybe<Friend_Requests_Aggregate_Bool_Exp>;
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
  createdAt?: InputMaybe<Scalars['timestamptz']['input']>;
  currentChallenge?: InputMaybe<Scalars['String']['input']>;
  defaultRole?: InputMaybe<Scalars['String']['input']>;
  defaultRoleByRole?: InputMaybe<AuthRoles_Obj_Rel_Insert_Input>;
  disabled?: InputMaybe<Scalars['Boolean']['input']>;
  displayName?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['citext']['input']>;
  emailVerified?: InputMaybe<Scalars['Boolean']['input']>;
  friends?: InputMaybe<Friends_Arr_Rel_Insert_Input>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  incomingFriendRequests?: InputMaybe<Friend_Requests_Arr_Rel_Insert_Input>;
  isAnonymous?: InputMaybe<Scalars['Boolean']['input']>;
  item_favorites?: InputMaybe<Item_Favorites_Arr_Rel_Insert_Input>;
  lastSeen?: InputMaybe<Scalars['timestamptz']['input']>;
  locale?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['jsonb']['input']>;
  newEmail?: InputMaybe<Scalars['citext']['input']>;
  otpHash?: InputMaybe<Scalars['String']['input']>;
  otpHashExpiresAt?: InputMaybe<Scalars['timestamptz']['input']>;
  otpMethodLastUsed?: InputMaybe<Scalars['String']['input']>;
  outgoingFriendRequests?: InputMaybe<Friend_Requests_Arr_Rel_Insert_Input>;
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
  createdAt?: InputMaybe<Order_By>;
  currentChallenge?: InputMaybe<Order_By>;
  defaultRole?: InputMaybe<Order_By>;
  defaultRoleByRole?: InputMaybe<AuthRoles_Order_By>;
  disabled?: InputMaybe<Order_By>;
  displayName?: InputMaybe<Order_By>;
  email?: InputMaybe<Order_By>;
  emailVerified?: InputMaybe<Order_By>;
  friends_aggregate?: InputMaybe<Friends_Aggregate_Order_By>;
  id?: InputMaybe<Order_By>;
  incomingFriendRequests_aggregate?: InputMaybe<Friend_Requests_Aggregate_Order_By>;
  isAnonymous?: InputMaybe<Order_By>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Order_By>;
  lastSeen?: InputMaybe<Order_By>;
  locale?: InputMaybe<Order_By>;
  metadata?: InputMaybe<Order_By>;
  newEmail?: InputMaybe<Order_By>;
  otpHash?: InputMaybe<Order_By>;
  otpHashExpiresAt?: InputMaybe<Order_By>;
  otpMethodLastUsed?: InputMaybe<Order_By>;
  outgoingFriendRequests_aggregate?: InputMaybe<Friend_Requests_Aggregate_Order_By>;
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

/** Boolean expression to compare columns of type "vector". All fields are combined with logical 'AND'. */
export type Vector_Comparison_Exp = {
  _eq?: InputMaybe<Scalars['vector']['input']>;
  _gt?: InputMaybe<Scalars['vector']['input']>;
  _gte?: InputMaybe<Scalars['vector']['input']>;
  _in?: InputMaybe<Array<Scalars['vector']['input']>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _lt?: InputMaybe<Scalars['vector']['input']>;
  _lte?: InputMaybe<Scalars['vector']['input']>;
  _neq?: InputMaybe<Scalars['vector']['input']>;
  _nin?: InputMaybe<Array<Scalars['vector']['input']>>;
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
  country?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  item_onboarding_id: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  special_designation?: Maybe<Scalars['String']['output']>;
  style?: Maybe<Scalars['String']['output']>;
  variety?: Maybe<Scalars['String']['output']>;
  vineyard_designation?: Maybe<Scalars['String']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
};

/** columns and relationships of "wine_style" */
export type Wine_Style = {
  __typename: 'wine_style';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "wine_style" */
export type Wine_Style_Aggregate = {
  __typename: 'wine_style_aggregate';
  aggregate?: Maybe<Wine_Style_Aggregate_Fields>;
  nodes: Array<Wine_Style>;
};

/** aggregate fields of "wine_style" */
export type Wine_Style_Aggregate_Fields = {
  __typename: 'wine_style_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Wine_Style_Max_Fields>;
  min?: Maybe<Wine_Style_Min_Fields>;
};


/** aggregate fields of "wine_style" */
export type Wine_Style_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Wine_Style_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "wine_style". All fields are combined with a logical 'AND'. */
export type Wine_Style_Bool_Exp = {
  _and?: InputMaybe<Array<Wine_Style_Bool_Exp>>;
  _not?: InputMaybe<Wine_Style_Bool_Exp>;
  _or?: InputMaybe<Array<Wine_Style_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "wine_style" */
export enum Wine_Style_Constraint {
  /** unique or primary key constraint on columns "text" */
  WineTypePkey = 'wine_type_pkey'
}

export enum Wine_Style_Enum {
  Dessert = 'DESSERT',
  Red = 'RED',
  Rose = 'ROSE',
  Sparkling = 'SPARKLING',
  White = 'WHITE'
}

/** Boolean expression to compare columns of type "wine_style_enum". All fields are combined with logical 'AND'. */
export type Wine_Style_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Wine_Style_Enum>;
  _in?: InputMaybe<Array<Wine_Style_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Wine_Style_Enum>;
  _nin?: InputMaybe<Array<Wine_Style_Enum>>;
};

/** input type for inserting data into table "wine_style" */
export type Wine_Style_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Wine_Style_Max_Fields = {
  __typename: 'wine_style_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Wine_Style_Min_Fields = {
  __typename: 'wine_style_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "wine_style" */
export type Wine_Style_Mutation_Response = {
  __typename: 'wine_style_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Wine_Style>;
};

/** on_conflict condition type for table "wine_style" */
export type Wine_Style_On_Conflict = {
  constraint: Wine_Style_Constraint;
  update_columns?: Array<Wine_Style_Update_Column>;
  where?: InputMaybe<Wine_Style_Bool_Exp>;
};

/** Ordering options when selecting data from "wine_style". */
export type Wine_Style_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: wine_style */
export type Wine_Style_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "wine_style" */
export enum Wine_Style_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "wine_style" */
export type Wine_Style_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "wine_style" */
export type Wine_Style_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Wine_Style_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Wine_Style_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "wine_style" */
export enum Wine_Style_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Wine_Style_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Wine_Style_Set_Input>;
  /** filter the rows which have to be updated */
  where: Wine_Style_Bool_Exp;
};

/** columns and relationships of "wine_variety" */
export type Wine_Variety = {
  __typename: 'wine_variety';
  comment?: Maybe<Scalars['String']['output']>;
  text: Scalars['String']['output'];
};

/** aggregated selection of "wine_variety" */
export type Wine_Variety_Aggregate = {
  __typename: 'wine_variety_aggregate';
  aggregate?: Maybe<Wine_Variety_Aggregate_Fields>;
  nodes: Array<Wine_Variety>;
};

/** aggregate fields of "wine_variety" */
export type Wine_Variety_Aggregate_Fields = {
  __typename: 'wine_variety_aggregate_fields';
  count: Scalars['Int']['output'];
  max?: Maybe<Wine_Variety_Max_Fields>;
  min?: Maybe<Wine_Variety_Min_Fields>;
};


/** aggregate fields of "wine_variety" */
export type Wine_Variety_Aggregate_FieldsCountArgs = {
  columns?: InputMaybe<Array<Wine_Variety_Select_Column>>;
  distinct?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Boolean expression to filter rows from the table "wine_variety". All fields are combined with a logical 'AND'. */
export type Wine_Variety_Bool_Exp = {
  _and?: InputMaybe<Array<Wine_Variety_Bool_Exp>>;
  _not?: InputMaybe<Wine_Variety_Bool_Exp>;
  _or?: InputMaybe<Array<Wine_Variety_Bool_Exp>>;
  comment?: InputMaybe<String_Comparison_Exp>;
  text?: InputMaybe<String_Comparison_Exp>;
};

/** unique or primary key constraints on table "wine_variety" */
export enum Wine_Variety_Constraint {
  /** unique or primary key constraint on columns "text" */
  WineVarietyPkey = 'wine_variety_pkey'
}

export enum Wine_Variety_Enum {
  Aglianico = 'AGLIANICO',
  AlbarinoAlvarinho = 'ALBARINO_ALVARINHO',
  Arneis = 'ARNEIS',
  Asti = 'ASTI',
  Barbera = 'BARBERA',
  Blaufrankisch = 'BLAUFRANKISCH',
  Blend = 'BLEND',
  CabernetFranc = 'CABERNET_FRANC',
  CabernetSauvignon = 'CABERNET_SAUVIGNON',
  Carignan = 'CARIGNAN',
  Carmenere = 'CARMENERE',
  Cava = 'CAVA',
  Champagne = 'CHAMPAGNE',
  Chardonnay = 'CHARDONNAY',
  CheninBlanc = 'CHENIN_BLANC',
  Cinsault = 'CINSAULT',
  Corvina = 'CORVINA',
  Cremant = 'CREMANT',
  Dolcetto = 'DOLCETTO',
  Furmint = 'FURMINT',
  Gamay = 'GAMAY',
  Garganega = 'GARGANEGA',
  Gewurztraminer = 'GEWURZTRAMINER',
  Grenache = 'GRENACHE',
  GrunerVeltliner = 'GRUNER_VELTLINER',
  Lambrusco = 'LAMBRUSCO',
  Malbec = 'MALBEC',
  Malvasia = 'MALVASIA',
  Marsanne = 'MARSANNE',
  Merlot = 'MERLOT',
  MourvedreMonastrell = 'MOURVEDRE_MONASTRELL',
  MullerThurgau = 'MULLER_THURGAU',
  Muscadet = 'MUSCADET',
  Nebbiolo = 'NEBBIOLO',
  PetiteSirah = 'PETITE_SIRAH',
  PetitVerdot = 'PETIT_VERDOT',
  Pinotage = 'PINOTAGE',
  PinotBlanc = 'PINOT_BLANC',
  PinotGrigioPinotGris = 'PINOT_GRIGIO_PINOT_GRIS',
  PinotNoir = 'PINOT_NOIR',
  Primitivo = 'PRIMITIVO',
  Prosecco = 'PROSECCO',
  RedBlend = 'RED_BLEND',
  RhoneBlends = 'RHONE_BLENDS',
  Riesling = 'RIESLING',
  Roussanne = 'ROUSSANNE',
  Sangiovese = 'SANGIOVESE',
  SauvignonBlanc = 'SAUVIGNON_BLANC',
  Semillon = 'SEMILLON',
  SyrahShiraz = 'SYRAH_SHIRAZ',
  Tempranillo = 'TEMPRANILLO',
  Torrontes = 'TORRONTES',
  Verdejo = 'VERDEJO',
  Viognier = 'VIOGNIER',
  Zinfandel = 'ZINFANDEL'
}

/** Boolean expression to compare columns of type "wine_variety_enum". All fields are combined with logical 'AND'. */
export type Wine_Variety_Enum_Comparison_Exp = {
  _eq?: InputMaybe<Wine_Variety_Enum>;
  _in?: InputMaybe<Array<Wine_Variety_Enum>>;
  _is_null?: InputMaybe<Scalars['Boolean']['input']>;
  _neq?: InputMaybe<Wine_Variety_Enum>;
  _nin?: InputMaybe<Array<Wine_Variety_Enum>>;
};

/** input type for inserting data into table "wine_variety" */
export type Wine_Variety_Insert_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** aggregate max on columns */
export type Wine_Variety_Max_Fields = {
  __typename: 'wine_variety_max_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** aggregate min on columns */
export type Wine_Variety_Min_Fields = {
  __typename: 'wine_variety_min_fields';
  comment?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

/** response of any mutation on the table "wine_variety" */
export type Wine_Variety_Mutation_Response = {
  __typename: 'wine_variety_mutation_response';
  /** number of rows affected by the mutation */
  affected_rows: Scalars['Int']['output'];
  /** data from the rows affected by the mutation */
  returning: Array<Wine_Variety>;
};

/** on_conflict condition type for table "wine_variety" */
export type Wine_Variety_On_Conflict = {
  constraint: Wine_Variety_Constraint;
  update_columns?: Array<Wine_Variety_Update_Column>;
  where?: InputMaybe<Wine_Variety_Bool_Exp>;
};

/** Ordering options when selecting data from "wine_variety". */
export type Wine_Variety_Order_By = {
  comment?: InputMaybe<Order_By>;
  text?: InputMaybe<Order_By>;
};

/** primary key columns input for table: wine_variety */
export type Wine_Variety_Pk_Columns_Input = {
  text: Scalars['String']['input'];
};

/** select columns of table "wine_variety" */
export enum Wine_Variety_Select_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

/** input type for updating data in table "wine_variety" */
export type Wine_Variety_Set_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** Streaming cursor of the table "wine_variety" */
export type Wine_Variety_Stream_Cursor_Input = {
  /** Stream column input with initial value */
  initial_value: Wine_Variety_Stream_Cursor_Value_Input;
  /** cursor ordering */
  ordering?: InputMaybe<Cursor_Ordering>;
};

/** Initial value of the column from where the streaming should start */
export type Wine_Variety_Stream_Cursor_Value_Input = {
  comment?: InputMaybe<Scalars['String']['input']>;
  text?: InputMaybe<Scalars['String']['input']>;
};

/** update columns of table "wine_variety" */
export enum Wine_Variety_Update_Column {
  /** column name */
  Comment = 'comment',
  /** column name */
  Text = 'text'
}

export type Wine_Variety_Updates = {
  /** sets the columns of the filtered rows to the given values */
  _set?: InputMaybe<Wine_Variety_Set_Input>;
  /** filter the rows which have to be updated */
  where: Wine_Variety_Bool_Exp;
};

/** columns and relationships of "wines" */
export type Wines = {
  __typename: 'wines';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  /** An object relationship */
  barcode?: Maybe<Barcodes>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  /** An array relationship */
  cellar_items: Array<Cellar_Items>;
  /** An aggregate relationship */
  cellar_items_aggregate: Cellar_Items_Aggregate;
  country?: Maybe<Country_Enum>;
  /** An object relationship */
  createdBy: Users;
  created_at: Scalars['timestamptz']['output'];
  created_by_id: Scalars['uuid']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['uuid']['output'];
  /** An array relationship */
  item_favorites: Array<Item_Favorites>;
  /** An aggregate relationship */
  item_favorites_aggregate: Item_Favorites_Aggregate;
  /** An array relationship */
  item_images: Array<Item_Image>;
  /** An aggregate relationship */
  item_images_aggregate: Item_Image_Aggregate;
  item_onboarding_id: Scalars['uuid']['output'];
  /** An array relationship */
  item_vectors: Array<Item_Vectors>;
  /** An aggregate relationship */
  item_vectors_aggregate: Item_Vectors_Aggregate;
  name: Scalars['String']['output'];
  region?: Maybe<Scalars['String']['output']>;
  /** An array relationship */
  reviews: Array<Item_Reviews>;
  /** An aggregate relationship */
  reviews_aggregate: Item_Reviews_Aggregate;
  special_designation?: Maybe<Scalars['String']['output']>;
  style: Wine_Style_Enum;
  updated_at: Scalars['timestamptz']['output'];
  variety?: Maybe<Wine_Variety_Enum>;
  vineyard_designation?: Maybe<Scalars['String']['output']>;
  vintage: Scalars['date']['output'];
  winery_id?: Maybe<Scalars['uuid']['output']>;
};


/** columns and relationships of "wines" */
export type WinesCellar_ItemsArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


/** columns and relationships of "wines" */
export type WinesCellar_Items_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Cellar_Items_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Cellar_Items_Order_By>>;
  where?: InputMaybe<Cellar_Items_Bool_Exp>;
};


/** columns and relationships of "wines" */
export type WinesItem_FavoritesArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** columns and relationships of "wines" */
export type WinesItem_Favorites_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Favorites_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Favorites_Order_By>>;
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
};


/** columns and relationships of "wines" */
export type WinesItem_ImagesArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


/** columns and relationships of "wines" */
export type WinesItem_Images_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Image_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Image_Order_By>>;
  where?: InputMaybe<Item_Image_Bool_Exp>;
};


/** columns and relationships of "wines" */
export type WinesItem_VectorsArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


/** columns and relationships of "wines" */
export type WinesItem_Vectors_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Vectors_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Vectors_Order_By>>;
  where?: InputMaybe<Item_Vectors_Bool_Exp>;
};


/** columns and relationships of "wines" */
export type WinesReviewsArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
};


/** columns and relationships of "wines" */
export type WinesReviews_AggregateArgs = {
  distinct_on?: InputMaybe<Array<Item_Reviews_Select_Column>>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order_by?: InputMaybe<Array<Item_Reviews_Order_By>>;
  where?: InputMaybe<Item_Reviews_Bool_Exp>;
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
};

/** order by avg() on columns of table "wines" */
export type Wines_Avg_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** Boolean expression to filter rows from the table "wines". All fields are combined with a logical 'AND'. */
export type Wines_Bool_Exp = {
  _and?: InputMaybe<Array<Wines_Bool_Exp>>;
  _not?: InputMaybe<Wines_Bool_Exp>;
  _or?: InputMaybe<Array<Wines_Bool_Exp>>;
  alcohol_content_percentage?: InputMaybe<Numeric_Comparison_Exp>;
  barcode?: InputMaybe<Barcodes_Bool_Exp>;
  barcode_code?: InputMaybe<String_Comparison_Exp>;
  cellar_items?: InputMaybe<Cellar_Items_Bool_Exp>;
  cellar_items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Bool_Exp>;
  country?: InputMaybe<Country_Enum_Comparison_Exp>;
  createdBy?: InputMaybe<Users_Bool_Exp>;
  created_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  created_by_id?: InputMaybe<Uuid_Comparison_Exp>;
  description?: InputMaybe<String_Comparison_Exp>;
  id?: InputMaybe<Uuid_Comparison_Exp>;
  item_favorites?: InputMaybe<Item_Favorites_Bool_Exp>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Bool_Exp>;
  item_images?: InputMaybe<Item_Image_Bool_Exp>;
  item_images_aggregate?: InputMaybe<Item_Image_Aggregate_Bool_Exp>;
  item_onboarding_id?: InputMaybe<Uuid_Comparison_Exp>;
  item_vectors?: InputMaybe<Item_Vectors_Bool_Exp>;
  item_vectors_aggregate?: InputMaybe<Item_Vectors_Aggregate_Bool_Exp>;
  name?: InputMaybe<String_Comparison_Exp>;
  region?: InputMaybe<String_Comparison_Exp>;
  reviews?: InputMaybe<Item_Reviews_Bool_Exp>;
  reviews_aggregate?: InputMaybe<Item_Reviews_Aggregate_Bool_Exp>;
  special_designation?: InputMaybe<String_Comparison_Exp>;
  style?: InputMaybe<Wine_Style_Enum_Comparison_Exp>;
  updated_at?: InputMaybe<Timestamptz_Comparison_Exp>;
  variety?: InputMaybe<Wine_Variety_Enum_Comparison_Exp>;
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
};

/** input type for inserting data into table "wines" */
export type Wines_Insert_Input = {
  alcohol_content_percentage?: InputMaybe<Scalars['numeric']['input']>;
  barcode?: InputMaybe<Barcodes_Obj_Rel_Insert_Input>;
  barcode_code?: InputMaybe<Scalars['String']['input']>;
  cellar_items?: InputMaybe<Cellar_Items_Arr_Rel_Insert_Input>;
  country?: InputMaybe<Country_Enum>;
  createdBy?: InputMaybe<Users_Obj_Rel_Insert_Input>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_favorites?: InputMaybe<Item_Favorites_Arr_Rel_Insert_Input>;
  item_images?: InputMaybe<Item_Image_Arr_Rel_Insert_Input>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  item_vectors?: InputMaybe<Item_Vectors_Arr_Rel_Insert_Input>;
  name?: InputMaybe<Scalars['String']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  reviews?: InputMaybe<Item_Reviews_Arr_Rel_Insert_Input>;
  special_designation?: InputMaybe<Scalars['String']['input']>;
  style?: InputMaybe<Wine_Style_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  variety?: InputMaybe<Wine_Variety_Enum>;
  vineyard_designation?: InputMaybe<Scalars['String']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
  winery_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate max on columns */
export type Wines_Max_Fields = {
  __typename: 'wines_max_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  item_onboarding_id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  special_designation?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vineyard_designation?: Maybe<Scalars['String']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
  winery_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by max() on columns of table "wines" */
export type Wines_Max_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  region?: InputMaybe<Order_By>;
  special_designation?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
  vineyard_designation?: InputMaybe<Order_By>;
  vintage?: InputMaybe<Order_By>;
  winery_id?: InputMaybe<Order_By>;
};

/** aggregate min on columns */
export type Wines_Min_Fields = {
  __typename: 'wines_min_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
  barcode_code?: Maybe<Scalars['String']['output']>;
  created_at?: Maybe<Scalars['timestamptz']['output']>;
  created_by_id?: Maybe<Scalars['uuid']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['uuid']['output']>;
  item_onboarding_id?: Maybe<Scalars['uuid']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  region?: Maybe<Scalars['String']['output']>;
  special_designation?: Maybe<Scalars['String']['output']>;
  updated_at?: Maybe<Scalars['timestamptz']['output']>;
  vineyard_designation?: Maybe<Scalars['String']['output']>;
  vintage?: Maybe<Scalars['date']['output']>;
  winery_id?: Maybe<Scalars['uuid']['output']>;
};

/** order by min() on columns of table "wines" */
export type Wines_Min_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
  barcode_code?: InputMaybe<Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  name?: InputMaybe<Order_By>;
  region?: InputMaybe<Order_By>;
  special_designation?: InputMaybe<Order_By>;
  updated_at?: InputMaybe<Order_By>;
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

/** input type for inserting object relation for remote table "wines" */
export type Wines_Obj_Rel_Insert_Input = {
  data: Wines_Insert_Input;
  /** upsert condition */
  on_conflict?: InputMaybe<Wines_On_Conflict>;
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
  cellar_items_aggregate?: InputMaybe<Cellar_Items_Aggregate_Order_By>;
  country?: InputMaybe<Order_By>;
  createdBy?: InputMaybe<Users_Order_By>;
  created_at?: InputMaybe<Order_By>;
  created_by_id?: InputMaybe<Order_By>;
  description?: InputMaybe<Order_By>;
  id?: InputMaybe<Order_By>;
  item_favorites_aggregate?: InputMaybe<Item_Favorites_Aggregate_Order_By>;
  item_images_aggregate?: InputMaybe<Item_Image_Aggregate_Order_By>;
  item_onboarding_id?: InputMaybe<Order_By>;
  item_vectors_aggregate?: InputMaybe<Item_Vectors_Aggregate_Order_By>;
  name?: InputMaybe<Order_By>;
  region?: InputMaybe<Order_By>;
  reviews_aggregate?: InputMaybe<Item_Reviews_Aggregate_Order_By>;
  special_designation?: InputMaybe<Order_By>;
  style?: InputMaybe<Order_By>;
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
  Country = 'country',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  ItemOnboardingId = 'item_onboarding_id',
  /** column name */
  Name = 'name',
  /** column name */
  Region = 'region',
  /** column name */
  SpecialDesignation = 'special_designation',
  /** column name */
  Style = 'style',
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
  country?: InputMaybe<Country_Enum>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  special_designation?: InputMaybe<Scalars['String']['input']>;
  style?: InputMaybe<Wine_Style_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  variety?: InputMaybe<Wine_Variety_Enum>;
  vineyard_designation?: InputMaybe<Scalars['String']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
  winery_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate stddev on columns */
export type Wines_Stddev_Fields = {
  __typename: 'wines_stddev_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev() on columns of table "wines" */
export type Wines_Stddev_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** aggregate stddev_pop on columns */
export type Wines_Stddev_Pop_Fields = {
  __typename: 'wines_stddev_pop_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_pop() on columns of table "wines" */
export type Wines_Stddev_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** aggregate stddev_samp on columns */
export type Wines_Stddev_Samp_Fields = {
  __typename: 'wines_stddev_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by stddev_samp() on columns of table "wines" */
export type Wines_Stddev_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
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
  country?: InputMaybe<Country_Enum>;
  created_at?: InputMaybe<Scalars['timestamptz']['input']>;
  created_by_id?: InputMaybe<Scalars['uuid']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['uuid']['input']>;
  item_onboarding_id?: InputMaybe<Scalars['uuid']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  special_designation?: InputMaybe<Scalars['String']['input']>;
  style?: InputMaybe<Wine_Style_Enum>;
  updated_at?: InputMaybe<Scalars['timestamptz']['input']>;
  variety?: InputMaybe<Wine_Variety_Enum>;
  vineyard_designation?: InputMaybe<Scalars['String']['input']>;
  vintage?: InputMaybe<Scalars['date']['input']>;
  winery_id?: InputMaybe<Scalars['uuid']['input']>;
};

/** aggregate sum on columns */
export type Wines_Sum_Fields = {
  __typename: 'wines_sum_fields';
  alcohol_content_percentage?: Maybe<Scalars['numeric']['output']>;
};

/** order by sum() on columns of table "wines" */
export type Wines_Sum_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** update columns of table "wines" */
export enum Wines_Update_Column {
  /** column name */
  AlcoholContentPercentage = 'alcohol_content_percentage',
  /** column name */
  BarcodeCode = 'barcode_code',
  /** column name */
  Country = 'country',
  /** column name */
  CreatedAt = 'created_at',
  /** column name */
  CreatedById = 'created_by_id',
  /** column name */
  Description = 'description',
  /** column name */
  Id = 'id',
  /** column name */
  ItemOnboardingId = 'item_onboarding_id',
  /** column name */
  Name = 'name',
  /** column name */
  Region = 'region',
  /** column name */
  SpecialDesignation = 'special_designation',
  /** column name */
  Style = 'style',
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
};

/** order by var_pop() on columns of table "wines" */
export type Wines_Var_Pop_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** aggregate var_samp on columns */
export type Wines_Var_Samp_Fields = {
  __typename: 'wines_var_samp_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by var_samp() on columns of table "wines" */
export type Wines_Var_Samp_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

/** aggregate variance on columns */
export type Wines_Variance_Fields = {
  __typename: 'wines_variance_fields';
  alcohol_content_percentage?: Maybe<Scalars['Float']['output']>;
};

/** order by variance() on columns of table "wines" */
export type Wines_Variance_Order_By = {
  alcohol_content_percentage?: InputMaybe<Order_By>;
};

export type GetCredentialQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type GetCredentialQuery = { __typename: 'query_root', admin_credentials_by_pk?: { __typename: 'admin_credentials', id: string, credentials: any } | null };

export type GetFileQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type GetFileQuery = { __typename: 'query_root', file?: { __typename: 'files', id: string, mimeType?: string | null, size?: number | null, bucket: { __typename: 'buckets', id: string } } | null };

export type AddTextExtractionResultsMutationVariables = Exact<{
  analysis: Image_Analysis_Insert_Input;
}>;


export type AddTextExtractionResultsMutation = { __typename: 'mutation_root', insert_image_analysis_one?: { __typename: 'image_analysis', id: number } | null };

export type InsertFriendsMutationVariables = Exact<{
  friends: Array<Friends_Insert_Input> | Friends_Insert_Input;
  requestId: Scalars['uuid']['input'];
}>;


export type InsertFriendsMutation = { __typename: 'mutation_root', insert_friends?: { __typename: 'friends_mutation_response', affected_rows: number } | null, delete_friend_requests_by_pk?: { __typename: 'friend_requests', id: string } | null };

export type InsertVectorMutationVariables = Exact<{
  vector: Item_Vectors_Insert_Input;
}>;


export type InsertVectorMutation = { __typename: 'mutation_root', insert_item_vectors_one?: { __typename: 'item_vectors', id: number } | null };

export type DeleteVectorsMutationVariables = Exact<{
  where: Item_Vectors_Bool_Exp;
}>;


export type DeleteVectorsMutation = { __typename: 'mutation_root', delete_item_vectors?: { __typename: 'item_vectors_mutation_response', affected_rows: number } | null };

export type UpdateItemImageMutationVariables = Exact<{
  itemId: Scalars['uuid']['input'];
  item: Item_Image_Set_Input;
}>;


export type UpdateItemImageMutation = { __typename: 'mutation_root', update_item_image_by_pk?: { __typename: 'item_image', id: string } | null };

export type AddItemOnboardingMutationVariables = Exact<{
  onboarding: Item_Onboardings_Insert_Input;
}>;


export type AddItemOnboardingMutation = { __typename: 'mutation_root', insert_item_onboardings_one?: { __typename: 'item_onboardings', id: string } | null };

export type InsertItemImageMutationVariables = Exact<{
  item: Item_Image_Insert_Input;
}>;


export type InsertItemImageMutation = { __typename: 'mutation_root', insert_item_image_one?: { __typename: 'item_image', id: string } | null };

export type AddItemImageMutationVariables = Exact<{
  input: Item_Image_Upload_Input;
}>;


export type AddItemImageMutation = { __typename: 'mutation_root', item_image_upload?: { __typename: 'item_image_upload_result', id: string } | null };

export type AddCellarItemMutationVariables = Exact<{
  item: Cellar_Items_Insert_Input;
}>;


export type AddCellarItemMutation = { __typename: 'mutation_root', insert_cellar_items_one?: { __typename: 'cellar_items', id: string, cellar_id: string } | null };

export type AddBeerMutationVariables = Exact<{
  beer: Beers_Insert_Input;
}>;


export type AddBeerMutation = { __typename: 'mutation_root', insert_beers_one?: { __typename: 'beers', id: string } | null };

export type UpdateBeerMutationVariables = Exact<{
  beerId: Scalars['uuid']['input'];
  beer: Beers_Set_Input;
}>;


export type UpdateBeerMutation = { __typename: 'mutation_root', update_beers_by_pk?: { __typename: 'beers', id: string } | null };

export type AddCoffeeMutationVariables = Exact<{
  coffee: Coffees_Insert_Input;
}>;


export type AddCoffeeMutation = { __typename: 'mutation_root', insert_coffees_one?: { __typename: 'coffees', id: string } | null };

export type UpdateCoffeeMutationVariables = Exact<{
  coffeeId: Scalars['uuid']['input'];
  coffee: Coffees_Set_Input;
}>;


export type UpdateCoffeeMutation = { __typename: 'mutation_root', update_coffees_by_pk?: { __typename: 'coffees', id: string } | null };

export type UpdateCellarItemMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
  item: Cellar_Items_Set_Input;
}>;


export type UpdateCellarItemMutation = { __typename: 'mutation_root', update_cellar_items_by_pk?: { __typename: 'cellar_items', id: string } | null };

export type AddWineMutationVariables = Exact<{
  wine: Wines_Insert_Input;
}>;


export type AddWineMutation = { __typename: 'mutation_root', insert_wines_one?: { __typename: 'wines', id: string } | null };

export type UpdateWineMutationVariables = Exact<{
  wineId: Scalars['uuid']['input'];
  wine: Wines_Set_Input;
}>;


export type UpdateWineMutation = { __typename: 'mutation_root', update_wines_by_pk?: { __typename: 'wines', id: string } | null };

export type AddSpiritMutationVariables = Exact<{
  spirit: Spirits_Insert_Input;
}>;


export type AddSpiritMutation = { __typename: 'mutation_root', insert_spirits_one?: { __typename: 'spirits', id: string } | null };

export type UpdateSpiritMutationVariables = Exact<{
  spiritId: Scalars['uuid']['input'];
  spirit: Spirits_Set_Input;
}>;


export type UpdateSpiritMutation = { __typename: 'mutation_root', update_spirits_by_pk?: { __typename: 'spirits', id: string } | null };

export type AddItemReviewMutationVariables = Exact<{
  review: Item_Reviews_Insert_Input;
}>;


export type AddItemReviewMutation = { __typename: 'mutation_root', insert_item_reviews_one?: { __typename: 'item_reviews', id: string, beer?: { __typename: 'beers', id: string } | null, wine?: { __typename: 'wines', id: string } | null, spirit?: { __typename: 'spirits', id: string } | null } | null };

export type AddCheckInMutationVariables = Exact<{
  checkIn: Check_Ins_Insert_Input;
}>;


export type AddCheckInMutation = { __typename: 'mutation_root', insert_check_ins_one?: { __typename: 'check_ins', id: string, cellar_item: { __typename: 'cellar_items', id: string } } | null };

export type AddCheckInsMutationVariables = Exact<{
  checkIns: Array<Check_Ins_Insert_Input> | Check_Ins_Insert_Input;
}>;


export type AddCheckInsMutation = { __typename: 'mutation_root', insert_check_ins?: { __typename: 'check_ins_mutation_response', affected_rows: number, returning: Array<{ __typename: 'check_ins', id: string, cellar_item: { __typename: 'cellar_items', id: string } }> } | null };

export type GetSearchVectorQueryQueryVariables = Exact<{
  text?: InputMaybe<Scalars['String']['input']>;
  image?: InputMaybe<Scalars['String']['input']>;
}>;


export type GetSearchVectorQueryQuery = { __typename: 'query_root', create_search_vector: string };

export type AddFavoriteMutationMutationVariables = Exact<{
  object: Item_Favorites_Insert_Input;
}>;


export type AddFavoriteMutationMutation = { __typename: 'mutation_root', insert_item_favorites_one?: { __typename: 'item_favorites', id: string, beer?: { __typename: 'beers', id: string } | null, wine?: { __typename: 'wines', id: string } | null, spirit?: { __typename: 'spirits', id: string } | null, coffee?: { __typename: 'coffees', id: string } | null } | null };

export type DeleteFavoriteMutationMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type DeleteFavoriteMutationMutation = { __typename: 'mutation_root', delete_item_favorites_by_pk?: { __typename: 'item_favorites', id: string } | null };

export type GetBeerPageQueryQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type GetBeerPageQueryQuery = { __typename: 'query_root', beers_by_pk?: { __typename: 'beers', id: string, name: string, created_by_id: string, style?: Beer_Style_Enum | null, vintage?: string | null, description?: string | null, alcohol_content_percentage?: any | null, country?: Country_Enum | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, reviews: Array<{ __typename: 'item_reviews', id: string, score: number, text?: string | null, createdAt: string, user: { __typename: 'users', avatarUrl: string, displayName: string } }>, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, cellar_items: Array<{ __typename: 'cellar_items', cellar: { __typename: 'cellars', id: string, name: string, createdBy: { __typename: 'users', id: string, displayName: string, avatarUrl: string }, co_owners: Array<{ __typename: 'cellar_owners', user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } }> } | null, cellars: Array<{ __typename: 'cellars', id: string, name: string }> };

export type EditBeerPageQueryQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
}>;


export type EditBeerPageQueryQuery = { __typename: 'query_root', beers_by_pk?: { __typename: 'beers', id: string, name: string, created_by_id: string, vintage?: string | null, style?: Beer_Style_Enum | null, description?: string | null, alcohol_content_percentage?: any | null, barcode_code?: string | null, international_bitterness_unit?: number | null, country?: Country_Enum | null } | null };

export type GetCellarBeerQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type GetCellarBeerQuery = { __typename: 'query_root', cellar_items_by_pk?: { __typename: 'cellar_items', id: string, open_at?: string | null, empty_at?: string | null, percentage_remaining: any, beer?: { __typename: 'beers', id: string, name: string, created_by_id: string, vintage?: string | null, style?: Beer_Style_Enum | null, description?: string | null, alcohol_content_percentage?: any | null, country?: Country_Enum | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, reviews: Array<{ __typename: 'item_reviews', id: string, score: number, text?: string | null, createdAt: string, user: { __typename: 'users', avatarUrl: string, displayName: string } }> } | null, display_image?: { __typename: 'item_image', file_id: string, placeholder?: string | null } | null, cellar: { __typename: 'cellars', name: string, created_by_id: string, co_owners: Array<{ __typename: 'cellar_owners', user_id: string }> }, check_ins: Array<{ __typename: 'check_ins', id: string, createdAt: string, user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null, user?: { __typename: 'users', id: string, displayName: string, avatarUrl: string, friends: Array<{ __typename: 'friends', friend: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null };

export type EditCoffeePageQueryQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
}>;


export type EditCoffeePageQueryQuery = { __typename: 'query_root', coffees_by_pk?: { __typename: 'coffees', id: string, name: string, created_by_id: string, description: string, barcode_code?: string | null, country?: Country_Enum | null } | null };

export type GetCellarCoffeeQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type GetCellarCoffeeQuery = { __typename: 'query_root', cellar_items_by_pk?: { __typename: 'cellar_items', id: string, open_at?: string | null, empty_at?: string | null, percentage_remaining: any, coffee?: { __typename: 'coffees', id: string, name: string, created_by_id: string, description: string, country?: Country_Enum | null, process?: Coffee_Process_Enum | null, roast_level?: Coffee_Roast_Level_Enum | null, species?: Coffee_Species_Enum | null, cultivar?: Coffee_Cultivar_Enum | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, reviews: Array<{ __typename: 'item_reviews', id: string, score: number, text?: string | null, createdAt: string, user: { __typename: 'users', avatarUrl: string, displayName: string } }> } | null, display_image?: { __typename: 'item_image', file_id: string, placeholder?: string | null } | null, cellar: { __typename: 'cellars', name: string, created_by_id: string, co_owners: Array<{ __typename: 'cellar_owners', user_id: string }> }, check_ins: Array<{ __typename: 'check_ins', id: string, createdAt: string, user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null, user?: { __typename: 'users', id: string, displayName: string, avatarUrl: string, friends: Array<{ __typename: 'friends', friend: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null };

export type EditCellarQueryQueryVariables = Exact<{
  id: Scalars['uuid']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type EditCellarQueryQuery = { __typename: 'query_root', cellars_by_pk?: { __typename: 'cellars', id: string, name: string, privacy: Permission_Type_Enum, created_by_id: string, co_owners: Array<{ __typename: 'cellar_owners', user_id: string }> } | null, user?: { __typename: 'users', id: string, displayName: string, avatarUrl: string, friends: Array<{ __typename: 'friends', friend: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null };

export type GetCellarQueryVariables = Exact<{
  cellarId: Scalars['uuid']['input'];
}>;


export type GetCellarQuery = { __typename: 'query_root', cellars_by_pk?: { __typename: 'cellars', id: string, name: string, created_by_id: string, co_owners: Array<{ __typename: 'cellar_owners', user_id: string }> } | null };

export type GetCellarItemsQueryQueryVariables = Exact<{
  cellarId: Scalars['uuid']['input'];
  itemsWhereClause?: InputMaybe<Cellar_Items_Bool_Exp>;
  search?: InputMaybe<Scalars['vector']['input']>;
  userId: Scalars['uuid']['input'];
}>;


export type GetCellarItemsQueryQuery = { __typename: 'query_root', cellars_by_pk?: { __typename: 'cellars', id: string, name: string, created_by_id: string, co_owners: Array<{ __typename: 'cellar_owners', user_id: string }>, item_counts: { __typename: 'cellar_items_aggregate', beers?: { __typename: 'cellar_items_aggregate_fields', count: number } | null, wines?: { __typename: 'cellar_items_aggregate_fields', count: number } | null, spirits?: { __typename: 'cellar_items_aggregate_fields', count: number } | null, coffees?: { __typename: 'cellar_items_aggregate_fields', count: number } | null }, items: Array<{ __typename: 'cellar_items', id: string, type: Item_Type_Enum, display_image?: { __typename: 'item_image', file_id: string, placeholder?: string | null } | null, beer?: { __typename: 'beers', id: string, name: string, vintage?: string | null, item_vectors: Array<{ __typename: 'item_vectors', distance?: number | null }>, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, wine?: { __typename: 'wines', id: string, name: string, vintage: string, item_vectors: Array<{ __typename: 'item_vectors', distance?: number | null }>, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, spirit?: { __typename: 'spirits', id: string, name: string, vintage?: string | null, item_vectors: Array<{ __typename: 'item_vectors', distance?: number | null }>, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, coffee?: { __typename: 'coffees', id: string, name: string, item_vectors: Array<{ __typename: 'item_vectors', distance?: number | null }>, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null }> } | null };

export type EditSpiritPageQueryQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
}>;


export type EditSpiritPageQueryQuery = { __typename: 'query_root', spirits_by_pk?: { __typename: 'spirits', id: string, name: string, created_by_id: string, vintage?: string | null, type: Spirit_Type_Enum, style?: string | null, description?: string | null, alcohol_content_percentage?: any | null, barcode_code?: string | null, country?: Country_Enum | null } | null };

export type GetSpiritQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type GetSpiritQuery = { __typename: 'query_root', cellar_items_by_pk?: { __typename: 'cellar_items', id: string, open_at?: string | null, empty_at?: string | null, percentage_remaining: any, spirit?: { __typename: 'spirits', id: string, name: string, created_by_id: string, vintage?: string | null, type: Spirit_Type_Enum, description?: string | null, alcohol_content_percentage?: any | null, style?: string | null, country?: Country_Enum | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, reviews: Array<{ __typename: 'item_reviews', id: string, score: number, text?: string | null, createdAt: string, user: { __typename: 'users', avatarUrl: string, displayName: string } }> } | null, display_image?: { __typename: 'item_image', file_id: string, placeholder?: string | null } | null, cellar: { __typename: 'cellars', name: string, created_by_id: string, co_owners: Array<{ __typename: 'cellar_owners', user_id: string }> }, check_ins: Array<{ __typename: 'check_ins', id: string, createdAt: string, user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null, user?: { __typename: 'users', id: string, displayName: string, avatarUrl: string, friends: Array<{ __typename: 'friends', friend: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null };

export type EditWinePageQueryQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
}>;


export type EditWinePageQueryQuery = { __typename: 'query_root', wines_by_pk?: { __typename: 'wines', id: string, name: string, description?: string | null, created_by_id: string, vintage: string, alcohol_content_percentage?: any | null, barcode_code?: string | null, special_designation?: string | null, vineyard_designation?: string | null, variety?: Wine_Variety_Enum | null, region?: string | null, style: Wine_Style_Enum, country?: Country_Enum | null } | null };

export type GetCellarWineQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type GetCellarWineQuery = { __typename: 'query_root', cellar_items_by_pk?: { __typename: 'cellar_items', id: string, open_at?: string | null, empty_at?: string | null, percentage_remaining: any, wine?: { __typename: 'wines', id: string, name: string, created_by_id: string, region?: string | null, variety?: Wine_Variety_Enum | null, vintage: string, style: Wine_Style_Enum, country?: Country_Enum | null, description?: string | null, barcode_code?: string | null, alcohol_content_percentage?: any | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, reviews: Array<{ __typename: 'item_reviews', id: string, score: number, text?: string | null, createdAt: string, user: { __typename: 'users', avatarUrl: string, displayName: string } }> } | null, display_image?: { __typename: 'item_image', file_id: string, placeholder?: string | null } | null, cellar: { __typename: 'cellars', name: string, created_by_id: string, co_owners: Array<{ __typename: 'cellar_owners', user_id: string }> }, check_ins: Array<{ __typename: 'check_ins', id: string, createdAt: string, user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null, user?: { __typename: 'users', id: string, displayName: string, avatarUrl: string, friends: Array<{ __typename: 'friends', friend: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null };

export type AddCellarQueryQueryVariables = Exact<{
  userId: Scalars['uuid']['input'];
}>;


export type AddCellarQueryQuery = { __typename: 'query_root', user?: { __typename: 'users', friends: Array<{ __typename: 'friends', friend: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null };

export type GetCellarsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetCellarsQuery = { __typename: 'query_root', cellars: Array<{ __typename: 'cellars', id: string, name: string, createdBy: { __typename: 'users', id: string, displayName: string, avatarUrl: string }, coOwners: Array<{ __typename: 'cellar_owners', user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> }> };

export type GetCoffeePageQueryQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type GetCoffeePageQueryQuery = { __typename: 'query_root', coffees_by_pk?: { __typename: 'coffees', id: string, name: string, created_by_id: string, description: string, country?: Country_Enum | null, process?: Coffee_Process_Enum | null, roast_level?: Coffee_Roast_Level_Enum | null, species?: Coffee_Species_Enum | null, cultivar?: Coffee_Cultivar_Enum | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, reviews: Array<{ __typename: 'item_reviews', id: string, score: number, text?: string | null, createdAt: string, user: { __typename: 'users', avatarUrl: string, displayName: string } }>, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, cellar_items: Array<{ __typename: 'cellar_items', cellar: { __typename: 'cellars', id: string, name: string, createdBy: { __typename: 'users', id: string, displayName: string, avatarUrl: string }, co_owners: Array<{ __typename: 'cellar_owners', user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } }> } | null, cellars: Array<{ __typename: 'cellars', id: string, name: string }> };

export type FriendsQueryQueryVariables = Exact<{
  userId: Scalars['uuid']['input'];
}>;


export type FriendsQueryQuery = { __typename: 'query_root', user?: { __typename: 'users', friends: Array<{ __typename: 'friends', friend_id: string }> } | null };

export type FavoritesQueryQueryVariables = Exact<{
  userId: Scalars['uuid']['input'];
  where?: InputMaybe<Item_Favorites_Bool_Exp>;
}>;


export type FavoritesQueryQuery = { __typename: 'query_root', user?: { __typename: 'users', item_favorites: Array<{ __typename: 'item_favorites', beer?: { __typename: 'beers', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, wine?: { __typename: 'wines', id: string, name: string, vintage: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, spirit?: { __typename: 'spirits', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, coffee?: { __typename: 'coffees', id: string, name: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null }> } | null };

export type SearchUsersQueryVariables = Exact<{
  search?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['uuid']['input'];
}>;


export type SearchUsersQuery = { __typename: 'query_root', users: Array<{ __typename: 'users', id: string, displayName: string, avatarUrl: string, friends: Array<{ __typename: 'friends', friend: { __typename: 'users', id: string } }> }> };

export type InsertFriendRequestMutationVariables = Exact<{
  request: Friend_Requests_Insert_Input;
}>;


export type InsertFriendRequestMutation = { __typename: 'mutation_root', insert_friend_requests_one?: { __typename: 'friend_requests', id: string } | null };

export type AcceptFriendRequestMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type AcceptFriendRequestMutation = { __typename: 'mutation_root', update_friend_requests_by_pk?: { __typename: 'friend_requests', id: string } | null };

export type DeleteFriendRequestMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type DeleteFriendRequestMutation = { __typename: 'mutation_root', delete_friend_requests_by_pk?: { __typename: 'friend_requests', id: string } | null };

export type GetFriendRequestsSubscriptionVariables = Exact<{
  id: Scalars['uuid']['input'];
}>;


export type GetFriendRequestsSubscription = { __typename: 'subscription_root', user?: { __typename: 'users', id: string, outgoingFriendRequests: Array<{ __typename: 'friend_requests', id: string, status: Friend_Request_Status_Enum, friend: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }>, incomingFriendRequests: Array<{ __typename: 'friend_requests', id: string, status: Friend_Request_Status_Enum, user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }>, friends: Array<{ __typename: 'friends', friend: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } | null };

export type RemoveFriendMutationVariables = Exact<{
  userId: Scalars['uuid']['input'];
  friendId: Scalars['uuid']['input'];
}>;


export type RemoveFriendMutation = { __typename: 'mutation_root', mine?: { __typename: 'friends', user_id: string, friend_id: string } | null, theirs?: { __typename: 'friends', user_id: string, friend_id: string } | null };

export type RankingQueryQueryVariables = Exact<{
  userId: Scalars['uuid']['input'];
  reviewers: Scalars['String']['input'];
  where?: InputMaybe<Item_Score_Bool_Exp_Bool_Exp>;
}>;


export type RankingQueryQuery = { __typename: 'query_root', item_scores: Array<{ __typename: 'item_scores', score?: number | null, count: number, beer?: { __typename: 'beers', id: string, name: string, vintage?: string | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }> } | null, wine?: { __typename: 'wines', id: string, name: string, vintage: string, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }> } | null, spirit?: { __typename: 'spirits', id: string, name: string, vintage?: string | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }> } | null, coffee?: { __typename: 'coffees', id: string, name: string, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }> } | null }> };

export type FavoriteFragmentFragment = { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null };

export type ImageFragmentFragment = { __typename: 'item_image', file_id: string, placeholder?: string | null };

export type GetSpiritPageQueryQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type GetSpiritPageQueryQuery = { __typename: 'query_root', spirits_by_pk?: { __typename: 'spirits', id: string, name: string, created_by_id: string, style?: string | null, vintage?: string | null, description?: string | null, alcohol_content_percentage?: any | null, type: Spirit_Type_Enum, country?: Country_Enum | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, reviews: Array<{ __typename: 'item_reviews', id: string, score: number, text?: string | null, createdAt: string, user: { __typename: 'users', avatarUrl: string, displayName: string } }>, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, cellar_items: Array<{ __typename: 'cellar_items', cellar: { __typename: 'cellars', id: string, name: string, createdBy: { __typename: 'users', id: string, displayName: string, avatarUrl: string }, co_owners: Array<{ __typename: 'cellar_owners', user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } }> } | null, cellars: Array<{ __typename: 'cellars', id: string, name: string }> };

export type GetUserQueryVariables = Exact<{
  userId: Scalars['uuid']['input'];
}>;


export type GetUserQuery = { __typename: 'query_root', user?: { __typename: 'users', id: string, displayName: string, avatarUrl: string } | null };

export type UpdateUserMutationVariables = Exact<{
  userId: Scalars['uuid']['input'];
  displayName: Scalars['String']['input'];
}>;


export type UpdateUserMutation = { __typename: 'mutation_root', updateUser?: { __typename: 'users', id: string } | null };

export type GetWinePageQueryQueryVariables = Exact<{
  itemId: Scalars['uuid']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type GetWinePageQueryQuery = { __typename: 'query_root', wines_by_pk?: { __typename: 'wines', id: string, name: string, created_by_id: string, region?: string | null, variety?: Wine_Variety_Enum | null, style: Wine_Style_Enum, vintage: string, description?: string | null, barcode_code?: string | null, alcohol_content_percentage?: any | null, country?: Country_Enum | null, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null }, reviews: Array<{ __typename: 'item_reviews', id: string, score: number, text?: string | null, createdAt: string, user: { __typename: 'users', avatarUrl: string, displayName: string } }>, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, cellar_items: Array<{ __typename: 'cellar_items', cellar: { __typename: 'cellars', id: string, name: string, createdBy: { __typename: 'users', id: string, displayName: string, avatarUrl: string }, co_owners: Array<{ __typename: 'cellar_owners', user: { __typename: 'users', id: string, displayName: string, avatarUrl: string } }> } }> } | null, cellars: Array<{ __typename: 'cellars', id: string, name: string }> };

export type GetBeerDefaultsQueryVariables = Exact<{
  hint: Item_Defaults_Hint;
}>;


export type GetBeerDefaultsQuery = { __typename: 'query_root', beer_defaults?: { __typename: 'beer_defaults_result', name?: string | null, description?: string | null, alcohol_content_percentage?: any | null, barcode_code?: string | null, barcode_type?: string | null, item_onboarding_id: string, country?: string | null, vintage?: string | null, style?: string | null, international_bitterness_unit?: number | null } | null };

export type AddCellarMutationVariables = Exact<{
  cellar: Cellars_Insert_Input;
}>;


export type AddCellarMutation = { __typename: 'mutation_root', insert_cellars_one?: { __typename: 'cellars', id: string } | null };

export type EditCellarMutationVariables = Exact<{
  id: Scalars['uuid']['input'];
  cellar: Cellars_Set_Input;
  co_owners: Array<Cellar_Owners_Insert_Input> | Cellar_Owners_Insert_Input;
}>;


export type EditCellarMutation = { __typename: 'mutation_root', update_cellars_by_pk?: { __typename: 'cellars', id: string } | null, delete_cellar_owners?: { __typename: 'cellar_owners_mutation_response', affected_rows: number } | null, insert_cellar_owners?: { __typename: 'cellar_owners_mutation_response', affected_rows: number } | null };

export type GetCoffeeDefaultsQueryVariables = Exact<{
  hint: Item_Defaults_Hint;
}>;


export type GetCoffeeDefaultsQuery = { __typename: 'query_root', coffee_defaults?: { __typename: 'coffee_defaults_result', name?: string | null, description?: string | null, barcode_code?: string | null, barcode_type?: string | null, item_onboarding_id: string, country?: string | null, roast_level?: string | null, cultivar?: string | null, process?: string | null, species?: string | null } | null };

export type SearchByBarcodeQueryVariables = Exact<{
  code: Scalars['String']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type SearchByBarcodeQuery = { __typename: 'query_root', barcodes_by_pk?: { __typename: 'barcodes', beers: Array<{ __typename: 'beers', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } }>, wines: Array<{ __typename: 'wines', id: string, name: string, vintage: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } }>, spirits: Array<{ __typename: 'spirits', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } }>, coffees: Array<{ __typename: 'coffees', id: string, name: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } }> } | null };

export type GetImageVectorQueryVariables = Exact<{
  image: Scalars['String']['input'];
}>;


export type GetImageVectorQuery = { __typename: 'query_root', create_search_vector: string };

export type ImageSearchQueryQueryVariables = Exact<{
  image: Scalars['String']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type ImageSearchQueryQuery = { __typename: 'query_root', image_search: Array<{ __typename: 'image_search', beer?: { __typename: 'beers', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, wine?: { __typename: 'wines', id: string, name: string, vintage: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, spirit?: { __typename: 'spirits', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, coffee?: { __typename: 'coffees', id: string, name: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null }> };

export type DeleteCellarItemMutationVariables = Exact<{
  itemId: Scalars['uuid']['input'];
}>;


export type DeleteCellarItemMutation = { __typename: 'mutation_root', delete_cellar_items_by_pk?: { __typename: 'cellar_items', id: string } | null };

export type ReviewFragmentFragment = { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null };

export type BeerItemCardFragmentFragment = { __typename: 'beers', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } };

export type WineItemCardFragmentFragment = { __typename: 'wines', id: string, name: string, vintage: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } };

export type SpiritItemCardFragmentFragment = { __typename: 'spirits', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } };

export type CoffeeItemCardFragmentFragment = { __typename: 'coffees', id: string, name: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } };

export type TextSearchQueryQueryVariables = Exact<{
  text: Scalars['String']['input'];
  userId: Scalars['uuid']['input'];
}>;


export type TextSearchQueryQuery = { __typename: 'query_root', text_search: Array<{ __typename: 'text_search', distance?: number | null, beer?: { __typename: 'beers', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, wine?: { __typename: 'wines', id: string, name: string, vintage: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, spirit?: { __typename: 'spirits', id: string, name: string, vintage?: string | null, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null, coffee?: { __typename: 'coffees', id: string, name: string, item_images: Array<{ __typename: 'item_image', file_id: string, placeholder?: string | null }>, item_favorites: Array<{ __typename: 'item_favorites', id: string }>, user_reviews: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number } | null }, reviews_aggregate: { __typename: 'item_reviews_aggregate', aggregate?: { __typename: 'item_reviews_aggregate_fields', count: number, avg?: { __typename: 'item_reviews_avg_fields', score?: number | null } | null } | null }, item_favorites_aggregate: { __typename: 'item_favorites_aggregate', aggregate?: { __typename: 'item_favorites_aggregate_fields', count: number } | null } } | null }> };

export type GetSpiritDefaultsQueryVariables = Exact<{
  hint: Item_Defaults_Hint;
}>;


export type GetSpiritDefaultsQuery = { __typename: 'query_root', spirit_defaults?: { __typename: 'spirit_defaults_result', name?: string | null, description?: string | null, alcohol_content_percentage?: any | null, barcode_code?: string | null, barcode_type?: string | null, item_onboarding_id: string, country?: string | null, vintage?: string | null, style?: string | null, type?: string | null } | null };

export type GetWineDefaultsQueryVariables = Exact<{
  hint: Item_Defaults_Hint;
}>;


export type GetWineDefaultsQuery = { __typename: 'query_root', wine_defaults?: { __typename: 'wine_defaults_result', name?: string | null, description?: string | null, alcohol_content_percentage?: any | null, barcode_code?: string | null, barcode_type?: string | null, item_onboarding_id: string, region?: string | null, country?: string | null, special_designation?: string | null, variety?: string | null, vineyard_designation?: string | null, vintage?: string | null, style?: string | null } | null };

export const ImageFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"imageFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_image"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}}]} as unknown as DocumentNode<ImageFragmentFragment, unknown>;
export const ReviewFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}}]} as unknown as DocumentNode<ReviewFragmentFragment, unknown>;
export const FavoriteFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]} as unknown as DocumentNode<FavoriteFragmentFragment, unknown>;
export const BeerItemCardFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"beerItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"beers"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]} as unknown as DocumentNode<BeerItemCardFragmentFragment, unknown>;
export const WineItemCardFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"wineItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"wines"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]} as unknown as DocumentNode<WineItemCardFragmentFragment, unknown>;
export const SpiritItemCardFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"spiritItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"spirits"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]} as unknown as DocumentNode<SpiritItemCardFragmentFragment, unknown>;
export const CoffeeItemCardFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"coffeeItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"coffees"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]} as unknown as DocumentNode<CoffeeItemCardFragmentFragment, unknown>;
export const GetCredentialDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCredential"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"admin_credentials_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"credentials"}}]}}]}}]} as unknown as DocumentNode<GetCredentialQuery, GetCredentialQueryVariables>;
export const GetFileDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetFile"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"bucket"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"mimeType"}},{"kind":"Field","name":{"kind":"Name","value":"size"}}]}}]}}]} as unknown as DocumentNode<GetFileQuery, GetFileQueryVariables>;
export const AddTextExtractionResultsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddTextExtractionResults"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"analysis"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"image_analysis_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_image_analysis_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"analysis"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddTextExtractionResultsMutation, AddTextExtractionResultsMutationVariables>;
export const InsertFriendsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"InsertFriends"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"friends"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"friends_insert_input"}}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"requestId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_friends"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"objects"},"value":{"kind":"Variable","name":{"kind":"Name","value":"friends"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affected_rows"}}]}},{"kind":"Field","name":{"kind":"Name","value":"delete_friend_requests_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"requestId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<InsertFriendsMutation, InsertFriendsMutationVariables>;
export const InsertVectorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"InsertVector"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"vector"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_vectors_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_item_vectors_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"vector"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<InsertVectorMutation, InsertVectorMutationVariables>;
export const DeleteVectorsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteVectors"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_vectors_bool_exp"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_item_vectors"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affected_rows"}}]}}]}}]} as unknown as DocumentNode<DeleteVectorsMutation, DeleteVectorsMutationVariables>;
export const UpdateItemImageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateItemImage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"item"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_image_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_item_image_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"item"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateItemImageMutation, UpdateItemImageMutationVariables>;
export const AddItemOnboardingDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddItemOnboarding"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"onboarding"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_onboardings_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_item_onboardings_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"onboarding"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddItemOnboardingMutation, AddItemOnboardingMutationVariables>;
export const InsertItemImageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"InsertItemImage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"item"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_image_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_item_image_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"item"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<InsertItemImageMutation, InsertItemImageMutationVariables>;
export const AddItemImageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddItemImage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_image_upload_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"item_image_upload"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddItemImageMutation, AddItemImageMutationVariables>;
export const AddCellarItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddCellarItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"item"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"cellar_items_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_cellar_items_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"item"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"cellar_id"}}]}}]}}]} as unknown as DocumentNode<AddCellarItemMutation, AddCellarItemMutationVariables>;
export const AddBeerDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddBeer"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"beer"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"beers_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_beers_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"beer"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddBeerMutation, AddBeerMutationVariables>;
export const UpdateBeerDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateBeer"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"beerId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"beer"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"beers_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_beers_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"beerId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"beer"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateBeerMutation, UpdateBeerMutationVariables>;
export const AddCoffeeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddCoffee"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"coffee"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"coffees_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_coffees_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"coffee"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddCoffeeMutation, AddCoffeeMutationVariables>;
export const UpdateCoffeeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateCoffee"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"coffeeId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"coffee"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"coffees_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_coffees_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"coffeeId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"coffee"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateCoffeeMutation, UpdateCoffeeMutationVariables>;
export const UpdateCellarItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateCellarItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"item"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"cellar_items_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_cellar_items_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"item"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateCellarItemMutation, UpdateCellarItemMutationVariables>;
export const AddWineDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddWine"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"wine"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"wines_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_wines_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"wine"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddWineMutation, AddWineMutationVariables>;
export const UpdateWineDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateWine"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"wineId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"wine"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"wines_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_wines_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"wineId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"wine"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateWineMutation, UpdateWineMutationVariables>;
export const AddSpiritDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddSpirit"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spirit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"spirits_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_spirits_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spirit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddSpiritMutation, AddSpiritMutationVariables>;
export const UpdateSpiritDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateSpirit"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spiritId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"spirit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"spirits_set_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_spirits_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spiritId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"spirit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateSpiritMutation, UpdateSpiritMutationVariables>;
export const AddItemReviewDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddItemReview"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"review"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_item_reviews_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"review"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"beer"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wine"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spirit"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]} as unknown as DocumentNode<AddItemReviewMutation, AddItemReviewMutationVariables>;
export const AddCheckInDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddCheckIn"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"checkIn"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"check_ins_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_check_ins_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"checkIn"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"cellar_item"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]} as unknown as DocumentNode<AddCheckInMutation, AddCheckInMutationVariables>;
export const AddCheckInsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddCheckIns"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"checkIns"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"check_ins_insert_input"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_check_ins"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"objects"},"value":{"kind":"Variable","name":{"kind":"Name","value":"checkIns"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affected_rows"}},{"kind":"Field","name":{"kind":"Name","value":"returning"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"cellar_item"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]}}]} as unknown as DocumentNode<AddCheckInsMutation, AddCheckInsMutationVariables>;
export const GetSearchVectorQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetSearchVectorQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"text"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"image"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"create_search_vector"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"text"},"value":{"kind":"Variable","name":{"kind":"Name","value":"text"}}},{"kind":"Argument","name":{"kind":"Name","value":"image"},"value":{"kind":"Variable","name":{"kind":"Name","value":"image"}}}]}]}}]} as unknown as DocumentNode<GetSearchVectorQueryQuery, GetSearchVectorQueryQueryVariables>;
export const AddFavoriteMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddFavoriteMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"object"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_item_favorites_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"object"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"beer"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wine"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spirit"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"coffee"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]} as unknown as DocumentNode<AddFavoriteMutationMutation, AddFavoriteMutationMutationVariables>;
export const DeleteFavoriteMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteFavoriteMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_item_favorites_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<DeleteFavoriteMutationMutation, DeleteFavoriteMutationMutationVariables>;
export const GetBeerPageQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetBeerPageQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"beers_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellar_items"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"empty_at"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_is_null"},"value":{"kind":"BooleanValue","value":true}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"distinct_on"},"value":{"kind":"EnumValue","value":"cellar_id"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellar"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellars"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_by_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<GetBeerPageQueryQuery, GetBeerPageQueryQueryVariables>;
export const EditBeerPageQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EditBeerPageQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"beers_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"international_bitterness_unit"}},{"kind":"Field","name":{"kind":"Name","value":"country"}}]}}]}}]} as unknown as DocumentNode<EditBeerPageQueryQuery, EditBeerPageQueryQueryVariables>;
export const GetCellarBeerDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCellarBeer"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellar_items_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"open_at"}},{"kind":"Field","name":{"kind":"Name","value":"empty_at"}},{"kind":"Field","name":{"kind":"Name","value":"percentage_remaining"}},{"kind":"Field","name":{"kind":"Name","value":"beer"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"display_image"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellar"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user_id"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"check_ins"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"friends"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"friend"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"displayName"},"value":{"kind":"EnumValue","value":"desc"}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friend"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetCellarBeerQuery, GetCellarBeerQueryVariables>;
export const EditCoffeePageQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EditCoffeePageQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"coffees_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"country"}}]}}]}}]} as unknown as DocumentNode<EditCoffeePageQueryQuery, EditCoffeePageQueryQueryVariables>;
export const GetCellarCoffeeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCellarCoffee"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellar_items_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"open_at"}},{"kind":"Field","name":{"kind":"Name","value":"empty_at"}},{"kind":"Field","name":{"kind":"Name","value":"percentage_remaining"}},{"kind":"Field","name":{"kind":"Name","value":"coffee"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"process"}},{"kind":"Field","name":{"kind":"Name","value":"roast_level"}},{"kind":"Field","name":{"kind":"Name","value":"species"}},{"kind":"Field","name":{"kind":"Name","value":"cultivar"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"display_image"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellar"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user_id"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"check_ins"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"friends"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"friend"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"displayName"},"value":{"kind":"EnumValue","value":"desc"}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friend"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetCellarCoffeeQuery, GetCellarCoffeeQueryVariables>;
export const EditCellarQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EditCellarQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellars_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"privacy"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user_id"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"friends"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friend"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]} as unknown as DocumentNode<EditCellarQueryQuery, EditCellarQueryQueryVariables>;
export const GetCellarDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCellar"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cellarId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellars_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cellarId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user_id"}}]}}]}}]}}]} as unknown as DocumentNode<GetCellarQuery, GetCellarQueryVariables>;
export const GetCellarItemsQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCellarItemsQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cellarId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemsWhereClause"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"cellar_items_bool_exp"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"vector"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellars_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cellarId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user_id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"item_counts"},"name":{"kind":"Name","value":"items_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"empty_at"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_is_null"},"value":{"kind":"BooleanValue","value":true}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","alias":{"kind":"Name","value":"beers"},"name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"columns"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"beer_id"}]}}]}]}},{"kind":"Field","alias":{"kind":"Name","value":"wines"},"name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"columns"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"wine_id"}]}}]}]}},{"kind":"Field","alias":{"kind":"Name","value":"spirits"},"name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"columns"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"spirit_id"}]}}]}]}},{"kind":"Field","alias":{"kind":"Name","value":"coffees"},"name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"columns"},"value":{"kind":"ListValue","values":[{"kind":"EnumValue","value":"coffee_id"}]}}]}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"items"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemsWhereClause"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"display_image"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"beer"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"beerItemCardFragment"}},{"kind":"Field","name":{"kind":"Name","value":"item_vectors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"distance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"args"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}}]}}]}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"wine"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"wineItemCardFragment"}},{"kind":"Field","name":{"kind":"Name","value":"item_vectors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"distance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"args"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}}]}}]}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"spirit"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"spiritItemCardFragment"}},{"kind":"Field","name":{"kind":"Name","value":"item_vectors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"distance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"args"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}}]}}]}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"coffee"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"coffeeItemCardFragment"}},{"kind":"Field","name":{"kind":"Name","value":"item_vectors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"distance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"args"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}}]}}]}]}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"beerItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"beers"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"wineItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"wines"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"spiritItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"spirits"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"coffeeItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"coffees"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}}]} as unknown as DocumentNode<GetCellarItemsQueryQuery, GetCellarItemsQueryQueryVariables>;
export const EditSpiritPageQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EditSpiritPageQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spirits_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"country"}}]}}]}}]} as unknown as DocumentNode<EditSpiritPageQueryQuery, EditSpiritPageQueryQueryVariables>;
export const GetSpiritDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetSpirit"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellar_items_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"open_at"}},{"kind":"Field","name":{"kind":"Name","value":"empty_at"}},{"kind":"Field","name":{"kind":"Name","value":"percentage_remaining"}},{"kind":"Field","name":{"kind":"Name","value":"spirit"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"display_image"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellar"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user_id"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"check_ins"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"friends"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"friend"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"displayName"},"value":{"kind":"EnumValue","value":"desc"}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friend"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetSpiritQuery, GetSpiritQueryVariables>;
export const EditWinePageQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EditWinePageQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wines_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"special_designation"}},{"kind":"Field","name":{"kind":"Name","value":"vineyard_designation"}},{"kind":"Field","name":{"kind":"Name","value":"variety"}},{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"country"}}]}}]}}]} as unknown as DocumentNode<EditWinePageQueryQuery, EditWinePageQueryQueryVariables>;
export const GetCellarWineDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCellarWine"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellar_items_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"open_at"}},{"kind":"Field","name":{"kind":"Name","value":"empty_at"}},{"kind":"Field","name":{"kind":"Name","value":"percentage_remaining"}},{"kind":"Field","name":{"kind":"Name","value":"wine"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"variety"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"display_image"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellar"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user_id"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"check_ins"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"friends"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"friend"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"displayName"},"value":{"kind":"EnumValue","value":"desc"}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friend"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetCellarWineQuery, GetCellarWineQueryVariables>;
export const AddCellarQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AddCellarQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friends"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friend"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]} as unknown as DocumentNode<AddCellarQueryQuery, AddCellarQueryQueryVariables>;
export const GetCellarsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCellars"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellars"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"coOwners"},"name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetCellarsQuery, GetCellarsQueryVariables>;
export const GetCoffeePageQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCoffeePageQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"coffees_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"process"}},{"kind":"Field","name":{"kind":"Name","value":"roast_level"}},{"kind":"Field","name":{"kind":"Name","value":"species"}},{"kind":"Field","name":{"kind":"Name","value":"cultivar"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellar_items"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"empty_at"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_is_null"},"value":{"kind":"BooleanValue","value":true}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"distinct_on"},"value":{"kind":"EnumValue","value":"cellar_id"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellar"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellars"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_by_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<GetCoffeePageQueryQuery, GetCoffeePageQueryQueryVariables>;
export const FriendsQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"FriendsQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friends"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friend_id"}}]}}]}}]}}]} as unknown as DocumentNode<FriendsQueryQuery, FriendsQueryQueryVariables>;
export const FavoritesQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"FavoritesQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_bool_exp"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"beer"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"beerItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wine"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"wineItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spirit"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"spiritItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"coffee"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"coffeeItemCardFragment"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"beerItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"beers"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"wineItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"wines"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"spiritItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"spirits"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"coffeeItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"coffees"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}}]} as unknown as DocumentNode<FavoritesQueryQuery, FavoritesQueryQueryVariables>;
export const SearchUsersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SearchUsers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"users"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_and"},"value":{"kind":"ListValue","values":[{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"displayName"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_ilike"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}}]}},{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_neq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]},{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_not"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"incomingFriendRequests"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}]}}]},{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_not"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"outgoingFriendRequests"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"friend_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}]}}]},{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_not"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"friends"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"friend_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}]}}]}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"friends"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friend"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]}}]} as unknown as DocumentNode<SearchUsersQuery, SearchUsersQueryVariables>;
export const InsertFriendRequestDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"InsertFriendRequest"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"request"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"friend_requests_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_friend_requests_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"request"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<InsertFriendRequestMutation, InsertFriendRequestMutationVariables>;
export const AcceptFriendRequestDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AcceptFriendRequest"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_friend_requests_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"status"},"value":{"kind":"EnumValue","value":"ACCEPTED"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AcceptFriendRequestMutation, AcceptFriendRequestMutationVariables>;
export const DeleteFriendRequestDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteFriendRequest"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_friend_requests_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<DeleteFriendRequestMutation, DeleteFriendRequestMutationVariables>;
export const GetFriendRequestsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"GetFriendRequests"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"outgoingFriendRequests"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"friend"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"incomingFriendRequests"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"friends"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"friend"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetFriendRequestsSubscription, GetFriendRequestsSubscriptionVariables>;
export const RemoveFriendDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RemoveFriend"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"friendId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","alias":{"kind":"Name","value":"mine"},"name":{"kind":"Name","value":"delete_friends_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"user_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"friend_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"friendId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user_id"}},{"kind":"Field","name":{"kind":"Name","value":"friend_id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"theirs"},"name":{"kind":"Name","value":"delete_friends_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"user_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"friendId"}}},{"kind":"Argument","name":{"kind":"Name","value":"friend_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user_id"}},{"kind":"Field","name":{"kind":"Name","value":"friend_id"}}]}}]}}]} as unknown as DocumentNode<RemoveFriendMutation, RemoveFriendMutationVariables>;
export const RankingQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RankingQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"reviewers"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"where"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"item_score_bool_exp_bool_exp"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"item_scores"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"args"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"reviewers"},"value":{"kind":"Variable","name":{"kind":"Name","value":"reviewers"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"score"},"value":{"kind":"EnumValue","value":"desc"}},{"kind":"ObjectField","name":{"kind":"Name","value":"count"},"value":{"kind":"EnumValue","value":"desc"}}]}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"Variable","name":{"kind":"Name","value":"where"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"200"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"beer"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"imageFragment"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"wine"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"imageFragment"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"spirit"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"imageFragment"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"coffee"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"imageFragment"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"imageFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_image"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}}]} as unknown as DocumentNode<RankingQueryQuery, RankingQueryQueryVariables>;
export const GetSpiritPageQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetSpiritPageQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spirits_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellar_items"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"empty_at"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_is_null"},"value":{"kind":"BooleanValue","value":true}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"distinct_on"},"value":{"kind":"EnumValue","value":"cellar_id"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellar"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellars"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_by_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<GetSpiritPageQueryQuery, GetSpiritPageQueryQueryVariables>;
export const GetUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]} as unknown as DocumentNode<GetUserQuery, GetUserQueryVariables>;
export const UpdateUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"displayName"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"displayName"},"value":{"kind":"Variable","name":{"kind":"Name","value":"displayName"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateUserMutation, UpdateUserMutationVariables>;
export const GetWinePageQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetWinePageQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wines_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"created_by_id"}},{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"variety"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_at"},"value":{"kind":"EnumValue","value":"desc"}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"score"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","alias":{"kind":"Name","value":"createdAt"},"name":{"kind":"Name","value":"created_at"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellar_items"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"empty_at"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_is_null"},"value":{"kind":"BooleanValue","value":true}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"distinct_on"},"value":{"kind":"EnumValue","value":"cellar_id"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cellar"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}},{"kind":"Field","name":{"kind":"Name","value":"co_owners"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}}]}}]}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"cellars"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"created_by_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<GetWinePageQueryQuery, GetWinePageQueryQueryVariables>;
export const GetBeerDefaultsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetBeerDefaults"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"hint"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_defaults_hint"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"beer_defaults"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"hint"},"value":{"kind":"Variable","name":{"kind":"Name","value":"hint"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_type"}},{"kind":"Field","name":{"kind":"Name","value":"item_onboarding_id"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"international_bitterness_unit"}}]}}]}}]} as unknown as DocumentNode<GetBeerDefaultsQuery, GetBeerDefaultsQueryVariables>;
export const AddCellarDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddCellar"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cellar"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"cellars_insert_input"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"insert_cellars_one"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"object"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cellar"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddCellarMutation, AddCellarMutationVariables>;
export const EditCellarDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"EditCellar"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cellar"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"cellars_set_input"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"co_owners"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"cellar_owners_insert_input"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"update_cellars_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"pk_columns"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"_set"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cellar"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","name":{"kind":"Name","value":"delete_cellar_owners"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"cellar_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affected_rows"}}]}},{"kind":"Field","name":{"kind":"Name","value":"insert_cellar_owners"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"objects"},"value":{"kind":"Variable","name":{"kind":"Name","value":"co_owners"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"affected_rows"}}]}}]}}]} as unknown as DocumentNode<EditCellarMutation, EditCellarMutationVariables>;
export const GetCoffeeDefaultsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetCoffeeDefaults"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"hint"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_defaults_hint"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"coffee_defaults"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"hint"},"value":{"kind":"Variable","name":{"kind":"Name","value":"hint"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_type"}},{"kind":"Field","name":{"kind":"Name","value":"item_onboarding_id"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"roast_level"}},{"kind":"Field","name":{"kind":"Name","value":"cultivar"}},{"kind":"Field","name":{"kind":"Name","value":"process"}},{"kind":"Field","name":{"kind":"Name","value":"species"}}]}}]}}]} as unknown as DocumentNode<GetCoffeeDefaultsQuery, GetCoffeeDefaultsQueryVariables>;
export const SearchByBarcodeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SearchByBarcode"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"code"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"barcodes_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"code"},"value":{"kind":"Variable","name":{"kind":"Name","value":"code"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"beers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"beerItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wines"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"wineItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spirits"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"spiritItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"coffees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"coffeeItemCardFragment"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"beerItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"beers"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"wineItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"wines"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"spiritItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"spirits"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"coffeeItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"coffees"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}}]} as unknown as DocumentNode<SearchByBarcodeQuery, SearchByBarcodeQueryVariables>;
export const GetImageVectorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetImageVector"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"image"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"create_search_vector"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"image"},"value":{"kind":"Variable","name":{"kind":"Name","value":"image"}}}]}]}}]} as unknown as DocumentNode<GetImageVectorQuery, GetImageVectorQueryVariables>;
export const ImageSearchQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ImageSearchQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"image"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"image_search"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"args"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"image"},"value":{"kind":"Variable","name":{"kind":"Name","value":"image"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"distance"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_lte"},"value":{"kind":"FloatValue","value":"0.3"}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"distance"},"value":{"kind":"EnumValue","value":"asc"}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"beer"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"beerItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wine"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"wineItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spirit"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"spiritItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"coffee"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"coffeeItemCardFragment"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"beerItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"beers"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"wineItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"wines"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"spiritItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"spirits"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"coffeeItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"coffees"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}}]} as unknown as DocumentNode<ImageSearchQueryQuery, ImageSearchQueryQueryVariables>;
export const DeleteCellarItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteCellarItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"delete_cellar_items_by_pk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"itemId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<DeleteCellarItemMutation, DeleteCellarItemMutationVariables>;
export const TextSearchQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TextSearchQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"text"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"uuid"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"text_search"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"args"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"text"},"value":{"kind":"Variable","name":{"kind":"Name","value":"text"}}}]}},{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"distance"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_lte"},"value":{"kind":"FloatValue","value":"0.32"}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"order_by"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"distance"},"value":{"kind":"EnumValue","value":"asc"}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"10"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"distance"}},{"kind":"Field","name":{"kind":"Name","value":"beer"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"beerItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wine"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"wineItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"spirit"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"spiritItemCardFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"coffee"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"coffeeItemCardFragment"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"reviewFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_reviews_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"avg"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"score"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"favoriteFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"item_favorites_aggregate"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"beerItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"beers"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"wineItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"wines"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"spiritItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"spirits"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"coffeeItemCardFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"coffees"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"item_images"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"file_id"}},{"kind":"Field","name":{"kind":"Name","value":"placeholder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}},{"kind":"Field","alias":{"kind":"Name","value":"user_reviews"},"name":{"kind":"Name","value":"reviews_aggregate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"where"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"user_id"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"_eq"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}}]}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"reviews_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"reviewFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"item_favorites_aggregate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"favoriteFragment"}}]}}]}}]} as unknown as DocumentNode<TextSearchQueryQuery, TextSearchQueryQueryVariables>;
export const GetSpiritDefaultsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetSpiritDefaults"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"hint"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_defaults_hint"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"spirit_defaults"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"hint"},"value":{"kind":"Variable","name":{"kind":"Name","value":"hint"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_type"}},{"kind":"Field","name":{"kind":"Name","value":"item_onboarding_id"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"style"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}}]}}]} as unknown as DocumentNode<GetSpiritDefaultsQuery, GetSpiritDefaultsQueryVariables>;
export const GetWineDefaultsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetWineDefaults"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"hint"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"item_defaults_hint"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wine_defaults"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"hint"},"value":{"kind":"Variable","name":{"kind":"Name","value":"hint"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"alcohol_content_percentage"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_code"}},{"kind":"Field","name":{"kind":"Name","value":"barcode_type"}},{"kind":"Field","name":{"kind":"Name","value":"item_onboarding_id"}},{"kind":"Field","name":{"kind":"Name","value":"region"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"special_designation"}},{"kind":"Field","name":{"kind":"Name","value":"variety"}},{"kind":"Field","name":{"kind":"Name","value":"vineyard_designation"}},{"kind":"Field","name":{"kind":"Name","value":"vintage"}},{"kind":"Field","name":{"kind":"Name","value":"style"}}]}}]}}]} as unknown as DocumentNode<GetWineDefaultsQuery, GetWineDefaultsQueryVariables>;