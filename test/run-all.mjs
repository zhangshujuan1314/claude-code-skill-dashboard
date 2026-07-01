#!/usr/bin/env node
// Run all test suites

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const suites = [
  'test-parse-frontmatter.mjs',
  'test-scan-personal.mjs',
  'test-adversarial.mjs',
];

let totalPassed = 0;
let totalFailed = 0;

for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  try {
    const output = execSync(`node "${path.join(__dirname, suite)}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30000,
    });
    console.log(output);

    // Extract counts
    const match = output.match(/(\d+) passed, (\d+) failed/);
    if (match) {
      totalPassed += parseInt(match[1], 10);
      totalFailed += parseInt(match[2], 10);
    }
  } catch (err) {
    console.error(err.stdout || '');
    console.error(err.stderr || err.message);
    // Try to extract counts from stdout
    const match = (err.stdout || '').match(/(\d+) passed, (\d+) failed/);
    if (match) {
      totalPassed += parseInt(match[1], 10);
      totalFailed += parseInt(match[2], 10);
    } else {
      totalFailed++;
    }
  }
}

console.log(`\n========================================`);
console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);
console.log(`========================================`);

if (totalFailed > 0) process.exit(1);
