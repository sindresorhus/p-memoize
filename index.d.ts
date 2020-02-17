import {Options as MemOptions} from 'mem';

declare namespace pMemoize {
	type Options<
		ArgumentsType extends unknown[],
		CacheKeyType,
		ReturnType
	> = MemOptions<ArgumentsType, CacheKeyType, ReturnType> & {
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
		memGot('sindresorhus.com');

		// This call is cached
		memGot('sindresorhus.com');

		setTimeout(() => {
			// This call is not cached as the cache has expired
			memGot('sindresorhus.com');
		}, 2000);
	})();
	```
	*/
	<ArgumentsType extends unknown[], ReturnType, CacheKeyType>(
		fn: (...arguments: ArgumentsType) => PromiseLike<ReturnType>,
		options?: pMemoize.Options<ArgumentsType, CacheKeyType, ReturnType>
	): (...arguments: ArgumentsType) => Promise<ReturnType>;

	/**
	Clear all cached data of a memoized function.

	@param memoized - A function that was previously memoized. Will throw if passed a non-memoized function.
	*/
	clear(memoized: (...arguments: unknown[]) => unknown): void;
};

export = pMemoize;
