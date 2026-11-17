#!/usr/bin/env node
// coding-standards 技能的 PostToolUse Hook：写入的源码新增了注释时提醒按技能自查，不限注释语言。

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REMINDER =
  '注释自查（coding-standards 技能“注释”一节，本会话没读过就先读）：注释用项目约定的语言；文档注释只写当前符号对外的契约，不写调用方、实现和架构；行内注释写原因和后果，不复述代码，不写代码没做的事；不写工单号和给评审者的自证。有问题就改，没有就继续。';

// 文档和数据文件不按源码检查。
const NON_CODE_FILE = /\.(md|mdx|markdown|txt|json|jsonc|lock|csv|tsv|log|svg)$/i;

// 注释标记后面同一行出现字母才算注释，分隔线“// -----”这类不算。
const LETTER_AFTER = String.raw`.*\p{L}`;
const SLASH = String.raw`(?:^|[\s;{}(),])(?:\/\/|\/\*)|^[ \t]*\*(?!\/)`;
// “#” 后面要有空白，排除 #include、颜色值和 shebang。
const HASH = String.raw`(?:^|\s)#\s|^[ \t]*<#`;
const DOCSTRING = String.raw`^[ \t]*[rRuU]?("""|''')`;
const DASH = String.raw`(?:^|\s)--\s`;
const HTML = String.raw`<!--`;
const BATCH = String.raw`^[ \t]*(?:@?rem\s|::)`;

const FAMILIES = [
  { pattern: /\.(c|h|cc|cpp|cxx|hpp|hh|java|kt|kts|scala|cs|go|rs|swift|dart|js|mjs|cjs|jsx|ts|mts|cts|tsx|php|css|scss|less|groovy|gradle)$/i, markers: [SLASH] },
  { pattern: /\.(py|pyi)$/i, markers: [HASH, DOCSTRING] },
  { pattern: /\.(sh|bash|zsh|rb|pl|r|ps1|psm1|psd1|ya?ml|toml|cmake|tf|nix)$|(^|[\\/])(dockerfile|makefile|cmakelists\.txt)$/i, markers: [HASH] },
  { pattern: /\.(sql|lua|hs)$/i, markers: [DASH] },
  { pattern: /\.(html?|xml|vue|svelte)$/i, markers: [HTML, SLASH] },
  { pattern: /\.(bat|cmd)$/i, markers: [BATCH] }
];
const DEFAULT_MARKERS = [SLASH, HASH];

function commentPattern(filePath) {
  const family = FAMILIES.find((item) => item.pattern.test(filePath));
  const markers = family ? family.markers : DEFAULT_MARKERS;
  return new RegExp(`(?:${markers.join('|')})${LETTER_AFTER}`, 'imu');
}

/** 一段源码文字里有注释时返回 true；按文件扩展名决定认哪些注释标记。 */
export function hasComment(filePath, text) {
  if (!filePath || NON_CODE_FILE.test(filePath)) return false;
  return commentPattern(filePath).test(text);
}

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

/** 本次写入的源码新增了注释时返回提醒，否则返回 null。只看工具输入，不读文件。 */
export function pickReminder(toolName, toolInput) {
  if (toolName === 'apply_patch') {
    const files = parsePatchAdditions(String(toolInput.command ?? ''));
    return files.some((file) => hasComment(file.filePath, file.lines.join('\n'))) ? REMINDER : null;
  }
  const filePath = toolInput.file_path ?? toolInput.notebook_path ?? '';
  const edits = Array.isArray(toolInput.edits) ? toolInput.edits.map((edit) => edit.new_string ?? '') : [];
  const text = [toolInput.content, toolInput.new_string, toolInput.new_source, ...edits].filter(Boolean).join('\n');
  return hasComment(filePath, text) ? REMINDER : null;
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
    process.stderr.write(`coding-standards hook: ${error.message}\n`);
    process.exitCode = 1;
  });
}
