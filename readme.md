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
- Whatever the function resolves to is cached as it is, so a one-shot value (an async generator, a `Readable`) is handed to every later caller already consumed.
- Concurrent calls with the same key share one execution, so neither the function nor its `shouldCache` predicate may await a nested call for that same key. The nested call joins the one already running, which is waiting on it, and neither ever settles.
- `.get()`, `.has()` and `.set()` methods on `cache` can run asynchronously by returning a promise.
- Instead of `.set()` being provided an object with the properties `value` and `maxAge`, it will only be provided `value` as the first argument. If you want to implement time-based expiry, consider [doing so in `cache`](#time-based-cache-expiration).

## API

### pMemoize(fn, options?)

Returns a memoized version of the given function.

For an overloaded function, the option types come from one of its overloads, because `ReturnType` resolves a type with several call signatures to a single one. Pass both type arguments to `pMemoize` when that matters.

#### fn

Type: `Function`

Promise-returning or async function to be memoized.

#### options

Type: `object`

##### cacheKey

Type: `Function`\
Default: `arguments_ => arguments_[0]`\
Example: `arguments_ => JSON.stringify(arguments_)`

Determines the cache key for storing the result based on the function arguments. By default, **only the first argument is considered** and it is compared by strict equality, so two objects only share an entry when they are the same one.

A `cacheKey` function can return any type supported by `Map` (or whatever structure you use in the `cache` option).

- A call with no arguments has an undefined first argument, so it shares an entry with a call passing `undefined` explicitly. Pass a `cacheKey` that also looks at the argument count to tell them apart.
- A `cacheKey` that returns a promise is rejected by the type: a promise is a fresh object on every call, so every key would be unique and nothing would ever be memoized.
- The receiver (`this`) is not part of the key, and `cacheKey` cannot see it. See [the receiver is not part of the cache key](#the-receiver-is-not-part-of-the-cache-key).

See the [caching strategy](#caching-strategy) section for more information.

##### cache

Type: `object | false`\
Default: `new Map()`

Use a different cache storage. Must implement the following methods: `.has(key)`, `.get(key)`, and `.set(key, value)`, and optionally `.clear()`. You could for example use a `WeakMap` instead or [`quick-lru`](https://github.com/sindresorhus/quick-lru) for a LRU cache. To disable caching so that only concurrent executions resolve with the same value, pass `false`.

- `.has()` decides whether there is a hit, and `.get()` is only called on a hit, to supply the value. If the two disagree, for example because the entry is evicted in between, the call resolves to `undefined` without running the function.
- Its key type must be the one `cacheKey` produces, which by default is the first argument's type. TypeScript cannot always check this, so a cache keyed by something else may only fail at runtime, depending on the cache.
- A cache with no `.clear()` cannot be emptied by [`pMemoizeClear()`](#pmemoizeclearmemoized), and a `WeakMap` has none.

See the [caching strategy](https://github.com/sindresorhus/mem#caching-strategy) section in the `mem` package for more information.

##### shouldCache

Type: `(value, {key, argumentsList}) => boolean | Promise<boolean>`

Controls whether a fulfilled value should be written to the cache.

It runs after the function fulfills and before `cache.set`.

- Omit to keep current behavior (always write).
- Return `false` to skip writing to the cache (in-flight de-duplication is still cleared).
- Throw or reject to propagate the error and skip caching. The predicate does not run at all when caching is disabled with `cache: false`.

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

#### The receiver is not part of the cache key

> [!WARNING]
> A method memoized on a prototype shares one cache between every instance, so it returns whichever instance's result was cached first.

The cache key is derived from the arguments only. The receiver (`this`) never reaches `cacheKey`, so there is no way to include it:

```js
class Repository {
	name = '';
	async lookup(key) {
		return `${this.name}:${key}`;
	}
}

// `beta.lookup('k')` returns the value cached by `alpha.lookup('k')`.
Repository.prototype.lookup = pMemoize(Repository.prototype.lookup);
```

The same applies to `pMemoizeDecorator()` when you pass a `cache` of your own, since the same cache instance is handed to every instance. A method that depends on the instance needs a per-instance cache, which is what `pMemoizeDecorator()` gives you when you do not pass one:

```js
class Repository {
	name = '';

	// Each instance gets its own cache.
	@pMemoizeDecorator()
	async lookup(key) {
		return `${this.name}:${key}`;
	}
}
```

### pMemoizeDecorator(options)

Returns a decorator to memoize class methods (instance and static).

Notes:

- Only class methods are supported; regular functions are not part of the decorators proposals.
- Requires the new ECMAScript decorators (TypeScript 5.0+). Legacy `experimentalDecorators` are not supported.
- Babel’s legacy decorators are not supported as they implement a different proposal variant.
- Private methods are not supported.
- Put `@pMemoizeDecorator()` first (topmost) when you combine it with other method decorators. Decorators are applied from the bottom up, so a decorator listed above it replaces the method after it, and the memoized copy is then skipped so that it does not hide that replacement. This happens silently.
- A subclass that overrides the method is not memoized for it, and a `super.method()` call from the override reaches the original, unmemoized method.

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

	// Only cache positive results.
	@pMemoizeDecorator({shouldCache: value => value > 0})
	async counter() {
		return ++this.index;
	}
}
```

The decorator memoizes per-instance for an instance method, and per-class for a static one. With no `cache` of your own, you can clear an instance method's cache using `pMemoizeClear(instance.method)`. With one, the cache is shared, so that call empties it for every instance of the class.

### pMemoizeClear(memoized)

Clear all cached data of a memoized function.

What the clear reaches depends on what it is clearing:

- The cache is emptied for every memoized function sharing it, and a call still running on any of them will not write its result back into it.
- Only the in-flight calls of the function you called it on are dropped, so a later call on it starts fresh rather than joining one that began before the clear. Another memoized function over the same cache keeps sharing its own in-flight calls until they settle.

A `cache.set()` that has already started when you clear is not undone, so that value can still land in the cleared cache.

This function is synchronous: a `clear()` that returns a promise finishes after it returns, and a rejection from it is dropped rather than reported, since there is nothing to return it through. A `clear()` that throws synchronously still propagates to the caller.

It throws when given something that was not memoized, when the memoized function has caching disabled, or when its cache cannot be cleared.

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
