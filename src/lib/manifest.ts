import type { UserScriptMeta } from './parser';

export interface ManifestV3 {
  manifest_version: 3;
  name: string;
  description: string;
  version: string;
  action: Record<string, never>;
  content_scripts: Array<{
    matches: string[];
    exclude_matches?: string[];
    js: string[];
    run_at: string;
  }>;
  permissions?: string[];
  host_permissions?: string[];
  background?: {
    service_worker: string;
    type: 'module';
  };
  icons?: Record<string, string>;
  web_accessible_resources?: Array<{
    resources: string[];
    matches: string[];
  }>;
}

const DEFAULT_ICON_PATHS = {
  '16': 'icons/icon16.png',
  '48': 'icons/icon48.png',
  '128': 'icons/icon128.png',
} as const;

const GRANT_PERMISSIONS: Record<string, { permissions?: string[]; host_permissions?: string[] }> = {
  GM_xmlhttpRequest:   { host_permissions: ['<all_urls>'] },
  'GM.xmlHttpRequest': { host_permissions: ['<all_urls>'] },
  GM_setValue:         { permissions: ['storage'] },
  GM_getValue:         { permissions: ['storage'] },
  'GM.setValue':       { permissions: ['storage'] },
  'GM.getValue':       { permissions: ['storage'] },
  GM_deleteValue:      { permissions: ['storage'] },
  GM_listValues:       { permissions: ['storage'] },
  GM_notification:     { permissions: ['notifications'] },
  'GM.notification':   { permissions: ['notifications'] },
  GM_setClipboard:     { permissions: ['clipboardWrite'] },
  'GM.setClipboard':   { permissions: ['clipboardWrite'] },
  GM_openInTab:        { permissions: ['tabs'] },
  'GM.openInTab':      { permissions: ['tabs'] },
};

export function buildManifest(
  meta: UserScriptMeta,
  opts: { hasBackground: boolean; requireFiles: string[] }
): ManifestV3 {
  const permissionsSet = new Set<string>();
  const hostPermissionsSet = new Set<string>();

  for (const grant of meta.grants) {
    const entry = GRANT_PERMISSIONS[grant];
    if (!entry) continue;
    entry.permissions?.forEach(p => permissionsSet.add(p));
    entry.host_permissions?.forEach(p => hostPermissionsSet.add(p));
  }

  // Build content scripts JS list
  const contentJs: string[] = [
    ...opts.requireFiles,
    'content.js',
  ];

  const contentScript: ManifestV3['content_scripts'][0] = {
    matches: meta.matches,
    js: contentJs,
    run_at: meta.runAt,
  };

  if (meta.excludeMatches.length > 0) {
    contentScript.exclude_matches = meta.excludeMatches;
  }

  const manifest: ManifestV3 = {
    manifest_version: 3,
    name: meta.name,
    description: meta.description,
    version: meta.version,
    action: {},
    content_scripts: [contentScript],
    icons: { ...DEFAULT_ICON_PATHS },
  };

  if (permissionsSet.size > 0) {
    manifest.permissions = [...permissionsSet];
  }

  if (hostPermissionsSet.size > 0) {
    manifest.host_permissions = [...hostPermissionsSet];
  }

  if (opts.hasBackground) {
    manifest.background = {
      service_worker: 'background.js',
      type: 'module',
    };
  }

  if (opts.requireFiles.length > 0) {
    manifest.web_accessible_resources = [
      {
        resources: opts.requireFiles,
        matches: meta.matches,
      },
    ];
  }

  return manifest;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isLocalIconPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return false;
  if (/^data:/i.test(v)) return false;
  return true;
}

export function normalizeManifestForPackaging(input: unknown): {
  manifest: Record<string, unknown>;
  notes: string[];
} {
  const notes: string[] = [];
  const base = toRecord(input) ? { ...(input as Record<string, unknown>) } : {};
  const manifest: Record<string, unknown> = base;

  if (manifest.manifest_version !== 3) {
    manifest.manifest_version = 3;
    notes.push('manifest_version 已自动修正为 3。');
  }

  const incomingIcons = toRecord(manifest.icons);
  const icons: Record<string, string> = {};
  let iconsFixed = false;

  (Object.keys(DEFAULT_ICON_PATHS) as Array<keyof typeof DEFAULT_ICON_PATHS>).forEach(size => {
    const raw = incomingIcons?.[size];
    if (isLocalIconPath(raw)) {
      icons[size] = raw;
    } else {
      icons[size] = DEFAULT_ICON_PATHS[size];
      iconsFixed = true;
    }
  });

  manifest.icons = icons;

  const action = toRecord(manifest.action) ? { ...(manifest.action as Record<string, unknown>) } : {};
  const defaultIcon = action.default_icon;

  if (typeof defaultIcon === 'string') {
    if (!isLocalIconPath(defaultIcon)) {
      action.default_icon = icons['48'];
      iconsFixed = true;
    }
  } else if (toRecord(defaultIcon)) {
    const rawIconMap = defaultIcon as Record<string, unknown>;
    const fixedIconMap: Record<string, string> = {};
    for (const size of Object.keys(DEFAULT_ICON_PATHS) as Array<keyof typeof DEFAULT_ICON_PATHS>) {
      const raw = rawIconMap[size];
      fixedIconMap[size] = isLocalIconPath(raw) ? raw : icons[size];
      if (!isLocalIconPath(raw)) iconsFixed = true;
    }
    action.default_icon = fixedIconMap;
  } else {
    action.default_icon = { ...icons };
    iconsFixed = true;
  }

  manifest.action = action;

  if (iconsFixed) {
    notes.push('已修正 manifest 图标配置为本地 icons/icon16|48|128.png，避免扩展加载时报 icons["128"] 错误。');
  }

  return { manifest, notes };
}
