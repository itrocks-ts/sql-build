import { Joins }   from '@itrocks/sql-join'
import { depends } from './dependencies'

export type ColumnReference<ColumnDefinition> = {
	alias:            string
	column:           string
	columnDefinition: ColumnDefinition
}

export function columnReference<TableDefinition, ColumnDefinition>(
	joins: Joins<TableDefinition, ColumnDefinition>, columnPath: string
): ColumnReference<ColumnDefinition>
{
	if (!columnPath) throw new Error('A column path cannot be empty')
	if (joins.add(columnPath)) {
		throw new Error(`Column path '${columnPath}' resolves to a relationship instead of a scalar column`)
	}
	const columnDefinition = joins.getColumnDefinition(columnPath)
	if (columnDefinition === undefined) {
		throw new Error(`Column path '${columnPath}' has no column definition`)
	}
	const [tablePath] = splitColumnPath(columnPath)
	return {
		alias:            joins.getAlias(tablePath),
		column:           (depends.columnOf as (definition: ColumnDefinition) => string)(columnDefinition),
		columnDefinition
	}
}

export function columnReferenceSql<TableDefinition, ColumnDefinition>(
	joins: Joins<TableDefinition, ColumnDefinition>, columnPath: string
): string
{
	const reference = columnReference(joins, columnPath)
	return qualified(reference.alias, reference.column)
}

export function qualified(alias: string, column: string): string
{
	return `${depends.quoteIdentifier(alias)}.${depends.quoteIdentifier(column)}`
}

function splitColumnPath(columnPath: string): [tablePath: string, column: string]
{
	const separator = columnPath.lastIndexOf('.')
	return (separator < 0)
		? ['', columnPath]
		: [columnPath.slice(0, separator), columnPath.slice(separator + 1)]
}
