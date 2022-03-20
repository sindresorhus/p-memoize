# p-memoize

> [Memoize](https://en.wikipedia.org/wiki/Memoization) promise-returning & async functions

Useful for speeding up consecutive function calls by caching the result of calls with identical input.

<!-- Please keep this section in sync with https://github.com/sindresorhus/mem/blob/main/readme.md -->

By default, **only the memoized function's first argument is considered** via strict equality comparison. If you need to cache multiple arguments or cache `object`s *by value*, have a look at alternative [caching strategies](#caching-strategy) below.

This package is similar to [mem](https://github.com/sindresorhus/mem) but with async-specific enhancements; in particular, it allows for asynchronous caches and does not cache rejected promises by default (unless the [`cachePromiseRejection`](#cachePromiseRejection) option is set).

## Install

```
$ npm install p-memoize
```

## Usage

```js
import pMemoize from 'p-memoize';
import got from 'got';

const memoizedGot = pMemoize(got);

await memoizedGot('https://sindresorhus.com');

// This call is cached
await memoizedGot('https://sindresorhus.com');
```

### Caching strategy

Similar to the [caching strategy for `mem`](https://github.com/sindresorhus/mem#options) with the following exceptions:

- Promises returned from a memoized function will be cached internally and take priority over `cache` if a value exists in both caches. The promise cache does not persist outside of the current instance and properties assigned to a returned promise will not be kept. All cached promises can be cleared with [`pMemoizeClear()`](#pmemoizeclearfn).
- `.get()` and `.has()` methods on `cache` can return a promise instead of returning a value immediately.
- Instead of `.set()` being provided an object with the properties `value` and `maxAge`, it will only be provided `value` as the first argument. If you want to implement time-based expiry, consider [doing so in `cache`](#time-based-cache-expiration).

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

##### cacheKey

Type: `Function`\
Default: `arguments_ => arguments_[0]`\
Example: `arguments_ => JSON.stringify(arguments_)`

Determines the cache key for storing the result based on the function arguments. By default, **only the first argument is considered**.

A `cacheKey` function can return any type supported by `Map` (or whatever structure you use in the `cache` option).

See the [caching strategy](#caching-strategy) section for more information.

##### cache

Type: `object`\
Default: `new Map()`

Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, `.set(key, value)`, `.delete(key)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache.

See the [caching strategy](https://github.com/sindresorhus/mem#caching-strategy) section in the `mem` package for more information.

### pMemoizeDecorator(options)

Returns a [decorator](https://github.com/tc39/proposal-decorators) to memoize class methods or static class methods.

Notes:

- Only class methods and getters/setters can be memoized, not regular functions (they aren't part of the proposal);
- Only [TypeScript’s decorators](https://www.typescriptlang.org/docs/handbook/decorators.html#parameter-decorators) are supported, not [Babel’s](https://babeljs.io/docs/en/babel-plugin-proposal-decorators), which use a different version of the proposal;
- Being an experimental feature, they need to be enabled with `--experimentalDecorators`; follow TypeScript’s docs.

#### options

Type: `object`

Same as options for `pMemoize()`.

```ts
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

	@pMemoizeDecorator()
	async counter() {
		return ++this.index;
	}
}
```

### pMemoizeClear(memoized)

Clear all cached data of a memoized function.

It will throw when given a non-memoized function.

## Tips

### Time-based cache expiration

```js
import pMemoize from 'p-memoize';
import ExpiryMap from 'expiry-map';
import got from 'got';

const cache = new ExpiryMap(10000); // Cached values expire after 10 seconds

const memoizedGot = pMemoize(got, {cache});
```

## Related

- [p-debounce](https://github.com/sindresorhus/p-debounce) - Debounce promise-returning & async functions
- [p-throttle](https://github.com/sindresorhus/p-throttle) - Throttle promise-returning & async functions
- [More…](https://github.com/sindresorhus/promise-fun)
