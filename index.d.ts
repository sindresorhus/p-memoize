import {Options} from 'mem';

declare const pMemoize: {
	/**
	 * [Memoize](https://en.wikipedia.org/wiki/Memoization) promise-returning & async functions.
	 *
	 * @param fn - Promise-returning or async function to be memoized.
	 * @param memoizeOptions - See the [`mem` options](https://github.com/sindresorhus/mem#options).
	 * @returns A memoized version of the `input` function.
	 */
	<ArgumentsType extends unknown[], ReturnType, CacheKeyType = unknown>(
		fn: (...arguments: ArgumentsType) => PromiseLike<ReturnType>,
		memoizeOptions?: Options<ArgumentsType, CacheKeyType, ReturnType>
	): (...arguments: ArgumentsType) => Promise<ReturnType>;

	/**
	 * Clear all cached data of a memoized function.
	 *
	 * @param memoized - A function that was previously memoized. Will throw if passed a non-memoized function.
	 */
	clear(memoized: (...arguments: unknown[]) => unknown): void;
};

export default pMemoize;

export {Options} from 'mem';
