declare module 'p-memoize' {
  type MemoizeOptions = {
    /**
     * Milliseconds until the cache expires.
     * @default `Infinity`
     */
    maxAge?: number;
 
    /**
     * Determines the cache key for storing the result based on the
     * function arguments. By default, if there's only one argument and
     * it's a primitive, it's used directly as a key, otherwise it's all
     * the function arguments JSON stringified as an array.
     *
     * You could for example change it to only cache on the first argument
     * `x => JSON.stringify(x)`.
     */
    cacheKey?: (...args: any[]) => string;
 
    /**
     * Use a different cache storage.
     * Must implement the following methods:
     * `.has(key)`, `.get(key)`, `.set(key, value)`, `.delete(key)`, and optionally `.clear()`
     * You could for example use a `WeakMap` instead or `quick-lru` for a LRU cache.
     *
     * @default new Map()
     */
    cahce?: Map | WeakMap;
 
    /** Cache rejected promises. */
    cachePromiseRejection?: boolean;
  };
 
  type Memoize = <T extends (...args: any[]) => any>(
    f: T,
    memoizeOptions?: MemOptions,
  ) => T;
 
  const pMemoize: Memoize;
 
  export = pMemoize;
}
