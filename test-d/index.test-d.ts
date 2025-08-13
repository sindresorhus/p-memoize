import {expectType} from 'tsd';
import pMemoize, {pMemoizeClear} from '../index.js';

const fn = async (text: string) => Boolean(text);

expectType<typeof fn>(pMemoize(fn));
expectType<typeof fn>(pMemoize(fn, {cacheKey: ([firstArgument]: [string]) => firstArgument}));
expectType<typeof fn>(pMemoize(fn, {
	// The cacheKey returns an array. This isn't deduplicated by a regular Map, but it's valid. The correct solution would be to use ManyKeysMap to deduplicate it correctly
	cacheKey: (arguments_: [string]) => arguments_,
	cache: new Map<[string], boolean>(),
}));
expectType<typeof fn>(pMemoize(fn, {cache: new Map<string, boolean>()}));
expectType<typeof fn>(pMemoize(fn, {cache: false}));

/* Overloaded function tests */
async function overloadedFn(parameter: false): Promise<false>;
async function overloadedFn(parameter: true): Promise<true>;
async function overloadedFn(parameter: boolean): Promise<boolean> {
	return parameter;
}

expectType<typeof overloadedFn>(pMemoize(overloadedFn));
expectType<true>(await pMemoize(overloadedFn)(true));
expectType<false>(await pMemoize(overloadedFn)(false));

pMemoizeClear(fn);

// `cacheKey` tests.
// The argument should match the memoized function’s parameters
pMemoize(async (text: string) => Boolean(text), {
	cacheKey(arguments_) {
		expectType<[string]>(arguments_);
	},
});

pMemoize(async () => 1, {
	cacheKey(arguments_: []) { // eslint-disable-line @typescript-eslint/no-restricted-types
		expectType<[]>(arguments_); // eslint-disable-line @typescript-eslint/no-restricted-types
	},
});

// Ensures that the various cache functions infer their arguments type from the return type of `cacheKey`
pMemoize(async (_arguments: {key: string}) => 1, {
	cacheKey(arguments_: [{key: string}]) {
		expectType<[{key: string}]>(arguments_);
		return new Date();
	},
	cache: {
		async get(key: Date) {
			expectType<Date>(key);
			return 5;
		},
		set(key: Date, data: number) {
			expectType<Date>(key);
			expectType<number>(data);
		},
		async has(key: Date) {
			expectType<Date>(key);
			return true;
		},
		delete(key: Date) {
			expectType<Date>(key);
		},
		clear: () => undefined,
	},
});
