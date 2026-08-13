import { Joins }           from '@itrocks/sql-join'
import { Columns }         from './columns'
import { ColumnSelection } from './query'
import { SqlQuery }        from './query'
import { WhereConditions } from './query'
import { Tables }          from './tables'
import { Where }           from './where'

export type SelectOptions = {
	aliasPrefix?: string
}

export class Select<TableDefinition = unknown, ColumnDefinition = unknown>
{

	readonly columns: Columns<TableDefinition, ColumnDefinition>
	readonly joins:   Joins<TableDefinition, ColumnDefinition>
	readonly tables:  Tables<TableDefinition, ColumnDefinition>
	readonly where:   Where<TableDefinition, ColumnDefinition>

	constructor(
		tableDefinition: TableDefinition,
		columns?:        readonly ColumnSelection[],
		where?:          WhereConditions,
		options:         SelectOptions = {}
	)
	{
		this.joins   = new Joins<TableDefinition, ColumnDefinition>(tableDefinition, [], options.aliasPrefix)
		this.columns = new Columns(tableDefinition, columns, this.joins)
		this.tables  = new Tables(tableDefinition, this.joins)
		this.where   = new Where(tableDefinition, where, this.joins)
	}

	build(): SqlQuery
	{
		const where = this.where.build()
		const sql   = `SELECT ${this.columns.toSql()}\nFROM ${this.tables.toSql()}`
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
