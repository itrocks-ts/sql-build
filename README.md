[![npm version](https://img.shields.io/npm/v/@itrocks/sql-build?logo=npm)](https://www.npmjs.org/package/@itrocks/sql-build)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/sql-build)](https://www.npmjs.org/package/@itrocks/sql-build)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/sql-build?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/sql-build)
[![issues](https://img.shields.io/github/issues/itrocks-ts/sql-build)](https://github.com/itrocks-ts/sql-build/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# sql-build

Builds parameterized SQL SELECT and COUNT queries from relational table metadata.

The package models read queries without importing reflection, a database driver, or the it.rocks framework. It delegates
relationship path resolution and `JOIN` rendering to
[`@itrocks/sql-join`](https://github.com/itrocks-ts/sql-join).

## Requirements

- Node.js 24 or newer.
- Metadata compatible with the defaults described below, or dependency configuration performed before the first query.

## Installation

```bash
npm i @itrocks/sql-build
```

## Overview

A query starts with a free `TableDefinition`. Its scalar and relationship columns are free `ColumnDefinition` objects.
The packages resolve these definitions in two layers:

- `@itrocks/sql-join` resolves tables, relationships, aliases, and joins;
- `@itrocks/sql-build` resolves the physical name of each projected or filtered scalar column.

The default metadata shape uses a `table` name, a `columns` record, and columns with `name`, `scalar`, `target`,
`required`, `multiple`, and `right` fields. Applications may replace this shape through dependency configuration.

Every complete builder returns the SQL text and bound values separately. Values are never interpolated into SQL.

## Usage

```ts
import { like }   from '@itrocks/sql-functions'
import { Select } from '@itrocks/sql-build'

type ColumnDefinition = {
	name:      string
	required?: boolean
	scalar?:   boolean
	target?:   TableDefinition
}

type TableDefinition = {
	columns: Record<string, ColumnDefinition>
	table:   string
}

const clients: TableDefinition = {
	columns: {
		name: { name: 'display_name', scalar: true }
	},
	table: 'clients'
}

const orders: TableDefinition = {
	columns: {
		client: { name: 'client', required: true, target: clients },
		number: { name: 'number', scalar: true }
	},
	table: 'orders'
}

const query = new Select(orders, ['number', 'client.name'], { 'client.name': like('A%') }).build()

query.sql
// SELECT `t0`.`number`, `t1`.`display_name` AS `client.name`
// FROM `orders` AS `t0`
// INNER JOIN `clients` AS `t1` ON `t0`.`client_id` = `t1`.`id`
// WHERE `t1`.`display_name` LIKE ?

query.values
// ['A%']
```

Pass `query.sql` and `query.values` to a database driver that supports `?` placeholders.

## Phase 1 behaviour

- An omitted `columns` argument selects only the root table wildcard, such as `` `t0`.* ``.
- Scalar paths may cross the object and one-to-many relationships supported by phase 1 of `@itrocks/sql-join`.
- Nested output columns receive their property path as an SQL alias by default.
- An explicit `{ path, alias }` selection replaces the automatic output alias.
- All entries in `where` are combined with `AND`, in insertion order.
- A normal filter uses `= ?`; `null` uses `IS NULL`; an
  [`SqlFunction`](https://github.com/itrocks-ts/sql-functions) supplies its comparison and value.
- Projecting a relationship path itself is rejected. Select a scalar descendant such as `client.name`.
- Inverse paths, many-to-many paths, logical condition trees, object hydration, query modifiers, and writes are not part
  of phase 1.

## API

### Select

```ts
new Select<TableDefinition, ColumnDefinition>(tableDefinition, columns?, where?, options?: SelectOptions)
```

Builds one parameterized `SELECT` query. The second argument configures projections, the third configures filters, and
`options.aliasPrefix` prefixes aliases allocated by `@itrocks/sql-join`.

- `build()` returns `{ sql, values }`.
- `toSql()` and `toString()` return the placeholder SQL without values.
- `columns`, `where`, `tables`, and `joins` expose the shared component builders.

### Count

```ts
new Count<TableDefinition, ColumnDefinition>(tableDefinition, where?, options?: CountOptions)
```

Builds `SELECT COUNT(*) AS count` with the same phase 1 filters and joins as `Select`.

### Columns

```ts
new Columns<TableDefinition, ColumnDefinition>(tableDefinition, selections?, joins?)
```

Renders a comma-separated projection list. Supplying a `Joins` instance lets several query components share aliases and
resolved paths.

### Where

```ts
new Where<TableDefinition, ColumnDefinition>(tableDefinition, conditions?, joins?)
```

Builds a flat, `AND`-combined `WHERE` clause. `build()` returns its SQL fragment and values.

### Tables

```ts
new Tables<TableDefinition, ColumnDefinition>(tableDefinition, joins?)
```

Renders the root table and all joins already registered in the shared `Joins` instance.

### Query types

```ts
type ColumnSelection = string | { alias?: string, path: string }
type WhereConditions = Readonly<Record<string, unknown>>
type SqlQuery = { sql: string, values: readonly unknown[] }
```

`SelectOptions` and `CountOptions` contain only the optional `aliasPrefix` setting. Projections and conditions stay as
separate constructor arguments because they are the most common inputs.

## Dependencies

See [dependency configuration](docs/dependencies.md) for defaults, generic metadata adapters, and the it.rocks framework
binding.
