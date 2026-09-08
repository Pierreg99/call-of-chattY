import assert from "node:assert/strict";

class TestHarness {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.failures = [];
  }

  describe(name, fn) {
    const suite = {
      name,
      tests: [],
      beforeEachFns: [],
      afterEachFns: [],
    };
    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    this.suites.push(suite);
    try {
      fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  test(name, fn) {
    if (!this.currentSuite) {
      this.describe("Default Suite", () => {
        this.test(name, fn);
      });
      return;
    }
    this.currentSuite.tests.push({ name, fn });
  }

  beforeEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEachFns.push(fn);
    }
  }

  afterEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterEachFns.push(fn);
    }
  }

  async run() {
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.failures = [];
    const startTime = performance.now();

    for (const suite of this.suites) {
      console.log(`\n  \x1b[1m\x1b[36m● ${suite.name}\x1b[0m`);
      for (const t of suite.tests) {
        this.totalTests++;
        const testStart = performance.now();
        try {
          for (const bf of suite.beforeEachFns) {
            await bf();
          }
          await t.fn();
          for (const af of suite.afterEachFns) {
            await af();
          }
          const testElapsed = (performance.now() - testStart).toFixed(2);
          this.passedTests++;
          console.log(`    \x1b[32m✔\x1b[0m ${t.name} \x1b[90m(${testElapsed}ms)\x1b[0m`);
        } catch (err) {
          const testElapsed = (performance.now() - testStart).toFixed(2);
          this.failedTests++;
          console.log(`    \x1b[31m✖\x1b[0m ${t.name} \x1b[90m(${testElapsed}ms)\x1b[0m`);
          console.log(`      \x1b[31mError: ${err.message}\x1b[0m`);
          if (err.stack) {
            const stackLine = err.stack.split("\n").slice(1, 3).join("\n      ");
            console.log(`      \x1b[90m${stackLine}\x1b[0m`);
          }
          this.failures.push({
            suite: suite.name,
            test: t.name,
            error: err,
          });
        }
      }
    }

    const totalDuration = (performance.now() - startTime).toFixed(2);
    return {
      total: this.totalTests,
      passed: this.passedTests,
      failed: this.failedTests,
      durationMs: totalDuration,
      failures: this.failures,
    };
  }
}

export const harness = new TestHarness();
export const describe = (name, fn) => harness.describe(name, fn);
export const test = (name, fn) => harness.test(name, fn);
export const it = test;
export const beforeEach = (fn) => harness.beforeEach(fn);
export const afterEach = (fn) => harness.afterEach(fn);

export function expect(actual) {
  const matchers = (isNot = false) => ({
    toBe(expected) {
      const pass = Object.is(actual, expected);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? "not " : ""}to be ${JSON.stringify(expected)}`);
      }
    },
    toEqual(expected) {
      try {
        assert.deepStrictEqual(actual, expected);
        if (isNot) throw new Error(`Expected values not to deeply equal`);
      } catch (e) {
        if (!isNot) throw e;
      }
    },
    toBeCloseTo(expected, delta = 0.001) {
      const diff = Math.abs(actual - expected);
      const pass = diff <= delta;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be close to ${expected} (diff: ${diff.toFixed(6)}, delta: ${delta})`);
      }
    },
    toBeGreaterThan(expected) {
      const pass = actual > expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be greater than ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected) {
      const pass = actual >= expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be >= ${expected}`);
      }
    },
    toBeLessThan(expected) {
      const pass = actual < expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be less than ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected) {
      const pass = actual <= expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be <= ${expected}`);
      }
    },
    toBeTruthy() {
      const pass = Boolean(actual);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be truthy`);
      }
    },
    toBeFalsy() {
      const pass = !Boolean(actual);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be falsy`);
      }
    },
    toBeNull() {
      const pass = actual === null;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be null`);
      }
    },
    toBeDefined() {
      const pass = actual !== undefined;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be defined`);
      }
    },
    toBeUndefined() {
      const pass = actual === undefined;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "not " : ""}to be undefined`);
      }
    },
    toContain(item) {
      let pass = false;
      if (typeof actual === "string") pass = actual.includes(item);
      else if (Array.isArray(actual)) pass = actual.includes(item);
      else if (actual instanceof Set) pass = actual.has(item);
      else if (actual instanceof Map) pass = actual.has(item);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected collection ${isNot ? "not " : ""}to contain ${JSON.stringify(item)}`);
      }
    },
    toThrow(regexOrSubstr) {
      let threw = false;
      let thrownError = null;
      try {
        if (typeof actual !== "function") {
          throw new Error("actual must be a function to use toThrow");
        }
        actual();
      } catch (err) {
        threw = true;
        thrownError = err;
      }
      if (isNot ? threw : !threw) {
        throw new Error(`Expected function ${isNot ? "not " : ""}to throw an error`);
      }
      if (threw && regexOrSubstr) {
        const msg = thrownError.message || String(thrownError);
        const matches = regexOrSubstr instanceof RegExp ? regexOrSubstr.test(msg) : msg.includes(regexOrSubstr);
        if (!matches) {
          throw new Error(`Expected error message "${msg}" to match ${regexOrSubstr}`);
        }
      }
    },
  });

  const base = matchers(false);
  base.not = matchers(true);
  return base;
}
