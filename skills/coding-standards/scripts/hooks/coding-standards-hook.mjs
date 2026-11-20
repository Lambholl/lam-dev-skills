#!/usr/bin/env node
// coding-standards 技能的 PreToolUse / SessionStart Hook：同一会话首次写入或修改源码前（以及上下文压缩后）拦下一次，提醒先读取规范。
// 提醒必须在修改源码前送到 Agent，所以用退出码 2（Antigravity 用 deny JSON）拦下一次，重试即放行。

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REMINDER =
  '编码与注释规范门禁（coding-standards 技能）：首次修改源码或上下文压缩后，必须先读取 coding-standards 技能、对应语言/框架规则以及项目 standards/coding.md（没有则看 AGENTS.md / CLAUDE.md）。读完后重试本次写入即可放行，同会话后续写入不再拦截；批量改完源码、报告完成或提交前，对照 diff 按技能“注释自检”核对全部新增和修改的注释。';

const STATE_DIR = path.join(os.tmpdir(), 'lam-coding-standards-hook');
const STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// 文档和数据文件不按源码拦截。
const NON_CODE_FILE = /\.(md|mdx|markdown|txt|json|jsonc|lock|csv|tsv|log|svg)$/i;

/** 路径指向源码文件时返回 true；文档、数据文件和空路径返回 false。 */
export function isCodeFile(filePath) {
  return Boolean(filePath) && !NON_CODE_FILE.test(filePath);
}

/**
 * 从 Codex apply_patch 补丁文本中提取新增、修改或重命名后的目标文件路径。
 * 补丁格式不在 Codex 的 Hook 文档里；格式变化后解析不到路径时返回空数组。
 */
export function parsePatchPaths(patch) {
  const paths = [];
  let currentIndex = -1;
  for (const line of patch.split(/\r?\n/)) {
    const added = line.match(/^\*\*\* (?:Add|Update) File: (.+)$/);
    const moved = line.match(/^\*\*\* Move to: (.+)$/);
    if (added) {
      paths.push(added[1].trim());
      currentIndex = paths.length - 1;
    } else if (moved && currentIndex >= 0) {
      paths[currentIndex] = moved[1].trim();
    } else if (/^\*\*\* (?:Delete File: |End Patch)/.test(line)) {
      currentIndex = -1;
    }
  }
  return paths;
}

/** 本次工具调用会写入或修改至少一个源码文件时返回 true。 */
export function hasCodeWrite(toolName, toolInput) {
  if (toolName === 'apply_patch') {
    return parsePatchPaths(String(toolInput.command ?? '')).some(isCodeFile);
  }
  const filePath = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.Path ?? toolInput.path ?? '';
  return isCodeFile(String(filePath));
}

function sessionStateFile(sessionId, stateDir) {
  const key = crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 16);
  return path.join(stateDir, `${key}.mark`);
}

/**
 * 同一会话首次调用时返回 true 并记录标记，之后返回 false。
 * 超过 STATE_MAX_AGE_MS 的旧会话标记文件会顺带清理。
 */
export function isFirstCodeWrite(sessionId, stateDir = STATE_DIR) {
  fs.mkdirSync(stateDir, { recursive: true });
  const now = Date.now();
  for (const name of fs.readdirSync(stateDir)) {
    const file = path.join(stateDir, name);
    // 并发会话可能刚删掉这个文件。
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (stat && now - stat.mtimeMs > STATE_MAX_AGE_MS) fs.rmSync(file, { force: true });
  }
  const stateFile = sessionStateFile(sessionId, stateDir);
  if (fs.existsSync(stateFile)) return false;
  fs.writeFileSync(stateFile, '1', 'utf8');
  return true;
}

/** 清除会话的已提醒标记，使该会话下一次源码写入重新触发门禁。 */
export function resetSessionGate(sessionId, stateDir = STATE_DIR) {
  fs.rmSync(sessionStateFile(sessionId, stateDir), { force: true });
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
  // Antigravity 的输入带 conversationId，PreToolUse 带 toolCall，SessionStart 不带 toolCall。
  const isAntigravity = input.conversationId !== undefined;
  if (isAntigravity) {
    if (input.toolCall === undefined) {
      resetSessionGate(input.conversationId);
      process.stdout.write('{}');
      return;
    }
    const shouldBlock =
      hasCodeWrite(input.toolCall.name, input.toolCall.args ?? {}) && isFirstCodeWrite(input.conversationId);
    process.stdout.write(JSON.stringify(shouldBlock ? { decision: 'deny', reason: REMINDER } : { decision: 'allow' }));
    return;
  }

  const sessionId = input.session_id ?? 'unknown';
  if (input.hook_event_name === 'SessionStart') {
    resetSessionGate(sessionId);
    return;
  }

  const shouldBlock = hasCodeWrite(input.tool_name, input.tool_input ?? {}) && isFirstCodeWrite(sessionId);
  if (!shouldBlock) return;
  // 退出码 2 让 Claude Code 和 Codex 拦下这次调用，并把 stderr 交给 Agent。
  process.stderr.write(REMINDER);
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // 退出码 1 不拦截工具调用，错误显示给使用者。
    process.stderr.write(`coding-standards hook: ${error.message}\n`);
    process.exitCode = 1;
  });
}
