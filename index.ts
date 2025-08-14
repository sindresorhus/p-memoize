import mimicFunction from 'mimic-function';
import type {AsyncReturnType} from 'type-fest';

// TODO: Use the one in `type-fest` when it's added there.
export type AnyAsyncFunction = (...arguments_: readonly any[]) => Promise<unknown | void>;

const cacheStore = new WeakMap<AnyAsyncFunction, CacheStorage<any, any> | false>();

export type CacheStorage<KeyType, ValueType> = {
	has: (key: KeyType) => Promise<boolean> | boolean;
	get: (key: KeyType) => Promise<ValueType | undefined> | ValueType | undefined;
	set: (key: KeyType, value: ValueType) => Promise<unknown> | unknown;
	delete: (key: KeyType) => unknown;
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

	@default arguments_ => arguments_[0]
	@example arguments_ => JSON.stringify(arguments_)
	*/
	readonly cacheKey?: (arguments_: Parameters<FunctionToMemoize>) => CacheKeyType;

	/**
	Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, `.set(key, value)`, `.delete(key)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache. To disable caching so that only concurrent executions resolve with the same value, pass `false`.

	@default new Map()
	@example new WeakMap()
	*/
	readonly cache?: CacheStorage<CacheKeyType, AsyncReturnType<FunctionToMemoize>> | false;

	/**
	Controls whether a fulfilled value should be written to the cache.

	It runs after the function fulfills and before `cache.set`.

	- Omit to keep current behavior (always write).
	- Return `false` to skip writing to the cache (in-flight de-duplication is still cleared).
	- Throw or reject to propagate the error and skip caching.

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

@param fn - Function to be memoized.

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
	OptionsType = Options<FunctionToMemoize, CacheKeyType>,
>(
	fn: FunctionToMemoize,
	options?: OptionsType & Options<FunctionToMemoize, CacheKeyType>,
): FunctionToMemoize {
	const defaultCacheKey = ([firstArgument]: Parameters<FunctionToMemoize>): CacheKeyType => firstArgument as CacheKeyType;

	const {
		cacheKey = defaultCacheKey,
		cache = new Map<CacheKeyType, AsyncReturnType<FunctionToMemoize>>(),
	} = options ?? {};

	// Promise objects can't be serialized so we keep track of them internally and only provide their resolved values to `cache`
	// `Promise<AsyncReturnType<FunctionToMemoize>>` is used instead of `ReturnType<FunctionToMemoize>` because promise properties are not kept
	const promiseCache = new Map<CacheKeyType, Promise<AsyncReturnType<FunctionToMemoize>>>();

	const memoized = function (this: any, ...arguments_: Parameters<FunctionToMemoize>): Promise<AsyncReturnType<FunctionToMemoize>> { // eslint-disable-line @typescript-eslint/promise-function-async
		const key = cacheKey(arguments_);

		if (promiseCache.has(key)) {
			return promiseCache.get(key)!;
		}

		const promise = (async () => {
			try {
				if (cache && await cache.has(key)) {
					return (await cache.get(key)) as AsyncReturnType<FunctionToMemoize>;
				}

				const promise = fn.apply(this, arguments_) as Promise<AsyncReturnType<FunctionToMemoize>>;

				const result = await promise;

				try {
					return result;
				} finally {
					if (cache) {
						const allow = options?.shouldCache
							? await options.shouldCache(result, {key, argumentsList: arguments_})
							: true;

						if (allow) {
							await cache.set(key, result);
						}
					}
				}
			} finally {
				promiseCache.delete(key);
			}
		})();

		promiseCache.set(key, promise);

		return promise;
	} as FunctionToMemoize;

	mimicFunction(memoized, fn, {
		ignoreNonConfigurable: true,
	});

	cacheStore.set(memoized, cache);

	return memoized;
}

/**
- Only class methods are supported; regular functions are not part of the decorators proposals.
- Uses the new ECMAScript decorators (TypeScript 5.0+). Legacy `experimentalDecorators` are not supported.
- Babel’s legacy decorators are not supported.
- Private methods are not supported.

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

	@pMemoizeDecorator()
	async counter() {
		return ++this.index;
	}
}
```
*/
export function pMemoizeDecorator<
	FunctionToMemoize extends AnyAsyncFunction = AnyAsyncFunction,
	CacheKeyType = Parameters<FunctionToMemoize>[0],
>(options: Options<NoInfer<FunctionToMemoize>, NoInfer<CacheKeyType>> = {}) {
	return function <This, Value extends FunctionToMemoize>(
		value: Value,
		context: ClassMethodDecoratorContext<This, Value>,
	): void {
		if (context.kind !== 'method') {
			throw new TypeError('pMemoizeDecorator can only decorate methods');
		}

		if (context.private) {
			throw new TypeError('pMemoizeDecorator cannot decorate private methods');
		}

		context.addInitializer(function (this: This) {
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

@param fn - Memoized function.
*/
export function pMemoizeClear(fn: AnyAsyncFunction): void {
	if (!cacheStore.has(fn)) {
		throw new TypeError('Can\'t clear a function that was not memoized!');
	}

	const cache = cacheStore.get(fn);

	if (!cache) {
		throw new TypeError('Can\'t clear a function that doesn\'t use a cache!');
	}

	if (typeof cache.clear !== 'function') {
		throw new TypeError('The cache Map can\'t be cleared!');
	}

	cache.clear();
}
