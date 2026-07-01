#!/usr/bin/env node
// Skill Dashboard Scanner
// Scans ~/.claude/skills/ + plugins → data.json + scan-report.json
// Usage: node scan.mjs [--privacy local|share] [--project /path]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanPersonalSkills } from './lib/scan-personal.mjs';
import { scanPlugins } from './lib/scan-plugins.mjs';
import { resolveVisibility } from './lib/resolve-visibility.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const homeDir = process.env.HOME || process.env.USERPROFILE || '~';

// ── Parse CLI args ──
const args = process.argv.slice(2);
const opts = {
  privacyMode: 'local',
  projectRoot: null,
  nestedScan: false,
  outputDir: __dirname,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--privacy':
      opts.privacyMode = args[++i] || 'local';
      break;
    case '--project':
      opts.projectRoot = args[++i];
      break;
    case '--nested':
      opts.nestedScan = true;
      break;
    case '--output':
      opts.outputDir = args[++i] || __dirname;
      break;
    case '--help':
      console.log(`Usage: node scan.mjs [options]
  --privacy local|share   Default: local (share redacts absolute paths)
  --project <path>        Scan project skills too
  --nested                Deep scan nested .claude dirs
  --output <dir>          Output directory (default: script dir)
  --help                  Show this help`);
      process.exit(0);
  }
}

// ── Scan ──
console.log('Scanning skills...');
const allWarnings = [];
const allSkills = [];
let allPlugins = [];

// 1. Personal skills
const personalDir = path.join(homeDir, '.claude', 'skills');
const personalResult = scanPersonalSkills(personalDir, {
  privacyMode: opts.privacyMode,
  homeDir,
});
allSkills.push(...personalResult.skills);
allWarnings.push(...personalResult.warnings);
console.log(`  Personal skills: ${personalResult.skills.length}`);

// 2. Plugin skills
const pluginResult = scanPlugins({
  privacyMode: opts.privacyMode,
  homeDir,
});
allSkills.push(...pluginResult.skills);
allPlugins = pluginResult.plugins;
allWarnings.push(...pluginResult.warnings);
console.log(`  Plugin skills: ${pluginResult.skills.length} (${allPlugins.length} plugins)`);

// 3. Project skills (opt-in)
if (opts.projectRoot) {
  const projectSkillsDir = path.join(opts.projectRoot, '.claude', 'skills');
  if (fs.existsSync(projectSkillsDir)) {
    const projectResult = scanPersonalSkills(projectSkillsDir, {
      privacyMode: opts.privacyMode,
      homeDir,
    });
    // Mark as project origin
    for (const skill of projectResult.skills) {
      skill.origin = 'project';
    }
    allSkills.push(...projectResult.skills);
    allWarnings.push(...projectResult.warnings);
    console.log(`  Project skills: ${projectResult.skills.length}`);
  }

  // Project settings for visibility
  // ponytail: project skillOverrides merging deferred — v1 uses user settings only
}

// 4. Resolve visibility from skillOverrides
const visibilityResult = resolveVisibility(allSkills, allPlugins);
allWarnings.push(...visibilityResult.warnings);

// ── Compute stats ──
const stats = {
  totalSkills: allSkills.length,
  visibleSkills: allSkills.filter(s => s.visibility === 'on' || s.visibility === 'name-only').length,
  hiddenSkills: allSkills.filter(s => s.visibility === 'off' || s.visibility === 'plugin-disabled').length,
  pluginSkills: allSkills.filter(s => s.origin === 'plugin').length,
  personalSkills: allSkills.filter(s => s.origin === 'personal').length,
  projectSkills: allSkills.filter(s => s.origin === 'project').length,
  symlinkedSkills: allSkills.filter(s => s.isSymlink).length,
  commandFileSkills: allSkills.filter(s => s.storage === 'command-file').length,
  bundledSkills: 0,
  pluginsTotal: allPlugins.length,
  pluginsEnabled: allPlugins.filter(p => p.enabled === true).length,
  pluginsDisabled: allPlugins.filter(p => p.enabled === false).length,
  warnings: allWarnings.filter(w => w.level === 'warning').length,
  errors: allWarnings.filter(w => w.level === 'error').length,
};

// ── Build dashboard data ──
const dashboardData = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scanContext: {
    platform: process.platform,
    privacyMode: opts.privacyMode,
    scanMode: opts.projectRoot ? 'personal+project' : 'personal',
  },
  stats,
  skills: allSkills,
  plugins: allPlugins,
  warnings: allWarnings,
};

// ── Try HTML generation (optional) ──
try {
  const { generateHtml } = await import('./lib/generate-html.mjs');
  generateHtml(dashboardData, opts.outputDir);
} catch (err) {
  console.warn('HTML generation skipped:', err.message);
}

// ── Write outputs ──
const dataJsonPath = path.join(opts.outputDir, 'data.json');
fs.writeFileSync(dataJsonPath, JSON.stringify(dashboardData, null, 2), 'utf-8');
console.log(`\nWrote: ${dataJsonPath}`);

const reportPath = path.join(opts.outputDir, 'scan-report.json');
const report = {
  generatedAt: dashboardData.generatedAt,
  summary: stats,
  warnings: allWarnings,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
console.log(`Wrote: ${reportPath}`);

console.log(`\nDone. ${stats.totalSkills} skills, ${allWarnings.length} diagnostics.`);
console.log('Run `node serve.mjs` or open `skills.generated.html` (after generation).');
