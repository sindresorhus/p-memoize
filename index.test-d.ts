import {expectType} from 'tsd';
import pMemoize, {pMemoizeClear} from './index.js';

expectType<(name: string) => Promise<string>>(
	pMemoize(async (name: string) => `Hello ${name}!`),
);
expectType<() => Promise<number>>(pMemoize(async () => 1));

pMemoize(async () => 1, {maxAge: 1, cachePromiseRejection: true});

const memoized = pMemoize(async () => 1);
pMemoizeClear(memoized);
