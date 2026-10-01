import {expectTypeOf} from 'nz';
import pMemoize, {pMemoizeClear, pMemoizeDecorator} from '../index.js';

// eslint-disable-next-line unicorn/consistent-boolean-name -- the fixture returns a boolean by design.
const fn = async (text: string) => Boolean(text);

expectTypeOf(pMemoize(fn)).toBe<typeof fn>();
expectTypeOf(pMemoize(fn, {cacheKey: ([firstArgument]: [string]) => firstArgument})).toBe<typeof fn>();
expectTypeOf(pMemoize(fn, {
	// The cacheKey returns an array. This isn't deduplicated by a regular Map, but it's valid. The correct solution would be to use ManyKeysMap to deduplicate it correctly
	cacheKey: (arguments_: [string]) => arguments_,
	cache: new Map<[string], boolean>(),
})).toBe<typeof fn>();
expectTypeOf(pMemoize(fn, {cache: new Map<string, boolean>()})).toBe<typeof fn>();
expectTypeOf(pMemoize(fn, {cache: false})).toBe<typeof fn>();

/*
Overloaded function tests
*/
// eslint-disable-next-line unicorn/consistent-boolean-name -- the parameter names document the overloads.
async function overloadedFn(parameter: false): Promise<false>;
// eslint-disable-next-line unicorn/consistent-boolean-name -- the parameter names document the overloads.
async function overloadedFn(parameter: true): Promise<true>;
// eslint-disable-next-line unicorn/consistent-boolean-name -- the parameter names document the overloads.
async function overloadedFn(parameter: boolean): Promise<boolean> {
	return parameter;
}

expectTypeOf(pMemoize(overloadedFn)).toBe<typeof overloadedFn>();
expectTypeOf(await pMemoize(overloadedFn)(true)).toBe<true>();
expectTypeOf(await pMemoize(overloadedFn)(false)).toBe<false>();

pMemoizeClear(fn);

// `cacheKey` tests.
// The argument should match the memoized function’s parameters
pMemoize(async (text: string) => Boolean(text), {
	cacheKey(arguments_) {
		expectTypeOf(arguments_).toBe<[string]>();
	},
});

pMemoize(async () => 1, {
	cacheKey(arguments_: []) { // eslint-disable-line @typescript-eslint/no-restricted-types
		expectTypeOf(arguments_).toBe<[]>(); // eslint-disable-line @typescript-eslint/no-restricted-types
	},
});

// `shouldCache` tests.
pMemoize(async (text: string) => Boolean(text), {
	shouldCache(value, context) {
		expectTypeOf(value).toBe<boolean>();
		expectTypeOf(context.argumentsList).toBe<[string]>();
		expectTypeOf(context.key).toBe<string>();
		return true;
	},
});

pMemoize(async (_input: {key: string}) => 5 as const, {
	cacheKey(_arguments: [{key: string}]): Date {
		return new Date();
	},
	async shouldCache(value, context) {
		expectTypeOf(value).toBe<5>();
		expectTypeOf(context.argumentsList).toBe<[
			{
				key: string;
			},
		]>();
		expectTypeOf(context.key).toBe<Date>();
		return true;
	},
});

// Ensures that the various cache functions infer their arguments type from the return type of `cacheKey`
pMemoize(async (_arguments: {key: string}) => 1, {
	cacheKey(arguments_: [{key: string}]) {
		expectTypeOf(arguments_).toBe<[{key: string}]>();
		return new Date();
	},
	cache: {
		async get(key: Date) {
			expectTypeOf(key).toBe<Date>();
			return 5;
		},
		set(key: Date, data: number) {
			expectTypeOf(key).toBe<Date>();
			expectTypeOf(data).toBe<number>();
		},
		async has(key: Date) {
			expectTypeOf(key).toBe<Date>();
			return true;
		},
		delete(key: Date) {
			expectTypeOf(key).toBe<Date>();
		},
		clear: () => undefined,
	},
});

// `pMemoizeDecorator` tests
class ExampleClass {
	@pMemoizeDecorator()
	async method(text: string): Promise<boolean> {
		return Boolean(text);
	}

	@pMemoizeDecorator({
		cacheKey: ([firstArgument]) => String(firstArgument),
	})
	async methodWithOptions(value: number): Promise<string> {
		return String(value);
	}
}

const instance = new ExampleClass();
expectTypeOf(instance.method('test')).toBe<Promise<boolean>>();
expectTypeOf(instance.methodWithOptions(42)).toBe<Promise<string>>();

// Test for issue #56: Ensure inline cache objects properly infer key types from function parameters
pMemoize(async (url: string): Promise<string> => `fetched: ${url}`, {
	cache: {
		async get(key: string): Promise<string | undefined> {
			expectTypeOf(key).toBe<string>(); // Should be string, not unknown
			return undefined;
		},
		async set(key: string, value: string): Promise<void> {
			expectTypeOf(key).toBe<string>(); // Should be string, not unknown
			expectTypeOf(value).toBe<string>();
		},
		async has(key: string): Promise<boolean> {
			expectTypeOf(key).toBe<string>(); // Should be string, not unknown
			return false;
		},
		async delete(key: string): Promise<void> {
			expectTypeOf(key).toBe<string>(); // Should be string, not unknown
		},
	},
});

// A cache must not have to implement `delete()`, since p-memoize never calls it.
pMemoize(async (url: string): Promise<string> => `fetched: ${url}`, {
	cache: {
		async get(key: string): Promise<string | undefined> {
			expectTypeOf(key).toBe<string>();
			return undefined;
		},
		async set(key: string, value: string): Promise<void> {
			expectTypeOf(key).toBe<string>();
			expectTypeOf(value).toBe<string>();
		},
		async has(key: string): Promise<boolean> {
			expectTypeOf(key).toBe<string>();
			return false;
		},
	},
});

// The decorator factory runs before the method it decorates exists, so the method's type can never flow into the options. They must therefore not be typed so tightly that a valid option is rejected on `unknown`. This is the example from the readme.
class DecoratorOptionExample {
	index = 0;

	@pMemoizeDecorator({shouldCache: value => value > 0})
	async counter() {
		return ++this.index;
	}
}

expectTypeOf(new DecoratorOptionExample().counter()).toBe<Promise<number>>();

// An `async` `cacheKey` returns a fresh promise on every call, so every key is unique and nothing is ever memoized. It has to be rejected rather than silently doing that.
pMemoize(async (text: string) => Boolean(text), {
	// @ts-expect-error A `cacheKey` must not return a promise.
	cacheKey: async ([text]) => text,
});

// A `cacheKey` returning any other type is fine.
pMemoize(async (text: string) => Boolean(text), {
	cacheKey: ([text]) => new URL(text),
});

// A misspelled option must be reported, not silently ignored at runtime.
pMemoize(async (text: string) => Boolean(text), {
	// @ts-expect-error There is no such option; `shouldCache` was meant.
	shoudCache: () => false,
});

// Private methods throw at runtime, so they must not type-check either.
class PrivateMethodExample {
	// @ts-expect-error Private methods are not supported.
	@pMemoizeDecorator()
	async #hidden(): Promise<number> {
		return 1;
	}

	async call(): Promise<number> {
		return this.#hidden();
	}
}

expectTypeOf(new PrivateMethodExample().call()).toBe<Promise<number>>();
