export function isGreasyForkUrl(url: string): boolean {
  return /greasyfork\.org/.test(url);
}

function extractScriptId(url: string): string | null {
  const m = url.match(/\/scripts\/(\d+)/);
  return m ? m[1] : null;
}

function parseNameFromMeta(metaText: string): string | null {
  const m = metaText.match(/\/\/\s*@name\s+(.+)/);
  return m ? m[1].trim() : null;
}

export async function fetchFromGreasyFork(url: string): Promise<string> {
  const scriptId = extractScriptId(url);
  if (!scriptId) {
    throw new Error('Could not extract script ID from URL. Expected format: greasyfork.org/scripts/{ID}');
  }

  // Step 1: fetch meta.js to get the script name
  const metaUrl = `https://update.greasyfork.org/scripts/${scriptId}.meta.js`;
  const metaRes = await fetch(metaUrl);
  if (!metaRes.ok) {
    throw new Error(`Failed to fetch meta.js (${metaRes.status}): ${metaUrl}`);
  }
  const metaText = await metaRes.text();
  const name = parseNameFromMeta(metaText);
  if (!name) {
    throw new Error('Could not parse @name from meta.js');
  }

  // Step 2: fetch full .user.js using encoded name
  const encodedName = encodeURIComponent(name);
  const scriptUrl = `https://update.greasyfork.org/scripts/${scriptId}/${encodedName}.user.js`;
  const scriptRes = await fetch(scriptUrl);
  if (!scriptRes.ok) {
    throw new Error(`Failed to fetch script (${scriptRes.status}): ${scriptUrl}`);
  }

  return scriptRes.text();
}
