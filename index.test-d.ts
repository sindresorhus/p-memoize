import {expectType} from 'tsd';
import pMemoize = require('.');

const fn = async (string: string) => true;

expectType<typeof fn>(pMemoize(fn));
expectType<typeof fn>(pMemoize(fn, {maxAge: 1}));
expectType<typeof fn>(pMemoize(fn, {cacheKey: (...arguments_) => arguments_}));
expectType<typeof fn>(
	pMemoize(
		fn,
		{cacheKey: (arguments_) => arguments_,
		cache: new Map<[string], {data: boolean; maxAge: number}>()})
);
expectType<typeof fn>(
	pMemoize(fn, {cache: new Map<[string], {data: boolean; maxAge: number}>()})
);

/* Overloaded function tests */
async function overloadedFn(parameter: false): Promise<false>;
async function overloadedFn(parameter: true): Promise<true>;
async function overloadedFn(parameter: boolean): Promise<boolean> {
	return parameter;
}
expectType<typeof overloadedFn>(pMemoize(overloadedFn));
(async () => {
	expectType<true>(await pMemoize(overloadedFn)(true));
	expectType<false>(await pMemoize(overloadedFn)(false));
})();

pMemoize.clear(fn);
