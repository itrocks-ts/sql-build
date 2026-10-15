import { ColumnSelection }   from '@itrocks/sql-build'
import { Count }             from '@itrocks/sql-build'
import { Dependencies }      from '@itrocks/sql-build'
import { ProjectionColumn }  from '@itrocks/sql-build'
import { ProjectionError }   from '@itrocks/sql-build'
import { ProjectionField }   from '@itrocks/sql-build'
import { ProjectionOptions } from '@itrocks/sql-build'
import { ProjectionQuery }   from '@itrocks/sql-build'
import { Select }            from '@itrocks/sql-build'
import { sqlBuildDependsOn } from '@itrocks/sql-build'

type Column = { name: string, scalar?: boolean, target?: Table }
type Table = { columns: Record<string, Column>, table: string }

const table: Table = { table: 'example', columns: { name: { name: 'name', scalar: true } } }
const selections: readonly ColumnSelection[] = [{ path: 'name' }]
const options: ProjectionOptions = { limit: 50, offset: 0, orderBy: [{ path: 'name' }], rootIds: [1, 2] as const }
const query: ProjectionQuery<Column, Table>
	= new Select<Table, Column>(table, selections, {}, options).buildProjection()
const column: ProjectionColumn<Column> = query.columns[0]
const field: ProjectionField<Column> = column.fields[0]
const definition: Column | undefined = field.definition
const target: Table | undefined = query.graph.getPath('name').tableDefinition
const error = new ProjectionError('multiple-values', 'children.name')
const legacy: Dependencies<Column> = {
	columnOf: column => column.name,
	placeholderOf: () => '?',
	quoteIdentifier: name => name
}
sqlBuildDependsOn(legacy)
sqlBuildDependsOn<Column, Table>({ objectFieldsOf: table => Object.keys(table.columns) })
new Count(table, {}, { rootIds: [1, 2] as const }).build()
void [definition, target, error]

// @ts-expect-error Projection descriptors preserve readonly column order.
query.columns.push(column)
// @ts-expect-error Fields cannot be mutated through the public result.
column.fields.push(field)
// @ts-expect-error Object field paths must be strings.
const invalid: ColumnSelection = { path: 'name', objectFields: [2] }
// @ts-expect-error Pagination uses numeric limits.
const invalidOptions: ProjectionOptions = { limit: '50' }
// @ts-expect-error A stored scalar definition remains the configured metadata type.
const wrong: { unrelated: string } = field.definition!
void [invalid, invalidOptions, wrong]
