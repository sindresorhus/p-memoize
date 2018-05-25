'use strict';
const mem = require('mem');
const mimicFn = require('mimic-fn');

const memoizedFns = new WeakMap();

module.exports = (fn, opts) => {
	const memoized = mem(fn, opts);

	const ret = function (...args) {
		return memoized.apply(this, args);
	};

	mimicFn(ret, fn);
	memoizedFns.set(ret, memoized);

	return ret;
};

module.exports.clear = fn => {
	mem.clear(memoizedFns.get(fn));
};
