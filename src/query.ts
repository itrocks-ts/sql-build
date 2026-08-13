
export type ColumnSelection = string | {
	alias?: string
	path:   string
}

export type SqlQuery = {
	sql:    string
	values: readonly unknown[]
}

export type WhereConditions = Readonly<Record<string, unknown>>
