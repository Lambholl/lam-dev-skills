#!/usr/bin/env node
// coding-standards 技能的 PreToolUse / SessionStart Hook：同一会话首次写入或修改项目源码前（以及上下文压缩后）拦下，提醒完整读取规范。
// 并行窗口内继续拦截以防同一批并发写入穿透；窗口过后重试放行。

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REMINDER =
  '编码与注释规范门禁（coding-standards 技能）：首次修改项目源码或上下文压缩后，必须先完整读取 coding-standards 技能、对应语言/框架规则以及项目 standards/coding.md（没有则看 AGENTS.md / CLAUDE.md），禁止截断读取。读完后重试本次写入即可放行，同会话后续写入不再拦截；批量改完源码、报告完成或提交前，按技能“注释自检”核对 git diff HEAD 及新建源码文件的全部注释。';

const STATE_DIR = path.join(os.tmpdir(), 'lam-coding-standards-hook');
const STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PARALLEL_WINDOW_MS = 3000;

// 文档、配置和数据文件不按源码拦截。
const NON_CODE_FILE = /\.(md|mdx|markdown|txt|json|jsonc|lock|csv|tsv|log|svg|yml|yaml|toml|ini|html|css)$/i;
// 一次性分析/调试脚本目录不按项目源码拦截。
const TEMP_SEGMENT = /(?:^|\/)(?:scratchpad|\.gemini\/antigravity\/brain)(?:\/|$)|^\/tmp(?:\/|$)/i;

function toPosix(value) {
  return String(value).replaceAll('\\', '/');
}

/** 路径位于系统临时目录或一次性工作区时返回 true。 */
export function isTempPath(filePath, tmpDir = os.tmpdir()) {
  if (!filePath) return false;
  const normalized = toPosix(filePath);
  if (TEMP_SEGMENT.test(normalized)) return true;
  if (!path.isAbsolute(filePath)) return false;
  const resolved = path.resolve(filePath);
  const resolvedTmp = path.resolve(tmpDir);
  const prefix = resolvedTmp.endsWith(path.sep) ? resolvedTmp : `${resolvedTmp}${path.sep}`;
  if (process.platform === 'win32') {
    return resolved.toLowerCase().startsWith(prefix.toLowerCase());
  }
  return resolved.startsWith(prefix);
}

/** 路径指向项目源码文件时返回 true；文档、配置、数据文件、临时路径和空路径返回 false。 */
export function isCodeFile(filePath, tmpDir = os.tmpdir()) {
  return Boolean(filePath) && !NON_CODE_FILE.test(filePath) && !isTempPath(filePath, tmpDir);
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

/** 本次工具调用会写入或修改至少一个项目源码文件时返回 true。 */
export function hasCodeWrite(toolName, toolInput, tmpDir = os.tmpdir()) {
  if (toolName === 'apply_patch') {
    return parsePatchPaths(String(toolInput.command ?? '')).some((filePath) => isCodeFile(filePath, tmpDir));
  }
  const filePath = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.Path ?? toolInput.path ?? '';
  return isCodeFile(String(filePath), tmpDir);
}

function sessionStateFile(sessionId, stateDir) {
  const key = crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 16);
  return path.join(stateDir, `${key}.json`);
}

function pruneOldState(stateDir, now) {
  fs.mkdirSync(stateDir, { recursive: true });
  for (const name of fs.readdirSync(stateDir)) {
    const file = path.join(stateDir, name);
    // 并发会话可能刚删掉这个文件。
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (stat && now - stat.mtimeMs > STATE_MAX_AGE_MS) fs.rmSync(file, { force: true });
  }
}

function loadState(sessionId, stateDir) {
  const file = sessionStateFile(sessionId, stateDir);
  if (!fs.existsSync(file)) return { unlocked: false, blockedAt: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      unlocked: Boolean(parsed.unlocked),
      blockedAt: typeof parsed.blockedAt === 'number' ? parsed.blockedAt : null
    };
  } catch {
    return { unlocked: false, blockedAt: null };
  }
}

function saveState(sessionId, state, stateDir, now) {
  pruneOldState(stateDir, now);
  fs.writeFileSync(sessionStateFile(sessionId, stateDir), JSON.stringify(state), 'utf8');
}

/**
 * 判断本次源码写入是否应拦截。
 * 首次调用及 parallelWindowMs 内的并发重试返回 true；窗口过后重试解锁并返回 false。
 */
export function shouldBlockCodeWrite(
  sessionId,
  { stateDir = STATE_DIR, now = Date.now(), parallelWindowMs = PARALLEL_WINDOW_MS } = {}
) {
  const state = loadState(sessionId, stateDir);
  if (state.unlocked) return false;
  if (state.blockedAt === null) {
    saveState(sessionId, { unlocked: false, blockedAt: now }, stateDir, now);
    return true;
  }
  if (now - state.blockedAt < parallelWindowMs) return true;
  saveState(sessionId, { unlocked: true, blockedAt: null }, stateDir, now);
  return false;
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
      hasCodeWrite(input.toolCall.name, input.toolCall.args ?? {}) && shouldBlockCodeWrite(input.conversationId);
    process.stdout.write(JSON.stringify(shouldBlock ? { decision: 'deny', reason: REMINDER } : { decision: 'allow' }));
    return;
  }

  const sessionId = input.session_id ?? 'unknown';
  if (input.hook_event_name === 'SessionStart') {
    resetSessionGate(sessionId);
    return;
  }

  const shouldBlock = hasCodeWrite(input.tool_name, input.tool_input ?? {}) && shouldBlockCodeWrite(sessionId);
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
