// Scan ~/.claude/skills/ directory for SKILL.md files.
// Handles real directories, symlinks, broken symlinks, symlink cycles.

import fs from 'node:fs';
import path from 'node:path';
import { parseSkillFile } from './parse-frontmatter.mjs';

/**
 * @param {string} skillsDir - absolute path to skills directory (e.g. ~/.claude/skills/)
 * @param {{privacyMode?: 'local'|'share', homeDir?: string}} [opts]
 * @returns {{ skills: Array, warnings: Array }}
 */
export function scanPersonalSkills(skillsDir, opts = {}) {
  const privacyMode = opts.privacyMode || 'local';
  const homeDir = opts.homeDir || (process.env.HOME || process.env.USERPROFILE || '~');
  const skills = [];
  const warnings = [];
  const visitedInodes = new Set(); // prevent symlink cycles

  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch (err) {
    warnings.push({
      level: 'error',
      code: 'scan-error',
      message: `Cannot read skills directory: ${skillsDir} (${err.message})`
    });
    return { skills, warnings };
  }

  for (const entry of entries) {
    const entryPath = path.join(skillsDir, entry.name);

    // --- Symlink handling ---
    let isSymlink = false;
    let symlinkTarget = null;
    let resolvedPath = entryPath;
    let storage = 'real-directory';

    if (entry.isSymbolicLink()) {
      isSymlink = true;
      storage = 'symlink';
      try {
        symlinkTarget = fs.readlinkSync(entryPath);
        // Resolve relative symlinks
        resolvedPath = path.resolve(path.dirname(entryPath), symlinkTarget);

        // Check for broken symlink
        if (!fs.existsSync(resolvedPath)) {
          warnings.push({
            level: 'error',
            code: 'broken-symlink',
            message: `Broken symlink: ${toDisplayPath(entryPath, homeDir, privacyMode)} -> ${symlinkTarget}`
          });
          skills.push({
            id: hashId(entryPath),
            commandName: entry.name,
            origin: 'personal',
            storage: 'symlink',
            description: '',
            activationText: '',
            tags: [],
            visibility: 'off',
            userInvocable: false,
            modelInvocable: false,
            frontmatter: {},
            pathDisplay: toDisplayPath(entryPath, homeDir, privacyMode),
            isSymlink: true,
            symlinkTargetDisplay: symlinkTarget,
            diagnostics: [{
              level: 'error',
              code: 'broken-symlink',
              message: `Target does not exist: ${symlinkTarget}`
            }]
          });
          continue;
        }

        // Symlink cycle detection via inode (Unix) or realpath (Windows)
        try {
          const stat = fs.statSync(resolvedPath);
          if (stat.ino && visitedInodes.has(stat.ino)) {
            warnings.push({
              level: 'error',
              code: 'symlink-cycle',
              message: `Symlink cycle detected at: ${toDisplayPath(entryPath, homeDir, privacyMode)}`
            });
            continue;
          }
          if (stat.ino) visitedInodes.add(stat.ino);
        } catch { /* stat failed but existsSync passed — unlikely, continue */ }
      } catch (err) {
        warnings.push({
          level: 'error',
          code: 'broken-symlink',
          message: `Cannot read symlink ${toDisplayPath(entryPath, homeDir, privacyMode)}: ${err.message}`
        });
        continue;
      }
    }

    // --- SKILL.md lookup ---
    const skillMdPath = path.join(resolvedPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      warnings.push({
        level: 'info',
        code: 'no-skill-file',
        message: `No SKILL.md found in ${toDisplayPath(entryPath, homeDir, privacyMode)}`
      });
      continue;
    }

    // --- Parse ---
    const parsed = parseSkillFile(skillMdPath);
    const fm = parsed.frontmatter;

    const commandName = fm.name || entry.name;
    const description = fm.description || '';
    const activationText = description.slice(0, 200);

    // Extract tags from description (heuristic: key trigger phrases)
    const tags = extractTags(description);

    const skill = {
      id: hashId(entryPath),
      commandName,
      displayName: fm.name || undefined,
      origin: isSymlink ? 'personal' : 'personal',
      storage,
      description,
      activationText,
      tags,
      visibility: 'on', // Will be resolved later by resolve-visibility
      userInvocable: true,
      modelInvocable: !fm.disableModelInvocation,
      frontmatter: fm,
      pathDisplay: toDisplayPath(entryPath, homeDir, privacyMode),
      ...(privacyMode === 'local' && { localPath: entryPath }),
      isSymlink,
      ...(isSymlink && {
        symlinkTargetDisplay: symlinkTarget,
        ...(privacyMode === 'local' && { symlinkTargetLocalPath: resolvedPath })
      }),
      diagnostics: parsed.diagnostics
    };

    skills.push(skill);
  }

  return { skills, warnings };
}

/** Extract trigger keyword tags from description text */
function extractTags(description) {
  const tags = new Set();
  const triggerPatterns = [
    { regex: /review|审查|评审/i, tag: 'review' },
    { regex: /debug|diagnos|调试|诊断/i, tag: 'debug' },
    { regex: /test|tdd|测试|test-driven/i, tag: 'testing' },
    { regex: /design|ui|ux|设计/i, tag: 'design' },
    { regex: /write|writing|写作|写文章|文章/i, tag: 'writing' },
    { regex: /plan|计划|规划/i, tag: 'planning' },
    { regex: /git|commit|branch|merge/i, tag: 'git' },
    { regex: /plugin|插件/i, tag: 'plugin' },
    { regex: /brainstorm|头脑风暴|创意/i, tag: 'brainstorm' },
    { regex: /research|研究|调研/i, tag: 'research' },
    { regex: /security|安全/i, tag: 'security' },
    { regex: /storage|disk|存储|磁盘|空间/i, tag: 'storage' },
    { regex: /banner|banner|海报/i, tag: 'banner' },
    { regex: /brand|品牌/i, tag: 'brand' },
    { regex: /slide|ppt|演示/i, tag: 'slides' },
    { regex: /article|edit|编辑/i, tag: 'editing' },
    { regex: /decision|决策/i, tag: 'decision' },
    { regex: /obsidian|笔记/i, tag: 'obsidian' },
    { regex: /code.?review|code review/i, tag: 'code-review' },
  ];

  for (const { regex, tag } of triggerPatterns) {
    if (regex.test(description)) {
      tags.add(tag);
    }
  }

  return [...tags];
}

/** Stable hash for skill identity */
function hashId(str) {
  // Simple hash — sufficient for uniqueness, no crypto needed
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return 'skill-' + Math.abs(hash).toString(36);
}

/** Convert a path for display: ~ in local mode, hash in share mode */
function toDisplayPath(absPath, homeDir, privacyMode) {
  if (privacyMode === 'share') {
    return '[redacted]';
  }
  // Normalize slashes for display
  const normalized = absPath.replace(/\\/g, '/');
  const homeNormalized = homeDir.replace(/\\/g, '/');
  if (normalized.startsWith(homeNormalized)) {
    return '~' + normalized.slice(homeNormalized.length);
  }
  return normalized;
}

export { toDisplayPath, hashId };
