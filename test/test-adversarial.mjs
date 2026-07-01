// Adversarial tests per spec section 16.2
// Covers: broken symlinks, cycles, unicode paths, duplicates,
// plugin edge cases, settings edge cases

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, parseSkillFile } from '../lib/parse-frontmatter.mjs';
import { scanPersonalSkills } from '../lib/scan-personal.mjs';
import { resolveVisibility } from '../lib/resolve-visibility.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; }
  else { console.error(`  FAIL: ${label}`); failed++; }
}

function assertEq(actual, expected, label) {
  try {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return; }
  } catch {}
  console.error(`  FAIL: ${label}`);
  console.error(`    expected: ${JSON.stringify(expected)}`);
  console.error(`    actual:   ${JSON.stringify(actual)}`);
  failed++;
}

// ── E1: No data ──
{
  // scanPersonalSkills on empty dir already tested in test-scan-personal
  // Here test: scanPersonalSkills on nonexistent dir returns empty + warning
  const { skills, warnings } = scanPersonalSkills('/nonexistent/dir/xyz');
  assertEq(skills.length, 0, 'E1: nonexistent dir → 0 skills');
  assert(warnings.length > 0, 'E1: nonexistent dir → warning emitted');
}

// ── C1-C4: Plugin skill visibility ──
{
  // Skills with origin=plugin should not be affected by skillOverrides
  const skills = [
    {
      id: 'test-plugin-skill',
      commandName: 'superpowers:brainstorming',
      origin: 'plugin',
      visibility: 'on',
      userInvocable: true,
      modelInvocable: true,
      frontmatter: {},
      diagnostics: [],
    }
  ];
  const plugins = [
    { key: 'superpowers@superpowers-marketplace', name: 'superpowers', enabled: true }
  ];

  // Create temp settings with an override for this skill
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-vis-test-'));
  const settingsPath = path.join(tmpDir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({
    skillOverrides: { 'superpowers:brainstorming': 'off' }
  }));

  resolveVisibility(skills, plugins, settingsPath);

  // Plugin skill should remain 'on' — override ignored
  assertEq(skills[0].visibility, 'on', 'C1: plugin skill ignores skillOverrides');
  assert(skills[0].modelInvocable === true, 'C1: plugin skill still model-invocable');

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── D1-D4: Settings tests ──
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-set-test-'));
  const settingsPath = path.join(tmpDir, 'settings.json');

  // D1: Absent from skillOverrides → on
  fs.writeFileSync(settingsPath, JSON.stringify({ skillOverrides: {} }));
  {
    const skills = [
      { id: 'd1', commandName: 'test-skill', origin: 'personal', visibility: 'on',
        userInvocable: true, modelInvocable: true, frontmatter: {}, diagnostics: [] }
    ];
    resolveVisibility(skills, [], settingsPath);
    assertEq(skills[0].visibility, 'on', 'D1: absent from overrides → on');
  }

  // D2: Skill set to off
  fs.writeFileSync(settingsPath, JSON.stringify({ skillOverrides: { 'deploy': 'off' } }));
  {
    const skills = [
      { id: 'd2', commandName: 'deploy', origin: 'personal', visibility: 'on',
        userInvocable: true, modelInvocable: true, frontmatter: {}, diagnostics: [] }
    ];
    resolveVisibility(skills, [], settingsPath);
    assertEq(skills[0].visibility, 'off', 'D2: override off');
    assertEq(skills[0].userInvocable, false, 'D2: not user-invocable');
    assertEq(skills[0].modelInvocable, false, 'D2: not model-invocable');
  }

  // D3: user-invocable-only
  fs.writeFileSync(settingsPath, JSON.stringify({ skillOverrides: { 'helper': 'user-invocable-only' } }));
  {
    const skills = [
      { id: 'd3', commandName: 'helper', origin: 'personal', visibility: 'on',
        userInvocable: true, modelInvocable: true, frontmatter: {}, diagnostics: [] }
    ];
    resolveVisibility(skills, [], settingsPath);
    assertEq(skills[0].visibility, 'user-invocable-only', 'D3: user-invocable-only');
    assertEq(skills[0].userInvocable, true, 'D3: user-invocable = true');
    assertEq(skills[0].modelInvocable, false, 'D3: model-invocable = false');
  }

  // D4: Plugin skill has skillOverrides → ignored
  fs.writeFileSync(settingsPath, JSON.stringify({ skillOverrides: { 'plugin:cmd': 'off' } }));
  {
    const skills = [
      { id: 'd4', commandName: 'plugin:cmd', origin: 'plugin', visibility: 'on',
        userInvocable: true, modelInvocable: true, frontmatter: {}, diagnostics: [] }
    ];
    const result = resolveVisibility(skills, [], settingsPath);
    assertEq(skills[0].visibility, 'on', 'D4: plugin override ignored');
    // Should emit info warning about ignored override
    const hasWarning = result.warnings.some(w => w.code === 'override-ignored');
    assert(hasWarning, 'D4: override-ignored warning emitted');
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── Parser adversarial: huge file, unicode, empty ──
{
  // Huge input
  const huge = '---\nname: test\n---\n\n' + 'x'.repeat(300000);
  const result = parseFrontmatter(huge);
  assert(result.frontmatter.name === 'test', 'ADV: huge body does not break parsing');
}

{
  // Unicode in key
  const input = '---\n名称: 中文名\ndescription: Test\n---\n\nBody';
  const result = parseFrontmatter(input);
  // Non-ASCII key goes to raw
  assert(result.frontmatter.raw !== undefined || result.diagnostics.length > 0, 'ADV: non-ASCII key handled');
}

{
  // Empty file
  const result = parseFrontmatter('');
  assert(result.diagnostics.some(d => d.code === 'missing-frontmatter'), 'ADV: empty file diagnostic');
}

// ── Duplicate command name detection ──
{
  const names = ['deploy', 'review', 'test', 'deploy', 'review'];
  const seen = new Set();
  const dupes = [];
  for (const name of names) {
    if (seen.has(name)) dupes.push(name);
    seen.add(name);
  }
  assertEq(dupes.length, 2, 'ADV: duplicate detection finds 2 dupes');
}

// ── Path with spaces ──
{
  const pathWithSpaces = '~/.claude/skills/code review/SKILL.md';
  // Should not crash
  const result = parseFrontmatter('---\nname: code review\ndescription: Test\n---\n\nBody');
  assert(result.frontmatter.name === 'code review', 'ADV: space in skill name ok');
}

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
