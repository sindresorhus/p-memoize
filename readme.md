# p-memoize

> [Memoize](https://en.wikipedia.org/wiki/Memoization) promise-returning & async functions

Useful for speeding up consecutive function calls by caching the result of calls with identical input.

<!-- Please keep this section in sync with https://github.com/sindresorhus/memoize/blob/main/readme.md -->

By default, **only the memoized function's first argument is considered** via strict equality comparison. If you need to cache multiple arguments or cache `object`s *by value*, have a look at alternative [caching strategies](#caching-strategy) below.

This package is similar to [memoize](https://github.com/sindresorhus/memoize) but with async-specific enhancements; in particular, it allows for asynchronous caches and does not cache rejected promises.

## Install

```sh
npm install p-memoize
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

Similar to the [caching strategy for `memoize`](https://github.com/sindresorhus/memoize#options) with the following exceptions:

- Promises returned from a memoized function are locally cached until resolving, when their value is added to `cache`. Special properties assigned to a returned promise will not be kept after resolution and every promise may need to resolve with a serializable object if caching results in a database.
- `.get()`, `.has()` and `.set()` methods on `cache` can run asynchronously by returning a promise.
- Instead of `.set()` being provided an object with the properties `value` and `maxAge`, it will only be provided `value` as the first argument. If you want to implement time-based expiry, consider [doing so in `cache`](#time-based-cache-expiration).

## API

### pMemoize(fn, options?)

Returns a memoized version of the given function.

#### fn

Type: `Function`

Promise-returning or async function to be memoized.

#### options

Type: `object`

##### cacheKey

Type: `Function`\
Default: `arguments_ => arguments_[0]`\
Example: `arguments_ => JSON.stringify(arguments_)`

Determines the cache key for storing the result based on the function arguments. By default, **only the first argument is considered**.

A `cacheKey` function can return any type supported by `Map` (or whatever structure you use in the `cache` option).

See the [caching strategy](#caching-strategy) section for more information.

##### cache

Type: `object | false`\
Default: `new Map()`

Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, `.set(key, value)`, `.delete(key)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache. To disable caching so that only concurrent executions resolve with the same value, pass `false`.

See the [caching strategy](https://github.com/sindresorhus/mem#caching-strategy) section in the `mem` package for more information.

##### shouldCache

Type: `(value, {key, argumentsList}) => boolean | Promise<boolean>`

Controls whether a fulfilled value should be written to the cache.

It runs after the function fulfills and before `cache.set`.

- Omit to keep current behavior (always write).
- Return `false` to skip writing to the cache (in-flight de-duplication is still cleared).
- Throw or reject to propagate the error and skip caching.

```js
import pMemoize from 'p-memoize';

// Only cache defined values
const getMaybe = pMemoize(async key => db.get(key), {
	shouldCache: value => value !== undefined,
});

// Only cache non-empty arrays
const search = pMemoize(async query => fetchResults(query), {
	shouldCache: value => Array.isArray(value) && value.length > 0,
});
```

Note: Affects only writes; reads from the cache are unchanged.

### pMemoizeDecorator(options)

Returns a decorator to memoize class methods (instance and static).

Notes:

- Only class methods are supported; regular functions are not part of the decorators proposals.
- Requires the new ECMAScript decorators (TypeScript 5.0+). Legacy `experimentalDecorators` are not supported.
- Babel’s legacy decorators are not supported as they implement a different proposal variant.
- Private methods are not supported.

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

The decorator memoizes per-instance. You can clear the cache for an instance method using `pMemoizeClear(instance.method)`.

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

### Caching promise rejections

```js
import pMemoize from 'p-memoize';
import pReflect from 'p-reflect';

const memoizedGot = pMemoize(async (url, options) => pReflect(got(url, options)));

await memoizedGot('https://example.com');
// {isFulfilled: true, isRejected: false, value: '...'}
```

## Related

- [p-debounce](https://github.com/sindresorhus/p-debounce) - Debounce promise-returning & async functions
- [p-throttle](https://github.com/sindresorhus/p-throttle) - Throttle promise-returning & async functions
- [More…](https://github.com/sindresorhus/promise-fun)
