'use strict';

const mem = require('mem');
const mimicFn = require('mimic-fn');

const memoizedFunctions = new WeakMap();

const pMemoize = (fn, options) => {
	const memoized = mem(fn, options);

	const memoizedAdapter = function (...args) {
		return memoized.apply(this, args);
	};

	mimicFn(memoizedAdapter, fn);
	memoizedFunctions.set(memoizedAdapter, memoized);

	return memoizedAdapter;
};

module.exports = pMemoize;
module.exports.default = pMemoize;

module.exports.clear = memoized => {
	if (!memoizedFunctions.has(memoized)) {
		throw new Error('Can\'t clear a function that was not memoized!');
	}

	mem.clear(memoizedFunctions.get(memoized));
};
