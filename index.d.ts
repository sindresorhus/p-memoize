
declare namespace pMemoize {
	interface CacheStorage<KeyType, ValueType> {
		has(key: KeyType): boolean;
		get(key: KeyType): ValueType | undefined;
		set(key: KeyType, value: ValueType): void;
		delete(key: KeyType): void;
		clear?: () => void;
	}

	type Options<
		ArgumentsType extends unknown[],
		CacheKeyType,
		ReturnType
	> = {
		/**
		Milliseconds until the cache expires.

		@default Infinity
		*/
		readonly maxAge?: number;

		/**
		Determines the cache key for storing the result based on the function arguments. By default, __only the first argument is considered__ and it only works with [primitives](https://developer.mozilla.org/en-US/docs/Glossary/Primitive).

		A `cacheKey` function can return any type supported by `Map` (or whatever structure you use in the `cache` option).

		You can have it cache **all** the arguments by value with `JSON.stringify`, if they are compatible:

		```
		import pMemoize = require('p-memoize');

		pMemoize(function_, {cacheKey: JSON.stringify});
		```

		Or you can use a more full-featured serializer like [serialize-javascript](https://github.com/yahoo/serialize-javascript) to add support for `RegExp`, `Date` and so on.

		```
		import pMemoize = require('p-memoize');
		import serializeJavascript = require('serialize-javascript');

		pMemoize(function_, {cacheKey: serializeJavascript});
		```

		@default arguments_ => arguments_[0]
		@example arguments_ => JSON.stringify(arguments_)
		*/
		readonly cacheKey?: (arguments: ArgumentsType) => CacheKeyType;

		/**
		Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, `.set(key, value)`, `.delete(key)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache.

		@default new Map()
		@example new WeakMap()
		*/
		readonly cache?: CacheStorage<CacheKeyType, {data: ReturnType; maxAge: number}>;
		/**
		Cache rejected promises.

		@default false
		*/
		readonly cachePromiseRejection?: boolean;
	};
}
declare const pMemoize: {
	/**
	[Memoize](https://en.wikipedia.org/wiki/Memoization) promise-returning & async functions.

	@param fn - Promise-returning or async function to be memoized.
	@param options - See the [`p-memoize` options](https://github.com/sindresorhus/p-memoize#options).
	@returns A memoized version of the `input` function.

	@example
	```
	import pMemoize = require('p-memoize');
	import got = require('got');

	const memGot = pMemoize(got, {maxAge: 1000});

	(async () => {
		memGot('https://sindresorhus.com');

		// This call is cached
		memGot('https://sindresorhus.com');

		setTimeout(() => {
			// This call is not cached as the cache has expired
			memGot('https://sindresorhus.com');
		}, 2000);
	})();
	```
	*/
	<ArgumentsType extends any[], ReturnType, CacheKeyType>(
		fn: (...arguments: ArgumentsType) => PromiseLike<ReturnType>,
		options?: pMemoize.Options<ArgumentsType, CacheKeyType, ReturnType>
	): (...arguments: ArgumentsType) => Promise<ReturnType>;

	/**
	Clear all cached data of a memoized function.

	@param memoized - A function that was previously memoized. Will throw if passed a non-memoized function.
	*/
	clear(memoized: (...arguments: any[]) => unknown): void;
};

export = pMemoize;
