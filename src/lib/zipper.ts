import JSZip from 'jszip';
import { generateIcons } from './icons';
import { normalizeManifestForPackaging } from './manifest';
import type { GeneratedFile } from './agentConverter';

export interface ZipInput {
  files: GeneratedFile[];
  requireUrls: string[];
  iconUrl: string | null;
}

async function tryFetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

function sanitizeFilename(url: string, index: number): string {
  try {
    const path = new URL(url).pathname;
    const base = path.split('/').pop() || `require_${index}.js`;
    return `require_${index}_${base.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  } catch {
    return `require_${index}.js`;
  }
}

export async function buildZip(input: ZipInput, scriptName: string): Promise<Blob> {
  const zip = new JSZip();
  const notes: string[] = [];

  const filesMap = new Map(input.files.map(file => [file.path, file]));

  // manifest.json (sanitize for loadability before writing)
  const manifestFile = filesMap.get('manifest.json') || input.files.find(file => file.kind === 'manifest') || null;
  if (!manifestFile) {
    throw new Error('No manifest.json found in generated files.');
  }

  try {
    const parsed = JSON.parse(manifestFile.content) as unknown;
    const normalized = normalizeManifestForPackaging(parsed);
    zip.file('manifest.json', JSON.stringify(normalized.manifest, null, 2));
    notes.push(...normalized.notes);
  } catch {
    zip.file('manifest.json', manifestFile.content);
    notes.push('manifest.json 解析失败，已按原始内容写入。若扩展加载失败，请检查格式。');
  }

  // Write all generated files except manifest.json (already normalized and written above).
  for (const file of input.files) {
    if (file.path === 'manifest.json' || file.path === manifestFile.path) continue;
    zip.file(file.path, file.content);
  }

  // @require files — fetch only if not already generated.
  for (let i = 0; i < input.requireUrls.length; i++) {
    const url = input.requireUrls[i];
    const filename = sanitizeFilename(url, i);
    if (filesMap.has(filename)) continue;

    const text = await tryFetchText(url);
    if (text !== null) {
      zip.file(filename, text);
    } else {
      notes.push(
        `Could not fetch @require URL: ${url}\n` +
          `Please download it manually and save as "${filename}" next to manifest.json.`
      );
    }
  }

  // Icons — ignore remote icon text conversion; always generate local PNG fallback.
  if (input.iconUrl) {
    const remoteIcon = await tryFetchText(input.iconUrl);
    if (remoteIcon === null) {
      notes.push(`Could not fetch icon URL: ${input.iconUrl}`);
    }
  }

  try {
    const iconFolder = zip.folder('icons')!;
    const icons = await generateIcons(scriptName);
    for (const [size, blob] of Object.entries(icons)) {
      const path = `icons/icon${size}.png`;
      if (!filesMap.has(path)) {
        iconFolder.file(`icon${size}.png`, blob);
      }
    }
  } catch {
    notes.push('Could not generate placeholder icons. Please add icons/icon16.png, icon48.png, icon128.png manually.');
  }

  if (notes.length > 0) {
    zip.file(
      'NOTES.md',
      `# Manual Steps Required\n\n` + notes.map((n, i) => `## Issue ${i + 1}\n\n${n}`).join('\n\n') + '\n'
    );
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
