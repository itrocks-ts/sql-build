import { SqlFunction }        from '@itrocks/sql-functions'
import { Joins }              from '@itrocks/sql-join'
import { columnReferenceSql } from './column-reference'
import { depends }            from './dependencies'
import { SqlQuery }           from './query'
import { WhereConditions }    from './query'

export class Where<TableDefinition = unknown, ColumnDefinition = unknown>
{

	readonly conditions: WhereConditions
	readonly joins:      Joins<TableDefinition, ColumnDefinition>

	constructor(
		tableDefinition: TableDefinition,
		conditions:      WhereConditions = {},
		joins = new Joins<TableDefinition, ColumnDefinition>(tableDefinition)
	)
	{
		this.conditions = conditions
		this.joins      = joins
	}

	build(): SqlQuery
	{
		const parts:  string[]  = []
		const values: unknown[] = []
		for (const [columnPath, value] of Object.entries(this.conditions)) {
			const column = columnReferenceSql(this.joins, columnPath)
			if (value === null) {
				parts.push(`${column} IS NULL`)
				continue
			}
			if (value instanceof SqlFunction) {
				if (value.sql.split('?').length !== 2) {
					throw new Error(`SQL function '${value.name}' must contain exactly one placeholder`)
				}
				parts.push(column + value.sql.replace('?', depends.placeholderOf(values.length + 1)))
				values.push(value.value)
				continue
			}
			parts.push(`${column} = ${depends.placeholderOf(values.length + 1)}`)
			values.push(value)
		}
		return {
			sql:    parts.length ? `WHERE ${parts.join(' AND ')}` : '',
			values
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
