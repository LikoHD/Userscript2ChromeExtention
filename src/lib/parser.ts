export interface UserScriptMeta {
  name: string;
  description: string;
  version: string;
  matches: string[];
  excludeMatches: string[];
  requires: string[];
  grants: string[];
  runAt: string;
  icon: string | null;
  warnings: string[];
}

/**
 * Convert a Greasemonkey @include/@exclude glob pattern to a Chrome match pattern.
 * Returns null if conversion is not possible.
 */
function globToMatchPattern(glob: string): string | null {
  // Already a valid match pattern (has scheme://host/path structure)
  if (/^https?:\/\//.test(glob) || glob.startsWith('*://')) {
    // Replace ** with * for Chrome compatibility
    return glob.replace(/\*\*/g, '*');
  }

  // Handle wildcard scheme
  if (glob.startsWith('http*://') || glob.startsWith('*://')) {
    return '*://' + glob.replace(/^https?\*?:\/\//, '').replace(/^http\*:\/\//, '');
  }

  // Handle plain domain globs like *.example.com/*
  if (!glob.includes('://') && !glob.startsWith('/')) {
    // Assume http/https
    const cleaned = glob.replace(/\*\*/g, '*');
    return `*://${cleaned}`;
  }

  return null;
}

function normalizeRunAt(runAt: string): string {
  // @run-at document-start → document_start
  return runAt.replace(/-/g, '_').replace(/^document_/, 'document_');
}

export function parseUserScript(text: string): UserScriptMeta {
  const meta: UserScriptMeta = {
    name: 'Converted Extension',
    description: '',
    version: '1.0.0',
    matches: [],
    excludeMatches: [],
    requires: [],
    grants: [],
    runAt: 'document_idle',
    icon: null,
    warnings: [],
  };

  // Extract the ==UserScript== block
  const blockMatch = text.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!blockMatch) {
    meta.warnings.push('No ==UserScript== block found. Using defaults.');
    return meta;
  }

  const block = blockMatch[1];
  const lines = block.split('\n');

  for (const line of lines) {
    const m = line.match(/^\s*\/\/\s*@(\S+)\s*(.*?)\s*$/);
    if (!m) continue;

    const [, key, value] = m;

    switch (key) {
      case 'name':
        meta.name = value || meta.name;
        break;

      case 'description':
        meta.description = value;
        break;

      case 'version':
        meta.version = value || meta.version;
        break;

      case 'match':
        if (value) meta.matches.push(value);
        break;

      case 'include': {
        if (!value) break;
        const converted = globToMatchPattern(value);
        if (converted) {
          meta.matches.push(converted);
        } else {
          meta.warnings.push(
            `@include "${value}" could not be converted to a Chrome match pattern and was skipped.`
          );
        }
        break;
      }

      case 'exclude': {
        if (!value) break;
        const converted = globToMatchPattern(value);
        if (converted) {
          meta.excludeMatches.push(converted);
        } else {
          meta.warnings.push(
            `@exclude "${value}" could not be converted to a Chrome match pattern and was skipped.`
          );
        }
        break;
      }

      case 'exclude-match':
        if (value) meta.excludeMatches.push(value);
        break;

      case 'require':
        if (value) meta.requires.push(value);
        break;

      case 'grant':
        if (value && value !== 'none') {
          meta.grants.push(value);
        }
        break;

      case 'run-at':
        meta.runAt = normalizeRunAt(value);
        break;

      case 'icon':
      case 'icon64':
        if (value && !meta.icon) meta.icon = value;
        break;
    }
  }

  // Ensure at least one match pattern
  if (meta.matches.length === 0) {
    meta.matches.push('*://*/*');
    meta.warnings.push(
      'No @match or @include found. Defaulted to "*://*/*". Please restrict this in manifest.json.'
    );
  }

  return meta;
}
