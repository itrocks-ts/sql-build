import { Joins }             from '@itrocks/sql-join'
import { RelationshipGraph } from '@itrocks/sql-join'
import { depends }           from './dependencies'
import { graphPaths }        from './graph-reference'
import { SqlQuery }          from './query'
import { WhereConditions }   from './query'
import { Tables }            from './tables'
import { graphTables }       from './tables'
import { Where }             from './where'

export type CountOptions = {
	aliasPrefix?: string
	rootIds?: readonly unknown[]
}

export class Count<TableDefinition = unknown, ColumnDefinition = unknown>
{

	readonly joins:  Joins<TableDefinition, ColumnDefinition>
	readonly tables: Tables<TableDefinition, ColumnDefinition>
	readonly where:  Where<TableDefinition, ColumnDefinition>

	constructor(
		private readonly tableDefinition: TableDefinition,
		where?: WhereConditions,
		private readonly options: CountOptions = {}
	)
	{
		this.joins  = new Joins<TableDefinition, ColumnDefinition>(tableDefinition, [], options.aliasPrefix)
		this.tables = new Tables(tableDefinition, this.joins)
		this.where  = new Where(tableDefinition, where, this.joins)
	}

	build(): SqlQuery
	{
		const graph = new RelationshipGraph<TableDefinition, ColumnDefinition>(
			this.tableDefinition, graphPaths(Object.keys(this.where.conditions)), this.options.aliasPrefix
		)
		const where = this.where.buildGraph(graph, this.options.rootIds)
		const sql = `SELECT COUNT(*) AS ${depends.quoteIdentifier('count')}\nFROM ${graphTables(graph, where.joins)}`
		return {
			sql:    where.sql ? `${sql}\n${where.sql}` : sql,
			values: where.values
		}
	}

	toSql(): string
	{
		return this.build().sql
	}

	toString(): string
	{
		return this.toSql()
	}

}
