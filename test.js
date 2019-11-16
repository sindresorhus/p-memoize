import test from 'ava';
import delay from 'delay';
import serializeJavascript from 'serialize-javascript';
import pMemoize from '.';

test('memoize', async t => {
	let i = 0;
	const fixture = async () => i++;
	const memoized = pMemoize(fixture);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	t.is(await memoized(undefined), 0);
	t.is(await memoized(undefined), 0);
	t.is(await memoized('foo'), 1);
	t.is(await memoized('foo'), 1);
	t.is(await memoized('foo'), 1);
	t.is(await memoized('foo', 'bar'), 1);
	t.is(await memoized('foo', 'bar'), 1);
	t.is(await memoized('foo', 'bar'), 1);
	t.is(await memoized(1), 2);
	t.is(await memoized(1), 2);
	t.is(await memoized(null), 3);
	t.is(await memoized(null), 3);
	t.is(await memoized(fixture), 4);
	t.is(await memoized(fixture), 4);
	t.is(await memoized(true), 5);
	t.is(await memoized(true), 5);

	// Ensure that functions are stored by reference and not by "value" (e.g. their `.toString()` representation)
	t.is(await memoized(() => i++), 6);
	t.is(await memoized(() => i++), 7);
});

test('cacheKey option', async t => {
	let i = 0;
	const fixture = async () => i++;
	const memoized = pMemoize(fixture, {cacheKey: ([firstArgument]) => String(firstArgument)});
	t.is(await memoized(1), 0);
	t.is(await memoized(1), 0);
	t.is(await memoized('1'), 0);
	t.is(await memoized('2'), 1);
	t.is(await memoized(2), 1);
});

test('memoize with multiple non-primitive arguments', async t => {
	let i = 0;
	const memoized = pMemoize(async () => i++, {cacheKey: JSON.stringify});
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	t.is(await memoized({foo: true}, {bar: false}), 1);
	t.is(await memoized({foo: true}, {bar: false}), 1);
	t.is(await memoized({foo: true}, {bar: false}, {baz: true}), 2);
	t.is(await memoized({foo: true}, {bar: false}, {baz: true}), 2);
});

test('memoize with regexp arguments', async t => {
	let i = 0;
	const memoized = pMemoize(async () => i++, {cacheKey: serializeJavascript});
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	t.is(await memoized(/Sindre Sorhus/), 1);
	t.is(await memoized(/Sindre Sorhus/), 1);
	t.is(await memoized(/Elvin Peng/), 2);
	t.is(await memoized(/Elvin Peng/), 2);
});

test('memoize with Symbol arguments', async t => {
	let i = 0;
	const argument1 = Symbol('fixture1');
	const argument2 = Symbol('fixture2');
	const memoized = pMemoize(async () => i++);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	t.is(await memoized(argument1), 1);
	t.is(await memoized(argument1), 1);
	t.is(await memoized(argument2), 2);
	t.is(await memoized(argument2), 2);
});

test('maxAge option', async t => {
	let i = 0;
	const fixture = async () => i++;
	const memoized = pMemoize(fixture, {maxAge: 100});
	t.is(await memoized(1), 0);
	t.is(await memoized(1), 0);
	await delay(50);
	t.is(await memoized(1), 0);
	await delay(200);
	t.is(await memoized(1), 1);
});

test('maxAge option deletes old items', async t => {
	let i = 0;
	const fixture = async () => i++;
	const cache = new Map();
	const deleted = [];
	const remove = cache.delete.bind(cache);
	cache.delete = item => {
		deleted.push(item);
		return remove(item);
	};

	const memoized = pMemoize(fixture, {maxAge: 100, cache});
	t.is(await memoized(1), 0);
	t.is(await memoized(1), 0);
	t.is(cache.has(1), true);
	await delay(50);
	t.is(await memoized(1), 0);
	t.is(deleted.length, 0);
	await delay(200);
	t.is(await memoized(1), 1);
	t.is(deleted.length, 1);
	t.is(deleted[0], 1);
});

test('maxAge items are deleted even if function throws', async t => {
	let i = 0;
	const fixture = async () => {
		if (i === 1) {
			throw new Error('failure');
		}

		return i++;
	};

	const cache = new Map();
	const memoized = pMemoize(fixture, {maxAge: 100, cache});
	t.is(await memoized(1), 0);
	t.is(await memoized(1), 0);
	t.is(cache.size, 1);
	await delay(50);
	t.is(await memoized(1), 0);
	await delay(200);
	await t.throwsAsync(async () => memoized(1), 'failure');
	t.is(cache.size, 0);
});

test('cache option', async t => {
	let i = 0;
	const fixture = () => i++;
	const memoized = pMemoize(fixture, {
		cache: new WeakMap(),
		cacheKey: ([firstArgument]) => firstArgument
	});
	const foo = {};
	const bar = {};
	t.is(await memoized(foo), 0);
	t.is(await memoized(foo), 0);
	t.is(await memoized(bar), 1);
	t.is(await memoized(bar), 1);
});

test('promise support', async t => {
	let i = 0;
	const memoized = pMemoize(async () => i++);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	t.is(await memoized(10), 1);
});

test('preserves the original function name', t => {
	t.is(pMemoize(async function foo() {}).name, 'foo'); // eslint-disable-line func-names
});

test('.clear()', async t => {
	let i = 0;
	const fixture = async () => i++;
	const memoized = pMemoize(fixture);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	pMemoize.clear(memoized);
	t.is(await memoized(), 1);
	t.is(await memoized(), 1);
});

test('prototype support', async t => {
	const fixture = async function () {
		return this.i++;
	};

	const Unicorn = function () {
		this.i = 0;
	};

	Unicorn.prototype.foo = pMemoize(fixture);

	const unicorn = new Unicorn();

	t.is(await unicorn.foo(), 0);
	t.is(await unicorn.foo(), 0);
	t.is(await unicorn.foo(), 0);
});
