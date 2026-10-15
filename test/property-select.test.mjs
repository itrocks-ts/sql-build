import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Count, ProjectionError, Select, sqlBuildDependsOn } = require('@itrocks/sql-build')
const { sqlJoinDependsOn } = require('@itrocks/sql-join')
const { like } = require('@itrocks/sql-functions')

const scalar = name => ({ name, scalar: true })
const country = { table: 'countries', columns: { code: scalar('iso_code'), name: scalar('name') } }
const city = { table: 'cities', columns: {
	country: { name: 'country', target: country, required: true }, name: scalar('city_name')
} }
const address = { table: 'addresses', columns: {
	city: { name: 'city', target: city, required: true }, street: scalar('street')
} }
const customer = { table: 'customers', columns: {
	address: { name: 'address', target: address }, name: scalar('display_name')
} }
const line = { table: 'lines', columns: { price: scalar('price'), quantity: scalar('quantity') } }
const tag = { table: 'tags', columns: { name: scalar('tag_name') } }
const invoice = { table: 'invoices', columns: {
	billing: { name: 'billing', target: address }, customer: { name: 'customer', target: customer },
	number: scalar('invoice_number'), p0: scalar('p0'), shipping: { name: 'shipping', target: address }
} }
line.columns.invoice = { name: 'invoice', target: invoice }
invoice.columns.lines = { name: 'lines', target: line, multiple: true, right: line.columns.invoice }
invoice.columns.tags = { name: 'tags', target: tag, multiple: true, mapping: {
	leftColumn: 'id', rightColumn: 'id', through: { table: 'invoice_tag', leftColumn: 'invoice', rightColumn: 'tag' }
} }
line.columns.tags = invoice.columns.tags
customer.columns.parent = { name: 'parent', target: customer }

sqlJoinDependsOn({
	multiplicityOf: column => column.unknown ? 'unknown' : column.multiple ? 'many' : 'one',
	relationshipOf: (table, name, column) => ({
		...(column.mapping ?? {
			leftColumn: column.multiple ? 'id' : `${column.name}_id`,
			rightColumn: column.multiple ? `${column.right.name}_id` : 'id'
		}),
		multiplicity: column.unknown ? 'unknown' : column.multiple ? 'many' : 'one',
		optional: !column.required
	})
})

function projection(columns, where, options)
{
	return new Select(invoice, columns, where, options).buildProjection()
}

function fromWhere(query)
{
	return query.sql.slice(query.sql.indexOf('\nFROM')).split('\nORDER BY')[0]
}

test('SQL-01/03/05: scalar metadata, shared paths and deterministic aliases', () =>
{
	const paths = ['number', 'customer.address.city.name', 'customer.name', 'shipping.city.name', 'billing.city.name']
	const query = projection(paths)
	const reversed = projection([...paths].reverse())
	assert.equal(query.rootIdentityAlias, 'p0')
	assert.deepEqual(query.columns.map(column => column.path), paths)
	for (const [path, node] of query.graph.getPaths()) assert.equal(node.alias, reversed.graph.getPath(path).alias)
	assert.equal(query.graph.getOrderedJoins().length, 7)
	assert.equal(new Set(query.graph.getOrderedJoins().map(join => join.rightAlias)).size, 7)
	assert.deepEqual(query.columns[1].presence.map(item => item.path), ['customer', 'customer.address',
		'customer.address.city'])
	assert.equal(query.columns[1].fields[0].definition, city.columns.name)
	assert.match(query.sql, /LEFT JOIN `cities`/)
	assert.doesNotMatch(query.sql, /INNER JOIN/)
	assert.deepEqual(query.values, [])
})

test('SQL-02/03/07: object expansion, nested identities and overlapping scalar aliases', () =>
{
	const query = projection([{ path: 'customer.address.city', objectFields: ['name', 'country.name'] },
		'customer.address.city.name', 'customer.address.city.country.name'])
	const object = query.columns[0]
	assert.equal(object.kind, 'object')
	assert.deepEqual(object.objectFields, ['name', 'country.name'])
	assert.deepEqual(object.fields.filter(field => field.role === 'identity').map(field => field.relativePath),
		['id', 'country.id'])
	assert.equal(object.fields.find(field => field.relativePath === 'name').alias, query.columns[1].fields[0].alias)
	assert.equal(object.fields.find(field => field.relativePath === 'country.name').alias,
		query.columns[2].fields[0].alias)
	assert.equal(query.graph.getPath('customer.address.city').tableDefinition, city)
	assert.equal(query.graph.getPath('customer.address.city.country.name').definition, country.columns.name)
	const all = projection(['customer.address.city']).columns[0]
	assert.deepEqual(all.objectFields, ['name'])
	assert.deepEqual(all.fields.map(field => field.relativePath), ['id', 'name'])
	assert.deepEqual(projection([{ path: 'customer', objectFields: [] }]).columns[0].fields
		.map(field => field.relativePath), ['id'])
	const nested = projection([{ path: 'customer.address.city', objectFields: ['country'] }]).columns[0]
	assert.deepEqual(nested.objectFields, ['country.id', 'country.code', 'country.name'])
})

test('SQL-04: undisplayed criteria, object identities and null retain common predicates', () =>
{
	const conditions = { number: 42, 'customer.address.city': 7, 'customer.name': like('A%'), billing: null }
	const query = projection([], conditions)
	const count = new Count(invoice, conditions).build()
	assert.equal(fromWhere(query), fromWhere(count))
	assert.deepEqual(query.values, [42, 7, 'A%'])
	assert.deepEqual(count.values, query.values)
	assert.match(query.sql, /`id` = \?/)
	assert.match(query.sql, /`id` IS NULL/)
	assert.equal(query.columns.length, 0)
	assert.match(query.sql, /^SELECT `t0`.`id` AS `p0`/)
})

test('SQL-06: aliases and quoted identifiers do not interpret property syntax', () =>
{
	const strange = { table: 'table`name', columns: { 'quote`name': scalar('column`name'), p0: scalar('p0') } }
	const query = new Select(strange, ['quote`name', 'p0'], { 'quote`name': "' OR 1 = 1" }).buildProjection()
	assert.match(query.sql, /`table``name`/)
	assert.match(query.sql, /`column``name` AS `p1`/)
	assert.match(query.sql, /`p0` AS `p2`/)
	assert.doesNotMatch(query.sql, /OR 1 = 1/)
	assert.deepEqual(query.values, ["' OR 1 = 1"])
	for (const path of ['', 'customer..name', 'customer.missing', 'number.name', 'toString']) {
		assert.throws(() => projection([path]))
	}
	assert.throws(() => projection(['number', 'number']), { code: 'invalid-path' })
	assert.throws(() => projection([{ path: 'number', objectFields: ['x'] }]), { code: 'unsupported-selection' })
	assert.throws(() => projection([{ path: 'number', alias: 'custom' }]), { code: 'unsupported-option' })
})

test('SQL-09: plural and unknown projection or ordering reject before rendering', () =>
{
	invoice.columns.uncertain = { name: 'uncertain', target: customer, unknown: true }
	for (const path of ['lines', 'lines.quantity', 'tags.name', 'lines.tags.name']) {
		assert.throws(() => projection([path]), { code: 'multiple-values' })
		assert.throws(() => projection([], {}, { orderBy: [{ path }] }), { code: 'multiple-values' })
	}
	assert.throws(() => projection(['uncertain.name']), { code: 'unsupported-selection' })
	assert.throws(() => projection([], { 'uncertain.name': 'x' }), { code: 'unsupported-selection' })
	assert.throws(() => projection([{ path: 'customer', objectFields: ['parent.parent.missing'] }]))
	assert.throws(() => projection([{ path: 'customer', objectFields: ['name', 'name'] }]))
	delete invoice.columns.uncertain
})

test('SQL-10: shared plural predicates use one existing child and independent branches use separate scopes', () =>
{
	const conditions = { 'lines.quantity': 3, 'lines.price': null, 'tags.name': 'urgent', number: 5 }
	const query = projection(['number'], conditions, { limit: 50, offset: 50 })
	const count = new Count(invoice, conditions).build()
	assert.equal(fromWhere(query).split('\nLIMIT')[0], fromWhere(count))
	assert.equal((query.sql.match(/EXISTS \(/g) ?? []).length, 2)
	assert.equal((query.sql.match(/FROM `lines`/g) ?? []).length, 1)
	assert.match(query.sql, /WHERE `t0`.`id` = `t1`.`invoice_id` AND `t1`.`quantity` = \? AND `t1`.`price` IS NULL/)
	assert.match(query.sql, /FROM `invoice_tag` AS `t2`/)
	assert.match(query.sql, /INNER JOIN `tags` AS `t3` ON `t2`.`tag` = `t3`.`id`/)
	assert.deepEqual(query.values, [5, 3, 'urgent', 50, 50])
	assert.deepEqual(count.values, [5, 3, 'urgent'])
	assert.doesNotMatch(query.sql.split('WHERE')[0], /JOIN `lines`|JOIN `invoice_tag`/)
	assert.match(query.sql, /LIMIT \? OFFSET \?$/)
})

test('SQL-10: nested plural scopes correlate to their actual parent and preserve shared prefixes', () =>
{
	const conditions = { 'lines.tags.name': null, 'lines.quantity': 2, 'customer.parent.name': 'same' }
	const query = projection([], conditions)
	assert.equal((query.sql.match(/EXISTS \(/g) ?? []).length, 2)
	assert.match(query.sql, /WHERE `t3`.`id` = `t4`.`invoice` AND `t5`.`tag_name` IS NULL/)
	assert.match(query.sql, /WHERE `t0`.`id` = `t3`.`invoice_id` AND `t3`.`quantity` = \? AND EXISTS/)
	assert.deepEqual(query.values, ['same', 2])
	assert.equal(fromWhere(query), fromWhere(new Count(invoice, conditions).build()))
})

test('SQL-08/12: root restrictions, stable order and zero or finite limits stay bound', () =>
{
	const query = projection(['number'], { number: 9 }, {
		limit: 0, offset: 0, orderBy: [{ path: 'customer', descending: true }], rootIds: [4, 2, 4]
	})
	assert.deepEqual(query.values, [9, 4, 2, 0, 0])
	assert.match(query.sql, /`t0`.`id` IN \(\?, \?\)/)
	assert.match(query.sql, /ORDER BY `t1`.`id` DESC, `t0`.`id` ASC/)
	assert.match(projection([], {}, { rootIds: [] }).sql, /WHERE 1 = 0/)
	assert.match(new Count(invoice, {}, { rootIds: [] }).build().sql, /WHERE 1 = 0/)
	assert.match(projection([], {}, { orderBy: [{ path: 'id', descending: true }] }).sql, /ORDER BY `t0`.`id` DESC$/)
	for (const options of [{ limit: -1 }, { limit: Infinity }, { limit: 1.5 }, { offset: 0 },
		{ limit: 1, offset: -1 }, { limit: 1, offset: NaN }, { limit: Number.MAX_SAFE_INTEGER + 1 },
		{ unknownOption: true },
		{ orderBy: [{ path: 'number' }, { path: 'number', descending: true }] }]) {
		assert.throws(() => projection([], {}, options), ProjectionError)
	}
})

test('trusted functions and numbered placeholders share one parameter stream', () =>
{
	sqlBuildDependsOn({ placeholderOf: position => `$${position}` })
	try {
		const query = projection([], { 'lines.quantity': like('4%'), number: 9 }, { rootIds: [1], limit: 5, offset: 2 })
		assert.deepEqual(query.values, [9, '4%', 1, 5, 2])
		assert.match(query.sql, /`invoice_number` = \$1/)
		assert.match(query.sql, /`quantity` LIKE \$2/)
		assert.match(query.sql, /IN \(\$3\)/)
		assert.match(query.sql, /LIMIT \$4 OFFSET \$5$/)
		const malformed = like('x')
		malformed.sql = ' BETWEEN ? AND ?'
		assert.throws(() => projection([], { number: malformed }), /exactly one placeholder/)
	}
	finally {
		sqlBuildDependsOn({ placeholderOf: () => '?' })
	}
})

test('metadata adapters control object fields without record construction or runtime value reads', () =>
{
	let calls = 0
	Object.defineProperty(customer, 'value', { get() { throw Error('runtime read') } })
	sqlBuildDependsOn({ objectFieldsOf: table => { calls ++; assert.equal(table, customer); return ['name'] } })
	try {
		const query = projection(['customer'])
		assert.equal(calls, 1)
		assert.deepEqual(query.columns[0].objectFields, ['name'])
		assert.equal(query.columns[0].fields[1].definition, customer.columns.name)
	}
	finally {
		sqlBuildDependsOn({ objectFieldsOf: undefined })
	}
})

test('legacy low-level projection keeps plural joins, explicit aliases and wildcard behaviour', () =>
{
	const query = new Select(invoice, [{ path: 'lines.quantity', alias: 'amount' }]).build()
	assert.match(query.sql, /AS `amount`/)
	assert.match(query.sql, /JOIN `lines`/)
	assert.doesNotMatch(query.sql, /EXISTS|ORDER BY/)
	assert.match(new Select(invoice).build().sql, /^SELECT `t0`\.\*/)
	assert.throws(() => new Select(invoice, ['customer']).build(), /relationship instead of a scalar/)
})

test('SQL-06/07: long cyclic paths preserve final metadata and configurable table aliases', () =>
{
	const path = 'customer.' + 'parent.'.repeat(32) + 'name'
	const query = projection([path, 'id', 'customer.id'], { 'customer.id': 4 }, { aliasPrefix: 'scope_' })
	assert.equal(query.columns[0].fields[0].definition, customer.columns.name)
	assert.equal(query.columns[0].presence.length, 33)
	assert.equal(query.columns[1].fields[0].alias, query.rootIdentityAlias)
	assert.equal(query.columns[2].fields[0].role, 'identity')
	assert.equal(query.graph.rootAlias(), 'scope_t0')
	assert.match(query.sql, /ORDER BY `scope_t0`.`id` ASC$/)
	assert.deepEqual(query.values, [4])
	assert.throws(() => projection(['number.id']), { code: 'invalid-path' })
})

test('SQL-09/10: singular inverse and plural physical mappings retain owner columns', () =>
{
	const details = { table: 'details', columns: { label: scalar('detail_label') } }
	invoice.columns.details = { name: 'details', target: details,
		mapping: { leftColumn: 'id', rightColumn: 'parent_invoice' } }
	const query = projection(['details.label'], { 'details.label': 'ok' })
	assert.match(query.sql, /LEFT JOIN `details` AS `t1` ON `t0`.`id` = `t1`.`parent_invoice`/)
	assert.equal(query.columns[0].presence[0].path, 'details')
	assert.equal(fromWhere(query), fromWhere(new Count(invoice, { 'details.label': 'ok' }).build()))
	delete invoice.columns.details
})

test('SQL-02: default object discovery omits plural and unmapped relations without reading records', () =>
{
	customer.columns.unmapped = { name: 'unmapped', scalar: false }
	customer.columns.lines = invoice.columns.lines
	try {
		const query = projection(['customer'])
		assert.deepEqual(query.columns[0].objectFields, ['name'])
		assert.equal(query.graph.getOrderedJoins().length, 1)
	}
	finally {
		delete customer.columns.unmapped
		delete customer.columns.lines
	}
})
