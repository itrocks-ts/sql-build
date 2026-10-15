import { RelationshipGraph } from '@itrocks/sql-join'

export type ColumnSelection = string | {
	alias?:        string
	objectFields?: readonly string[]
	path:          string
}

export type ProjectionColumn<C = unknown> = {
	readonly fields: readonly ProjectionField<C>[]
	readonly kind: 'scalar' | 'object'
	readonly objectFields?: readonly string[]
	readonly path: string
	readonly presence: readonly { readonly alias: string, readonly path: string }[]
}

export type ProjectionField<C = unknown> = {
	readonly alias: string
	readonly definition?: C
	readonly relativePath: string
	readonly role: 'value' | 'identity'
}

export type ProjectionOptions = {
	limit?:   number
	offset?:  number
	orderBy?: readonly { path: string, descending?: boolean }[]
	rootIds?: readonly unknown[]
}

export type ProjectionQuery<C = unknown, T = unknown> = SqlQuery & {
	readonly columns: readonly ProjectionColumn<C>[]
	readonly graph: RelationshipGraph<T, C>
	readonly rootIdentityAlias: string
}

export type SqlQuery = {
	sql:    string
	values: readonly unknown[]
}

export type WhereConditions = Readonly<Record<string, unknown>>
