import { Joins }             from '@itrocks/sql-join'
import { RelationshipError } from '@itrocks/sql-join'
import { RelationshipGraph } from '@itrocks/sql-join'
import { qualified }         from './column-reference'
import { depends }           from './dependencies'
import { graphPaths }        from './graph-reference'
import { graphReference }    from './graph-reference'
import { singular }          from './graph-reference'
import { ProjectionError }   from './projection-error'
import { ColumnSelection }   from './query'
import { ProjectionColumn }  from './query'
import { ProjectionField }   from './query'
import { ProjectionOptions } from './query'
import { ProjectionQuery }   from './query'
import { graphTables }       from './tables'
import { Where }             from './where'

type Selection = { path: string, objectFields?: readonly string[] }

export function buildProjection<T, C>(
	table: T, selections: readonly ColumnSelection[], where: Where<T, C>, options: ProjectionOptions, aliasPrefix = ''
): ProjectionQuery<C, T>
{
	validateOptions(options)
	const selected: Selection[] = selections.map(selection => {
		if ((typeof selection !== 'string') && (selection.alias !== undefined)) {
			throw new ProjectionError('unsupported-option', selection.path)
		}
		return (typeof selection === 'string') ? { path: selection } : selection
	})
	if (new Set(selected.map(selection => selection.path)).size !== selected.length) {
		throw new ProjectionError('invalid-path')
	}
	const orderBy = [...(options.orderBy ?? [])]
	if (!orderBy.some(order => order.path === 'id')) orderBy.push({ path: 'id' })
	const requestedPaths = [...selected.map(selection => selection.path), ...Object.keys(where.conditions),
		...orderBy.map(order => order.path)]
	// Discover object expansion from metadata; only the final complete graph allocates SQL query aliases.
	const discovery = new RelationshipGraph<T, C>(table, graphPaths(requestedPaths), aliasPrefix)
	const expanded = selected.map(selection => {
		const node = graphReference(discovery, selection.path).node
		singular(node)
		const object = !!node?.relationship && !selection.path.endsWith('.id')
		if (!object) {
			if (selection.objectFields !== undefined) throw new ProjectionError('unsupported-selection', selection.path)
			return { ...selection, fields: undefined }
		}
		const fields = selection.objectFields ?? directFields<T, C>(node!.tableDefinition!)
		const fullPaths = fields.map(field => `${selection.path}.${field}`)
		graphPaths(fields)
		if (new Set(fields).size !== fields.length) throw new ProjectionError('invalid-path', selection.path)
		const fieldGraph = new RelationshipGraph<T, C>(table, graphPaths(fullPaths), aliasPrefix)
		const leaves: string[] = []
		for (const field of fields) {
			const fieldNode = graphReference(fieldGraph, `${selection.path}.${field}`).node
			singular(fieldNode)
			if (fieldNode?.relationship && !field.endsWith('.id') && (field !== 'id')) {
				leaves.push(`${field}.id`, ...directFields<T, C>(fieldNode.tableDefinition!).map(leaf => `${field}.${leaf}`))
			}
			else leaves.push(field)
		}
		requestedPaths.push(...leaves.map(field => `${selection.path}.${field}`))
		return { ...selection, fields: [...new Set(leaves)] }
	})
	const graph = new RelationshipGraph<T, C>(table, graphPaths(requestedPaths), aliasPrefix)
	const output: string[] = []
	const aliases = new Map<string, string>()
	const add = (sql: string): string => {
		let alias = aliases.get(sql)
		if (alias === undefined) {
			alias = `p${aliases.size}`
			aliases.set(sql, alias)
			output.push(`${sql} AS ${depends.quoteIdentifier(alias)}`)
		}
		return alias
	}
	const rootIdentityAlias = add(qualified(graph.rootAlias(), 'id'))
	const columns: ProjectionColumn<C>[] = expanded.map(selection => {
		const reference = graphReference(graph, selection.path)
		const fields: ProjectionField<C>[] = []
		const presence: { alias: string, path: string }[] = []
		const addIdentity = (path: string, relativePath: string): void => {
			const alias = add(qualified(graph.getPath(path).alias, 'id'))
			if (!fields.some(field => field.relativePath === relativePath)) {
				fields.push({ alias, relativePath, role: 'identity' })
			}
		}
		let ancestor = reference.node
		while (ancestor) {
			if (ancestor.relationship) presence.unshift({
				alias: add(qualified(ancestor.alias, 'id')), path: ancestor.path
			})
			ancestor = ancestor.parentPath ? graph.getPath(ancestor.parentPath) : undefined
		}
		if (selection.fields === undefined) {
			fields.push({ alias: add(reference.sql), definition: reference.definition, relativePath: '',
				role: reference.definition === undefined ? 'identity' : 'value' })
		}
		else {
			addIdentity(selection.path, 'id')
			for (const field of selection.fields) {
				const fullPath = `${selection.path}.${field}`
				const leaf = graphReference(graph, fullPath)
				singular(leaf.node)
				let parent = leaf.node
				while (parent && (parent.path !== selection.path)) {
					if (parent.relationship) addIdentity(parent.path, `${parent.path.slice(selection.path.length + 1)}.id`)
					parent = parent.parentPath ? graph.getPath(parent.parentPath) : undefined
				}
				if (!fields.some(existing => existing.relativePath === field)) fields.push({
					alias: add(leaf.sql), definition: leaf.definition, relativePath: field,
					role: leaf.definition === undefined ? 'identity' : 'value'
				})
			}
		}
		return { fields, kind: selection.fields === undefined ? 'scalar' : 'object',
			objectFields: selection.fields, path: selection.path, presence }
	})
	const order = orderBy.map(item => {
		const reference = graphReference(graph, item.path)
		singular(reference.node)
		return `${reference.sql} ${item.descending ? 'DESC' : 'ASC'}`
	})
	const predicate = where.buildGraph(graph, options.rootIds)
	const values = [...predicate.values]
	let sql = `SELECT ${output.join(', ')}\nFROM ${graphTables(graph, predicate.joins)}`
	if (predicate.sql) sql += `\n${predicate.sql}`
	sql += `\nORDER BY ${order.join(', ')}`
	if (options.limit !== undefined) {
		values.push(options.limit)
		sql += `\nLIMIT ${depends.placeholderOf(values.length)}`
		if (options.offset !== undefined) {
			values.push(options.offset)
			sql += ` OFFSET ${depends.placeholderOf(values.length)}`
		}
	}
	return { columns, graph, rootIdentityAlias, sql, values }
}

function directFields<T, C>(table: T): readonly string[]
{
	if (depends.objectFieldsOf) return depends.objectFieldsOf(table)
	const fields: string[] = []
	for (const path of new Joins<T, C>(table).getColumnDefinitions('').keys()) {
		if (path === 'id') continue
		try {
			const node = new RelationshipGraph<T, C>(table, [path]).getPath(path)
			if (!node.relationship && (node.multiplicity === 'one')) fields.push(path)
		}
		catch (error) {
			// An unmapped relation is not a directly stored scalar field.
			if (!(error instanceof RelationshipError) || (error.code !== 'unsupported-relationship')) throw error
		}
	}
	return fields.sort()
}

function validateOptions(options: ProjectionOptions): void
{
	if (Object.keys(options).some(key => !['aliasPrefix', 'limit', 'offset', 'orderBy', 'rootIds'].includes(key))) {
		throw new ProjectionError('unsupported-option')
	}
	for (const value of [options.limit, options.offset]) {
		if ((value !== undefined) && (!Number.isSafeInteger(value) || (value < 0))) {
			throw new ProjectionError('unsupported-option')
		}
	}
	if ((options.offset !== undefined) && (options.limit === undefined)) {
		throw new ProjectionError('unsupported-option')
	}
	const paths = new Set<string>()
	for (const order of options.orderBy ?? []) {
		if (paths.has(order.path) || ((order.descending !== undefined) && (typeof order.descending !== 'boolean'))) {
			throw new ProjectionError('unsupported-option', order.path)
		}
		paths.add(order.path)
	}
}
