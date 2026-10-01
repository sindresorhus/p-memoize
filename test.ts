/* eslint-disable no-lone-blocks -- the trailing blocks are type-level fixtures that only have to type check. */
/* eslint-disable node-test/no-duplicate-assertions -- calling a memoized function twice and asserting the same result is the behaviour under test, not a repeated assertion. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import serializeJavascript from 'serialize-javascript';
import pDefer from 'p-defer';
import {promiseStateAsync as promiseState} from 'p-state';
import pMemoize, {pMemoizeDecorator, pMemoizeClear} from './index.js';

test('memoize', async () => {
	let index = 0;
	const fixture = async () => index++;
	const memoized = pMemoize(fixture);
	assert.equal(await memoized(), 0);
	assert.equal(await memoized(), 0);
	assert.equal(await memoized(), 0);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(undefined), 0);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(undefined), 0);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('foo'), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('foo'), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('foo'), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('foo', 'bar'), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('foo', 'bar'), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('foo', 'bar'), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(1), 2);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(1), 2);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(null), 3);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(null), 3);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(fixture), 4);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(fixture), 4);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(true), 5);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(true), 5);

	// Ensure that functions are stored by reference and not by "value" (e.g. their `.toString()` representation)
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(() => index++), 6);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(() => index++), 7);
});

test('pending promises are cached', async () => {
	const {promise, resolve} = pDefer();
	let invocationsCount = 0;
	const cache = new Map();

	const memoized = pMemoize(async () => {
		invocationsCount++;
		return promise;
	}, {cache});

	const promise1 = memoized();
	assert.equal(await promiseState(promise1), 'pending');

	const promise2 = memoized();
	assert.equal(await promiseState(promise2), 'pending');

	assert.equal(invocationsCount, 1, 'pending promises are cached');

	resolve(true);

	assert.ok(await promise1, 'promise resolution is propagated');
	assert.ok(await promise2, 'promise resolution is propagated');
	assert.ok(await memoized(), 'cache is hit');
	assert.ok(cache.get(undefined), 'result is cached');
});

test('pending promises are cached synchronously', async () => {
	const {promise, resolve} = pDefer();
	let invocationsCount = 0;
	const cache = new Map();

	const memoized = pMemoize(async () => {
		invocationsCount++;
		return promise;
	}, {cache});

	const promise1 = memoized();
	const promise2 = memoized();
	assert.equal(promise1, promise2);

	resolve(true);

	assert.ok(await promise1, 'promise is executed');
	assert.ok(await promise2, 'promise resolution is propagated');

	assert.equal(invocationsCount, 1, 'pending promises are cached');

	assert.ok(await memoized(), 'cache is hit');
	assert.ok(cache.get(undefined), 'result is cached');
});

test('cacheKey option', async () => {
	let index = 0;
	const fixture = async (..._arguments: any) => index++;
	const memoized = pMemoize(fixture, {cacheKey: ([firstArgument]) => String(firstArgument)});
	assert.equal(await memoized(1), 0);
	assert.equal(await memoized(1), 0);
	assert.equal(await memoized('1'), 0);
	assert.equal(await memoized('2'), 1);
	assert.equal(await memoized(2), 1);
});

test('memoize with multiple non-primitive arguments', async () => {
	let index = 0;
	const memoized = pMemoize(async () => index++, {cacheKey: JSON.stringify});
	assert.equal(await memoized(), 0);
	assert.equal(await memoized(), 0);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized({foo: true}, {bar: false}), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized({foo: true}, {bar: false}), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized({foo: true}, {bar: false}, {baz: true}), 2);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized({foo: true}, {bar: false}, {baz: true}), 2);
});

test('memoize with regexp arguments', async () => {
	let index = 0;
	const memoized = pMemoize(async () => index++, {cacheKey: serializeJavascript});
	assert.equal(await memoized(), 0);
	assert.equal(await memoized(), 0);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(/Sindre Sorhus/v), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(/Sindre Sorhus/v), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(/Elvin Peng/v), 2);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(/Elvin Peng/v), 2);
});

test('memoize with Symbol arguments', async () => {
	let index = 0;
	const argument1 = Symbol('fixture1');
	const argument2 = Symbol('fixture2');
	const memoized = pMemoize(async () => index++);
	assert.equal(await memoized(), 0);
	assert.equal(await memoized(), 0);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(argument1), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(argument1), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(argument2), 2);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized(argument2), 2);
});

test('cache option', async () => {
	let index = 0;
	const fixture = async (..._arguments: any) => index++;
	const memoized = pMemoize(fixture, {
		cache: new WeakMap(),
		cacheKey: <ReturnValue>([firstArgument]: [ReturnValue]): ReturnValue => firstArgument,
	});
	const foo = {};
	const bar = {};
	assert.equal(await memoized(foo), 0);
	assert.equal(await memoized(foo), 0);
	assert.equal(await memoized(bar), 1);
	assert.equal(await memoized(bar), 1);
});

test('internal promise cache is only used if a value already exists in cache', async () => {
	let index = 0;
	const fixture = async (..._arguments: any) => index++;
	const cache = new Map();
	const memoized = pMemoize(fixture, {
		cache,
		cacheKey: <ReturnValue>([firstArgument]: [ReturnValue]): ReturnValue => firstArgument,
	});
	const foo = {};
	assert.equal(await memoized(foo), 0);
	assert.equal(await memoized(foo), 0);
	cache.delete(foo);
	assert.equal(await memoized(foo), 1);
	assert.equal(await memoized(foo), 1);
});

test('preserves the original function name', () => {
	assert.equal(pMemoize(async function foo() {}).name, 'foo'); // eslint-disable-line func-names, @typescript-eslint/no-empty-function
});

test('disables caching', async () => {
	let index = 0;

	const memoized = pMemoize(async () => index++, {cache: false});

	assert.equal(await memoized(), 0);
	assert.equal(await memoized(), 1);
	assert.equal(await memoized(), 2);
	assert.deepEqual(await Promise.all([memoized(), memoized()]), [3, 3]);
});

test('.pMemoizeClear()', async () => {
	let index = 0;
	const fixture = async () => index++;
	const memoized = pMemoize(fixture);
	assert.equal(await memoized(), 0);
	assert.equal(await memoized(), 0);
	pMemoizeClear(memoized);
	assert.equal(await memoized(), 1);
	assert.equal(await memoized(), 1);
});

test('prototype support', async () => {
	class Unicorn {
		index = 0;
		async foo() {
			return this.index++;
		}
	}

	Unicorn.prototype.foo = pMemoize(Unicorn.prototype.foo);

	const unicorn = new Unicorn();

	assert.equal(await unicorn.foo(), 0);
	assert.equal(await unicorn.foo(), 0);
	assert.equal(await unicorn.foo(), 0);
});

test('.pMemoizeDecorator()', async () => {
	let returnValue = 1;
	const returnValue2 = 101;

	class TestClass {
		@pMemoizeDecorator()
		async counter() {
			return returnValue++;
		}

		@pMemoizeDecorator()
		async counter2() {
			return returnValue2;
		}
	}

	const alpha = new TestClass();
	assert.equal(await alpha.counter(), 1);
	assert.equal(await alpha.counter(), 1, 'The method should be memoized');
	assert.equal(await alpha.counter2(), 101, 'The method should be memoized separately from the other one');

	const beta = new TestClass();
	assert.equal(await beta.counter(), 2, 'The method should not be memoized across instances');
});

test('.pMemoizeClear() throws when called with a plain function', () => {
	assert.throws(() => {
		pMemoizeClear(async () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
	}, {
		name: 'TypeError',
		message: 'Can\'t clear a function that was not memoized!',
	});
});

test('.pMemoizeClear() throws when called on an unclearable cache', () => {
	const fixture = async () => 1;
	const memoized = pMemoize(fixture, {
		cache: new WeakMap(),
	});

	assert.throws(() => {
		pMemoizeClear(memoized);
	}, {
		name: 'TypeError',
		message: 'The cache Map can\'t be cleared!',
	});
});

test('.pMemoizeClear() throws when called on a disabled cache', () => {
	const fixture = async () => 1;
	const memoized = pMemoize(fixture, {
		cache: false,
	});

	assert.throws(() => {
		pMemoizeClear(memoized);
	}, {
		name: 'TypeError',
		message: 'Can\'t clear a function that doesn\'t use a cache!',
	});
});

test('shouldCache: skips cache.set when predicate false', async () => {
	let calls = 0;
	const cache = new Map<unknown, unknown>();
	const recordedSets: Array<{key: unknown; value: unknown}> = [];
	const wrappedCache = {
		async has(key: unknown) {
			return cache.has(key);
		},
		async get(key: unknown) {
			return cache.get(key);
		},
		async set(key: unknown, value: unknown) {
			recordedSets.push({key, value});
			cache.set(key, value);
		},
		delete(key: unknown) {
			cache.delete(key);
		},
		clear() {
			cache.clear();
		},
	} as const;

	const memoized = pMemoize(async () => ++calls, {
		cache: wrappedCache,
		shouldCache() {
			return false;
		},
	});

	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('a'), 1);
	assert.equal(recordedSets.length, 0, 'cache.set was not called');
	// Next call should recompute since we skipped caching
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('a'), 2);
});

test('shouldCache: still de-dupes in-flight', async () => {
	const {promise, resolve} = pDefer<number>();
	let invocationsCount = 0;
	const memoized = pMemoize(async () => {
		invocationsCount++;
		return promise;
	}, {
		shouldCache() {
			return false;
		},
	});

	const promise1 = memoized();
	const promise2 = memoized();
	assert.equal(promise1, promise2, 'in-flight promise is shared');
	resolve(42);
	assert.equal(await promise1, 42);
	assert.equal(await promise2, 42);
	assert.equal(invocationsCount, 1);
});

test('shouldCache: not called when cache disabled', async () => {
	let called = 0;
	let i = 0;
	const memoized = pMemoize(async () => ++i, {
		cache: false,
		shouldCache() {
			called++;
			return true;
		},
	});

	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('x'), 1);
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('x'), 2);
	assert.equal(called, 0);
});

test('shouldCache: not called on rejection and nothing cached', async () => {
	const recordedSets: unknown[] = [];
	const cache = new Map<unknown, unknown>();
	const wrappedCache = {
		async has(key: unknown) {
			return cache.has(key);
		},
		async get(key: unknown) {
			return cache.get(key);
		},
		async set(key: unknown, value: unknown) {
			recordedSets.push([key, value]);
			cache.set(key, value);
		},
	} as const;

	let called = 0;
	const memoized = pMemoize(async () => {
		throw new Error('boom');
	}, {
		cache: wrappedCache,
		shouldCache() {
			called++;
			return true;
		},
	});

	// @ts-expect-error Argument type does not match
	await assert.rejects(memoized('x'), {message: 'boom'});
	assert.equal(called, 0);
	assert.equal(recordedSets.length, 0);
});

test('shouldCache: supports async predicate', async () => {
	const recordedSets: Array<{key: unknown; value: unknown}> = [];
	const cache = new Map<unknown, unknown>();
	const wrappedCache = {
		async has(key: unknown) {
			return cache.has(key);
		},
		async get(key: unknown) {
			return cache.get(key);
		},
		async set(key: unknown, value: unknown) {
			recordedSets.push({key, value});
			cache.set(key, value);
		},
		delete(key: unknown) {
			cache.delete(key);
		},
	} as const;

	const memoized = pMemoize(async () => 'ok', {
		cache: wrappedCache,
		async shouldCache(value) {
			await Promise.resolve();
			return value === 'ok';
		},
	});

	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('x'), 'ok');
	assert.equal(recordedSets.length, 1, 'cache.set was called once');
});

test('shouldCache: works with custom cacheKey', async () => {
	const recordedKeys: unknown[] = [];
	const cache = new Map<unknown, unknown>();
	const wrappedCache = {
		async has(key: unknown) {
			return cache.has(key);
		},
		async get(key: unknown) {
			return cache.get(key);
		},
		async set(key: unknown, value: unknown) {
			recordedKeys.push(key);
			cache.set(key, value);
		},
		delete(key: unknown) {
			cache.delete(key);
		},
	} as const;

	const memoized = pMemoize(async () => 'v', {
		cache: wrappedCache,
		cacheKey: ([first]) => String(first),
		shouldCache(_value, {key, argumentsList}) {
			assert.equal(key, String(argumentsList[0]));
			return true;
		},
	});

	// @ts-expect-error Argument type does not match
	await memoized(1);
	assert.deepEqual(recordedKeys, ['1']);
});

test('shouldCache: predicate error bubbles and does not cache', async () => {
	const cache = new Map<unknown, unknown>();
	const recordedSets: unknown[] = [];
	const wrappedCache = {
		async has(key: unknown) {
			return cache.has(key);
		},
		async get(key: unknown) {
			return cache.get(key);
		},
		async set(key: unknown, value: unknown) {
			recordedSets.push([key, value]);
			cache.set(key, value);
		},
		delete(key: unknown) {
			cache.delete(key);
		},
	} as const;

	const memoized = pMemoize(async () => 'x', {
		cache: wrappedCache,
		shouldCache() {
			throw new Error('nope');
		},
	});

	// @ts-expect-error Argument type does not match
	await assert.rejects(memoized('k'), {message: 'nope'});
	assert.equal(recordedSets.length, 0);
});

test('shouldCache: interop with external eviction', async () => {
	// Simulate external TTL eviction by deleting after set.
	const cache = new Map<unknown, unknown>();
	const wrappedCache = {
		async has(key: unknown) {
			return cache.has(key);
		},
		async get(key: unknown) {
			return cache.get(key);
		},
		async set(key: unknown, value: unknown) {
			cache.set(key, value);
		},
		delete(key: unknown) {
			cache.delete(key);
		},
	} as const;

	let index = 0;
	const memoized = pMemoize(async () => ++index, {
		cache: wrappedCache,
		shouldCache() {
			return true;
		},
	});

	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('a'), 1);
	// Evict externally
	wrappedCache.delete('a');
	// @ts-expect-error Argument type does not match
	assert.equal(await memoized('a'), 2);
});

{
	pMemoize(async (url: string): Promise<string> => '', {
		cacheKey: ([url]) => url,
		cache: {
			async get(url: string): Promise<string | undefined> {
				return undefined;
			},
			async set(url: string, contents: string): Promise<void> {}, // eslint-disable-line @typescript-eslint/no-empty-function
			async has(url: string): Promise<boolean> {
				return true;
			},
		},
	});
}

{
	const cache = {
		async get(url: string): Promise<string | undefined> {
			return undefined;
		},
		async set(url: string, contents: string): Promise<void> {}, // eslint-disable-line @typescript-eslint/no-empty-function
		async has(url: string): Promise<boolean> {
			return true;
		},
	} as const;

	pMemoize(async (url: string): Promise<string> => '', {
		cacheKey: ([url]) => url,
		cache,
	});
}
