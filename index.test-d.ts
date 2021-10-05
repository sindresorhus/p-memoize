import {expectType} from 'tsd';
import pMemoize, {CacheItem, pMemoizeClear} from './index.js';

expectType<(name: string) => Promise<string>>(
	pMemoize(async (name: string) => `Hello ${name}!`),
);
expectType<() => Promise<number>>(pMemoize(async () => 1));

expectType<() => Promise<number>>(pMemoize(async () => 1, {
	cache: new Map<string, CacheItem<number>>()
}));

pMemoize(async () => 1, {maxAge: 1, cachePromiseRejection: true});

const memoized = pMemoize(async () => 1);
pMemoizeClear(memoized);
