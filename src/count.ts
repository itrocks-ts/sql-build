import { Joins }           from '@itrocks/sql-join'
import { depends }         from './dependencies'
import { SqlQuery }        from './query'
import { WhereConditions } from './query'
import { Tables }          from './tables'
import { Where }           from './where'

export type CountOptions = {
	aliasPrefix?: string
}

export class Count<TableDefinition = unknown, ColumnDefinition = unknown>
{

	readonly joins:  Joins<TableDefinition, ColumnDefinition>
	readonly tables: Tables<TableDefinition, ColumnDefinition>
	readonly where:  Where<TableDefinition, ColumnDefinition>

	constructor(tableDefinition: TableDefinition, where?: WhereConditions, options: CountOptions = {})
	{
		this.joins  = new Joins<TableDefinition, ColumnDefinition>(tableDefinition, [], options.aliasPrefix)
		this.tables = new Tables(tableDefinition, this.joins)
		this.where  = new Where(tableDefinition, where, this.joins)
	}

	build(): SqlQuery
	{
		const where = this.where.build()
		const sql   = `SELECT COUNT(*) AS ${depends.quoteIdentifier('count')}\nFROM ${this.tables.toSql()}`
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
