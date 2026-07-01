// Unit tests for the frontmatter parser
// Run: node test/test-parse-frontmatter.mjs

import { parseFrontmatter, parseSkillFile } from '../lib/parse-frontmatter.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function assertEq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

// --- Pure text tests ---

// A1: Basic skill
{
  const input = '---\nname: basic-skill\ndescription: Summarize git changes\n---\n\nBody';
  const result = parseFrontmatter(input);
  assertEq(result.frontmatter.name, 'basic-skill', 'A1: name');
  assertEq(result.frontmatter.description, 'Summarize git changes', 'A1: description');
  assertEq(result.diagnostics.length, 0, 'A1: no diagnostics');
  assert(result.bodyStartLine > 0, 'A1: bodyStartLine');
}

// A2: Quoted colon
{
  const input = '---\ndescription: "Use when user says: review this PR"\n---\n\nBody';
  const result = parseFrontmatter(input);
  assert(result.frontmatter.description.includes(':'), 'A2: colon preserved in quoted string');
  assert(!result.frontmatter.description.includes('"'), 'A2: quotes stripped');
}

// A3: Multiline description (block scalar |)
{
  const input = '---\ndescription: |\n  Use when user asks for review.\n  Focus on correctness.\n---\n\nBody';
  const result = parseFrontmatter(input);
  assert(result.frontmatter.description.includes('Focus on correctness'), 'A3: multiline preserved');
  assert(result.frontmatter.description.includes('\n'), 'A3: newlines preserved');
}

// A4: Missing description
{
  const input = '---\nname: weak-skill\n---\n\nBody';
  const result = parseFrontmatter(input);
  assertEq(result.frontmatter.name, 'weak-skill', 'A4: name parsed');
  assert(result.diagnostics.some(d => d.code === 'missing-description'), 'A4: missing-description diagnostic');
}

// A5: Unknown fields
{
  const input = '---\ndescription: Test\nfuture-field: abc\n---\n\nBody';
  const result = parseFrontmatter(input);
  assertEq(result.frontmatter.raw?.futureField || result.frontmatter.raw?.['future-field'], 'abc', 'A5: unknown field preserved in raw');
}

// No frontmatter
{
  const input = '# No Frontmatter\n\nJust body text.';
  const result = parseFrontmatter(input);
  assert(result.diagnostics.some(d => d.code === 'missing-frontmatter'), 'no-frontmatter: diagnostic emitted');
}

// Unclosed frontmatter
{
  const input = '---\nname: test\n\nBody without closing';
  const result = parseFrontmatter(input);
  assert(result.diagnostics.some(d => d.code === 'parse-warning'), 'unclosed: parse-warning emitted');
}

// Boolean fields
{
  const input = '---\ndescription: Test\ndisable-model-invocation: true\nuser-invocable: true\n---\n\nBody';
  const result = parseFrontmatter(input);
  assertEq(result.frontmatter.disableModelInvocation, true, 'bool: disableModelInvocation true');
  assertEq(result.frontmatter.userInvocable, true, 'bool: userInvocable true');
}

// Array fields
{
  const input = '---\ndescription: Test\nallowed-tools: [Read, Write, Bash]\n---\n\nBody';
  const result = parseFrontmatter(input);
  assertEq(result.frontmatter.allowedTools, ['Read', 'Write', 'Bash'], 'array: allowedTools');
}

// --- File-based tests ---

// B1: Basic fixture
{
  const result = parseSkillFile(path.join(FIXTURES, 'basic', 'SKILL.md'));
  assertEq(result.frontmatter.name, 'basic-skill', 'B1: name from file');
  assertEq(result.frontmatter.description, 'Summarize git changes and prepare commit messages', 'B1: description from file');
}

// B2: Multiline fixture
{
  const result = parseSkillFile(path.join(FIXTURES, 'multiline', 'SKILL.md'));
  assert(result.frontmatter.description.includes('Use when the user asks'), 'B2: multiline from file');
}

// B3: Quoted colon fixture
{
  const result = parseSkillFile(path.join(FIXTURES, 'quoted-colon', 'SKILL.md'));
  assert(result.frontmatter.description.includes(':'), 'B3: colon in quoted description');
}

// B4: Missing desc fixture
{
  const result = parseSkillFile(path.join(FIXTURES, 'missing-desc', 'SKILL.md'));
  assert(result.diagnostics.some(d => d.code === 'missing-description'), 'B4: missing desc diagnostic');
}

// B5: Unknown fields fixture
{
  const result = parseSkillFile(path.join(FIXTURES, 'unknown-fields', 'SKILL.md'));
  const raw = result.frontmatter.raw || {};
  const hasFutureField = raw['future-field'] === 'abc' || raw.futureField === 'abc';
  assert(hasFutureField, 'B5: unknown field in raw');
}

// B6: No frontmatter fixture
{
  const result = parseSkillFile(path.join(FIXTURES, 'no-frontmatter', 'SKILL.md'));
  assert(result.diagnostics.some(d => d.code === 'missing-frontmatter'), 'B6: missing frontmatter diagnostic');
}

// B7: Unicode fixture
{
  const result = parseSkillFile(path.join(FIXTURES, 'unicode-审阅', 'SKILL.md'));
  assertEq(result.frontmatter.name, '审阅-skill', 'B7: unicode name preserved');
}

// B8: Oversized file
{
  const result = parseSkillFile(path.join(FIXTURES, 'huge', 'SKILL.md'));
  assert(result.diagnostics.some(d => d.code === 'oversized-skill'), 'B8: oversized diagnostic');
}

// B9: Nonexistent file
{
  const result = parseSkillFile('/nonexistent/path/SKILL.md');
  assert(result.diagnostics.length > 0, 'B9: error on missing file');
}

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
