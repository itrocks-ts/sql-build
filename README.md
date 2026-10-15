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

## Low-level selection

- An omitted `columns` argument selects only the root table wildcard, such as `` `t0`.* ``.
- Scalar paths may cross the object and one-to-many relationships supported by phase 1 of `@itrocks/sql-join`.
- Nested output columns receive their property path as an SQL alias by default.
- An explicit `{ path, alias }` selection replaces the automatic output alias.
- All entries in `where` are combined with `AND`, in insertion order.
- A normal filter uses `= ?`; `null` uses `IS NULL`; an
  [`SqlFunction`](https://github.com/itrocks-ts/sql-functions) supplies its comparison and value.
- Projecting a relationship path itself is rejected. Select a scalar descendant such as `client.name`.
- `build()` retains joined row semantics for plural projections. Logical condition trees, hydration and writes are
  outside this builder. Use `buildProjection()` for one row per root and explicit object field mappings.

## API

### Select

```ts
new Select<TableDefinition, ColumnDefinition>(tableDefinition, columns?, where?, options?: SelectOptions)
```

Builds one parameterized `SELECT` query. The second argument configures projections, the third configures filters, and
`options.aliasPrefix` prefixes aliases allocated by `@itrocks/sql-join`.

- `build()` returns `{ sql, values }` with the low-level projection behaviour above.
- `buildProjection()` returns `ProjectionQuery<ColumnDefinition, TableDefinition>` as described below.
- `toSql()` and `toString()` return the placeholder SQL without values.
- `columns`, `where`, `tables`, and `joins` expose the shared component builders.

### Count

```ts
new Count<TableDefinition, ColumnDefinition>(tableDefinition, where?, options?: CountOptions)
```

Builds `SELECT COUNT(*) AS count` using the same root predicates as `Select.buildProjection()`. Plural criteria use
correlated `EXISTS`, so multiple matching children do not inflate the total. Options accept `aliasPrefix` and
`rootIds`; count is unbounded. Existing scalar criteria and trusted functions keep their behaviour.

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

Builds a flat, `AND`-combined `WHERE` clause. `build()` returns its SQL fragment and values for the low-level joins.
`buildGraph(graph, rootIds?)` compiles the same operators against a complete `RelationshipGraph` and returns
`{ sql, values, joins }`, where `joins` contains only the outer singular joins. Both count and projection use it.

### Tables

```ts
new Tables<TableDefinition, ColumnDefinition>(tableDefinition, joins?)
```

Renders the root table and all joins already registered in the shared `Joins` instance.

### Query types

```ts
type ColumnSelection = string | { alias?: string, objectFields?: readonly string[], path: string }
type WhereConditions = Readonly<Record<string, unknown>>
type SqlQuery = { sql: string, values: readonly unknown[] }
```

`SelectOptions` extends `ProjectionOptions` with optional `aliasPrefix`. These neutral options affect
`buildProjection()`; `build()` retains its existing behaviour. `CountOptions` accepts `aliasPrefix` and `rootIds`.
Projections and conditions stay as separate constructor arguments.

## Root and object projection

```ts
const query = new Select(orders, [
	{ path: 'client', objectFields: ['name'] },
	'client.name'
], { 'client.number': 7 }, {
	limit: 50,
	offset: 0,
	orderBy: [{ path: 'client.name' }],
	rootIds: [10, 12]
}).buildProjection()
```

Pass `query.sql` and `query.values` to the driver. The builder returns no records and performs no conversion or
representation formatting. The adapter reconstructs partial objects from the explicit descriptors:

- `rootIdentityAlias` identifies the root's hidden `id` column. Empty or omitted selections return root identities
  and an empty `columns` array.
- `columns` preserves request order; duplicate paths reject. Each `ProjectionColumn` has `path`, `kind`, `fields`
  and an ordered `presence` list of `{ path, alias }` from the first ancestor to the selected relation.
- `ProjectionField` has `alias`, `relativePath`, `role` (`value` or `identity`) and optional `definition`.
  Scalar columns use relative path `''`. Object identities use `id`; nested identities use paths such as `country.id`.
  Value definitions are the actual final property metadata. Synthetic identities omit a definition and follow the
  adapter's identity conversion convention. A null presence identity distinguishes absence from a null scalar value.
- Object `objectFields` records the planned relative field paths. Omission expands directly stored scalar fields;
  an empty list loads identity only. Explicit nested singular paths include hidden identities at each object boundary.
  A terminal object field expands its direct scalars and identity. The optional metadata binding can exclude nonstored
  fields. Scalar columns cannot receive `objectFields`.
- `graph` exposes the final shared `RelationshipGraph<TableDefinition, ColumnDefinition>` for target definitions,
  final property owners and relationship facts. It registers selection, expanded fields, criteria and ordering before
  SQL rendering. Metadata discovery graphs are not rendered.

The final graph deduplicates full relationship paths, with distinct aliases for different paths to the same type.
Optional ancestry keeps downstream left joins. Output aliases use the reserved `p0`, `p1`, … namespace, and
identical SQL fields share an alias across descriptors. Table aliases use `t0`, `t1`, …, optionally prefixed.
Explicit output aliases apply only to low-level `build()`; projection rejects them to protect its reserved namespace.
The technical `id` and `<relation>.id` paths refer to storage identities even when absent from model metadata.

### Ordering and root restrictions

`ProjectionOptions` exports `orderBy?: readonly { path: string, descending?: boolean }[]`, `limit?: number`,
`offset?: number` and `rootIds?: readonly unknown[]`. The storage adapter validates and converts identifier operands.
Scalar order paths use their stored values; object paths use identity. Ascending root id is appended unless explicit.
An omitted or empty order uses ascending root id. Duplicate order paths and unknown options reject.

Limit and offset must be nonnegative safe integers. Offset requires a limit; zero limit is a bound zero, not unlimited.
Omission is unbounded. Limits, offsets, criteria and deduplicated root identities all use the placeholder dependency
in one parameter stream. Empty root ids add an always-false predicate; other ids intersect with the criteria.
Stable pagination assumes a fixed dataset and correctly declared singular relationships.

### Predicates and errors

Count and projection share the flat AND compiler. Equality binds an operand, null uses `IS NULL`, and existing trusted
`SqlFunction` operators must contain exactly one placeholder. Object criteria compare joined identities; object null
checks absence. The builder does not transform operand values or accept request SQL.

Known plural criteria compile to correlated `EXISTS`. Conditions under the same plural prefix constrain the same
related row; independent branches use separate scopes and nested plural paths use nested scopes. Link mappings come
from `sql-join`; a link row must join an existing target. A null field criterion within a plural scope requires an
existing related row, never an absent collection. Plural joins stay outside the root FROM, count and page stream.

Projection or ordering through any plural relation throws `ProjectionError('multiple-values', path)`.
Unknown multiplicity throws `unsupported-selection`; malformed projection input uses `invalid-path`, and invalid
options use `unsupported-option`. `ProjectionErrorCode` exports these codes. Graph metadata errors retain the public
`RelationshipError` codes and path from `sql-join`. Adapters map these builder errors to their own public errors.
`ProjectionQuery`, `ProjectionColumn`, `ProjectionField` and `ProjectionOptions` are exported types.

Run `npm run build` and `npm test` inside this package to compile public output and execute compatibility, type and
metadata-only projection tests. No database is accessed by this suite.

## Dependencies

See [dependency configuration](docs/dependencies.md) for defaults, generic metadata adapters, and the it.rocks framework
binding.
