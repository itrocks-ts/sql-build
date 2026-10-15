import { Joins }             from '@itrocks/sql-join'
import { Columns }           from './columns'
import { buildProjection }   from './projection'
import { ColumnSelection }   from './query'
import { ProjectionOptions } from './query'
import { ProjectionQuery }   from './query'
import { SqlQuery }          from './query'
import { WhereConditions }   from './query'
import { Tables }            from './tables'
import { Where }             from './where'

export type SelectOptions = ProjectionOptions & {
	aliasPrefix?: string
}

export class Select<TableDefinition = unknown, ColumnDefinition = unknown>
{

	readonly columns: Columns<TableDefinition, ColumnDefinition>
	readonly joins:   Joins<TableDefinition, ColumnDefinition>
	readonly tables:  Tables<TableDefinition, ColumnDefinition>
	readonly where:   Where<TableDefinition, ColumnDefinition>

	constructor(
		private readonly tableDefinition: TableDefinition,
		columns?:        readonly ColumnSelection[],
		where?:          WhereConditions,
		private readonly options: SelectOptions = {}
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

	buildProjection(): ProjectionQuery<ColumnDefinition, TableDefinition>
	{
		return buildProjection(this.tableDefinition, this.columns.selections ?? [], this.where,
			this.options, this.options.aliasPrefix)
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
