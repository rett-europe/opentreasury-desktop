/**
 * Argon2id benchmarking CLI.
 *
 * Usage: node --import tsx/esm app/src/core/crypto/benchmark.ts
 *
 * Tests various Argon2id param combinations and reports timing.
 * Goal: Find params that take ~500ms (300–800ms acceptable band).
 */

import { deriveRecoveryKey, type Argon2Params } from './recoveryKey.js';
import { generateMnemonic } from './mnemonic.js';
import { randomBytes } from './primitives.js';

interface BenchmarkResult {
  params: Argon2Params;
  samples: number[];
  mean: number;
  min: number;
  max: number;
  stddev: number;
}

async function benchmarkParams(
  params: Argon2Params,
  samples: number = 10,
): Promise<BenchmarkResult> {
  const mnemonic = generateMnemonic();
  const salt = randomBytes(16);
  const timings: number[] = [];

  console.log(
    `\nBenchmarking: m=${params.m} KiB, t=${params.t}, p=${params.p} (${samples} samples)`,
  );

  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await deriveRecoveryKey(mnemonic, salt, params);
    const duration = performance.now() - start;
    timings.push(duration);
    process.stdout.write(`.`);
  }

  const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
  const min = Math.min(...timings);
  const max = Math.max(...timings);
  const variance = timings.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / timings.length;
  const stddev = Math.sqrt(variance);

  console.log(
    `\n  Mean: ${mean.toFixed(1)}ms | Min: ${min.toFixed(1)}ms | Max: ${max.toFixed(1)}ms | StdDev: ${stddev.toFixed(1)}ms`,
  );

  return { params, samples: timings, mean, min, max, stddev };
}

async function main() {
  console.log('=== Argon2id Benchmark for OpenTreasury ===');
  console.log('Target: 300–800ms (ideal ~500ms)\n');

  const candidates: Argon2Params[] = [
    // Conservative (fast, lower security)
    { m: 32768, t: 2, p: 1 }, // 32 MiB, 2 iterations
    { m: 49152, t: 2, p: 1 }, // 48 MiB, 2 iterations

    // Baseline (spec default)
    { m: 65536, t: 3, p: 1 }, // 64 MiB, 3 iterations

    // Aggressive (slower, higher security)
    { m: 65536, t: 4, p: 1 }, // 64 MiB, 4 iterations
    { m: 98304, t: 3, p: 1 }, // 96 MiB, 3 iterations
  ];

  const results: BenchmarkResult[] = [];

  for (const params of candidates) {
    const result = await benchmarkParams(params);
    results.push(result);
  }

  console.log('\n=== Summary ===');
  console.log(`${'Params'.padEnd(20)} | ${'Mean'.padStart(10)} | ${'Range'.padStart(20)} | Status`);
  console.log('-'.repeat(80));

  for (const r of results) {
    const paramStr = `m=${r.params.m} t=${r.params.t} p=${r.params.p}`;
    const meanStr = `${r.mean.toFixed(1)}ms`;
    const rangeStr = `${r.min.toFixed(0)}–${r.max.toFixed(0)}ms`;
    const status =
      r.mean >= 300 && r.mean <= 800 ? '✓ Target' : r.mean < 300 ? '⚠ Too fast' : '⚠ Too slow';

    console.log(
      `${paramStr.padEnd(20)} | ${meanStr.padStart(10)} | ${rangeStr.padStart(20)} | ${status}`,
    );
  }

  console.log('\nRecommendation: Choose params closest to 500ms in the Target range.');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
