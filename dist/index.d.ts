import type { AsyncReturnType } from 'type-fest';
declare type AnyAsyncFunction = (...arguments_: any) => Promise<any>;
interface CacheStorage<KeyType, ValueType> {
    has: (key: KeyType) => Promise<boolean> | boolean;
    get: (key: KeyType) => Promise<ValueType | undefined> | ValueType | undefined;
    set: (key: KeyType, value: ValueType) => void;
    delete: (key: KeyType) => void;
    clear?: () => void;
}
interface Options<FunctionToMemoize extends AnyAsyncFunction, CacheKeyType> {
    /**
    Cache rejected promises.

    @default false
    */
    readonly cachePromiseRejection?: boolean;
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
    import mem from 'mem';

    mem(function_, {cacheKey: JSON.stringify});
    ```

    Or you can use a more full-featured serializer like [serialize-javascript](https://github.com/yahoo/serialize-javascript) to add support for `RegExp`, `Date` and so on.

    ```
    import mem from 'mem';
    import serializeJavascript from 'serialize-javascript';

    mem(function_, {cacheKey: serializeJavascript});
    ```

    @default arguments_ => arguments_[0]
    @example arguments_ => JSON.stringify(arguments_)
    */
    readonly cacheKey?: (arguments_: Parameters<FunctionToMemoize>) => CacheKeyType;
    /**
    Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, `.set(key, value)`, `.delete(key)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache.

    @default new Map()
    @example new WeakMap()
    */
    readonly cache?: CacheStorage<CacheKeyType, AsyncReturnType<FunctionToMemoize>>;
}
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
export default function pMemoize<FunctionToMemoize extends AnyAsyncFunction, CacheKeyType>(fn: FunctionToMemoize, { cachePromiseRejection, cacheKey, cache, }?: Options<FunctionToMemoize, CacheKeyType>): FunctionToMemoize;
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
export declare function pMemoizeDecorator<FunctionToMemoize extends AnyAsyncFunction, CacheKeyType>(options?: Options<FunctionToMemoize, CacheKeyType>): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
/**
Clear all cached data of a memoized function.

@param fn - Memoized function.
*/
export declare function pMemoizeClear(fn: AnyAsyncFunction): void;
export {};
