'use strict';
const mem = require('mem');
const mimicFn = require('mimic-fn');

module.exports = (fn, opts) => {
	const memoized = mem(fn, opts);

	const ret = function () {
		return memoized.apply(this, arguments).catch(err => {
			mem.clear(memoized);
			throw err;
		});
	};
	
        ret.clear = () => mem.clear(memoized);

	mimicFn(ret, fn);

	return ret;
};
