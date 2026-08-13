# Dependency configuration

`@itrocks/sql-build` resolves physical scalar column names, placeholders, and quoted identifiers through dependencies
supplied to `sqlBuildDependsOn()`. Configure both `@itrocks/sql-build` and `@itrocks/sql-join` before constructing the
first query when the default metadata shape does not apply.

## Defaults

| Dependency        | Default behaviour                                                       |
|-------------------|-------------------------------------------------------------------------|
| `columnOf`        | Returns a string definition, or reads `name` from an object definition. |
| `placeholderOf`   | Returns `?` for every one-based value position.                         |
| `quoteIdentifier` | Wraps the identifier in backticks and doubles embedded backticks.       |

The package deliberately has no dependency for table or relationship resolution. `@itrocks/sql-join` owns those
contracts and must be configured through its own `sqlJoinDependsOn()` function.

## Generic configuration

Supply only dependencies that differ from the defaults:

```ts
import { sqlBuildDependsOn } from '@itrocks/sql-build'
import { sqlJoinDependsOn }  from '@itrocks/sql-join'

const quoteIdentifier = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`

sqlJoinDependsOn<TableDefinition, ColumnDefinition>({
	columnDefinitionOf:  (table, column) => table.fields.get(column),
	columnDefinitionsOf: table => Object.fromEntries(table.fields),
	columnOf:            column => column.physical,
	isScalar:            column => column.target === undefined,
	quoteIdentifier,
	tableDefinitionOf:   column => column.target,
	tableOf:             table => table.physical
})

sqlBuildDependsOn<ColumnDefinition>({
	columnOf:        column => column.physical,
	placeholderOf:   position => `$${position}`,
	quoteIdentifier
})
```

`columnOf` appears in both configurations because the packages have separate responsibilities: `@itrocks/sql-join`
uses it to render relationship columns, while `@itrocks/sql-build` uses it for projected and filtered scalar columns.
Supplying the same naming adapter keeps both parts of a query consistent.

Partial configuration preserves the defaults for omitted dependencies. Configuration is process-wide and affects
builders when they render a query.

## it.rocks framework configuration

The framework supplies the following mapping in its
[`bind()` composition root](https://github.com/itrocks-ts/framework/blob/main/src/dependencies.ts):

- `columnOf` is supplied by the framework SQL metadata adapter. It maps reflected properties to their stored field and
  ultimately uses [`toColumn` from `@itrocks/rename`](https://github.com/itrocks-ts/rename#tocolumn).
- `placeholderOf` keeps the `?` default expected by the current MariaDB driver.
- `quoteIdentifier` keeps the deterministic backtick default. The current MySQL data source uses the same identifier
  quoting convention.

The framework configures `@itrocks/sql-join` separately with the same reflected `ColumnDefinition`, table definitions,
relationship metadata, and physical naming adapter.
