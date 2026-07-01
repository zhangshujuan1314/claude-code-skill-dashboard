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

// 5. Generate HTML (dynamic import — only after generate-html.mjs exists)
try {
  const { generateHtml } = await import('./lib/generate-html.mjs');
  const templatePath = path.join(__dirname, 'template.html');
  const htmlPath = path.join(opts.outputDir, 'skills.generated.html');
  generateHtml(dataJsonPath, templatePath, htmlPath);
} catch (err) {
  console.warn('HTML generation skipped:', err.message);
}

// 6. Generate install.sh
const installPath = path.join(opts.outputDir, 'install.sh');
generateInstallScript(allPlugins, allSkills, installPath, homeDir);

console.log(`\nDone. ${stats.totalSkills} skills, ${allWarnings.length} diagnostics.`);
console.log('Run `node serve.mjs` or open `skills.generated.html` (after generation).');

// ── install.sh 生成器 ──
function generateInstallScript(plugins, skills, outPath, home) {
  const lines = ['#!/usr/bin/env bash'];
  lines.push('# 技能一键安装脚本 — 全局安装至 Claude Code');
  lines.push('# 生成时间: ' + new Date().toISOString());
  lines.push('set -euo pipefail');
  lines.push('');

  // Plugin marketplace repos
  const MARKETPLACE_REPOS = {
    'superpowers@superpowers-marketplace': 'obra/superpowers-marketplace',
    'ponytail@ponytail': 'DietrichGebert/ponytail',
    'ui-ux-pro-max@ui-ux-pro-max-skill': 'nextlevelbuilder/ui-ux-pro-max-skill',
  };

  // 1. Install plugins
  const seenPlugins = new Set();
  for (const p of plugins) {
    if (seenPlugins.has(p.key)) continue;
    seenPlugins.add(p.key);
    const mrepo = MARKETPLACE_REPOS[p.key];
    if (mrepo) {
      lines.push(`# 插件: ${p.name} (${p.version || 'latest'})`);
      lines.push(`claude plugins install ${p.key} 2>/dev/null || echo "  跳过 ${p.key}（可能已安装）"`);
    } else {
      lines.push(`# 插件: ${p.key} — 无已知 marketplace，通过 CLI 安装`);
      lines.push(`claude plugins install ${p.key} 2>/dev/null || echo "  跳过 ${p.key}"`);
    }
    lines.push('');
  }

  // 2. Symlinked skills (from ~/.agents/skills/)
  const symlinkedSkills = skills.filter(s => s.origin === 'personal' && s.isSymlink);
  if (symlinkedSkills.length > 0) {
    lines.push(`# ── 符号链接技能 (${symlinkedSkills.length} 个) ──`);
    lines.push('# 如果需要安装这些技能，请先克隆源仓库：');
    lines.push('#   git clone https://github.com/multica-ai/andrej-karpathy-skills ~/.agents/skills');
    lines.push('# 然后运行以下命令建立符号链接：');
    lines.push('mkdir -p ~/.claude/skills');
    for (const s of symlinkedSkills) {
      const name = s.commandName;
      lines.push(`ln -sf ~/.agents/skills/${name} ~/.claude/skills/${name} 2>/dev/null || echo "  跳过 ${name}"`);
    }
    lines.push('');
  }

  // 3. Standalone skills — can't auto-install, note them
  const standalone = skills.filter(s => s.origin === 'personal' && !s.isSymlink);
  if (standalone.length > 0) {
    lines.push(`# ── 独立技能 (${standalone.length} 个，需手动恢复) ──`);
    lines.push('# 以下技能无公开安装源，需通过 女娲 或其他方式重建：');
    for (const s of standalone) {
      lines.push(`#   ${s.commandName} — ${(s.description || '').slice(0, 60)}`);
    }
    lines.push('');
  }

  lines.push('echo "✅ 安装完成。"');
  lines.push(`echo "  已安装 ${seenPlugins.size} 个插件"`);
  lines.push(`echo "  ${symlinkedSkills.length} 个符号链接技能"`);
  lines.push(`echo "  ${standalone.length} 个独立技能需手动恢复"`);

  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
  // chmod +x on unix
  try { fs.chmodSync(outPath, 0o755); } catch {}
  console.log(`Wrote: ${outPath}`);
}
