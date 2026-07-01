// Integration tests for the personal skills scanner
// Uses test fixtures to simulate a skills directory

import { scanPersonalSkills } from '../lib/scan-personal.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; }
  else { console.error(`  FAIL: ${label}`); failed++; }
}

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; }
  else { console.error(`  FAIL: ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); failed++; }
}

// Create a temp directory mimicking ~/.claude/skills/
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-'));

// Set up: create symlink-like scenario
// We'll test with real directories since symlinks require admin on Windows

// Test 1: Scan fixtures directory (treating it as a skills dir)
{
  const { skills, warnings } = scanPersonalSkills(FIXTURES, { homeDir: os.homedir() });
  assert(skills.length >= 6, `T1: found at least 6 skills, got ${skills.length}`);

  // Check basic skill
  const basic = skills.find(s => s.commandName === 'basic-skill');
  assert(basic, 'T1: found basic-skill');
  if (basic) {
    assertEq(basic.origin, 'personal', 'T1: basic origin');
    assert(basic.description.includes('Summarize git changes'), 'T1: basic description');
  }

  // Check missing-desc skill has diagnostic
  const weak = skills.find(s => s.commandName === 'weak-skill');
  if (weak) {
    assert(weak.diagnostics.some(d => d.code === 'missing-description'), 'T1: missing-description diagnostic');
  }

  // Unicode skill
  const unicode = skills.find(s => s.commandName === '审阅-skill');
  assert(unicode, 'T1: found unicode skill');

  // No-frontmatter skill still shows up
  const nofm = skills.find(s => s.commandName && s.diagnostics.some(d => d.code === 'missing-frontmatter'));
  assert(nofm, 'T1: no-frontmatter skill included');
}

// Test 2: Nonexistent directory
{
  const { skills, warnings } = scanPersonalSkills('/nonexistent/dir');
  assertEq(skills.length, 0, 'T2: no skills for nonexistent dir');
  assert(warnings.length > 0, 'T2: warning emitted');
}

// Test 3: Empty directory
{
  const emptyDir = path.join(tmpDir, 'empty');
  fs.mkdirSync(emptyDir, { recursive: true });
  const { skills, warnings } = scanPersonalSkills(emptyDir);
  assertEq(skills.length, 0, 'T3: empty dir has 0 skills');
}

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
