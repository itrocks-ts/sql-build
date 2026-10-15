import { Join }              from '@itrocks/sql-join'
import { Joins }             from '@itrocks/sql-join'
import { RelationshipGraph } from '@itrocks/sql-join'
import { depends }           from './dependencies'

export function graphTables<T, C>(graph: RelationshipGraph<T, C>, joins: readonly Join<T | undefined, C>[]): string
{
	const table = new Joins(graph.root).getStartingTable()
	return `${depends.quoteIdentifier(table)} AS ${depends.quoteIdentifier(graph.rootAlias())}`
		+ joins.map(join => `\n${join.toSql()}`).join('')
}

export class Tables<TableDefinition = unknown, ColumnDefinition = unknown>
{

	readonly joins: Joins<TableDefinition, ColumnDefinition>

	constructor(
		tableDefinition: TableDefinition,
		joins = new Joins<TableDefinition, ColumnDefinition>(tableDefinition)
	)
	{
		this.joins = joins
	}

	toSql(): string
	{
		const root  = `${depends.quoteIdentifier(this.joins.getStartingTable())}`
			+ ` AS ${depends.quoteIdentifier(this.joins.rootAlias())}`
		const joins = this.joins.toSql()
		return joins ? `${root}\n${joins}` : root
	}

	toString(): string
	{
		return this.toSql()
	}

}
