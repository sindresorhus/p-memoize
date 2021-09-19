import test from 'ava';
import delay from 'delay';
import pMemoize, {pMemoizeClear} from './index.js';

test('main', async t => {
	let index = 0;
	const memoized = pMemoize(async () => index++);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	t.is(await memoized(10), 1);
});

test('does memoize consecutive calls', async t => {
	let index = 0;
	const memoized = pMemoize(async () => index++);
	const firstCall = memoized();
	const secondCall = memoized();

	await Promise.all([firstCall, secondCall]);

	t.is(await firstCall, 0);
	t.is(await secondCall, 0);
});

test('does not memoize rejected promise', async t => {
	let index = 0;

	const memoized = pMemoize(async () => {
		index++;

		if (index === 2) {
			throw new Error('fixture');
		}

		return index;
	});

	t.is(await memoized(), 1);
	t.is(await memoized(), 1);

	await t.throwsAsync(memoized(10), {message: 'fixture'});
	await t.notThrowsAsync(memoized(10));

	t.is(await memoized(10), 3);
	t.is(await memoized(10), 3);
	t.is(await memoized(100), 4);
});

test('can memoize rejected promise', async t => {
	let index = 0;

	const memoized = pMemoize(async () => {
		index++;

		if (index === 2) {
			throw new Error('fixture');
		}

		return index;
	}, {
		cachePromiseRejection: true,
	});

	t.is(await memoized(), 1);
	t.is(await memoized(), 1);

	await t.throwsAsync(memoized(10), {message: 'fixture'});
	await t.throwsAsync(memoized(10), {message: 'fixture'});

	t.is(await memoized(100), 3);
});

test('preserves the original function name', t => {
	t.is(pMemoize(async function foo() {}).name, 'foo'); // eslint-disable-line func-names
});

test('pMemoizeClear()', async t => {
	let index = 0;
	const fixture = async () => index++;
	const memoized = pMemoize(fixture);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
	pMemoizeClear(memoized);
	t.is(await memoized(), 1);
	t.is(await memoized(), 1);
});

test('always returns async function', async t => {
	let index = 0;
	const fixture = () => index++;
	const memoized = pMemoize(fixture);
	t.is(await memoized(), 0);
	t.is(await memoized(), 0);
});

test('pMemoizeClear() throws when called with a plain function', t => {
	t.throws(() => {
		pMemoizeClear(() => {});
	}, {
		message: 'Cannot clear a function that was not memoized!',
	});
});

test('maxAge starts on promise settlement', async t => {
	let index = 0;
	const fixture = async () => {
		await delay(40);
		return index++;
	};

	const memoized = pMemoize(fixture, {maxAge: 40});
	t.is(await memoized(), 0);
	await delay(20);
	t.is(await memoized(), 0);
	await delay(20);
	t.is(await memoized(), 1);
});
