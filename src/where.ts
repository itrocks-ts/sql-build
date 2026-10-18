import { SqlFunction }        from '@itrocks/sql-functions'
import { Join }               from '@itrocks/sql-join'
import { JoinMode }           from '@itrocks/sql-join'
import { Joins }              from '@itrocks/sql-join'
import { RelationshipGraph }  from '@itrocks/sql-join'
import { columnReferenceSql } from './column-reference'
import { depends }            from './dependencies'
import { graphReference }     from './graph-reference'
import { ProjectionError }    from './projection-error'
import { SqlQuery }           from './query'
import { WhereConditions }    from './query'

type Scope<T, C> = {
	children: Map<string, Scope<T, C>>
	conditions: [string, unknown][]
	joins: Join<T | undefined, C>[]
}

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
			parts.push(this.predicate(column, value, values))
		}
		return {
			sql:    parts.length ? `WHERE ${parts.join(' AND ')}` : '',
			values
		}
	}

	buildGraph(graph: RelationshipGraph<TableDefinition, ColumnDefinition>, rootIds?: readonly unknown[])
		: SqlQuery & { joins: readonly Join<TableDefinition | undefined, ColumnDefinition>[] }
	{
		const root: Scope<TableDefinition, ColumnDefinition> = { children: new Map(), conditions: [], joins: [] }
		const scopes = new Map<string, Scope<TableDefinition, ColumnDefinition>>([['', root]])
		for (const node of graph.getPaths().values()) {
			const parent = scopes.get(node.parentPath) ?? root
			if (node.multiplicity === 'unknown') throw new ProjectionError('unsupported-selection', node.path)
			if (node.relationship?.multiplicity === 'many') {
				// A link row alone is not a related object: its target must exist inside this scope.
				const joins = node.joins.map(join => new Join({ ...join, mode: JoinMode.inner }))
				const scope = { children: new Map(), conditions: [], joins }
				parent.children.set(node.path, scope)
				scopes.set(node.path, scope)
			}
			else {
				parent.joins.push(...node.joins)
				scopes.set(node.path, parent)
			}
		}
		for (const [path, value] of Object.entries(this.conditions)) {
			const reference = graphReference(graph, path)
			const scope = reference.node ? scopes.get(reference.node.path)! : root
			scope.conditions.push([reference.sql, value])
		}
		const values: unknown[] = []
		const render = (scope: Scope<TableDefinition, ColumnDefinition>): string[] => {
			const parts = scope.conditions.map(([column, value]) => this.predicate(column, value, values))
			for (const child of scope.children.values()) {
				const conditions = render(child)
				const [first, ...joins] = child.joins
				conditions.unshift(`${first.leftSql()} = ${first.rightSql()}`)
				const from = `${depends.quoteIdentifier(first.rightTable)} AS ${depends.quoteIdentifier(first.rightAlias)}`
				parts.push(`EXISTS (SELECT 1 FROM ${from}`
					+ joins.map(join => `\n${join.toSql()}`).join('') + `\nWHERE ${conditions.join(' AND ')})`)
			}
			return parts
		}
		const parts = render(root)
		if (rootIds !== undefined) {
			const ids = [...new Set(rootIds)]
			const placeholders = ids.map(id => {
				values.push(id)
				return depends.placeholderOf(values.length)
			})
			parts.push(ids.length ? `${graphReference(graph, 'id').sql} IN (${placeholders.join(', ')})` : '1 = 0')
		}
		return { joins: root.joins, sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', values }
	}

	private predicate(column: string, value: unknown, values: unknown[]): string
	{
		if (Array.isArray(value)) {
			if (!value.length) return '1 = 0'
			const placeholders = value.map(operand => {
				values.push(operand)
				return depends.placeholderOf(values.length)
			})
			return `${column} IN (${placeholders.join(', ')})`
		}
		if (value === null) return `${column} IS NULL`
		if (value instanceof SqlFunction) {
			if (value.sql.split('?').length !== 2) {
				throw new Error(`SQL function '${value.name}' must contain exactly one placeholder`)
			}
			const sql = column + value.sql.replace('?', depends.placeholderOf(values.length + 1))
			values.push(value.value)
			return sql
		}
		values.push(value)
		return `${column} = ${depends.placeholderOf(values.length)}`
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
