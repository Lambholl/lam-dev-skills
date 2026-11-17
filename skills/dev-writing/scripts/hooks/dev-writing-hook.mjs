#!/usr/bin/env node
// dev-writing 技能的 PostToolUse Hook：写入 Markdown 后提醒按技能自查。

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DOC_FILE = /\.(md|mdx|markdown)$/i;

const REMINDER =
  '文档自查（dev-writing 技能，本会话没读过就先读）：先定读者；结论在前；门禁、验证状态、缺口、范围决定和技术约束写清；删掉套话和防御性表达；不写对话来历、维护者设备和环境标识。有问题就改，没有就继续。';

/**
 * 把 Codex apply_patch 的补丁文本按文件拆开，返回每个文件的路径和新增行（已去掉行首的 +）。
 * 补丁格式不在 Codex 的 Hook 文档里；格式变化后解析不到文件，这次写入就没有提醒。
 */
export function parsePatchAdditions(patch) {
  const files = [];
  let current = null;
  for (const line of patch.split(/\r?\n/)) {
    const added = line.match(/^\*\*\* (?:Add|Update) File: (.+)$/);
    const moved = line.match(/^\*\*\* Move to: (.+)$/);
    if (added) {
      current = { filePath: added[1].trim(), lines: [] };
      files.push(current);
    } else if (moved && current) {
      current.filePath = moved[1].trim();
    } else if (/^\*\*\* (?:Delete File: |End Patch)/.test(line)) {
      current = null;
    } else if (current && line.startsWith('+')) {
      current.lines.push(line.slice(1));
    }
  }
  return files;
}

/** 本次写入了 Markdown 的非空内容时返回提醒，否则返回 null。只看工具输入，不读文件。 */
export function pickReminder(toolName, toolInput) {
  if (toolName === 'apply_patch') {
    const files = parsePatchAdditions(String(toolInput.command ?? ''));
    return files.some((file) => DOC_FILE.test(file.filePath) && file.lines.join('').trim()) ? REMINDER : null;
  }
  const filePath = toolInput.file_path ?? toolInput.notebook_path ?? '';
  if (!DOC_FILE.test(filePath)) return null;
  const edits = Array.isArray(toolInput.edits) ? toolInput.edits.map((edit) => edit.new_string ?? '') : [];
  const text = [toolInput.content, toolInput.new_string, toolInput.new_source, ...edits].filter(Boolean).join('');
  return text.trim() ? REMINDER : null;
}

async function readStdin() {
  let raw = '';
  // 按字符解码，多字节字符被拆进不同数据块时才不会损坏。
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function main() {
  const input = JSON.parse(await readStdin());
  const reminder = pickReminder(input.tool_name, input.tool_input ?? {});
  if (reminder) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder } }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // 退出码 1 不拦截工具调用，错误显示给使用者。
    process.stderr.write(`dev-writing hook: ${error.message}\n`);
    process.exitCode = 1;
  });
}
