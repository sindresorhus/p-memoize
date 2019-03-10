declare const pMemoize: {
	/**
	 * [Memoize](https://en.wikipedia.org/wiki/Memoization) promise-returning & async functions.
	 *
	 * @param input - Promise-returning or async function to be memoized.
	 * @param memoizeOptions - See the [`mem` options](https://github.com/sindresorhus/mem#options).
	 * @returns A memoized version of the `input` function.
	 */
	<ArgumentsType extends unknown[], ReturnType>(
		input: (...args: ArgumentsType) => PromiseLike<ReturnType>,
		memoizeOptions?: any // TODO replace this with mem.Options and re-export the type
	): (...args: ArgumentsType) => Promise<ReturnType>;

	/**
	 * Clear all cached data of a memoized function.
	 *
	 * @param memoized - A function that was previously memoized. Will throw if passed a non-memoized function.
	 */
	clear(memoized: (...args: unknown[]) => unknown): void;
};

export default pMemoize;
