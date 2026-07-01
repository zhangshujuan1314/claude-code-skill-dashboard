// Plugin inventory via `claude plugin list --json` (primary) with
// filesystem cache fallback for skill discovery.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseSkillFile } from './parse-frontmatter.mjs';
import { toDisplayPath, hashId } from './scan-personal.mjs';

/**
 * @param {{privacyMode?: 'local'|'share', homeDir?: string, pluginCliPreferred?: boolean, cacheFallback?: boolean}} [opts]
 * @returns {{ skills: Array, plugins: Array, warnings: Array }}
 */
export function scanPlugins(opts = {}) {
  const privacyMode = opts.privacyMode || 'local';
  const homeDir = opts.homeDir || (process.env.HOME || process.env.USERPROFILE || '~');
  const pluginCliPreferred = opts.pluginCliPreferred !== false;
  const cacheFallback = opts.cacheFallback !== false;
  const skills = [];
  const plugins = [];
  const warnings = [];

  // ── Step 1: Get plugin list via CLI ──
  let pluginList = [];
  let cliAvailable = false;

  if (pluginCliPreferred) {
    try {
      const raw = execSync('claude plugin list --json', {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore']
      });
      pluginList = JSON.parse(raw);
      cliAvailable = true;
    } catch (err) {
      warnings.push({
        level: 'warning',
        code: 'cli-unavailable',
        message: `claude plugin list --json failed: ${err.message}. Falling back to filesystem.`
      });
    }
  }

  // ── Step 2: Build plugin records ──
  for (const p of pluginList) {
    const installPath = p.installPath || p.path || '';
    const [pname, marketplace = ''] = (p.id || p.name || '').split('@');

    const plugin = {
      key: p.id || p.name,
      name: pname,
      marketplace: marketplace || undefined,
      version: p.version || undefined,
      enabled: p.enabled === true,
      sourceScope: p.scope || 'user',
      pathDisplay: toDisplayPath(installPath, homeDir, privacyMode),
      ...(privacyMode === 'local' && { localPath: installPath }),
      diagnostics: []
    };

    plugins.push(plugin);

    // ── Step 3: Discover plugin skills from install path ──
    if (cacheFallback && installPath && fs.existsSync(installPath)) {
      // Check for skills/ directory
      const skillsDir = path.join(installPath, 'skills');
      if (fs.existsSync(skillsDir)) {
        let entries;
        try {
          entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        } catch {
          plugin.diagnostics.push({
            level: 'warning',
            code: 'cache-fallback-used',
            message: `Cannot read skills directory for ${plugin.key}`
          });
          entries = [];
        }

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
          if (!fs.existsSync(skillMdPath)) {
            warnings.push({
              level: 'info',
              code: 'no-skill-file',
              message: `No SKILL.md in plugin skill: ${plugin.key}/${entry.name}`
            });
            continue;
          }

          const parsed = parseSkillFile(skillMdPath);
          const fm = parsed.frontmatter;

          const commandName = fm.name || entry.name;
          const namespace = pname;
          const fullCommandName = `${namespace}:${commandName}`;
          const description = fm.description || '';
          const activationText = description.slice(0, 200);

          // Extract tags from description
          const tags = extractTags(description);

          skills.push({
            id: hashId(`plugin:${plugin.key}:${entry.name}`),
            commandName: fullCommandName,
            displayName: fm.name || undefined,
            namespace,
            origin: 'plugin',
            storage: 'real-directory',
            pluginKey: plugin.key,
            pluginName: pname,
            marketplace: marketplace || undefined,
            pluginVersion: plugin.version,
            description,
            activationText,
            tags,
            visibility: plugin.enabled ? 'on' : 'plugin-disabled',
            userInvocable: true,
            modelInvocable: plugin.enabled && !fm.disableModelInvocation,
            frontmatter: fm,
            pathDisplay: toDisplayPath(skillMdPath, homeDir, privacyMode),
            ...(privacyMode === 'local' && { localPath: skillMdPath }),
            isSymlink: false,
            diagnostics: parsed.diagnostics
          });
        }
      }

      // Check for commands/ directory (command files)
      const commandsDir = path.join(installPath, 'commands');
      if (fs.existsSync(commandsDir)) {
        let cmdEntries;
        try {
          cmdEntries = fs.readdirSync(commandsDir);
        } catch {
          cmdEntries = [];
        }

        for (const cmdFile of cmdEntries) {
          if (!cmdFile.endsWith('.md')) continue;
          const cmdPath = path.join(commandsDir, cmdFile);
          const cmdName = path.basename(cmdFile, '.md');
          const parsed = parseSkillFile(cmdPath);
          const fm = parsed.frontmatter;

          skills.push({
            id: hashId(`cmd:${plugin.key}:${cmdName}`),
            commandName: `${namespace}:${cmdName}`,
            displayName: fm.name || cmdName,
            namespace,
            origin: 'plugin',
            storage: 'command-file',
            pluginKey: plugin.key,
            pluginName: pname,
            marketplace: marketplace || undefined,
            pluginVersion: plugin.version,
            description: fm.description || `Command: ${cmdName}`,
            activationText: (fm.description || '').slice(0, 200),
            tags: [],
            visibility: plugin.enabled ? 'on' : 'plugin-disabled',
            userInvocable: true,
            modelInvocable: plugin.enabled && !fm.disableModelInvocation,
            frontmatter: fm,
            pathDisplay: toDisplayPath(cmdPath, homeDir, privacyMode),
            ...(privacyMode === 'local' && { localPath: cmdPath }),
            isSymlink: false,
            diagnostics: parsed.diagnostics
          });
        }
      }

      // Check for root SKILL.md (plugin root skill)
      const rootSkillMd = path.join(installPath, 'SKILL.md');
      if (fs.existsSync(rootSkillMd)) {
        const parsed = parseSkillFile(rootSkillMd);
        const fm = parsed.frontmatter;
        const cmdName = fm.name || pname;

        skills.push({
          id: hashId(`root:${plugin.key}`),
          commandName: `${namespace}:${cmdName}`,
          displayName: fm.name || undefined,
          namespace,
          origin: 'plugin',
          storage: 'plugin-root-skill',
          pluginKey: plugin.key,
          pluginName: pname,
          marketplace: marketplace || undefined,
          pluginVersion: plugin.version,
          description: fm.description || '',
          activationText: (fm.description || '').slice(0, 200),
          tags: [],
          visibility: plugin.enabled ? 'on' : 'plugin-disabled',
          userInvocable: true,
          modelInvocable: plugin.enabled && !fm.disableModelInvocation,
          frontmatter: fm,
          pathDisplay: toDisplayPath(rootSkillMd, homeDir, privacyMode),
          ...(privacyMode === 'local' && { localPath: rootSkillMd }),
          isSymlink: false,
          diagnostics: parsed.diagnostics
        });
      }
    } else if (cacheFallback && installPath) {
      plugin.diagnostics.push({
        level: 'warning',
        code: 'cache-fallback-used',
        message: `Install path not found: ${installPath}`
      });
    }
  }

  if (!cliAvailable) {
    warnings.push({
      level: 'warning',
      code: 'cli-unavailable',
      message: 'claude plugin list --json not available, plugin data may be incomplete'
    });
  }

  return { skills, plugins, warnings };
}

/** Extract trigger keyword tags from description text */
function extractTags(description) {
  const tags = new Set();
  const triggerPatterns = [
    { regex: /review|审查|评审/i, tag: 'review' },
    { regex: /debug|diagnos|调试|诊断/i, tag: 'debug' },
    { regex: /test|tdd|测试/i, tag: 'testing' },
    { regex: /design|ui|ux|设计/i, tag: 'design' },
    { regex: /write|writing|写作/i, tag: 'writing' },
    { regex: /plan|计划|规划/i, tag: 'planning' },
    { regex: /git|commit|branch/i, tag: 'git' },
    { regex: /brainstorm|头脑风暴/i, tag: 'brainstorm' },
    { regex: /research|研究|调研/i, tag: 'research' },
    { regex: /security|安全/i, tag: 'security' },
    { regex: /code.?review/i, tag: 'code-review' },
  ];
  for (const { regex, tag } of triggerPatterns) {
    if (regex.test(description)) tags.add(tag);
  }
  return [...tags];
}
