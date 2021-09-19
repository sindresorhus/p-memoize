import mimicFunction from 'mimic-fn';
import mapAgeCleaner from 'map-age-cleaner';

const cacheStore = new WeakMap();

export default function pMemoize(fn, {
	cachePromiseRejection = false,
	maxAge,
	cacheKey,
	cache = new Map(),
} = {}) {
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

		const promise = fn.apply(this, arguments_);
		cache.set(key, {
			data: promise,
			// We cannot use `Infinity` because of https://github.com/SamVerschueren/map-age-cleaner/issues/8
			maxAge: 2_147_483_647, // This is the largest number `setTimeout` can handle.
		});

		const [{reason}] = await Promise.allSettled([promise]);
		if (!cachePromiseRejection && reason) {
			cache.delete(key);
		} else if (maxAge) {
			// Promise fulfilled, so start the timer
			cache.set(key, {
				data: promise,
				maxAge: Date.now() + maxAge,
			});
		}

		return promise;
	};

	mimicFunction(memoized, fn);
	cacheStore.set(memoized, cache);

	return memoized;
}

export function pMemoizeClear(memoized) {
	if (!cacheStore.has(memoized)) {
		throw new Error('Cannot clear a function that was not memoized!');
	}

	const cache = cacheStore.get(memoized);

	if (typeof cache.clear !== 'function') {
		throw new TypeError('The cache Map can\'t be cleared!');
	}

	cache.clear();
}
