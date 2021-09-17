import test from 'ava';
import delay from 'delay';
import pMemoize from '.';

test('main', async t => {
	let i = 0;
	const memoized = pMemoize(async () => i++);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	t.is(await memoized(10), 1);
});

test('does not memoize rejected promise', async t => {
	let i = 0;

	const memoized = pMemoize(async () => {
		i++;

		if (i === 2) {
			throw new Error('fixture');
		}

		return i;
	});

	t.is(await memoized(), 1);
	t.is(await memoized(), 1);

	await t.throwsAsync(memoized(10), 'fixture');
	await t.notThrowsAsync(memoized(10));

	t.is(await memoized(10), 3);
	t.is(await memoized(10), 3);
	t.is(await memoized(100), 4);
});

test('can memoize rejected promise', async t => {
	let i = 0;

	const memoized = pMemoize(async () => {
		i++;

		if (i === 2) {
			throw new Error('fixture');
		}

		return i;
	}, {
		cachePromiseRejection: true
	});

	t.is(await memoized(), 1);
	t.is(await memoized(), 1);

	await t.throwsAsync(memoized(10), 'fixture');
	await t.throwsAsync(memoized(10), 'fixture');

	t.is(await memoized(100), 3);
});

test('preserves the original function name', t => {
	t.is(pMemoize(async function foo() {}).name, 'foo'); // eslint-disable-line func-names
});

test('pMemoize.clear()', async t => {
	let i = 0;
	const fixture = async () => i++;
	const memoized = pMemoize(fixture);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	pMemoize.clear(memoized);
	t.is(await memoized(), 1);
	t.is(await memoized(), 1);
});

test('always returns async function', async t => {
	let i = 0;
	const fixture = () => i++;
	const memoized = pMemoize(fixture);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
});

test('pMemoize.clear() throws when called with a plain function', t => {
	t.throws(() => {
		pMemoize.clear(() => {});
	}, 'Can\'t clear a function that was not memoized!');
});

test('maxAge starts on promise settlement', async t => {
	let i = 0;
	const fixture = async () => {
		await delay(40);
		return i++;
	};

	const memoized = pMemoize(fixture, {maxAge: 40});
	t.is(await memoized(), 0);
	await delay(20);
	t.is(await memoized(), 0);
	await delay(20);
	t.is(await memoized(), 1);
});
