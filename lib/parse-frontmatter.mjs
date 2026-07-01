// Constrained YAML frontmatter parser. Handles the skill.md patterns found
// in practice: key: value, quoted strings, block scalars (| and >),
// booleans, arrays. Unknown keys go into raw. Emits diagnostics, never throws.

import fs from 'node:fs';

const MAX_SKILL_FILE_BYTES = 262144; // 256KB

/**
 * @typedef {Object} SkillFrontmatter
 * @property {string} [name]
 * @property {string} [description]
 * @property {string[]} [paths]
 * @property {string} [model]
 * @property {string} [effort]
 * @property {string} [context]
 * @property {string} [agent]
 * @property {string} [shell]
 * @property {string[]} [allowedTools]
 * @property {string[]} [disallowedTools]
 * @property {boolean} [disableModelInvocation]
 * @property {boolean} [userInvocable]
 * @property {Object<string, unknown>} [raw]
 */

/**
 * @typedef {Object} Diagnostic
 * @property {'info'|'warning'|'error'} level
 * @property {string} code
 * @property {string} message
 */

/**
 * @typedef {Object} ParseResult
 * @property {SkillFrontmatter} frontmatter
 * @property {Diagnostic[]} diagnostics
 * @property {number} [bodyStartLine]
 */

/**
 * Parse a SKILL.md file from disk. Returns frontmatter, diagnostics, and
 * the line number where the body starts (for sizing/token analysis).
 *
 * @param {string} filePath - absolute path to SKILL.md
 * @param {{maxBytes?: number}} [opts]
 * @returns {ParseResult|null} null if file doesn't exist or can't be read
 */
export function parseSkillFile(filePath, opts = {}) {
  const maxBytes = opts.maxBytes ?? MAX_SKILL_FILE_BYTES;
  const diagnostics = [];

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    diagnostics.push({
      level: 'error',
      code: 'unreadable-skill',
      message: `Cannot stat file: ${filePath}`
    });
    return { frontmatter: {}, diagnostics, bodyStartLine: 0 };
  }

  if (stat.size > maxBytes) {
    diagnostics.push({
      level: 'warning',
      code: 'oversized-skill',
      message: `File size ${stat.size} exceeds limit ${maxBytes}: ${filePath}`
    });
    // Still try to parse — just read up to the limit
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    diagnostics.push({
      level: 'error',
      code: 'unreadable-skill',
      message: `Cannot read file: ${filePath}`
    });
    return { frontmatter: {}, diagnostics, bodyStartLine: 0 };
  }

  const result = parseFrontmatter(raw);
  result.diagnostics.push(...diagnostics);
  return result;
}

/**
 * Parse YAML frontmatter from raw text content.
 *
 * @param {string} raw - full text content (may include --- delimiters)
 * @returns {ParseResult}
 */
export function parseFrontmatter(raw) {
  const diagnostics = [];
  const frontmatter = {};
  const rawFields = {};

  const lines = raw.split('\n');

  // Frontmatter must start with --- on the very first line
  if (lines[0]?.trim() !== '---') {
    diagnostics.push({
      level: 'warning',
      code: 'missing-frontmatter',
      message: 'No YAML frontmatter block found (file must start with ---)'
    });
    // Try to extract a name from first # heading as fallback
    for (const line of lines) {
      const m = line.match(/^#\s+(.+)/);
      if (m) {
        frontmatter._headingFallback = m[1].trim();
        break;
      }
    }
    return { frontmatter, diagnostics, bodyStartLine: 0 };
  }

  // Find closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    diagnostics.push({
      level: 'warning',
      code: 'parse-warning',
      message: 'Frontmatter block opened but never closed with ---'
    });
    return { frontmatter, diagnostics, bodyStartLine: 0 };
  }

  const fmLines = lines.slice(1, endIndex);
  const bodyStartLine = endIndex + 1;

  // Simple line-by-line YAML parser for the subset used in skill frontmatter
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // Match key: value (or key:)
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (!kvMatch) {
      diagnostics.push({
        level: 'warning',
        code: 'parse-warning',
        message: `Cannot parse frontmatter line ${i + 2}: "${trimmed}"`
      });
      i++;
      continue;
    }

    const key = kvMatch[1];
    let value = kvMatch[2];

    // Block scalar: key: | or key: >
    if (value === '|' || value === '>') {
      const blockLines = [];
      i++;
      while (i < fmLines.length) {
        const blockLine = fmLines[i];
        // Block scalars are indented
        if (blockLine.startsWith('  ') || blockLine.startsWith('\t')) {
          blockLines.push(blockLine.trimStart());
          i++;
        } else if (blockLine.trim() === '') {
          blockLines.push('');
          i++;
        } else {
          break;
        }
      }
      value = blockLines.join('\n').trim();
    } else {
      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      i++;
    }

    // Assign to known fields or raw
    switch (key) {
      case 'name':
        frontmatter.name = value;
        break;
      case 'description':
        frontmatter.description = value;
        break;
      case 'paths':
        frontmatter.paths = parseYamlArray(value);
        break;
      case 'model':
        frontmatter.model = value;
        break;
      case 'effort':
        frontmatter.effort = value;
        break;
      case 'context':
        frontmatter.context = value;
        break;
      case 'agent':
        frontmatter.agent = value;
        break;
      case 'shell':
        frontmatter.shell = value;
        break;
      case 'allowedTools':
      case 'allowed-tools':
        frontmatter.allowedTools = parseYamlArray(value);
        break;
      case 'disallowedTools':
      case 'disallowed-tools':
        frontmatter.disallowedTools = parseYamlArray(value);
        break;
      case 'disableModelInvocation':
      case 'disable-model-invocation':
        frontmatter.disableModelInvocation = parseYamlBool(value);
        break;
      case 'userInvocable':
      case 'user-invocable':
        frontmatter.userInvocable = parseYamlBool(value);
        break;
      default:
        rawFields[key] = parseYamlValue(value);
    }
  }

  if (Object.keys(rawFields).length > 0) {
    frontmatter.raw = rawFields;
  }

  if (!frontmatter.description) {
    diagnostics.push({
      level: 'info',
      code: 'missing-description',
      message: 'Frontmatter has no description field'
    });
  }

  return { frontmatter, diagnostics, bodyStartLine };
}

/** Parse a YAML array value: "[a, b, c]" or "a, b, c" */
function parseYamlArray(val) {
  if (!val || val === '[]') return [];
  // Strip brackets if present
  let inner = val.trim();
  if (inner.startsWith('[') && inner.endsWith(']')) {
    inner = inner.slice(1, -1);
  }
  return inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

/** Parse a YAML boolean */
function parseYamlBool(val) {
  return val === 'true' || val === 'yes' || val === 'True';
}

/** Parse a generic YAML value (string, number, boolean) */
function parseYamlValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  return val;
}
