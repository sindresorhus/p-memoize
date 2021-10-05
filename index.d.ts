type AnyFunction = (...arguments_: readonly any[]) => unknown | void;

export interface CacheStorage<KeyType, ValueType> {
	has(key: KeyType): boolean;
	get(key: KeyType): ValueType | undefined;
	set(key: KeyType, value: ValueType): void;
	delete(key: KeyType): void;
	clear?: () => void; // eslint-disable-line @typescript-eslint/member-ordering
}

export interface CacheItem<ReturnType> {
	data: PromiseLike<ReturnType>;
	maxAge: number;
}

export type Options<
	ArgumentsType extends unknown[],
	CacheKeyType,
	ReturnType,
> = {
	/**
	Cache rejected promises.

	@default false
	*/
	readonly cachePromiseRejection?: boolean;

	/**
	The milliseconds until the cache expires.

	@default Infinity
	*/
	readonly maxAge?: number;

	/**
	Determines the cache key for storing the result based on the function arguments. By default, **only the first argument is considered**.

	A `cacheKey` function can return any type supported by `Map` (or whatever structure you use in the `cache` option).

	@default arguments_ => arguments_[0]
	@example arguments_ => JSON.stringify(arguments_)

	See the [caching strategy](https://github.com/sindresorhus/mem#caching-strategy) section in the `mem` package for more information.
	*/
	readonly cacheKey?: (arguments: ArgumentsType) => CacheKeyType;

	/**
	Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, `.set(key, value)`, `.delete(key)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache.

	@default new Map()
	@example new WeakMap()

	See the [caching strategy](https://github.com/sindresorhus/mem#caching-strategy) section in the `mem` package for more information.
	*/
	readonly cache?: CacheStorage<CacheKeyType, CacheItem<ReturnType>>;
};

/**
[Memoize](https://en.wikipedia.org/wiki/Memoization) promise-returning & async functions.

@param fn - Promise-returning or async function to be memoized.
@param options - See the [`p-memoize` options](https://github.com/sindresorhus/p-memoize#options).
@returns A memoized version of the `input` function.

@example
```
import pMemoize from 'p-memoize';
import got from 'got';

const memoizedGot = pMemoize(got, {maxAge: 1000});

memoizedGot('https://sindresorhus.com');

// This call is cached
memoizedGot('https://sindresorhus.com');

setTimeout(() => {
	// This call is not cached as the cache has expired
	memoizedGot('https://sindresorhus.com');
}, 2000);
```
*/
export default function pMemoize<ArgumentsType extends unknown[], ReturnType, CacheKeyType>(
	fn: (...arguments: ArgumentsType) => PromiseLike<ReturnType>,
	options?: Options<ArgumentsType, CacheKeyType, ReturnType>
): (...arguments: ArgumentsType) => Promise<ReturnType>;

/**
Clear all cached data of a memoized function.

@param memoized - A function that was previously memoized. It will throw when given a non-memoized function.
*/
export function pMemoizeClear(memoizedFunction: AnyFunction): void;
