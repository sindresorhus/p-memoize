import mimicFn from 'mimic-fn';
const cacheStore = new WeakMap();
const promiseCacheStore = new WeakMap();
/**
[Memoize](https://en.wikipedia.org/wiki/Memoization) functions - An optimization used to speed up consecutive function calls by caching the result of calls with identical input.

@param fn - Function to be memoized.

@example
```
import pMemoize from 'p-memoize';
import {setTimeout as delay} from 'timer/promises'
import got from 'got';

const memoizedGot = pMemoize(got, {maxAge: 1000});

await memoizedGot('https://sindresorhus.com');

// This call is cached
await memoizedGot('https://sindresorhus.com');

await delay(2000);

// This call is not cached as the cache has expired
await memoizedGot('https://sindresorhus.com');
```
*/
export default function pMemoize(fn, { cachePromiseRejection = false, cacheKey, cache = new Map(), } = {}) {
    const promiseCache = new Map();
    const memoized = async function (...arguments_) {
        const key = cacheKey ? cacheKey(arguments_) : arguments_[0];
        if (promiseCache.has(key)) {
            return promiseCache.get(key); // eslint-disable-line @typescript-eslint/no-unsafe-return
        }
        if (await cache.has(key)) {
            return cache.get(key); // eslint-disable-line @typescript-eslint/no-unsafe-return
        }
        const promise = fn.apply(this, arguments_);
        promiseCache.set(key, promise);
        try {
            const result = await promise;
            cache.set(key, result);
            return result; // eslint-disable-line @typescript-eslint/no-unsafe-return
        }
        catch (error) {
            if (!cachePromiseRejection) {
                promiseCache.delete(key);
            }
            throw error;
        }
    };
    mimicFn(memoized, fn, {
        ignoreNonConfigurable: true,
    });
    cacheStore.set(memoized, cache);
    promiseCacheStore.set(memoized, promiseCache);
    return memoized;
}
/**
@returns A [decorator](https://github.com/tc39/proposal-decorators) to memoize class methods or static class methods.

@example
```
import {pMemoizeDecorator} from 'p-memoize';

class Example {
    index = 0

    @pMemoizeDecorator()
    async counter() {
        return ++this.index;
    }
}

class ExampleWithOptions {
    index = 0

    @pMemoizeDecorator({maxAge: 1000})
    async counter() {
        return ++this.index;
    }
}
```
*/
export function pMemoizeDecorator(options = {}) {
    const instanceMap = new WeakMap();
    return (target, propertyKey, descriptor) => {
        const input = target[propertyKey]; // eslint-disable-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        if (typeof input !== 'function') {
            throw new TypeError('The decorated value must be a function');
        }
        delete descriptor.value;
        delete descriptor.writable;
        descriptor.get = function () {
            if (!instanceMap.has(this)) {
                const value = pMemoize(input, options);
                instanceMap.set(this, value);
                return value;
            }
            return instanceMap.get(this);
        };
    };
}
/**
Clear all cached data of a memoized function.

@param fn - Memoized function.
*/
export function pMemoizeClear(fn) {
    const cache = cacheStore.get(fn);
    if (!cache) {
        throw new TypeError('Can\'t clear a function that was not memoized!');
    }
    if (typeof cache.clear !== 'function') {
        throw new TypeError('The cache Map can\'t be cleared!');
    }
    cache.clear();
    promiseCacheStore.get(fn).clear();
}
