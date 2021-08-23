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
const pMemoize = require('p-memoize');
const got = require('got');

const memGot = pMemoize(got, {maxAge: 1000});

(async () => {
	memGot('https://sindresorhus.com');

	// This call is cached
	memGot('https://sindresorhus.com');

	setTimeout(() => {
		// This call is not cached as the cache has expired
		memGot('https://sindresorhus.com');
	}, 2000);
})();
```

### Caching strategy

See the [Caching strategy for `mem`](https://github.com/sindresorhus/mem#options).

## API

### pMemoize(fn, options?)

Returns a memoized version of the `fn` function.

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

### pMemoize.clear(memoized)

Clear all cached data of a memoized function.

Will throw if passed a non-memoized function.

## Related

- [p-debounce](https://github.com/sindresorhus/p-debounce) - Debounce promise-returning & async functions
- [p-throttle](https://github.com/sindresorhus/p-throttle) - Throttle promise-returning & async functions
- [More…](https://github.com/sindresorhus/promise-fun)
