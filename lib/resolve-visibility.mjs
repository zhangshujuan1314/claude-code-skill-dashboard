// Apply skillOverrides from settings.json to non-plugin skills.
// Plugin skills derive visibility from plugin enabled state.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Read user settings.json and apply skillOverrides to personal/project skills.
 * Plugin skills are not affected by skillOverrides.
 *
 * @param {Array} skills - SkillRecord array (mutated in place)
 * @param {Array} plugins - PluginRecord array
 * @param {string} [settingsPath] - path to settings.json (default: ~/.claude/settings.json)
 * @returns {{ warnings: Array }}
 */
export function resolveVisibility(skills, plugins, settingsPath) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
  const defaultSettingsPath = path.join(homeDir, '.claude', 'settings.json');
  const targetPath = settingsPath || defaultSettingsPath;
  const warnings = [];

  // Read settings.json
  let settings;
  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    settings = JSON.parse(raw);
  } catch (err) {
    warnings.push({
      level: 'warning',
      code: 'settings-unavailable',
      message: `Cannot read settings.json at ${targetPath}: ${err.message}`
    });
    // No overrides — all personal skills default to "on"
    for (const skill of skills) {
      if (skill.origin !== 'plugin') {
        skill.visibility = 'on';
        skill.userInvocable = true;
        skill.modelInvocable = !skill.frontmatter?.disableModelInvocation;
      }
    }
    return { warnings };
  }

  const skillOverrides = settings.skillOverrides || {};

  for (const skill of skills) {
    if (skill.origin === 'plugin' || skill.origin === 'bundled') {
      // Plugin skills: visibility already set by scan-plugins
      // Do NOT apply skillOverrides to plugin skills
      if (skillOverrides[skill.commandName]) {
        warnings.push({
          level: 'info',
          code: 'override-ignored',
          message: `skillOverrides entry for "${skill.commandName}" ignored (plugin skill)`
        });
      }
      continue;
    }

    // Personal/project skills: apply skillOverrides
    // Check by commandName against skillOverrides
    const override = skillOverrides[skill.commandName];

    if (override) {
      switch (override) {
        case 'on':
          skill.visibility = 'on';
          skill.userInvocable = true;
          skill.modelInvocable = true;
          break;
        case 'name-only':
          skill.visibility = 'name-only';
          skill.userInvocable = true;
          skill.modelInvocable = true; // name is listed to model
          break;
        case 'user-invocable-only':
          skill.visibility = 'user-invocable-only';
          skill.userInvocable = true;
          skill.modelInvocable = false;
          break;
        case 'off':
          skill.visibility = 'off';
          skill.userInvocable = false;
          skill.modelInvocable = false;
          break;
        default:
          skill.visibility = 'on';
          skill.userInvocable = true;
          skill.modelInvocable = true;
      }
    } else {
      // No override → default "on"
      skill.visibility = 'on';
      skill.userInvocable = true;
      skill.modelInvocable = !skill.frontmatter?.disableModelInvocation;
    }
  }

  return { warnings };
}
