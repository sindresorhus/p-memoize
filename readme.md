# p-memoize

> [Memoize](https://en.wikipedia.org/wiki/Memoization) promise-returning & async functions

Useful for speeding up consecutive function calls by caching the result of calls with identical input.

<!-- Please keep this section in sync with https://github.com/sindresorhus/mem/blob/main/readme.md -->

By default, **only the memoized function's first argument is considered** via strict equality comparison. If you need to cache multiple arguments or cache `object`s *by value*, have a look at alternative [caching strategies](#caching-strategy) below.

This package is similar to [mem](https://github.com/sindresorhus/mem) but with async-specific enhancements; in particular, it does not cache rejected promises by default (unless the [`cachePromiseRejection`](#cachePromiseRejection) option is set).

## Install

```
$ npm install p-memoize
```

## Usage

```js
import pMemoize from 'p-memoize';
import got from 'got';

const memoizedGot = pMemoize(got, {maxAge: 1000});

memoizedGot('https://sindresorhus.com');

// This call is cached
memoizedGot('https://sindresorhus.com');

setTimeout(() => {
	// This call is not cached as the cache has expired
	memoizedGot('https://sindresorhus.com');
}, 2000);
```

### Caching strategy

See the [Caching strategy for `mem`](https://github.com/sindresorhus/mem#options).

## API

### pMemoize(fn, options?)

Returns a memoized version of the given function.

#### fn

Type: `Function`

Promise-returning or async function to be memoized.

#### options

Type: `object`

See the [`mem` options](https://github.com/sindresorhus/mem#options) in addition to the below option.

##### cachePromiseRejection

Type: `boolean`\
Default: `false`

Cache rejected promises.

##### maxAge

Type: `number`\
Default: `Infinity`

The milliseconds until the cache expires.

##### cacheKey

Type: `Function`\
Default: `arguments_ => arguments_[0]`\
Example: `arguments_ => JSON.stringify(arguments_)`

Determines the cache key for storing the result based on the function arguments. By default, **only the first argument is considered**.

A `cacheKey` function can return any type supported by `Map` (or whatever structure you use in the `cache` option).

See the [caching strategy](https://github.com/sindresorhus/mem#caching-strategy) section in the `mem` package for more information.

##### cache

Type: `object`\
Default: `new Map()`

Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, `.set(key, value)`, `.delete(key)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache.

See the [caching strategy](https://github.com/sindresorhus/mem#caching-strategy) section in the `mem` package for more information.

### pMemoizeClear(memoized)

Clear all cached data of a memoized function.

It will throw when given a non-memoized function.

## Related

- [p-debounce](https://github.com/sindresorhus/p-debounce) - Debounce promise-returning & async functions
- [p-throttle](https://github.com/sindresorhus/p-throttle) - Throttle promise-returning & async functions
- [More…](https://github.com/sindresorhus/promise-fun)
