import test from 'ava';
import m from './';

test('main', async t => {
	let i = 0;
	const memoized = m(async () => i++);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	t.is(await memoized(10), 1);
});

test('does not memoize rejected promise', async t => {
	let i = 0;

	const memoized = m(async () => {
		i++;

		if (i === 2) {
			throw new Error('fixture');
		}

		return i;
	});

	t.is(await memoized(), 1);
	t.is(await memoized(), 1);

	await t.throws(memoized(10), 'fixture');
	await t.notThrows(memoized(10));

	t.is(await memoized(10), 3);
	t.is(await memoized(10), 3);
	t.is(await memoized(100), 4);
});

test('preserves the original function name', t => {
	t.is(m(async function foo() {}).name, 'foo'); // eslint-disable-line func-names, prefer-arrow-callback
});
