import { Dependencies }      from '../src/sql-build'
import { Select }            from '../src/sql-build'
import { sqlBuildDependsOn } from '../src/sql-build'

type ColumnDefinition = {
	name:   string
	scalar: boolean
}

type TableDefinition = {
	columns: Record<string, ColumnDefinition>
	table:   string
}

const dependencies: Partial<Dependencies<ColumnDefinition>> = {
	columnOf:        definition => definition.name,
	placeholderOf:   position => `$${position}`,
	quoteIdentifier: identifier => `"${identifier}"`
}

sqlBuildDependsOn(dependencies)

const tableDefinition: TableDefinition = {
	columns: { number: { name: 'number', scalar: true } },
	table:   'orders'
}

const select = new Select<TableDefinition, ColumnDefinition>(tableDefinition, ['number'])

void select

// @ts-expect-error Columns must be passed as the second argument, not in options.
new Select<TableDefinition, ColumnDefinition>(tableDefinition, { columns: ['number'] })

// @ts-expect-error Select must receive the configured TableDefinition.
new Select<TableDefinition, ColumnDefinition>('orders')

sqlBuildDependsOn<ColumnDefinition>({
	// @ts-expect-error columnOf must receive the configured ColumnDefinition.
	columnOf: (definition: { incompatible: true }) => String(definition.incompatible)
})

sqlBuildDependsOn<ColumnDefinition>({
	// @ts-expect-error placeholderOf must receive a number.
	placeholderOf: (position: string) => position
})

sqlBuildDependsOn<ColumnDefinition>({
	// @ts-expect-error quoteIdentifier must receive a string.
	quoteIdentifier: (identifier: number) => String(identifier)
})
