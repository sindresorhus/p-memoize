# p-memoize [![Build Status](https://travis-ci.org/sindresorhus/p-memoize.svg?branch=master)](https://travis-ci.org/sindresorhus/p-memoize)

> [Memoize](https://en.wikipedia.org/wiki/Memoization) promise-returning & async functions

Useful for speeding up consecutive function calls by caching the result of calls with identical input.


## Install

```
$ npm install --save p-memoize
```


## Usage

```js
const pMemoize = require('p-memoize');
const got = require('got');
const memGot = pMemoize(got, {maxAge: 1000});

memGot('sindresorhus.com').then(() => {
	// this call is cached
	memGot('sindresorhus.com').then(() => {
		setTimeout(() => {
			// this call is not cached as the cache has expired
			memGot('sindresorhus.com').then(() => {});
		}, 2000);
	});
});
```


## API

See the [`mem` docs](https://github.com/sindresorhus/mem#api).

The only difference is that this module does not cache rejected promises.


## Related

- [p-debounce](https://github.com/sindresorhus/p-debounce) - Debounce promise-returning & async functions
- [p-throttle](https://github.com/sindresorhus/p-throttle) - Throttle promise-returning & async functions
- [More…](https://github.com/sindresorhus/promise-fun)


## License

MIT © [Sindre Sorhus](https://sindresorhus.com)
