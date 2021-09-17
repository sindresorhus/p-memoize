'use strict';
const mimicFn = require('mimic-fn');
const mapAgeCleaner = require('map-age-cleaner');

const cacheStore = new WeakMap();

const pMemoize = (fn, {cachePromiseRejection = false, ...options} = {}) => {
	const {maxAge, cacheKey} = options;
	const cache = options.cache || new Map();

	if (Number.isSafeInteger(maxAge)) {
		mapAgeCleaner(cache);
	} else if (typeof maxAge !== 'undefined') {
		throw new TypeError('maxAge is not a safe integer.');
	}

	const memoized = async function (...arguments_) {
		const key = cacheKey ? cacheKey(arguments_) : arguments_[0];

		const cacheItem = cache.get(key);
		if (cacheItem) {
			return cacheItem.data;
		}

		const result = fn.apply(this, arguments_);

		let resultError;
		try {
			return await Promise.resolve(result);
		} catch (error) {
			resultError = error;
			throw error;
		} finally {
			cache.set(key, {
				data: result,
				maxAge: maxAge ? Date.now() + maxAge : Number.POSITIVE_INFINITY
			});

			if (!cachePromiseRejection && resultError) {
				cache.delete(key);
			}
		}
	};

	mimicFn(memoized, fn);
	cacheStore.set(memoized, cache);

	return memoized;
};

module.exports = pMemoize;

module.exports.clear = memoized => {
	if (!cacheStore.has(memoized)) {
		throw new Error('Can\'t clear a function that was not memoized!');
	}

	const cache = cacheStore.get(memoized);

	if (typeof cache.clear !== 'function') {
		throw new TypeError('The cache Map can\'t be cleared!');
	}

	cache.clear();
};
