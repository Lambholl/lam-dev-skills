#!/usr/bin/env node
// git-workflow 技能的 PreToolUse Hook：同一会话里每份提交信息第一次执行 git commit、gh pr create、gh pr edit 时拦下，给出自查清单。
// 提醒必须在提交发生前送到 Agent，所以用退出码 2 拦下，而不是用不拦截的 additionalContext。

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REMINDER =
  '提交信息自查（git-workflow 技能，本会话没读过就先读）：标题用 type(scope): 描述，语言跟随项目；正文可选，标题说得清就不写；要写就只写 diff 看不出的原因、行为变化和风险，第一句写原因，不复述标题，其余变化和取舍分点、每点一句；不写测试结果、实现步骤、逐文件清单、记忆编号、对话过程、维护者设备和环境标识。改动含源码时，同时核对本次 diff 新增和修改的注释（只写对外契约、已有常量直接引用常量名、不写没做的事和版本历史、与实现一致）。查过没问题就原样重新执行，提交信息不变就会放行；改过信息会再提醒一次。';

const STATE_DIR = path.join(os.tmpdir(), 'lam-git-workflow-hook');
const STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const HEREDOC = /<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2(?=[\s)]|$)/g;
const POWERSHELL_HERE_STRING = /@(['"])\n([\s\S]*?)\n\1@/g;
// 命令段开头允许的前缀：括号、环境变量赋值。
const SEGMENT_PREFIX = String.raw`^[\s({]*(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|\S*)\s+)*`;
const QUOTED_OR_WORD = String.raw`(?:"[^"]*"|'[^']*'|\S+)`;
// git 的全局选项可以出现在子命令之前，如 git -C repo commit。
const GIT_COMMIT = new RegExp(
  `${SEGMENT_PREFIX}git(?:\\.exe)?(?:\\s+(?:-[Cc]\\s+${QUOTED_OR_WORD}|--[\\w-]+(?:=${QUOTED_OR_WORD})?|-[A-Za-z]))*\\s+commit(?:\\s|$)`
);
const GH_PR = new RegExp(`${SEGMENT_PREFIX}gh(?:\\.exe)?\\s+pr\\s+(?:create|edit)(?:\\s|$)`);
// git commit 的 -m、-am、--message、-F、--file 和 gh pr 的 --title、-t、--body、-b、--body-file、-F。
const MESSAGE_FLAG =
  /(?:^|\s)(?:--body-file|--message|--title|--body|--file|-[a-zA-Z]*m|-[tbF])(?:=|[ \t]+)?(?:"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'|([^\s;&|]+))/g;

/** 返回 Bash、PowerShell 或 run_command 工具输入里的命令文字；Codex 可能把命令写成参数数组。 */
export function commandText(toolInput) {
  const command = toolInput.command ?? toolInput.cmd ?? toolInput.CommandLine ?? '';
  return Array.isArray(command) ? command.join(' ') : String(command);
}

function stripHereDocuments(command) {
  return command.replace(HEREDOC, '').replace(POWERSHELL_HERE_STRING, '');
}

/** 把命令按换行、`;`、`&&`、`||`、`|`、`&` 拆成段，返回会写入新提交信息或 PR 信息的那些段。 */
export function commitSegments(command) {
  return stripHereDocuments(command.replace(/\r\n/g, '\n'))
    .split(/\n|;|&&|\|\||\||&/)
    .filter((segment) => (GIT_COMMIT.test(segment) && !/--no-edit(?:\s|$)/.test(segment)) || GH_PR.test(segment));
}

export function isCommitCommand(command) {
  return commitSegments(command).length > 0;
}

/**
 * 返回判断“是不是同一份提交信息”用的文字。
 * 信息取自第一个提交命令之后的 heredoc、PowerShell here-string 和信息参数，所以命令前后增减 git add、git status 时结果不变。
 * 信息写在文件里时取文件路径。取不到信息时（打开编辑器写）返回整条命令。
 */
export function commitIdentity(command) {
  const normalized = command.replace(/\r\n/g, '\n');
  const firstSegment = commitSegments(normalized)[0];
  const start = firstSegment ? normalized.indexOf(firstSegment.trim()) : 0;
  const parts = [];
  const flagsText = normalized
    .slice(Math.max(start, 0))
    .replace(HEREDOC, (_match, _quote, _tag, body) => {
      parts.push(body);
      return '';
    })
    .replace(POWERSHELL_HERE_STRING, (_match, _quote, body) => {
      parts.push(body);
      return '';
    });
  for (const match of flagsText.matchAll(MESSAGE_FLAG)) {
    parts.push(match[1] ?? match[2] ?? match[3]);
  }
  return parts.length > 0 ? parts.join('\0') : command;
}

/**
 * 同一会话里某份提交信息第一次出现时返回 true 并记下它，之后返回 false。
 * 记录按会话分文件存在 stateDir，超过一天的记录文件顺带删除。
 */
export function isFirstAttempt(sessionId, identity, stateDir = STATE_DIR) {
  fs.mkdirSync(stateDir, { recursive: true });
  const now = Date.now();
  for (const name of fs.readdirSync(stateDir)) {
    const file = path.join(stateDir, name);
    // 并发的会话可能刚删掉这个文件。
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (stat && now - stat.mtimeMs > STATE_MAX_AGE_MS) fs.rmSync(file, { force: true });
  }
  const sessionKey = crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 16);
  const stateFile = path.join(stateDir, `${sessionKey}.json`);
  const commitKey = crypto.createHash('sha256').update(identity).digest('hex');
  const seen = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : [];
  if (seen.includes(commitKey)) return false;
  seen.push(commitKey);
  fs.writeFileSync(stateFile, JSON.stringify(seen), 'utf8');
  return true;
}

async function readStdin() {
  let raw = '';
  // 按字符解码，大段中文被拆进多个数据块时汉字才不会在块边界损坏。
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function main() {
  const input = JSON.parse(await readStdin());
  // Antigravity 的输入是 { conversationId, toolCall: { name, args } }，Claude Code 和 Codex 是 { session_id, tool_input }。
  const isAntigravity = input.toolCall !== undefined;
  const command = commandText((isAntigravity ? input.toolCall.args : input.tool_input) ?? {});
  const sessionId = input.session_id ?? input.conversationId ?? 'unknown';
  const block = isCommitCommand(command) && isFirstAttempt(sessionId, commitIdentity(command));
  if (isAntigravity) {
    // Antigravity 只认 stdout 里必填的 decision，没有用退出码拦截的约定。
    process.stdout.write(JSON.stringify(block ? { decision: 'deny', reason: REMINDER } : { decision: 'allow' }));
    return;
  }
  if (!block) return;
  // 退出码 2 让 Claude Code 和 Codex 拦下这次调用，并把 stderr 交给 Agent。
  process.stderr.write(REMINDER);
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // 退出码 1 不拦截工具调用，错误显示给使用者。
    process.stderr.write(`git-workflow hook: ${error.message}\n`);
    process.exitCode = 1;
  });
}
