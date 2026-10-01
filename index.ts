import mimicFunction from 'mimic-function';

// Deliberately `Promise`, not `PromiseLike`, so that a function is not memoized on the strength of returning some other thenable.
export type AnyAsyncFunction = (...arguments_: readonly any[]) => Promise<unknown | void>;

type AsyncReturnType<FunctionType extends AnyAsyncFunction> = Awaited<ReturnType<FunctionType>>;

// Everything `pMemoizeClear()` needs to reach, including the in-flight promises, which live outside of `cache` but are part of the memoized state.
type MemoizedStore<ValueType> = {
	cache: CacheStorage<any, any> | false;
	promiseCache: Map<unknown, Promise<ValueType>>;
	/**
	Shared with every other memoized function using the same cache, so that clearing it invalidates the calls in flight on all of them. `undefined` when caching is disabled.
	*/
	shared: SharedCache | undefined;
};

// A clear bumps this so a call which was already running knows its result no longer belongs in the cache. It hangs off the cache rather than off one function, because two functions over one cache share its entries.
type SharedCache = {
	generation: number;
};

const cacheStore = new WeakMap<AnyAsyncFunction, MemoizedStore<any>>();

// The generation per cache. Weakly keyed so it lives exactly as long as the cache does.
const sharedCaches = new WeakMap<CacheStorage<any, any>, SharedCache>();

/**
Whether a cache method handed back something to await, as opposed to a plain value.
*/
function isThenable(value: unknown): value is PromiseLike<unknown> {
	return typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';
}

/**
The method `name` resolves to on `owner`, or `undefined` if there is none or it is an accessor.

Descriptors are read rather than the property itself: a plain read would run a subclass getter once per instantiation, with the prototype as its receiver, which can throw. An accessor in the chain means something replaced the method with one, so it is not the function we decorated.
*/
function findMethod(owner: Record<PropertyKey, unknown>, name: string | symbol): unknown {
	// The walk ends at the top of the prototype chain rather than at `undefined`, which is why it is a truthiness check. A method missing from the whole chain (deleted by a mixin or a mock, say) is the case the caller stands down for, so the walk has to survive reaching the end.
	let current: Record<PropertyKey, unknown> | undefined = owner;

	while (current) {
		const descriptor = Object.getOwnPropertyDescriptor(current, name);

		if (descriptor !== undefined) {
			return 'value' in descriptor ? descriptor.value : undefined;
		}

		current = Object.getPrototypeOf(current) as Record<PropertyKey, unknown> | undefined;
	}

	return undefined;
}

export type CacheStorage<KeyType, ValueType> = {
	has: (key: KeyType) => Promise<boolean> | boolean;
	get: (key: KeyType) => Promise<ValueType | undefined> | ValueType | undefined;
	set: (key: KeyType, value: ValueType) => Promise<unknown> | unknown;
	/**
	Not used by p-memoize. It is allowed so that a cache which has one can still be passed as an object literal.
	*/
	delete?: (key: KeyType) => unknown;
	clear?: () => unknown;
};

/**
Controls whether a fulfilled value should be written to the cache.
*/
export type ShouldCache<
	KeyType,
	ValueType,
	ArgumentsList extends readonly unknown[] = readonly unknown[],
> = (
	value: ValueType,
	context: {key: KeyType; argumentsList: ArgumentsList},
) => boolean | Promise<boolean>;

export type Options<
	FunctionToMemoize extends AnyAsyncFunction,
	CacheKeyType,
> = {
	/**
	Determines the cache key for storing the result based on the function arguments. By default, __only the first argument is considered__ and it only works with [primitives](https://developer.mozilla.org/docs/Glossary/Primitive).

	A `cacheKey` function can return any type supported by `Map` (or whatever structure you use in the `cache` option).

	You can have it cache **all** the arguments by value with `JSON.stringify`, if they are compatible:

	```
	import pMemoize from 'p-memoize';

	pMemoize(function_, {cacheKey: JSON.stringify});
	```

	Or you can use a more full-featured serializer like [serialize-javascript](https://github.com/yahoo/serialize-javascript) to add support for `RegExp`, `Date` and so on.

	```
	import pMemoize from 'p-memoize';
	import serializeJavascript from 'serialize-javascript';

	pMemoize(function_, {cacheKey: serializeJavascript});
	```

	- A call with no arguments has an undefined first argument, so it shares an entry with a call passing `undefined` explicitly. Pass a `cacheKey` that also looks at the argument count to tell them apart.
	- An `async` `cacheKey` is rejected outright: a promise is a fresh object on every call, so every key would be unique and nothing would ever be memoized.
	- The receiver (`this`) is not part of the key, and `cacheKey` cannot see it. A method memoized on a prototype, or one given a `cache` that is shared between instances, returns whichever instance's result was cached first. Use `pMemoizeDecorator()` without a custom `cache` for methods that depend on the instance.

	@default arguments_ => arguments_[0]
	@example arguments_ => JSON.stringify(arguments_)
	*/
	readonly cacheKey?: (arguments_: Parameters<FunctionToMemoize>) => CacheKeyType extends PromiseLike<unknown> ? never : CacheKeyType;

	/**
	Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, and `.set(key, value)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache. To disable caching so that only concurrent executions resolve with the same value, pass `false`.

	- `.has()` decides whether there is a hit, and `.get()` is only called on a hit, to supply the value. If the two disagree, for example because the entry is evicted in between, the call resolves to `undefined` without running the function.
	- Its key type must be the one `cacheKey` produces, which by default is the first argument's type. TypeScript infers that type from whichever of `cacheKey` and `cache` it can, so a cache keyed by something else is not reported until it throws on the first write.
	- A cache with no `.clear()` cannot be emptied by `pMemoizeClear()`, and a `WeakMap` has none.

	@default new Map()
	@example new WeakMap()
	*/
	readonly cache?: CacheStorage<CacheKeyType, AsyncReturnType<FunctionToMemoize>> | false;

	/**
	Controls whether a fulfilled value should be written to the cache.

	It runs after the function fulfills and before `cache.set`.

	- Omit to keep current behavior (always write).
	- Return `false` to skip writing to the cache (in-flight de-duplication is still cleared).
	- Throw or reject to propagate the error and skip caching. The predicate does not run at all when caching is disabled with `cache: false`.

	@example
	```
	import pMemoize from 'p-memoize';

	// Only cache defined values
	const getMaybe = pMemoize(async key => db.get(key), {
		shouldCache: value => value !== undefined,
	});

	// Only cache non-empty arrays
	const search = pMemoize(async query => fetchResults(query), {
		shouldCache: value => Array.isArray(value) && value.length > 0,
	});
	```

	Note: This only affects writes; reads from the cache are unchanged.
	*/
	readonly shouldCache?: ShouldCache<
		CacheKeyType,
		AsyncReturnType<FunctionToMemoize>,
		Parameters<FunctionToMemoize>
	>;
};

/**
[Memoize](https://en.wikipedia.org/wiki/Memoization) functions - An optimization used to speed up consecutive function calls by caching the result of calls with identical input.

For an overloaded function, the option types come from one of its overloads, because `ReturnType` resolves a type with several call signatures to a single one. Pass both type arguments to `pMemoize` when that matters.

@param fn - Function to be memoized.
@param options - See the `Options` type above.

@example
```
import {setTimeout as delay} from 'node:timer/promises';
import pMemoize from 'p-memoize';
import got from 'got';

const memoizedGot = pMemoize(got);

await memoizedGot('https://sindresorhus.com');

// This call is cached
await memoizedGot('https://sindresorhus.com');

await delay(2000);

// This call is not cached as the cache has expired
await memoizedGot('https://sindresorhus.com');
```
*/
export default function pMemoize<
	FunctionToMemoize extends AnyAsyncFunction,
	CacheKeyType = Parameters<FunctionToMemoize>[0],
>(
	fn: FunctionToMemoize,
	options?: Options<FunctionToMemoize, CacheKeyType>,
): FunctionToMemoize {
	const defaultCacheKey = ([firstArgument]: Parameters<FunctionToMemoize>): CacheKeyType => firstArgument as CacheKeyType;

	const {
		cacheKey = defaultCacheKey,
		cache = new Map<CacheKeyType, AsyncReturnType<FunctionToMemoize>>(),
		shouldCache,
	} = options ?? {};

	// Promise objects can't be serialized so we keep track of them internally and only provide their resolved values to `cache`
	// `Promise<AsyncReturnType<FunctionToMemoize>>` is used instead of `ReturnType<FunctionToMemoize>` because promise properties are not kept
	const promiseCache = new Map<CacheKeyType, Promise<AsyncReturnType<FunctionToMemoize>>>();

	let shared: SharedCache | undefined;

	if (cache !== false) {
		shared = sharedCaches.get(cache);

		if (!shared) {
			shared = {generation: 0};
			sharedCaches.set(cache, shared);
		}
	}

	const store: MemoizedStore<AsyncReturnType<FunctionToMemoize>> = {
		cache,
		promiseCache,
		shared,
	};

	const memoized = function (this: any, ...arguments_: Parameters<FunctionToMemoize>): Promise<AsyncReturnType<FunctionToMemoize>> { // eslint-disable-line @typescript-eslint/promise-function-async
		let key: CacheKeyType;

		try {
			// A copy, because `arguments_` is the array that is then passed on, and a key built by sorting it in place would silently change what the function receives.
			key = cacheKey([...arguments_] as Parameters<FunctionToMemoize>);
		} catch (error) {
			// `cacheKey` runs before the async part, so a throw here would escape synchronously while every other caller-supplied callback turns its throw into a rejection. Keep them consistent so `memoized().catch()` always works.
			// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- The caller's own error is propagated as-is.
			return Promise.reject(error);
		}

		// Nothing is read from or written to a cache when caching is disabled, so it needs no generation of its own.
		const generation = store.shared === undefined ? 0 : store.shared.generation;

		const pendingPromise = promiseCache.get(key);

		if (pendingPromise !== undefined) {
			return pendingPromise;
		}

		// `promise` is read inside the callback below, and TypeScript cannot order that read against this assignment. It is not even true: when `cache.has()` throws synchronously, the callback's `finally` runs before the assignment happens. The assertion is what lets that path compile; `hasSettled` is what keeps it harmless.
		let promise!: Promise<AsyncReturnType<FunctionToMemoize>>;
		// Set by the `finally`, which means the call is over and nothing needs registering.
		let hasSettled = false;

		// eslint-disable-next-line prefer-const -- Forced by the declaration above.
		promise = (async (): Promise<AsyncReturnType<FunctionToMemoize>> => {
			try {
				if (cache === false) {
					// Nothing above suspends, so `fn` would run before this promise is registered as the in-flight one and a re-entrant call for the same key would start a second execution. Yield once so the registration below wins the race.
					await Promise.resolve();
				} else {
					if (await cache.has(key)) {
						const value = await cache.get(key) as AsyncReturnType<FunctionToMemoize>;

						// A `pMemoizeClear()` between the two reads empties the cache, so `get()` may hand back nothing even though `has()` said yes. Treat that as a miss instead of resolving to `undefined`.
						if (store.shared?.generation === generation) {
							return value;
						}
					}

					// `cache.has()` or `cache.get()` may have called back into this function for the same key, in which case that call got there first and is already running it. Joining anything else would mean awaiting ourselves. The `await` matters: without it the `finally` below would drop the entry while that call is still running.
					const inFlight = promiseCache.get(key);

					if (inFlight !== undefined && inFlight !== promise) {
						return await inFlight;
					}
				}

				const result = await (fn.apply(this, arguments_) as Promise<AsyncReturnType<FunctionToMemoize>>);

				if (cache !== false) {
					const shouldWrite = shouldCache
						? await shouldCache(result, {key, argumentsList: arguments_})
						: true;

					// `shouldCache()` may await, so a `pMemoizeClear()` landing in that window would otherwise write the result into the cache that was just cleared. A write that has already started is not undone; the docs say so.
					if (shouldWrite && store.shared?.generation === generation) {
						await cache.set(key, result);
					}
				}

				return result;
			} finally {
				hasSettled = true;

				// Only drop the entry when it is still ours: a clear, or a later call for the same key, may have replaced it while this one was running.
				if (promiseCache.get(key) === promise) {
					promiseCache.delete(key);
				}
			}
		})();

		// A `cache.has()` that throws synchronously settles the call before this point, and its cleanup has already run. Registering it now would keep that failure as the in-flight entry for this key forever, and every later call would hand it straight back.
		if (!hasSettled) {
			promiseCache.set(key, promise);
		}

		return promise;
	} as FunctionToMemoize;

	// Copying `fn`'s name, properties and source is cosmetic, and it can fail on a function that makes it hard: a non-configurable own `toString`, a `toString` that throws, a proxy whose traps throw. None of that is worth refusing to memoize over.
	try {
		mimicFunction(memoized, fn, {
			ignoreNonConfigurable: true,
		});
	} catch {}

	cacheStore.set(memoized, store);

	return memoized;
}

/**
- Only class methods are supported; regular functions are not part of the decorators proposals.
- Uses the new ECMAScript decorators (TypeScript 5.0+). Legacy `experimentalDecorators` are not supported.
- Babel’s legacy decorators are not supported.
- Private methods are not supported.
- Put `@pMemoizeDecorator()` first (topmost) when you combine it with other method decorators. Decorators are applied from the bottom up, so a decorator listed above it replaces the method after it, and the memoized copy is then skipped so that it does not hide that replacement. This happens silently.
- A subclass that overrides the method is not memoized for it, and a `super.method()` call from the override reaches the original, unmemoized method.

@returns A decorator to memoize class methods or static class methods.

@example
```
import {pMemoizeDecorator} from 'p-memoize';

class Example {
	index = 0

	@pMemoizeDecorator()
	async counter() {
		return ++this.index;
	}
}

class ExampleWithOptions {
	index = 0

	// Only cache positive results.
	@pMemoizeDecorator({shouldCache: value => value > 0})
	async counter() {
		return ++this.index;
	}
}
```
*/
export function pMemoizeDecorator<
	// The decorator factory is called before the method it decorates exists, so its type can never flow in here. Defaulting to a signature that resolves to `any` keeps the options usable instead of rejecting them on `unknown`; pass both type arguments to get precise ones.
	FunctionToMemoize extends AnyAsyncFunction = (...arguments_: any[]) => Promise<any>,
	CacheKeyType = Parameters<FunctionToMemoize>[0],
>(options: Options<NoInfer<FunctionToMemoize>, NoInfer<CacheKeyType>> = {}) {
	// `private` is narrowed so that a private method is reported where it is written. The runtime check still stands, because JavaScript has no such restriction.
	return function <This, Value extends FunctionToMemoize>(
		value: Value,
		context: ClassMethodDecoratorContext<This, Value> & {private: false},
	): void {
		if (context.kind !== 'method') {
			throw new TypeError('pMemoizeDecorator can only decorate methods');
		}

		if (context.private) {
			throw new TypeError('pMemoizeDecorator cannot decorate private methods');
		}

		context.addInitializer(function (this: This) {
			// A subclass can override the method, and defining the memoized copy on the instance would shadow that override. Ask where the method is actually defined (the prototype for an instance method, the class itself for a static one) and stand down if it is not ours.
			const owner = (context.static ? this : Object.getPrototypeOf(this)) as Record<PropertyKey, unknown>;

			if (findMethod(owner, context.name) !== value) {
				return;
			}

			const memoizedMethod = pMemoize(value, options as Options<Value, CacheKeyType>);
			Object.defineProperty(this, context.name, {
				configurable: true,
				writable: true,
				enumerable: false,
				value: memoizedMethod,
			});
		});
	};
}

/**
Clear all cached data of a memoized function.

What the clear reaches depends on what it is clearing:

- The cache is emptied for every memoized function sharing it, and a call still running on any of them will not write its result back into it.
- Only the in-flight calls of `fn` itself are dropped, so a later call on it starts fresh rather than joining one that began before the clear. Another memoized function over the same cache keeps sharing its own in-flight calls until they settle.

A `cache.set()` that has already started when you clear is not undone, so that value can still land in the cleared cache.

This function is synchronous: a `clear()` that returns a promise finishes after it returns, and a rejection from it is dropped rather than reported, since there is nothing to return it through. A `clear()` that throws synchronously still propagates to the caller.

@param fn - Memoized function.
*/
export function pMemoizeClear(fn: AnyAsyncFunction): void {
	const store = cacheStore.get(fn);

	if (store === undefined) {
		throw new TypeError('Can\'t clear a function that was not memoized!');
	}

	const {cache} = store;

	if (cache === false) {
		throw new TypeError('Can\'t clear a function that doesn\'t use a cache!');
	}

	if (typeof cache.clear !== 'function') {
		throw new TypeError('The cache can\'t be cleared!');
	}

	// Bumping the shared generation stops the calls still running on any function over this cache from writing into it. Done before emptying it, and not conditional on it: a `clear()` that fails halfway must not leave those calls free to refill it. The counter hangs off the cache rather than off one function, so looking it up by the cache reaches all of them at once.
	const shared = sharedCaches.get(cache);

	if (shared) {
		shared.generation++;
	}

	// Drop this function's in-flight promises so a later call starts fresh rather than joining one that was already running when the cache was cleared.
	store.promiseCache.clear();

	const cleared = cache.clear();

	// A `clear()` that returns a promise outlives this function, which has no way to return or await one. Left unobserved, a rejection from it takes the whole process down as an unhandled rejection, so it is observed and dropped: a synchronous throw still propagates to the caller.
	if (isThenable(cleared)) {
		cleared.then(undefined, () => undefined);
	}
}
