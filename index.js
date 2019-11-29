'use strict';
const mimicFn = require('mimic-fn');
const mapAgeCleaner = require('map-age-cleaner');

const cacheStore = new WeakMap();

const pMemoize = (fn, {
	cacheKey = ([firstArgument]) => firstArgument,
	cache = new Map(),
	maxAge
} = {}) => {
	if (typeof maxAge === 'number') {
		mapAgeCleaner(cache);
	}

	const memoized = async function (...arguments_) {
		const key = cacheKey(arguments_);

		if (await cache.has(key)) {
			return (await cache.get(key)).data;
		}

		const cacheItem = await fn.apply(this, arguments_);

		await cache.set(key, {
			data: cacheItem,
			maxAge: maxAge ? Date.now() + maxAge : Infinity
		});

		return cacheItem;
	};

	try {
		// The below call will throw in some host environments
		// See https://github.com/sindresorhus/mimic-fn/issues/10
		mimicFn(memoized, fn);
	} catch (_) {}

	cacheStore.set(memoized, cache);

	return memoized;
};

module.exports = pMemoize;

module.exports.clear = async fn => {
	if (!cacheStore.has(fn)) {
		throw new Error('Can\'t clear a function that was not memoized!');
	}

	const cache = cacheStore.get(fn);
	if (typeof cache.clear === 'function') {
		await cache.clear();
	}
};
