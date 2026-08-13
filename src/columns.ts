import { Joins }              from '@itrocks/sql-join'
import { columnReferenceSql } from './column-reference'
import { depends }            from './dependencies'
import { ColumnSelection }    from './query'

export class Columns<TableDefinition = unknown, ColumnDefinition = unknown>
{

	readonly joins:      Joins<TableDefinition, ColumnDefinition>
	readonly selections: readonly ColumnSelection[] | undefined

	constructor(
		tableDefinition: TableDefinition,
		selections?:     readonly ColumnSelection[],
		joins = new Joins<TableDefinition, ColumnDefinition>(tableDefinition)
	)
	{
		this.joins      = joins
		this.selections = selections
	}

	toSql(): string
	{
		if (this.selections === undefined) return `${depends.quoteIdentifier(this.joins.rootAlias())}.*`
		if (!this.selections.length) throw new Error('A SELECT query must contain at least one column')
		return this.selections.map(selection => this.selectionSql(selection)).join(', ')
	}

	toString(): string
	{
		return this.toSql()
	}

	private selectionSql(selection: ColumnSelection): string
	{
		const alias = (typeof selection === 'string') ? undefined : selection.alias
		const path  = (typeof selection === 'string') ? selection : selection.path
		if (path === '*') return `${depends.quoteIdentifier(this.joins.rootAlias())}.*`
		const sql         = columnReferenceSql(this.joins, path)
		const outputAlias = alias ?? (path.includes('.') ? path : undefined)
		return outputAlias ? `${sql} AS ${depends.quoteIdentifier(outputAlias)}` : sql
	}

}
