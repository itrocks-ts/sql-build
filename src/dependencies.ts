
export type Dependencies<ColumnDefinition> = {
	columnOf:        (columnDefinition: ColumnDefinition) => string
	placeholderOf:   (position: number) => string
	quoteIdentifier: (identifier: string) => string
}

type FreeColumnDefinition = {
	name?: unknown
}

export const depends: Dependencies<unknown> = {
	columnOf:        defaultColumnOf,
	placeholderOf:   () => '?',
	quoteIdentifier: identifier => '`' + identifier.replaceAll('`', '``') + '`'
}

function defaultColumnOf(columnDefinition: unknown): string
{
	if (typeof columnDefinition === 'string') return columnDefinition
	if (!isObject(columnDefinition)) return String(columnDefinition)
	const name = (columnDefinition as FreeColumnDefinition).name
	return (typeof name === 'string') ? name : String(columnDefinition)
}

function isObject(value: unknown): value is Record<string, unknown>
{
	return (typeof value === 'object') && (value !== null)
}

export function sqlBuildDependsOn<ColumnDefinition>(dependencies: Partial<Dependencies<ColumnDefinition>>): void
{
	Object.assign(depends, dependencies)
}
