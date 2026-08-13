import assert   from 'node:assert/strict'
import { test } from 'node:test'

import { like }              from '@itrocks/sql-functions'
import { sqlJoinDependsOn }  from '@itrocks/sql-join'
import { Count }             from '../src/sql-build'
import { Select }            from '../src/sql-build'
import { sqlBuildDependsOn } from '../src/sql-build'

type TableDefinition = {
	columns: Record<string, ColumnDefinition>
	table:   string
}

type ColumnDefinition = {
	multiple?: boolean
	name:      string
	required?: boolean
	right?:    ColumnDefinition
	scalar?:   boolean
	target?:   TableDefinition
}

const client: TableDefinition = {
	columns: {
		name:   { name: 'display_name', scalar: true },
		number: { name: 'number', scalar: true }
	},
	table: 'clients'
}

const orderLine: TableDefinition = {
	columns: {
		order:    { name: 'parent_order' },
		quantity: { name: 'quantity', scalar: true }
	},
	table: 'order_lines'
}

const order: TableDefinition = {
	columns: {
		client: { name: 'buyer_reference', required: true, target: client },
		lines:  { name: 'lines' },
		number: { name: 'number', scalar: true }
	},
	table: 'orders'
}

orderLine.columns.order = { name: 'parent_order', required: true, target: order }
order.columns.lines = {
	multiple: true,
	name:     'lines',
	required: true,
	right:    orderLine.columns.order,
	target:   orderLine
}

test('builds a parameterized SELECT for root columns', () =>
{
	const query = new Select(order, ['number'], { number: 42 }).build()

	assert.equal(
		query.sql,
		'SELECT `t0`.`number`\nFROM `orders` AS `t0`\nWHERE `t0`.`number` = ?'
	)
	assert.deepEqual(query.values, [42])
})

test('shares joins between selected and filtered property paths', () =>
{
	const select = new Select(order, ['number', 'client.name'], { 'client.name': like('A%') })
	const query = select.build()

	assert.equal(
		query.sql,
		'SELECT `t0`.`number`, `t1`.`display_name` AS `client.name`\n'
		+ 'FROM `orders` AS `t0`\n'
		+ 'INNER JOIN `clients` AS `t1` ON `t0`.`buyer_reference_id` = `t1`.`id`\n'
		+ 'WHERE `t1`.`display_name` LIKE ?'
	)
	assert.deepEqual(query.values, ['A%'])
	assert.equal(select.joins.getOrderedJoins().length, 1)
	assert.deepEqual(select.build(), query)
})

test('uses sql-join for one-to-many paths and accepts explicit output aliases', () =>
{
	const query = new Select(order, [{ alias: 'ordered_quantity', path: 'lines.quantity' }]).build()

	assert.equal(
		query.sql,
		'SELECT `t1`.`quantity` AS `ordered_quantity`\n'
		+ 'FROM `orders` AS `t0`\n'
		+ 'INNER JOIN `order_lines` AS `t1` ON `t0`.`id` = `t1`.`parent_order_id`'
	)
	assert.deepEqual(query.values, [])
})

test('renders null filters without binding a value', () =>
{
	const query = new Select(order, ['number'], { number: null }).build()

	assert.match(query.sql, /WHERE `t0`.`number` IS NULL$/)
	assert.deepEqual(query.values, [])
})

test('builds COUNT queries with the same joins and values', () =>
{
	const count = new Count(order, { 'client.number': 7 }, { aliasPrefix: 'count_' })
	const query = count.build()

	assert.equal(
		query.sql,
		'SELECT COUNT(*) AS `count`\n'
		+ 'FROM `orders` AS `count_t0`\n'
		+ 'INNER JOIN `clients` AS `count_t1` ON `count_t0`.`buyer_reference_id` = `count_t1`.`id`\n'
		+ 'WHERE `count_t1`.`number` = ?'
	)
	assert.deepEqual(query.values, [7])
})

test('selects the root wildcard and rejects relationship projections', () =>
{
	assert.equal(new Select(order).toSql(), 'SELECT `t0`.*\nFROM `orders` AS `t0`')
	assert.throws(
		() => new Select(order, ['client']).build(),
		/resolves to a relationship instead of a scalar column/
	)
})

test('allows adapters to number placeholders', () =>
{
	sqlBuildDependsOn<ColumnDefinition>({ placeholderOf: position => `$${position}` })
	const query = new Select(order, ['number'], { number: 1, 'client.name': like('A%') }).build()

	assert.match(query.sql, /`t0`.`number` = \$1 AND `t1`.`display_name` LIKE \$2$/)
	assert.deepEqual(query.values, [1, 'A%'])
	sqlBuildDependsOn<ColumnDefinition>({ placeholderOf: () => '?' })
})

test('allows adapters to resolve arbitrary definitions and identifier quoting', () =>
{
	type ReflectedColumn = { field: string, primitive: boolean, target?: ReflectedTable }
	type ReflectedTable  = { fields: Map<string, ReflectedColumn>, physical: string }

	const owner: ReflectedTable = {
		fields: new Map([['label', { field: 'display_label', primitive: true }]]),
		physical: 'owners'
	}
	const reflected: ReflectedTable = {
		fields: new Map([
			['label', { field: 'display_label', primitive: true }],
			['owner', { field: 'assigned_owner', primitive: false, target: owner }]
		]),
		physical: 'reflected_rows'
	}

	sqlJoinDependsOn<ReflectedTable, ReflectedColumn>({
		columnDefinitionOf:  (definition, column) => definition.fields.get(column),
		columnDefinitionsOf: definition => Object.fromEntries(definition.fields),
		columnOf:            definition => definition.field,
		isScalar:            definition => definition.primitive,
		quoteIdentifier:     identifier => `"${identifier}"`,
		tableDefinitionOf:   definition => definition.target,
		tableOf:             definition => definition.physical
	})
	sqlBuildDependsOn<ReflectedColumn>({
		columnOf:        definition => definition.field,
		quoteIdentifier: identifier => `"${identifier}"`
	})

	const query = new Select<ReflectedTable, ReflectedColumn>(reflected, ['owner.label']).build()
	assert.equal(
		query.sql,
		'SELECT "t1"."display_label" AS "owner.label"\n'
		+ 'FROM "reflected_rows" AS "t0"\n'
		+ 'LEFT JOIN "owners" AS "t1" ON "t0"."assigned_owner" = "t1"."id"'
	)
})
