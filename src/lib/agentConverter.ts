// ---------------------------------------------------------------------------
// agentConverter.ts — Claude Agent via OpenRouter + tool_use + SSE streaming
// ---------------------------------------------------------------------------

export type AgentStep =
  | 'analysis'
  | 'plan_files'
  | 'write_file'
  | 'delete_file'
  | 'check'
  | 'fix'
  | 'note'
  | 'done'
  // Legacy step ids kept for backward UI compatibility.
  | 'manifest'
  | 'content_js'
  | 'background_js';

export type FileKind =
  | 'manifest'
  | 'content'
  | 'background'
  | 'asset'
  | 'vendor'
  | 'doc'
  | 'other';

export interface GeneratedFile {
  path: string;
  content: string;
  kind: FileKind;
  required: boolean;
  reason?: string;
}

export interface CheckIssue {
  id: string;
  severity: 'error' | 'warning';
  file?: string;
  message: string;
  fixHint?: string;
}

export interface CheckReport {
  pass: boolean;
  summary: string;
  issues: CheckIssue[];
}

export interface AgentProgressEvent {
  step: AgentStep;
  content: string;
  filePath?: string;
  round?: number;
  passed?: boolean;
}

export interface StreamEvent {
  toolName: string;
  content: string;
  filePath?: string;
}

export type ProgressCallback = (event: AgentProgressEvent) => void;
export type StreamCallback = (event: StreamEvent) => void;

export interface AgentConversionResult {
  analysis: string;
  files: GeneratedFile[];
  checks: CheckReport[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_analysis',
      description:
        '用中文分析 UserScript 并说明转换策略。请务必首先调用此工具，输出严格遵循以下三段式格式：\\n\\n## 核心功能\\n[2-3句说明脚本的用户侧功能]\\n\\n## 实现原理\\n[2-3句说明技术实现原理]\\n\\n## 请求权限\\n- GM_xxx：用于...（逐条列出每个 @grant 权限及其作用）',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '中文三段式分析（核心功能/实现原理/请求权限）' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_files',
      description: 'Plan which files should exist for the MV3 extension based on this script.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'A short summary of architecture decisions.' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                kind: {
                  type: 'string',
                  enum: ['manifest', 'content', 'background', 'asset', 'vendor', 'doc', 'other'],
                },
                required: { type: 'boolean' },
                reason: { type: 'string' },
              },
              required: ['path', 'kind', 'required'],
            },
          },
        },
        required: ['summary', 'files'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite one extension file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path inside extension package, e.g. manifest.json' },
          content: { type: 'string', description: 'Complete file content.' },
          kind: {
            type: 'string',
            enum: ['manifest', 'content', 'background', 'asset', 'vendor', 'doc', 'other'],
          },
          required: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['path', 'content', 'kind', 'required'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a previously planned/generated file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['path', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_check',
      description: 'Run a self-check for MV3 correctness and completeness.',
      parameters: {
        type: 'object',
        properties: {
          pass: { type: 'boolean' },
          summary: { type: 'string' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                severity: { type: 'string', enum: ['error', 'warning'] },
                file: { type: 'string' },
                message: { type: 'string' },
                fixHint: { type: 'string' },
              },
              required: ['id', 'severity', 'message'],
            },
          },
        },
        required: ['pass', 'summary', 'issues'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_fix',
      description: 'Start a fix round based on the latest run_check issues.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
        },
        required: ['summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_note',
      description: 'Add an important note or warning for the user.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an expert Chrome Extension Manifest V3 architect.

You must convert the UserScript into a complete Chrome MV3 extension using the provided tools.

Execution policy:
1) First call set_analysis.
2) Then call plan_files.
3) Then create files with write_file (and delete_file if needed).
4) Then call run_check.
5) If run_check.pass is false, call apply_fix, then perform file changes with write_file/delete_file, then call run_check again.
6) You may do at most 2 fix rounds.
7) Only finish when run_check.pass is true.

Hard constraints:
- manifest_version must be 3.
- Use service worker (no DOM in background).
- For privileged/cross-origin operations in content scripts, use message passing to background.
- Ensure manifest references only files that actually exist.
- Output full file content when writing files.`;

// ---------------------------------------------------------------------------
// Types for internal message building
// ---------------------------------------------------------------------------
interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface BuiltToolCall {
  id: string;
  name: string;
  arguments: string;
}

// ---------------------------------------------------------------------------
// JSON string field extractor (handles escape sequences in partial JSON)
// ---------------------------------------------------------------------------
function extractJsonStringField(json: string, field: string): string {
  const keyIdx = json.indexOf(`"${field}"`);
  if (keyIdx === -1) return '';
  const colonIdx = json.indexOf(':', keyIdx);
  if (colonIdx === -1) return '';
  let i = colonIdx + 1;
  while (i < json.length && (json[i] === ' ' || json[i] === '\n' || json[i] === '\r')) i++;
  if (json[i] !== '"') return '';
  i++;

  let result = '';
  while (i < json.length) {
    if (json[i] === '\\' && i + 1 < json.length) {
      const nx = json[i + 1];
      if (nx === 'n') {
        result += '\n';
        i += 2;
      } else if (nx === 't') {
        result += '\t';
        i += 2;
      } else if (nx === 'r') {
        i += 2;
      } else if (nx === '"') {
        result += '"';
        i += 2;
      } else if (nx === '\\') {
        result += '\\';
        i += 2;
      } else {
        result += nx;
        i += 2;
      }
    } else if (json[i] === '"') {
      break;
    } else {
      result += json[i++];
    }
  }
  return result;
}

function extractStreamingPayload(toolName: string, partialArgs: string): { content: string; filePath?: string } {
  if (toolName === 'set_analysis') {
    return { content: extractJsonStringField(partialArgs, 'text') };
  }
  if (toolName === 'plan_files') {
    return { content: extractJsonStringField(partialArgs, 'summary') };
  }
  if (toolName === 'write_file') {
    return {
      content: extractJsonStringField(partialArgs, 'content'),
      filePath: extractJsonStringField(partialArgs, 'path') || undefined,
    };
  }
  if (toolName === 'apply_fix') {
    return { content: extractJsonStringField(partialArgs, 'summary') };
  }
  if (toolName === 'run_check') {
    return { content: extractJsonStringField(partialArgs, 'summary') };
  }
  return { content: '' };
}

// ---------------------------------------------------------------------------
// SSE line generator
// ---------------------------------------------------------------------------
async function* parseSSELines(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      yield data;
    }
  }
}

// ---------------------------------------------------------------------------
// Non-streaming call (for subsequent turns)
// ---------------------------------------------------------------------------
interface OpenRouterResponse {
  choices: Array<{
    finish_reason: string;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    };
  }>;
  error?: { message: string };
}

function openRouterHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://script2extension.app',
    'X-Title': 'script2extension',
  };
}

async function callOpenRouter(apiKey: string, messages: OpenRouterMessage[]): Promise<OpenRouterResponse> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({ model: 'anthropic/claude-sonnet-4-5', messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 8000 }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as OpenRouterResponse;
  if (data.error) throw new Error(`OpenRouter error: ${data.error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Streaming turn (turn 0)
// ---------------------------------------------------------------------------
async function runStreamingTurn(
  apiKey: string,
  messages: OpenRouterMessage[],
  onStream: StreamCallback,
): Promise<{ assistantMessage: OpenRouterMessage; toolCalls: BuiltToolCall[]; finishReason: string }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-5',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 8000,
      stream: true,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  const tcMap = new Map<number, BuiltToolCall>();
  let finishReason = 'stop';
  let contentBuf = '';

  for await (const data of parseSSELines(res.body!.getReader())) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }

    const choice = (parsed.choices as Array<Record<string, unknown>>)?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = String(choice.finish_reason);

    const delta = (choice.delta ?? {}) as Record<string, unknown>;
    if (typeof delta.content === 'string') contentBuf += delta.content;

    const tcDeltas = delta.tool_calls as Array<Record<string, unknown>> | undefined;
    if (tcDeltas) {
      for (const d of tcDeltas) {
        const idx = Number(d.index ?? 0);
        if (!tcMap.has(idx)) tcMap.set(idx, { id: '', name: '', arguments: '' });
        const tc = tcMap.get(idx)!;
        if (d.id) tc.id = String(d.id);
        const fn = d.function as Record<string, string> | undefined;
        if (fn?.name) tc.name = fn.name;
        if (fn?.arguments) {
          tc.arguments += fn.arguments;
          const payload = extractStreamingPayload(tc.name, tc.arguments);
          if (payload.content) {
            onStream({ toolName: tc.name, content: payload.content, filePath: payload.filePath });
          }
        }
      }
    }
  }

  const toolCalls = Array.from(tcMap.values());
  const assistantMessage: OpenRouterMessage = {
    role: 'assistant',
    content: contentBuf || null,
    tool_calls: toolCalls.length > 0
      ? toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } }))
      : undefined,
  };

  return { assistantMessage, toolCalls, finishReason };
}

function parseCheckIssues(raw: unknown): CheckIssue[] {
  if (!Array.isArray(raw)) return [];
  const issues: CheckIssue[] = [];
  for (let index = 0; index < raw.length; index++) {
    const item = raw[index];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const message = typeof obj.message === 'string' ? obj.message : '';
    if (!message) continue;
    issues.push({
      id: typeof obj.id === 'string' ? obj.id : `issue_${index + 1}`,
      severity: obj.severity === 'warning' ? 'warning' : 'error',
      file: typeof obj.file === 'string' ? obj.file : undefined,
      message,
      fixHint: typeof obj.fixHint === 'string' ? obj.fixHint : undefined,
    });
  }
  return issues;
}

function hasCoreFiles(files: Map<string, GeneratedFile>): boolean {
  if (!files.has('manifest.json')) return false;
  for (const file of files.values()) {
    if (file.kind === 'content') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function convertWithAgent(
  scriptText: string,
  apiKey: string,
  onProgress: ProgressCallback,
  onStream?: StreamCallback,
): Promise<AgentConversionResult> {
  const files = new Map<string, GeneratedFile>();
  const checks: CheckReport[] = [];
  const notes: string[] = [];
  let analysis = '';
  let fixRounds = 0;
  let checkPassed = false;

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Convert this UserScript to Chrome Extension MV3:\n\`\`\`javascript\n${scriptText}\n\`\`\``,
    },
  ];

  const maxTurns = 12;

  for (let turn = 0; turn < maxTurns; turn++) {
    let assistantMsg: OpenRouterMessage;
    let rawToolCalls: BuiltToolCall[];

    if (turn === 0 && onStream) {
      const r = await runStreamingTurn(apiKey, messages, onStream);
      assistantMsg = r.assistantMessage;
      rawToolCalls = r.toolCalls;
    } else {
      const response = await callOpenRouter(apiKey, messages);
      const choice = response.choices[0];
      assistantMsg = {
        role: 'assistant',
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
      };
      rawToolCalls = (choice.message.tool_calls ?? []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }

    messages.push(assistantMsg);

    if (!rawToolCalls || rawToolCalls.length === 0) {
      if (checkPassed) break;
      if (turn < maxTurns - 1) {
        messages.push({
          role: 'user',
          content: 'Continue. Use tools only. Ensure you run run_check and pass it before finishing.',
        });
        continue;
      }
      break;
    }

    const toolResults: OpenRouterMessage[] = [];

    for (const tc of rawToolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        args = {};
      }

      switch (tc.name) {
        case 'set_analysis': {
          analysis = String(args.text ?? '');
          onProgress({ step: 'analysis', content: analysis });
          break;
        }

        case 'plan_files': {
          const summary = String(args.summary ?? '');
          onProgress({ step: 'plan_files', content: summary });
          break;
        }

        case 'write_file': {
          const path = String(args.path ?? '').trim();
          const content = String(args.content ?? '');
          const kind = ((): FileKind => {
            const raw = String(args.kind ?? 'other');
            if (
              raw === 'manifest' ||
              raw === 'content' ||
              raw === 'background' ||
              raw === 'asset' ||
              raw === 'vendor' ||
              raw === 'doc' ||
              raw === 'other'
            ) {
              return raw;
            }
            return 'other';
          })();

          if (!path) break;

          const file: GeneratedFile = {
            path,
            content,
            kind,
            required: Boolean(args.required),
            reason: typeof args.reason === 'string' ? args.reason : undefined,
          };

          files.set(path, file);
          onProgress({ step: 'write_file', content: `Wrote ${path}`, filePath: path });
          break;
        }

        case 'delete_file': {
          const path = String(args.path ?? '').trim();
          if (!path) break;
          files.delete(path);
          onProgress({
            step: 'delete_file',
            content: `Deleted ${path}${typeof args.reason === 'string' ? `: ${args.reason}` : ''}`,
            filePath: path,
          });
          break;
        }

        case 'run_check': {
          const report: CheckReport = {
            pass: Boolean(args.pass),
            summary: String(args.summary ?? ''),
            issues: parseCheckIssues(args.issues),
          };
          checks.push(report);
          onProgress({
            step: 'check',
            round: checks.length,
            content: report.summary || (report.pass ? 'Check passed' : 'Check failed'),
            passed: report.pass,
          });
          checkPassed = report.pass;
          break;
        }

        case 'apply_fix': {
          fixRounds += 1;
          onProgress({
            step: 'fix',
            round: fixRounds,
            content: String(args.summary ?? `Applying fix round #${fixRounds}`),
          });
          break;
        }

        case 'add_note': {
          const message = String(args.message ?? '').trim();
          if (message) {
            notes.push(message);
            onProgress({ step: 'note', content: message });
          }
          break;
        }

        // Legacy compatibility if model still emits old tools.
        case 'write_manifest': {
          const content = JSON.stringify((args.manifest ?? {}) as Record<string, unknown>, null, 2);
          files.set('manifest.json', {
            path: 'manifest.json',
            content,
            kind: 'manifest',
            required: true,
            reason: 'Legacy tool fallback',
          });
          onProgress({ step: 'write_file', content: 'Wrote manifest.json', filePath: 'manifest.json' });
          break;
        }

        case 'write_content_js': {
          const content = String(args.code ?? '');
          files.set('content.js', {
            path: 'content.js',
            content,
            kind: 'content',
            required: true,
            reason: 'Legacy tool fallback',
          });
          onProgress({ step: 'write_file', content: 'Wrote content.js', filePath: 'content.js' });
          break;
        }

        case 'write_background_js': {
          if (args.code == null) {
            files.delete('background.js');
            onProgress({ step: 'delete_file', content: 'Deleted background.js', filePath: 'background.js' });
          } else {
            files.set('background.js', {
              path: 'background.js',
              content: String(args.code),
              kind: 'background',
              required: false,
              reason: 'Legacy tool fallback',
            });
            onProgress({ step: 'write_file', content: 'Wrote background.js', filePath: 'background.js' });
          }
          break;
        }
      }

      toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'OK' });
    }

    messages.push(...toolResults);

    if (checkPassed) break;

    if (fixRounds >= 2 && checks.length > 0 && !checkPassed) {
      notes.push('Reached max fix rounds (2) without passing check.');
      break;
    }
  }

  if (!hasCoreFiles(files)) {
    throw new Error('Agent did not generate required files (manifest.json + at least one content file).');
  }

  if (checks.length === 0) {
    checks.push({
      pass: false,
      summary: 'Agent did not run check step.',
      issues: [{ id: 'missing_check', severity: 'error', message: 'run_check was not called.' }],
    });
  }

  const lastCheck = checks[checks.length - 1];
  if (!lastCheck.pass) {
    throw new Error(`Agent check did not pass: ${lastCheck.summary || 'unknown check failure'}`);
  }

  onProgress({ step: 'done', content: '' });

  return {
    analysis,
    files: Array.from(files.values()).sort((a, b) => a.path.localeCompare(b.path)),
    checks,
    notes,
  };
}
