#!/usr/bin/env node
// coding-standards 技能的 PreToolUse / SessionStart Hook：同一会话首次写入或修改项目源码前（以及上下文压缩后）拦下，提醒完整读取规范。
// 并行窗口内继续拦截以防同一批并发写入穿透；窗口过后重试放行。
// Claude Code 压缩后会把通过 Skill 工具调用过的 SKILL.md 全文重新注入，所以压缩后的提醒只要求重读语言规则和项目约定；
// Codex 和 Antigravity 压缩后只留摘要，仍要求全部重读。

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REMINDER_PREFIX = '编码与注释规范门禁（coding-standards 技能）：';
const PROJECT_RULES = '对应语言/框架规则以及项目 standards/coding.md（没有则看 AGENTS.md / CLAUDE.md），禁止截断读取。';
const REMINDER_SUFFIX =
  '读完后重试本次写入即可放行，同会话后续写入不再拦截；批量改完源码、报告完成或提交前，按技能“注释自检”核对 git diff HEAD 及新建源码文件的全部注释。';

/** Codex 和 Antigravity 的提醒：压缩后只留摘要，首次写入和压缩后都要求完整读取技能。 */
const FULL_REMINDER = `${REMINDER_PREFIX}首次修改项目源码或上下文压缩后，必须先完整读取 coding-standards 技能的 SKILL.md、${PROJECT_RULES}${REMINDER_SUFFIX}`;

/** Claude Code 首次写入的提醒：用 Skill 工具加载，压缩后正文才会被重新注入。 */
const CLAUDE_REMINDER = `${REMINDER_PREFIX}首次修改项目源码前，必须先用 Skill 工具调用 coding-standards 技能，并完整读取${PROJECT_RULES}${REMINDER_SUFFIX}`;

/** Claude Code 压缩后的提醒：技能正文已重新注入，只要求重读细则。 */
const CLAUDE_COMPACT_REMINDER = `${REMINDER_PREFIX}上下文刚压缩过。通过 Skill 工具调用过的 coding-standards 正文若已重新注入上下文，不必重读；上下文里找不到该技能正文时，先用 Skill 工具调用它。压缩不保留 references 和项目文件，必须重新完整读取${PROJECT_RULES}${REMINDER_SUFFIX}`;

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
  if (!fs.existsSync(file)) return { unlocked: false, blockedAt: null, wasCompacted: false };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      unlocked: Boolean(parsed.unlocked),
      blockedAt: typeof parsed.blockedAt === 'number' ? parsed.blockedAt : null,
      wasCompacted: Boolean(parsed.wasCompacted)
    };
  } catch {
    return { unlocked: false, blockedAt: null, wasCompacted: false };
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
    saveState(sessionId, { ...state, blockedAt: now }, stateDir, now);
    return true;
  }
  if (now - state.blockedAt < parallelWindowMs) return true;
  saveState(sessionId, { unlocked: true, blockedAt: null, wasCompacted: false }, stateDir, now);
  return false;
}

/**
 * 清除会话的已提醒标记，使该会话下一次源码写入重新触发门禁。
 * wasCompacted 为 true 时记下这次重置来自上下文压缩，供 isCompactedGate 读取。
 */
export function resetSessionGate(sessionId, stateDir = STATE_DIR, { wasCompacted = false } = {}) {
  const now = Date.now();
  if (wasCompacted) {
    saveState(sessionId, { unlocked: false, blockedAt: null, wasCompacted: true }, stateDir, now);
  } else {
    fs.rmSync(sessionStateFile(sessionId, stateDir), { force: true });
  }
}

/** 会话的门禁由上下文压缩重置、且还没有放行过时返回 true。 */
export function isCompactedGate(sessionId, stateDir = STATE_DIR) {
  const state = loadState(sessionId, stateDir);
  return !state.unlocked && state.wasCompacted;
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
    process.stdout.write(JSON.stringify(shouldBlock ? { decision: 'deny', reason: FULL_REMINDER } : { decision: 'allow' }));
    return;
  }

  const sessionId = input.session_id ?? 'unknown';
  if (input.hook_event_name === 'SessionStart') {
    resetSessionGate(sessionId, STATE_DIR, { wasCompacted: input.source === 'compact' });
    return;
  }

  const toolName = input.tool_name;
  if (!hasCodeWrite(toolName, input.tool_input ?? {})) return;
  // 先读压缩标记：shouldBlockCodeWrite 放行时会清掉它。
  const wasCompacted = isCompactedGate(sessionId);
  if (!shouldBlockCodeWrite(sessionId)) return;
  // Codex 写文件只用 apply_patch，靠工具名区分 Codex 和 Claude Code。
  const isCodex = toolName === 'apply_patch';
  const reminder = isCodex ? FULL_REMINDER : wasCompacted ? CLAUDE_COMPACT_REMINDER : CLAUDE_REMINDER;
  // 退出码 2 让 Claude Code 和 Codex 拦下这次调用，并把 stderr 交给 Agent。
  process.stderr.write(reminder);
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // 退出码 1 不拦截工具调用，错误显示给使用者。
    process.stderr.write(`coding-standards hook: ${error.message}\n`);
    process.exitCode = 1;
  });
}
