import { GraphPath }         from '@itrocks/sql-join'
import { RelationshipGraph } from '@itrocks/sql-join'
import { qualified }         from './column-reference'
import { depends }           from './dependencies'
import { ProjectionError }   from './projection-error'

export function graphPaths(paths: readonly string[]): string[]
{
	return paths.map(path => {
		if ((typeof path !== 'string') || path.split('.').some(part => !part.length)) {
			throw new ProjectionError('invalid-path', String(path))
		}
		return (path === 'id') ? '' : path.endsWith('.id') ? path.slice(0, -3) : path
	}).filter(path => path.length > 0)
}

export function graphReference<T, C>(graph: RelationshipGraph<T, C>, path: string)
	: { definition?: C, node?: GraphPath<T, C>, sql: string }
{
	if (path === 'id') return { sql: qualified(graph.rootAlias(), 'id') }
	const identity = path.endsWith('.id')
	const node = graph.getPath(identity ? path.slice(0, -3) : path)
	if (identity && !node.relationship) throw new ProjectionError('invalid-path', path)
	return {
		definition: (identity || node.relationship) ? undefined : node.definition,
		node,
		sql: qualified(node.alias, (identity || node.relationship) ? 'id' : depends.columnOf(node.definition))
	}
}

export function singular<T, C>(node: GraphPath<T, C> | undefined): void
{
	if (node?.multiplicity === 'many') throw new ProjectionError('multiple-values', node.path)
	if (node?.multiplicity === 'unknown') throw new ProjectionError('unsupported-selection', node.path)
}
