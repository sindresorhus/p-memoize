'use strict';
const mem = require('mem');
const mimicFn = require('mimic-fn');

const memoizedFunctions = new WeakMap();

const pMemoize = (fn, {cachePromiseRejection = false, ...options} = {}) => {
	const cache = options.cache || new Map();
	const cacheKey = options.cacheKey || (([firstArgument]) => firstArgument);

	const memoized = mem(fn, {
		...options,
		cache,
		cacheKey
	});

	const memoizedAdapter = function (...arguments_) {
		const cacheItem = memoized.apply(this, arguments_);

		if (!cachePromiseRejection && cacheItem && cacheItem.catch) {
			cacheItem.catch(() => {
				cache.delete(cacheKey(arguments_));
			});
		}

		return cacheItem;
	};

	mimicFn(memoizedAdapter, fn);
	memoizedFunctions.set(memoizedAdapter, memoized);

	return memoizedAdapter;
};

module.exports = pMemoize;

module.exports.clear = memoized => {
	if (!memoizedFunctions.has(memoized)) {
		throw new Error('Can\'t clear a function that was not memoized!');
	}

	mem.clear(memoizedFunctions.get(memoized));
};
