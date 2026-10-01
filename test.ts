/* eslint-disable no-lone-blocks -- the trailing blocks are type-level fixtures that only have to type check. */
/* eslint-disable node-test/no-duplicate-assertions -- calling a memoized function twice and asserting the same result is the behaviour under test, not a repeated assertion. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import serializeJavascript from 'serialize-javascript';
import pDefer from 'p-defer';
import {promiseStateAsync as promiseState} from 'p-state';
import pMemoize, {pMemoizeDecorator, pMemoizeClear} from './index.js';

/**
Waits for `promise`, but fails rather than hanging when it never settles.

Several tests wait for a gate that the memoized call under test is supposed to open. If a regression stops the call from ever running, the gate never opens, and an unbounded wait turns a red test into a hung job. Nothing here waits on a timer, so a gate that does not open promptly is already broken.
*/
async function withTimeout<T>(promise: Promise<T>, description: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					reject(new Error(`Timed out waiting for ${description}`));
				}, 2000);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

/**
Turns a promise into its resolved value, or the message of the error it rejected with.

Lets a test state what it expects from a call that is meant to fail without wrapping every assertion in `assert.rejects`.
*/
async function settle(promise: Promise<unknown>): Promise<unknown> {
	try {
		return await promise;
	} catch (error) {
		return (error as Error).message;
	}
}

/**
Lets Node report anything that escaped as an unhandled rejection.

The report lands at the end of the next tick of the event loop, so yielding a few times is enough and, unlike a fixed sleep, does not depend on how loaded the machine is.
*/
async function drainEventLoop(): Promise<void> {
	for (let turn = 0; turn < 5; turn++) {
		// eslint-disable-next-line no-await-in-loop -- Draining means yielding once per turn, in order.
		await new Promise(resolve => {
			setImmediate(resolve);
		});
	}
}

test('.pMemoizeDecorator() does not invoke a subclass accessor while checking for an override', () => {
	// A mixin replacing the method with an accessor is a common shape. Reading it to see whether the method was overridden would run the getter once per construction, with the prototype as its receiver, and would throw if the getter is not ready yet.
	let reads = 0;

	class Base {
		@pMemoizeDecorator()
		async work() {
			return 'memoized';
		}
	}

	class Derived extends Base {}

	Object.defineProperty(Derived.prototype, 'work', {
		configurable: true,
		get() {
			reads++;
			return 'from accessor';
		},
	});

	const instance = new Derived();
	assert.equal(reads, 0, 'the accessor was not invoked while installing the method');

	assert.equal((instance as unknown as {work: string}).work, 'from accessor');
	assert.equal(reads, 1, 'only the explicit read reached the accessor');
});

test('.pMemoizeDecorator() stands down when the method is deleted from the prototype', () => {
	class Base {
		@pMemoizeDecorator()
		async work() {
			return 'memoized';
		}
	}

	// A mixin or mock that puts the method back the way it found it leaves nothing to find, which has to be a stand-down. Walking for it must not run off the end of the prototype chain.
	delete (Base.prototype as unknown as Record<string, unknown>)['work'];

	const instance = new Base();
	assert.ok(instance instanceof Base, 'construction completed');
});

test('.pMemoizeDecorator() survives a subclass accessor that throws', () => {
	class Base {
		@pMemoizeDecorator()
		async work() {
			return 'memoized';
		}
	}

	class Derived extends Base {}

	Object.defineProperty(Derived.prototype, 'work', {
		configurable: true,
		get() {
			throw new Error('accessor is not ready yet');
		},
	});

	const instance = new Derived();
	assert.ok(instance instanceof Derived, 'construction completed');
});

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

test('a cache emptied while a call is reading it does not resolve to `undefined`', async () => {
	const cache = new Map<string, string>();
	let invocationsCount = 0;
	const memoized = pMemoize(async (value: string) => {
		invocationsCount++;
		return value;
	}, {cache});

	await memoized('something');

	// `pMemoizeClear()` runs while the second call is in between its `has()` and `get()` reads.
	const pending = memoized('something');
	pMemoizeClear(memoized);

	assert.equal(await pending, 'something');
	assert.equal(invocationsCount, 2, 'the clear turned the hit into a miss, so the function ran again');
});

test('a cache entry evicted between `has()` and `get()` resolves to `undefined` (documented limitation)', async () => {
	const cache = new Map<string, string>();
	let invocationsCount = 0;
	const memoized = pMemoize(async (value: string) => {
		invocationsCount++;
		return value;
	}, {cache});

	await memoized('something');

	const pending = memoized('something');
	cache.delete('something');

	assert.equal(await pending, undefined);
	assert.equal(invocationsCount, 1);
});

test('a throwing `cacheKey` rejects instead of throwing synchronously', async () => {
	const memoized = pMemoize(async () => 1, {
		cacheKey() {
			throw new Error('bad key');
		},
	});

	// Must not throw synchronously, so that `.catch()` can be attached to the result.
	// @ts-expect-error Argument type does not match
	await assert.rejects(memoized('x'), {message: 'bad key'});
});

test('a synchronously throwing memoized function rejects', async () => {
	// A plain function is not a valid `AnyAsyncFunction`, but it is accepted at runtime.
	const memoized = pMemoize(() => {
		throw new Error('boom');
	});

	// @ts-expect-error Argument type does not match
	await assert.rejects(memoized('x'), {message: 'boom'});
});

test('a cache that rejects for absent keys still runs the memoized function', async () => {
	// `get()` is only called on a hit, so a cache that cannot answer for an absent key must not stop the call.
	const cache = {
		has: () => false,
		async get() {
			throw new Error('get boom');
		},
		set() {
			return undefined;
		},
	};

	let invocationsCount = 0;
	const memoized = pMemoize(async (_value: string) => ++invocationsCount, {cache: cache as any});

	assert.equal(await memoized('a'), 1);
	assert.equal(invocationsCount, 1);
});

test('a cache whose `get()` rejects on a hit fails the call', async () => {
	const cache = {
		has: () => true,
		async get() {
			throw new Error('get boom');
		},
		set() {
			return undefined;
		},
	};

	const memoized = pMemoize(async () => 'value', {cache: cache as any});
	// @ts-expect-error Argument type does not match
	await assert.rejects(memoized('a'), {message: 'get boom'});
});

test('a rejecting `has()` leaves no unhandled rejection behind', async () => {
	const failures: unknown[] = [];
	const onUnhandledRejection = (reason: unknown) => {
		failures.push(reason);
	};

	process.on('unhandledRejection', onUnhandledRejection);

	try {
		const cache = {
			async has() {
				throw new Error('has boom');
			},
			get() {
				return undefined;
			},
			set() {
				return undefined;
			},
		};

		const memoized = pMemoize(async () => 1, {cache: cache as any});
		// @ts-expect-error Argument type does not match
		await assert.rejects(memoized('a'), {message: 'has boom'});

		await drainEventLoop();
	} finally {
		process.off('unhandledRejection', onUnhandledRejection);
	}

	assert.deepEqual(failures, []);
});

test('calls for one key issued in the same tick share a single promise', async () => {
	const store = new Map<number, number>();
	const asyncCache = {
		async has(key: number) {
			return store.has(key);
		},
		async get(key: number) {
			return store.get(key);
		},
		async set(key: number, value: number) {
			store.set(key, value);
		},
	};

	// Each case needs its own memoized function, so the measurements are collected and asserted at once.
	const shared = {distinctPromises: 1, values: [2, 2, 2]};

	assert.deepEqual([
		await measureSharing('default cache', pMemoize(async (value: number) => value + 1)),
		await measureSharing('async cache', pMemoize(async (value: number) => value + 1, {cache: asyncCache})),
		await measureSharing('cache disabled', pMemoize(async (value: number) => value + 1, {cache: false})),
	], [
		{label: 'default cache', ...shared},
		{label: 'async cache', ...shared},
		{label: 'cache disabled', ...shared},
	]);
});

async function measureSharing(label: string, memoized: (key: number) => Promise<number>) {
	const promises = [memoized(1), memoized(1), memoized(1)];

	return {
		label,
		distinctPromises: new Set(promises).size,
		values: await Promise.all(promises),
	};
}

test('the memoized function receives the arguments unchanged', async () => {
	let received: readonly unknown[] | undefined;
	const memoized = pMemoize(async (...arguments_: readonly unknown[]) => {
		received = arguments_;
		return arguments_.length;
	}, {cacheKey: () => 'constant'});

	assert.equal(await memoized('a', 1, null), 3);
	assert.deepEqual(received, ['a', 1, null]);
});

test('a `cacheKey` that reorders the arguments in place does not reorder them for the function', async () => {
	// `cacheKey` sorts the argument array it is handed, so a custom one that builds a canonical key that way would otherwise change the order the memoized function receives them in.
	let received: readonly unknown[] = [];
	const memoized = pMemoize(async (...arguments_: unknown[]) => {
		received = arguments_;
		return arguments_.join(',');
	}, {
		cacheKey(arguments_) {
			arguments_.sort((first, second) => String(first).localeCompare(String(second)));
			return arguments_.join(',');
		},
	});

	assert.equal(await memoized('c', 'a', 'b'), 'c,a,b');
	assert.deepEqual(received, ['c', 'a', 'b'], 'the function saw the arguments in their original order');
});

test('a call with no arguments shares a key with an explicit `undefined` argument', async () => {
	// Documented consequence of the default key. It only reads the first argument, and a call with no arguments has an undefined one, so the second call is answered from the first's entry and never runs.
	const memoized = pMemoize(async (...arguments_: unknown[]) => arguments_.length);

	assert.equal(await memoized(), 0);
	assert.equal(await memoized(undefined), 0, 'the explicit undefined call reuses the no-argument entry');
});

test('`cacheKey` is called for every call, including cache hits', async () => {
	// The key has to be computed before the in-flight map can be consulted, so a hit costs a `cacheKey` call too.
	const calls: Array<readonly unknown[]> = [];
	const memoized = pMemoize(async (value: string) => value, {
		cacheKey(arguments_) {
			calls.push(arguments_);
			return arguments_.join(':');
		},
	});

	await memoized('a');
	await memoized('a');
	await memoized('b');

	assert.deepEqual(calls, [['a'], ['a'], ['b']]);
});

test('`shouldCache` receives the argument list of the call it is deciding about', async () => {
	const seen: Array<readonly unknown[]> = [];
	const memoized = pMemoize(async (first: string, second: string) => `${first}${second}`, {
		cacheKey: ([first]) => first,
		shouldCache(_value, {argumentsList}) {
			seen.push(argumentsList);
			return true;
		},
	});

	await memoized('a', '1');
	await memoized('a', '2');

	assert.deepEqual(seen, [['a', '1']]);
});

test('a value of `undefined` is cached and served back', async () => {
	let invocationsCount = 0;
	const cache = new Map<string, undefined>();
	const memoized = pMemoize(async (_value: string) => {
		invocationsCount++;
		return undefined;
	}, {cache});

	await memoized('a');
	await memoized('a');

	assert.equal(invocationsCount, 1);
	assert.equal(cache.has('a'), true);
});

test('.pMemoizeClear() stops another memoized function refilling a shared cache', async () => {
	// Sharing a cache means sharing its entries, so clearing it has to reach the calls in flight on every function over it, not just the one it was called on.
	const cache = new Map<string, number>();
	// The cleared function is created last on purpose: the clear has to reach whichever generation the *other* function is holding, not whichever one happens to be registered most recently.
	const beta = pMemoize(async (_key: string) => 2, {cache});
	const alpha = pMemoize(async (_key: string) => 1, {cache});

	const inFlight = beta('a');
	pMemoizeClear(alpha);
	assert.equal(await inFlight, 2);
	assert.equal(cache.size, 0, 'beta\'s in-flight call did not refill the cache alpha had cleared');
});

test('.pMemoizeClear() does not drop another memoized function\'s in-flight call', async () => {
	// The counterpart to the test above, and the reason it is worded as "does not refill". The generation is shared per cache, so it reaches every function over that cache, but the in-flight promises are not shared: only the function the clear was called on starts fresh.
	const cache = new Map<string, number>();
	const {promise, resolve} = pDefer<number>();
	const beta = pMemoize(async (_key: string) => promise, {cache});
	const alpha = pMemoize(async (_key: string) => 0, {cache});

	const inFlight = beta('a');
	pMemoizeClear(alpha);

	const afterClear = beta('a');
	assert.equal(afterClear, inFlight, 'beta keeps sharing the call that began before the clear');

	resolve(1);
	assert.equal(await inFlight, 1);
	assert.equal(await afterClear, 1);
	assert.equal(cache.size, 0, 'neither call wrote into the cache alpha cleared');
});

test('two memoized functions sharing a cache share its entries and its clears', async () => {
	// Sharing a cache means sharing its keys too, and `pMemoizeClear()` empties the whole cache.
	const cache = new Map<string, string>();
	const alpha = pMemoize(async (key: string) => `alpha:${key}`, {cache});
	const beta = pMemoize(async (key: string) => `beta:${key}`, {cache});

	assert.equal(await alpha('x'), 'alpha:x');
	assert.equal(await beta('x'), 'alpha:x', 'beta reads the entry alpha wrote');

	pMemoizeClear(alpha);
	assert.equal(await beta('x'), 'beta:x', 'clearing alpha emptied the shared cache');
});

test('the memoized function keeps the name and own properties of the original', () => {
	const fixture = Object.assign(async function named(value: number) { // eslint-disable-line func-names
		return value;
	}, {tag: 'original'});

	const memoized = pMemoize(fixture);

	assert.equal(memoized.name, 'named');
	assert.equal(memoized.tag, 'original');
});

test('a rejected call is not cached', async () => {
	let invocationsCount = 0;
	const cache = new Map<string, never>();
	const memoized = pMemoize(async (value: string) => {
		invocationsCount++;
		throw new Error(`boom ${value}`);
	}, {cache});

	await assert.rejects(memoized('a'), {message: 'boom a'});
	await assert.rejects(memoized('a'), {message: 'boom a'});

	assert.equal(invocationsCount, 2);
	assert.equal(cache.size, 0);
});

test('concurrent calls with the cache disabled all settle with the same value', async () => {
	const {promise, resolve} = pDefer<string>();
	let invocationsCount = 0;
	const memoized = pMemoize(async () => {
		invocationsCount++;
		return promise;
	}, {cache: false});

	const promises = [memoized(), memoized(), memoized()];
	assert.equal(new Set(promises).size, 1, 'one shared promise');

	resolve('done');
	assert.deepEqual(await Promise.all(promises), ['done', 'done', 'done']);
	assert.equal(invocationsCount, 1);
});

test('a rejected call with the cache disabled is not remembered', async () => {
	let calls = 0;
	const memoized = pMemoize(async () => {
		calls++;
		throw new Error('boom');
	}, {cache: false});

	// Overlapping calls share the one execution, rejections included.
	assert.deepEqual(await Promise.all([memoized(), memoized()].map(async promise => settle(promise))), ['boom', 'boom']);
	assert.equal(calls, 1);

	// Once it has settled the entry is gone, so the next call runs again.
	assert.deepEqual(await Promise.all([memoized(), memoized()].map(async promise => settle(promise))), ['boom', 'boom']);
	assert.equal(calls, 2);
});

test('a function that throws synchronously is not remembered either', async () => {
	let calls = 0;
	// A plain function is not a valid `AnyAsyncFunction`, but it is accepted at runtime.
	const memoized = pMemoize(() => {
		calls++;
		throw new Error('sync boom');
	}, {cache: false});

	assert.deepEqual(await Promise.all([memoized(), memoized()].map(async promise => settle(promise))), ['sync boom', 'sync boom']);
	assert.equal(calls, 1);

	assert.equal(await settle(memoized()), 'sync boom');
	assert.equal(calls, 2);
});

test('the memoized function forwards `this`', async () => {
	const memoized = pMemoize(async function (this: {value: string}, key: string) {
		return `${this.value}:${key}`;
	});

	assert.equal(await memoized.call({value: 'alpha'}, 'k'), 'alpha:k');
	assert.equal(await memoized.call({value: 'alpha'}, 'k'), 'alpha:k');
});

test('a cache whose `get()` throws synchronously for absent keys still runs the memoized function', async () => {
	const store = new Map<string, number>();
	const cache = {
		has: (key: string) => store.has(key),
		get(key: string) {
			if (!store.has(key)) {
				throw new Error('missing');
			}

			return store.get(key);
		},
		set(key: string, value: number) {
			store.set(key, value);
		},
	};

	let invocationsCount = 0;
	const memoized = pMemoize(async (_value: string) => ++invocationsCount, {cache});

	assert.equal(await memoized('a'), 1);
	assert.equal(await memoized('a'), 1);
	assert.equal(invocationsCount, 1);
});

test('a cache that throws once does not poison the key', async () => {
	// A synchronous throw from `has()` settles the call before it is registered as the in-flight one. Registering it anyway would cache the failure for every later call.
	let shouldThrow = true;
	let invocationsCount = 0;
	const memoized = pMemoize(async (_value: string) => ++invocationsCount, {
		cache: {
			has() {
				if (shouldThrow) {
					shouldThrow = false;
					throw new Error('has boom');
				}

				return false;
			},
			get() {
				return undefined;
			},
			set() {
				return undefined;
			},
		},
	});

	await assert.rejects(memoized('a'), {message: 'has boom'});
	assert.equal(await memoized('a'), 1);
	assert.equal(invocationsCount, 1);
});

test('.pMemoizeClear() drops in-flight calls even when `cache.clear()` throws', async () => {
	const store = new Map<string, number>();
	const cache = {
		has: (key: string) => store.has(key),
		get: (key: string) => store.get(key),
		set(key: string, value: number) {
			store.set(key, value);
		},
		clear() {
			store.clear();
			throw new Error('clear boom');
		},
	};

	// Each execution resolves with its own invocation number, so the value left in the cache says which of them wrote it.
	const started = [pDefer<void>(), pDefer<void>()];
	let invocationsCount = 0;
	const {promise, resolve} = pDefer<void>();
	const memoized = pMemoize(async (_value: string) => {
		started[invocationsCount]?.resolve();
		invocationsCount++;
		await promise;
		return invocationsCount;
	}, {cache});

	const inFlight = memoized('a');
	await withTimeout(started[0]!.promise, 'the first execution to start');

	assert.throws(() => {
		pMemoizeClear(memoized);
	}, {message: 'clear boom'});

	// The bookkeeping happens before the cache is emptied, so a `clear()` that throws does not leave the in-flight promise in place for a later call to join.
	// The same key, so that leaving the old in-flight promise in place would make this call join it.
	const afterClear = memoized('a');
	await withTimeout(started[1]!.promise, 'the second execution to start');
	assert.equal(invocationsCount, 2, 'the later call did not join the pre-clear in-flight promise');

	resolve();
	await Promise.all([inFlight, afterClear]);

	// Only the call started after the clear may write, so the cached value says which one did.
	assert.equal(store.get('a'), 2, 'the pre-clear call wrote into the cleared cache');
});

test('.pMemoizeClear() does not leave an async `clear()` rejection unhandled', async () => {
	// `pMemoizeClear()` returns nothing, so an async `clear()` that rejects has nowhere to report to. Left unobserved it is an unhandled rejection, which Node escalates to a crash.
	const failures: unknown[] = [];
	const onUnhandledRejection = (reason: unknown) => {
		failures.push(reason);
	};

	process.on('unhandledRejection', onUnhandledRejection);

	try {
		const cache = {
			has: () => false,
			get: () => undefined,
			set() {
				return undefined;
			},
			async clear() {
				await Promise.resolve();
				throw new Error('remote flush failed');
			},
		};

		const memoized = pMemoize(async (_value: string) => 'value', {cache: cache as never});
		await memoized('a');

		// A synchronous `clear()` still propagates to the caller; only the promise it hands back is dropped, so this does not throw.
		pMemoizeClear(memoized);

		await drainEventLoop();
	} finally {
		process.off('unhandledRejection', onUnhandledRejection);
	}

	assert.deepEqual(failures, []);
});

test('cache option', async () => {
	let index = 0;
	const fixture = async (_firstArgument: Record<string, unknown>) => index++;

	const memoized = pMemoize(fixture, {
		cache: new WeakMap<Record<string, unknown>, number>(),
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
	const fixture = async (_firstArgument: Record<string, unknown>) => index++;

	const cache = new Map<Record<string, unknown>, number>();
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

test('a function whose own `toString` cannot be redefined still memoizes', async () => {
	let calls = 0;
	const fixture: (value: number) => Promise<number> = Object.defineProperty(async (_value: number) => ++calls, 'toString', {
		value: () => 'fixture',
		configurable: false,
	});

	const memoized = pMemoize(fixture);
	assert.equal(await memoized(1), 1);
	assert.equal(await memoized(1), 1);
	assert.equal(calls, 1);
});

test('a function whose `toString` throws still memoizes', async () => {
	let calls = 0;
	const fixture = async (_value: number) => ++calls;
	Object.defineProperty(fixture, 'toString', {
		value() {
			throw new Error('toString exploded');
		},
	});

	const memoized = pMemoize(fixture);
	assert.equal(await memoized(1), 1);
	assert.equal(await memoized(1), 1);
	assert.equal(calls, 1);
});

test('a proxy that throws from `ownKeys` still memoizes', async () => {
	let calls = 0;
	const target = async (_value: number) => ++calls;
	const fixture: (value: number) => Promise<number> = new Proxy(target, {
		ownKeys() {
			throw new Error('ownKeys exploded');
		},
	});

	const memoized = pMemoize(fixture);
	assert.equal(await memoized(1), 1);
	assert.equal(await memoized(1), 1);
	assert.equal(calls, 1);
});

test('a memoized function whose wrapping failed can still be cleared', async () => {
	const fixture: () => Promise<number> = Object.defineProperty(async () => 1, 'toString', {
		value: () => 'fixture',
		configurable: false,
	});

	const memoized = pMemoize(fixture);
	await memoized();
	pMemoizeClear(memoized);
	assert.equal(await memoized(), 1);
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

test('.pMemoizeClear() stops sharing the in-flight promise', async () => {
	const {promise, resolve} = pDefer<number>();
	let invocationsCount = 0;
	const memoized = pMemoize(async () => {
		invocationsCount++;
		return promise;
	});

	const promise1 = memoized();
	pMemoizeClear(memoized);
	const promise2 = memoized();

	assert.notEqual(promise1, promise2, 'the in-flight promise from before the clear is not shared');

	resolve(1);
	assert.equal(await promise1, 1);
	assert.equal(await promise2, 1);
	assert.equal(invocationsCount, 1, 'the two overlapping calls are still de-duplicated with each other');
});

test('.pMemoizeClear() discards results of calls that were already in flight', async () => {
	const {promise, resolve} = pDefer<number>();
	let invocationsCount = 0;
	const memoized = pMemoize(async () => {
		invocationsCount++;
		return promise;
	});

	const inFlight = memoized();
	pMemoizeClear(memoized);
	resolve(1);
	assert.equal(await inFlight, 1);

	assert.equal(await memoized(), 1);
	assert.equal(invocationsCount, 2, 'the cleared in-flight result was not reused');
});

test('many clears racing many in-flight calls all settle', async () => {
	const cache = new Map<string, number>();
	let invocationsCount = 0;
	const slowCache = {
		has: (key: string) => cache.has(key),
		get: (key: string) => cache.get(key),
		async set(key: string, value: number) {
			await Promise.resolve();
			cache.set(key, value);
		},
		delete(key: string) {
			cache.delete(key);
		},
		clear() {
			cache.clear();
		},
	};

	const memoized = pMemoize(async (_key: string) => ++invocationsCount, {cache: slowCache});

	const calls: Array<Promise<number>> = [];
	for (let index = 0; index < 200; index++) {
		calls.push(memoized(`k${index % 10}`));

		if (index % 3 === 0) {
			pMemoizeClear(memoized);
		}
	}

	const settled = await Promise.allSettled(calls);
	assert.ok(settled.every(result => result.status === 'fulfilled'), 'every call settled');
	assert.ok(invocationsCount <= 200, `fn ran ${invocationsCount} times for 200 calls`);
});

test('.pMemoizeClear() during `shouldCache` prevents the write', async () => {
	const {promise, resolve} = pDefer<number>();
	const predicateStarted = pDefer<void>();
	const releasePredicate = pDefer<void>();
	const store = new Map<string, number>();
	let writes = 0;
	const cache = {
		has: (key: string) => store.has(key),
		get: (key: string) => store.get(key),
		set(key: string, value: number) {
			writes++;
			store.set(key, value);
		},
		delete(key: string) {
			store.delete(key);
		},
		clear() {
			store.clear();
		},
	};

	const memoized = pMemoize(async (_value: string) => promise, {
		cache,
		async shouldCache() {
			predicateStarted.resolve();
			await releasePredicate.promise;
			return true;
		},
	});

	const inFlight = memoized('a');
	resolve(1);
	await withTimeout(predicateStarted.promise, 'shouldCache() to start');

	pMemoizeClear(memoized);
	releasePredicate.resolve();
	await inFlight;

	assert.equal(store.size, 0, 'the cleared cache was not repopulated');
	// The write is skipped rather than issued, which matters for a cache where every write costs a round trip.
	assert.equal(writes, 0, 'the write was issued after the clear');
});

test('a clear does not undo a cache write that already started (documented limitation)', async () => {
	const writeStarted = pDefer<void>();
	const releaseWrite = pDefer<void>();
	const cache = new Map<string, number>();
	const slowWriteCache = {
		has: (key: string) => cache.has(key),
		get: (key: string) => cache.get(key),
		async set(key: string, value: number) {
			writeStarted.resolve();
			await releaseWrite.promise;
			cache.set(key, value);
		},
		clear() {
			cache.clear();
		},
	};

	let invocationsCount = 0;
	const memoized = pMemoize(async (_key: string) => ++invocationsCount, {cache: slowWriteCache});

	const inFlight = memoized('k');
	await withTimeout(writeStarted.promise, 'the cache write to start');

	pMemoizeClear(memoized);
	releaseWrite.resolve();
	await inFlight;
	await drainEventLoop();

	assert.equal(cache.size, 1, 'the stale value stays');
	assert.equal(await memoized('k'), 1, 'and it is served rather than recomputed');
	assert.equal(invocationsCount, 1);
});

test('.pMemoizeClear() does not let a settling call evict a newer in-flight call', async () => {
	// Each invocation gets its own deferred, so the two calls can be settled independently, and resolves its "started" deferred so the test never has to poll for it.
	const results = [pDefer<number>(), pDefer<number>()];
	const started = [pDefer<void>(), pDefer<void>()];
	let invocationsCount = 0;
	const memoized = pMemoize(async () => {
		started[invocationsCount]!.resolve();
		return results[invocationsCount++]!.promise;
	});

	const promise1 = memoized();
	await withTimeout(started[0]!.promise, 'the first execution to start');

	pMemoizeClear(memoized);

	const promise2 = memoized();
	await withTimeout(started[1]!.promise, 'the second execution to start');

	results[0]!.resolve(1);
	assert.equal(await promise1, 1);

	// `promise1` has settled, but `promise2` is still in flight and must stay de-duplicated.
	const promise3 = memoized();
	assert.equal(promise3, promise2);
	assert.equal(invocationsCount, 2);

	results[1]!.resolve(2);
	assert.equal(await promise2, 2);
	assert.equal(await promise3, 2);
});

test('a re-entrant call joins the in-flight promise instead of running again', async () => {
	let invocationsCount = 0;
	let nested: Promise<number> | undefined;
	const memoized = pMemoize(async (): Promise<number> => {
		invocationsCount++;
		nested ??= memoized();
		return invocationsCount;
	}, {cache: false});

	assert.equal(await memoized(), 1);
	assert.equal(await nested, 1);
	assert.equal(invocationsCount, 1);
});

test('a re-entrant call from `cache.has()` joins the in-flight promise', async () => {
	let invocationsCount = 0;
	const store = new Map<unknown, unknown>();
	let reentered: Promise<number> | undefined;
	let shouldReenter = false;
	const cache = {
		has(key: unknown) {
			store.has(key);
			if (shouldReenter) {
				shouldReenter = false;
				reentered = memoized('a');
			}

			return false;
		},
		get: (key: unknown) => store.get(key),
		set(key: unknown, value: unknown) {
			store.set(key, value);
			return value;
		},
		delete: (key: unknown) => store.delete(key),
		clear() {
			store.clear();
		},
	};
	const memoized = pMemoize(async (_value: string) => {
		invocationsCount++;
		return invocationsCount;
	}, {cache: cache as any, cacheKey: ([first]) => first});

	shouldReenter = true;
	assert.equal(await memoized('a'), 1);
	assert.equal(await reentered, 1);
	assert.equal(invocationsCount, 1);
});

test('several re-entrant calls all join one execution', async () => {
	let invocationsCount = 0;
	const reentered: Array<Promise<number>> = [];
	let pendingReentries = 2;
	const memoized = pMemoize(async (): Promise<number> => {
		invocationsCount++;

		while (pendingReentries > 0) {
			pendingReentries--;
			reentered.push(memoized());
		}

		return invocationsCount;
	}, {cache: false});

	assert.equal(await memoized(), 1);
	assert.deepEqual(await Promise.all(reentered), [1, 1]);
	assert.equal(invocationsCount, 1);
});

test('two re-entrant calls from the cache read join one execution', async () => {
	const store = new Map<string, number>();
	let invocationsCount = 0;
	const reentered: Array<Promise<number>> = [];
	let pending = 2;

	const cache = {
		has(key: string) {
			if (pending > 0) {
				pending--;
				reentered.push(memoized('a'));
			}

			return store.has(key);
		},
		get(key: string) {
			if (pending > 0) {
				pending--;
				reentered.push(memoized('a'));
			}

			return store.get(key);
		},
		set(key: string, value: number) {
			store.set(key, value);
		},
		delete(key: string) {
			store.delete(key);
		},
	};

	const memoized = pMemoize(async (_key: string) => ++invocationsCount, {cache});

	assert.equal(await memoized('a'), 1);
	assert.deepEqual(await Promise.all(reentered), [1, 1]);
	assert.equal(invocationsCount, 1);
});

test('a memoized function may clear its own cache while running', async () => {
	const cache = new Map<string, number>();
	let invocationsCount = 0;

	// The clear lands before the result would be written, so the write is dropped.
	const memoized = pMemoize(async (_key: string) => {
		invocationsCount++;
		if (invocationsCount === 1) {
			pMemoizeClear(memoized);
		}

		return invocationsCount;
	}, {cache});

	assert.equal(await memoized('a'), 1);
	assert.equal(cache.size, 0, 'the clear was not undone by the in-flight write');
	assert.equal(await memoized('a'), 2);
});

test('`shouldCache` may clear the cache while the call is running', async () => {
	const cache = new Map<string, number>();
	let invocationsCount = 0;
	let clears = 0;

	const memoized = pMemoize(async (_key: string) => ++invocationsCount, {
		cache,
		shouldCache() {
			if (clears++ === 0) {
				pMemoizeClear(memoized);
			}

			return true;
		},
	});

	assert.equal(await memoized('a'), 1);
	assert.equal(cache.size, 0, 'the clear was not undone by the write after the predicate');
	assert.equal(await memoized('a'), 2);
});

test('a memoized function may re-enter itself for a different key', async () => {
	let invocationsCount = 0;

	const memoized = pMemoize(async (key: string) => {
		invocationsCount++;
		if (key === 'a') {
			await memoized('b');
		}

		return key;
	});

	assert.equal(await memoized('a'), 'a');
	assert.equal(invocationsCount, 2);
});

test('a cache that evicts on write keeps its own bound', async () => {
	const maxSize = 4;
	const store = new Map<string, number>();
	const cache = {
		has: (key: string) => store.has(key),
		get(key: string) {
			return store.get(key);
		},
		set(key: string, value: number) {
			store.delete(key);
			store.set(key, value);
			while (store.size > maxSize) {
				store.delete(store.keys().next().value!);
			}
		},
		delete(key: string) {
			store.delete(key);
		},
		clear() {
			store.clear();
		},
	};

	let invocationsCount = 0;
	const memoized = pMemoize(async (_key: string) => ++invocationsCount, {cache});

	for (let index = 0; index < 200; index++) {
		// eslint-disable-next-line no-await-in-loop -- Each key has to be written before the next one evicts it.
		await memoized(`key-${index % 17}`);
	}

	assert.ok(store.size <= maxSize, `the cache grew to ${store.size}`);
});

test('a clear releases the memoized state after many keys', async () => {
	let invocationsCount = 0;
	const memoized = pMemoize(async (_key: number) => ++invocationsCount);

	for (let index = 0; index < 2000; index++) {
		// eslint-disable-next-line no-await-in-loop -- Sequential on purpose: the point is the volume of keys.
		await memoized(index);
	}

	const before = invocationsCount;
	pMemoizeClear(memoized);
	await memoized(0);
	assert.equal(invocationsCount, before + 1);
});

test('a thenable from the memoized function is awaited and cached', async () => {
	let invocationsCount = 0;

	// A plain function is not a valid `AnyAsyncFunction`, but a thenable is accepted at runtime.
	const memoized = pMemoize((() => {
		invocationsCount++;
		return {
			// eslint-disable-next-line unicorn/no-thenable -- A thenable that is not a promise is the point.
			then(resolve: (value: string) => void) {
				resolve('from thenable');
			},
		};
	}) as unknown as () => Promise<string>);

	assert.equal(await memoized(), 'from thenable');
	assert.equal(await memoized(), 'from thenable');
	assert.equal(invocationsCount, 1);
});

test('a cache may hand back thenables instead of promises', async () => {
	const store = new Map<string, string>();
	// A thenable that is not a promise is the point, so this has to be an object literal.
	const makeThenable = (value: string) => ({
		// eslint-disable-next-line unicorn/no-thenable
		then(onFulfilled?: (result: string) => unknown) {
			queueMicrotask(() => {
				onFulfilled?.(value);
			});
		},
	});

	const cache = {
		has: (key: string) => store.has(key),
		get(key: string) {
			return store.has(key) ? makeThenable(store.get(key)!) : undefined;
		},
		set(key: string, value: string) {
			store.set(key, value);
			return makeThenable('');
		},
		delete(key: string) {
			store.delete(key);
		},
	};

	let invocationsCount = 0;
	const memoized = pMemoize(async (key: string) => `computed:${key}:${++invocationsCount}`, {cache: cache as never});

	assert.equal(await memoized('a'), 'computed:a:1');
	assert.equal(await memoized('a'), 'computed:a:1');
	assert.equal(invocationsCount, 1);
});

test('a method memoized on a prototype is NOT keyed by the receiver (documented limitation)', async () => {
	// Documented limitation, see the readme section on the receiver. The receiver is not part of the cache key and `cacheKey` cannot see it, so there is no way to key by instance. The decorator is the supported way to memoize a method that depends on the instance.
	class Repository {
		name: string;

		constructor(name: string) {
			this.name = name;
		}

		async lookup(key: string) {
			return `${this.name}:${key}`;
		}
	}

	Repository.prototype.lookup = pMemoize(Repository.prototype.lookup);

	const alpha = new Repository('alpha');
	const beta = new Repository('beta');

	assert.equal(await alpha.lookup('k'), 'alpha:k');
	assert.equal(await beta.lookup('k'), 'alpha:k', 'the cached value comes from the other instance');
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

test('.pMemoizeDecorator() stops one instance refilling a cache it shares with another', async () => {
	// The decorator hands the same cache to every instance, so clearing one has to stop the others' in-flight calls from writing back into it.
	const cache = new Map<string, number>();
	const gate = pDefer<void>();

	class Service {
		calls = 0;

		@pMemoizeDecorator({cache})
		async work() {
			this.calls++;
			await gate.promise;
			return this.calls;
		}
	}

	const alpha = new Service();
	const beta = new Service();

	const inFlight = beta.work();
	await withTimeout(new Promise(resolve => {
		setImmediate(resolve);
	}), 'the work to start');

	pMemoizeClear(alpha.work);
	gate.resolve();
	await inFlight;

	assert.equal(cache.size, 0, 'beta\'s in-flight call refilled the cache alpha had cleared');
});

test('.pMemoizeDecorator() installs the method the way a prototype method looks', async () => {
	class Service {
		name = 'x';

		@pMemoizeDecorator()
		async work() {
			return this.name;
		}
	}

	const service = new Service();
	assert.equal(await service.work(), 'x');

	// Non-enumerable, so it stays out of keys, spread and JSON, the way a method that was never decorated would.
	assert.deepEqual(Object.keys(service), ['name']);
	assert.deepEqual({...service}, {name: 'x'});

	// Configurable and writable, so it can still be replaced or removed.
	const descriptor = Object.getOwnPropertyDescriptor(service, 'work');
	assert.equal(descriptor?.enumerable, false);
	assert.equal(descriptor?.configurable, true);
	assert.equal(descriptor?.writable, true);
});

test('.pMemoizeDecorator() rejects anything that is not a plain method', () => {
	const decorate = pMemoizeDecorator();
	const context = {
		name: 'value',
		static: false,
		private: false,
		access: {
			has: () => true,
		},
		addInitializer() {
			// Nothing to install in this fixture; the guard runs before the initializer is added.
		},
	};

	// A getter, a setter, a field or an auto-accessor all reach the decorator with a context that is not a method, and TypeScript does not stop them.
	assert.throws(() => {
		decorate(async () => 'x', {kind: 'getter', ...context} as never);
	}, {name: 'TypeError', message: 'pMemoizeDecorator can only decorate methods'});

	assert.throws(() => {
		decorate(async () => 'x', {kind: 'setter', ...context} as never);
	}, {name: 'TypeError', message: 'pMemoizeDecorator can only decorate methods'});

	assert.throws(() => {
		decorate(async () => 'x', {kind: 'field', ...context} as never);
	}, {name: 'TypeError', message: 'pMemoizeDecorator can only decorate methods'});

	// A private method is a method, so it gets its own message.
	assert.throws(() => {
		decorate(async () => 'x', {
			...context,
			kind: 'method',
			name: '#value',
			private: true,
		} as never);
	}, {name: 'TypeError', message: 'pMemoizeDecorator cannot decorate private methods'});
});

test('.pMemoizeDecorator() does not shadow an override in a subclass', async () => {
	let baseCalls = 0;
	let derivedCalls = 0;

	class Base {
		@pMemoizeDecorator()
		async work() {
			baseCalls++;
			return `base:${baseCalls}`;
		}
	}

	class Derived extends Base {
		override async work() {
			derivedCalls++;
			return `derived:${derivedCalls}`;
		}
	}

	assert.equal(await new Base().work(), 'base:1');

	const derived = new Derived();
	assert.equal(await derived.work(), 'derived:1', 'the override runs, not the base method');
	assert.equal(await derived.work(), 'derived:2', 'the override is not decorated, so it is not memoized');
	assert.equal(baseCalls, 1);
	assert.equal(derivedCalls, 2);
});

test('.pMemoizeDecorator() memoizes when it is listed above another method decorator', async () => {
	function passThrough<This, Value extends (this: This, ...arguments_: any[]) => any>(value: Value, _context: ClassMethodDecoratorContext<This, Value>): Value {
		return function (this: This, ...arguments_: Parameters<Value>) {
			return value.apply(this, arguments_);
		} as Value;
	}

	class Topmost {
		calls = 0;

		@pMemoizeDecorator()
		@passThrough
		async work() {
			return ++this.calls;
		}
	}

	class Bottommost {
		calls = 0;

		@passThrough
		@pMemoizeDecorator()
		async work() {
			return ++this.calls;
		}
	}

	const topmost = new Topmost();
	await topmost.work();
	assert.equal(await topmost.work(), 1, 'memoized when listed first');

	// Documented limitation: the decorator above replaces the method, so the memoized copy stands down.
	const bottommost = new Bottommost();
	await bottommost.work();
	assert.equal(await bottommost.work(), 2, 'not memoized when listed last');
});

test('.pMemoizeDecorator() leaves `super` calls from an override unmemoized (documented limitation)', async () => {
	let baseCalls = 0;

	class Base {
		@pMemoizeDecorator()
		async work() {
			return ++baseCalls;
		}
	}

	class Derived extends Base {
		derivedCalls = 0;

		override async work() {
			this.derivedCalls++;
			return super.work();
		}
	}

	const derived = new Derived();
	await derived.work();
	assert.equal(await derived.work(), 2);
	assert.equal(derived.derivedCalls, 2);
});

test('.pMemoizeDecorator() does not shadow a static override in a subclass', async () => {
	let baseCalls = 0;
	let derivedCalls = 0;

	// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- The fixture only has statics to decorate.
	class Base {
		@pMemoizeDecorator()
		static async work() {
			baseCalls++;
			return `base:${baseCalls}`;
		}
	}

	class Derived extends Base {
		static override async work() {
			derivedCalls++;
			return `derived:${derivedCalls}`;
		}
	}

	assert.equal(await Base.work(), 'base:1');
	assert.equal(await Derived.work(), 'derived:1', 'the override runs, not the base method');
	assert.equal(baseCalls, 1);
	assert.equal(derivedCalls, 1);
});

test('.pMemoizeDecorator() memoizes a static method', async () => {
	// A static method is installed on the class rather than on the prototype, so it takes the other branch of the owner lookup. The override test next to this one only exercises that branch on the stand-down path, which is why the memoized case needs its own.
	let calls = 0;

	// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- The fixture only has a static to decorate.
	class Service {
		@pMemoizeDecorator()
		static async lookup(key: string) {
			calls++;
			return `${key}:${calls}`;
		}
	}

	assert.equal(await Service.lookup('a'), 'a:1');
	assert.equal(await Service.lookup('a'), 'a:1', 'the static method is memoized');
	assert.equal(await Service.lookup('b'), 'b:2');
	assert.equal(calls, 2);

	// There is one static method per class, so its cache is the class's own.
	pMemoizeClear(Service.lookup);
	assert.equal(await Service.lookup('a'), 'a:3');
});

test('.pMemoizeDecorator() stands down for a subclass that replaces the method with a data property', () => {
	class Base {
		@pMemoizeDecorator()
		async work() {
			return 'memoized';
		}
	}

	class Derived extends Base {}

	Object.defineProperty(Derived.prototype, 'work', {
		configurable: true,
		writable: true,
		value: 'replaced',
	});

	const derived = new Derived();
	assert.equal(derived.work, 'replaced');
});

test('.pMemoizeDecorator() stands down three levels down a chain', async () => {
	class Base {
		@pMemoizeDecorator()
		async work() {
			return 'base';
		}
	}

	class Middle extends Base {}

	class Derived extends Middle {
		calls = 0;
	}

	Object.defineProperty(Derived.prototype, 'work', {
		configurable: true,
		writable: true,
		async value(this: {calls: number}) {
			this.calls++;
			return `derived:${this.calls}`;
		},
	});

	const derived = new Derived();
	assert.equal(await derived.work(), 'derived:1');
	assert.equal(await derived.work(), 'derived:2', 'the middle class has no override, so the base method is not installed over the derived one');
});

test('.pMemoizeDecorator() memoizes a method a subclass does not override', async () => {
	let baseCalls = 0;

	class Base {
		@pMemoizeDecorator()
		async work() {
			baseCalls++;
			return `base:${baseCalls}`;
		}
	}

	class Derived extends Base {}

	const derived = new Derived();
	assert.equal(await derived.work(), 'base:1');
	assert.equal(await derived.work(), 'base:1', 'the inherited method is memoized');
	assert.equal(baseCalls, 1);
});

/* eslint-disable unicorn/no-unsafe-property-key -- Indexing with a symbol variable is the point of this test, and the rule cannot tell a symbol key apart from an arbitrary string one. */
test('.pMemoizeDecorator() memoizes a method named by a symbol', async () => {
	// A computed method name puts a symbol in `context.name`, which is what the override check and the property definition both have to carry through.
	const key = Symbol('lookup');

	class Base {
		calls = 0;

		@pMemoizeDecorator()
		async [key](value: string) {
			this.calls++;
			return `${value}:${this.calls}`;
		}
	}

	class Derived extends Base {}

	const derived = new Derived();
	assert.equal(await derived[key]('a'), 'a:1');
	assert.equal(await derived[key]('a'), 'a:1', 'the inherited method is memoized');
	assert.equal(derived.calls, 1);

	// A symbol-named override has to be stood down for just like a string-named one.
	const overrides = new Derived();
	await overrides[key]('a');
	Object.defineProperty(Derived.prototype, key, {
		configurable: true,
		writable: true,
		async value() {
			return 'overridden';
		},
	});

	const shadowed = new Derived();
	assert.equal(await shadowed[key]('a'), 'overridden', 'the override was not shadowed by the memoized copy');
});
/* eslint-enable unicorn/no-unsafe-property-key */

test('.pMemoizeClear() throws when called with a plain function', () => {
	assert.throws(() => {
		pMemoizeClear(async () => {}); // eslint-disable-line @typescript-eslint/no-empty-function
	}, {
		name: 'TypeError',
		message: 'Can\'t clear a function that was not memoized!',
	});
});

test('.pMemoizeClear() throws when called on an unclearable cache', () => {
	// A `WeakMap` is one of the caches the docs suggest, so the message must not call it a Map.
	const memoized = pMemoize(async () => 1, {cache: new WeakMap<Record<string, unknown>, number>()});

	assert.throws(() => {
		pMemoizeClear(memoized);
	}, {
		name: 'TypeError',
		message: 'The cache can\'t be cleared!',
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
	const cache = new Map<string, number>();
	const recordedSets: Array<{key: string; value: number}> = [];
	const wrappedCache = {
		async has(key: string) {
			return cache.has(key);
		},
		async get(key: string) {
			return cache.get(key);
		},
		async set(key: string, value: number) {
			recordedSets.push({key, value});
			cache.set(key, value);
		},
		delete(key: string) {
			cache.delete(key);
		},
		clear() {
			cache.clear();
		},
	} as const;

	const memoized = pMemoize(async (_value: string) => ++calls, {
		cache: wrappedCache,
		shouldCache() {
			return false;
		},
	});

	assert.equal(await memoized('a'), 1);
	assert.equal(recordedSets.length, 0, 'cache.set was not called');
	// Next call should recompute since we skipped caching
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
	const cache = new Map<string, number>();
	const wrappedCache = {
		async has(key: string) {
			return cache.has(key);
		},
		async get(key: string) {
			return cache.get(key);
		},
		async set(key: string, value: number) {
			recordedSets.push([key, value]);
			cache.set(key, value);
		},
	} as const;

	let called = 0;
	const memoized = pMemoize(async (_value: string): Promise<number> => {
		throw new Error('boom');
	}, {
		cache: wrappedCache,
		shouldCache() {
			called++;
			return true;
		},
	});

	await assert.rejects(memoized('x'), {message: 'boom'});
	assert.equal(called, 0);
	assert.equal(recordedSets.length, 0);
});

test('shouldCache: supports async predicate', async () => {
	const recordedSets: Array<{key: string; value: string}> = [];
	const cache = new Map<string, string>();
	const wrappedCache = {
		async has(key: string) {
			return cache.has(key);
		},
		async get(key: string) {
			return cache.get(key);
		},
		async set(key: string, value: string) {
			recordedSets.push({key, value});
			cache.set(key, value);
		},
		delete(key: string) {
			cache.delete(key);
		},
	} as const;

	const memoized = pMemoize(async (_value: string) => 'ok', {
		cache: wrappedCache,
		async shouldCache(value) {
			await Promise.resolve();
			return value === 'ok';
		},
	});

	assert.equal(await memoized('x'), 'ok');
	assert.equal(recordedSets.length, 1, 'cache.set was called once');
});

test('shouldCache: works with custom cacheKey', async () => {
	const recordedKeys: string[] = [];
	const cache = new Map<string, string>();
	const wrappedCache = {
		async has(key: string) {
			return cache.has(key);
		},
		async get(key: string) {
			return cache.get(key);
		},
		async set(key: string, value: string) {
			recordedKeys.push(key);
			cache.set(key, value);
		},
		delete(key: string) {
			cache.delete(key);
		},
	} as const;

	const memoized = pMemoize(async (_value: number) => 'v', {
		cache: wrappedCache,
		cacheKey: ([first]) => String(first),
		shouldCache(_value, {key, argumentsList}) {
			assert.equal(key, String(argumentsList[0]));
			return true;
		},
	});

	await memoized(1);
	assert.deepEqual(recordedKeys, ['1']);
});

test('shouldCache: predicate error bubbles and does not cache', async () => {
	const cache = new Map<string, string>();
	const recordedSets: unknown[] = [];
	const wrappedCache = {
		async has(key: string) {
			return cache.has(key);
		},
		async get(key: string) {
			return cache.get(key);
		},
		async set(key: string, value: string) {
			recordedSets.push([key, value]);
			cache.set(key, value);
		},
		delete(key: string) {
			cache.delete(key);
		},
	} as const;

	const memoized = pMemoize(async (_value: string) => 'x', {
		cache: wrappedCache,
		shouldCache() {
			throw new Error('nope');
		},
	});

	await assert.rejects(memoized('k'), {message: 'nope'});
	assert.equal(recordedSets.length, 0);
});

test('options are read once, when the function is memoized', async () => {
	const cache = new Map<string, number>();
	let calls = 0;
	const options = {
		cache,
		shouldCache: () => true,
	};

	const memoized = pMemoize(async (_value: string) => ++calls, options);

	await memoized('a');
	assert.equal(cache.size, 1);

	// `cache` and `cacheKey` are captured when the function is memoized, so `shouldCache` has to be as well. Reading it per call means editing the object afterwards silently changes how an already-memoized function writes to the cache.
	(options as {shouldCache: () => boolean}).shouldCache = () => false;
	await memoized('b');
	assert.equal(cache.size, 2);
	assert.equal(calls, 2);
});

test('shouldCache: interop with external eviction', async () => {
	// Simulate external TTL eviction by deleting after set.
	const cache = new Map<string, number>();
	const wrappedCache = {
		async has(key: string) {
			return cache.has(key);
		},
		async get(key: string) {
			return cache.get(key);
		},
		async set(key: string, value: number) {
			cache.set(key, value);
		},
		delete(key: string) {
			cache.delete(key);
		},
	} as const;

	let index = 0;
	const memoized = pMemoize(async (_value: string) => ++index, {
		cache: wrappedCache,
		shouldCache() {
			return true;
		},
	});

	assert.equal(await memoized('a'), 1);
	// Evict externally
	wrappedCache.delete('a');
	assert.equal(await memoized('a'), 2);
});

{
	pMemoize(async (_url: string): Promise<string> => '', {
		cacheKey: ([_url]) => _url,
		cache: {
			async get(_url: string): Promise<string | undefined> {
				return undefined;
			},
			async set(_url: string, _contents: string): Promise<void> {}, // eslint-disable-line @typescript-eslint/no-empty-function
			async has(_url: string): Promise<boolean> {
				return true;
			},
		},
	});
}

{
	const cache = {
		async get(_url: string): Promise<string | undefined> {
			return undefined;
		},
		async set(_url: string, _contents: string): Promise<void> {}, // eslint-disable-line @typescript-eslint/no-empty-function
		async has(_url: string): Promise<boolean> {
			return true;
		},
	} as const;

	pMemoize(async (_url: string): Promise<string> => '', {
		cacheKey: ([_url]) => _url,
		cache,
	});
}
