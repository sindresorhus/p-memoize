'use strict';
const mem = require('mem');
const mimicFn = require('mimic-fn');

module.exports = (fn, opts) => {
	const memoized = mem(fn, opts);

	const ret = function (...args) {
		return memoized.apply(this, args).catch(err => {
			mem.clear(memoized);
			throw err;
		});
	};

	mimicFn(ret, fn);

	return ret;
};
