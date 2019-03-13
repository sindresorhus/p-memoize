import {expectType} from 'tsd-check';
import pMemoize from '.';

expectType<(name: string) => Promise<string>>(
	pMemoize(async (name: string) => `Hello ${name}!`)
);
expectType<() => Promise<number>>(pMemoize(async () => 1));

pMemoize(async () => 1, {maxAge: 1});

const memoized = pMemoize(async () => 1);
pMemoize.clear(memoized);
