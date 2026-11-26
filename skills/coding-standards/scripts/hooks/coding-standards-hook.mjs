#!/usr/bin/env node
// coding-standards 技能的 Hook：按目标源码的语言/框架和项目 coding.md 检查本会话是否完整读过规范；
// 未读齐前拦下源码写入，通过 PostToolUse（及 Claude Code 的 /coding-standards）观测完整读取后放行；
// SessionStart（含上下文压缩）重置已读状态，Claude Code 压缩前经 Skill 工具加载的 SKILL.md 除外。

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STATE_DIR = path.join(os.tmpdir(), 'lam-coding-standards-hook');
const STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CODEX_FALLBACK_ATTEMPTS = 2;
const CODEX_FALLBACK_WINDOW_MS = 10 * 1000;

// 一次性分析/调试脚本目录不按项目源码拦截。
const TEMP_SEGMENT = /(?:^|\/)(?:scratchpad|\.gemini\/antigravity\/brain)(?:\/|$)|^\/tmp(?:\/|$)/i;

// 每个目标文件扩展名对应的必读规范组；组内多项表示任读其一即可（如 .h 读 c.md 或 cpp.md）。
const EXTENSION_DOCS = {
  '.ts': [['languages/typescript.md']],
  '.mts': [['languages/typescript.md']],
  '.cts': [['languages/typescript.md']],
  '.tsx': [['languages/typescript.md'], ['frameworks/react.md']],
  '.js': [['languages/javascript.md']],
  '.mjs': [['languages/javascript.md']],
  '.cjs': [['languages/javascript.md']],
  '.jsx': [['languages/javascript.md'], ['frameworks/react.md']],
  '.vue': [['frameworks/vue.md']],
  '.java': [['languages/java.md']],
  '.py': [['languages/python.md']],
  '.pyi': [['languages/python.md']],
  '.cs': [['languages/csharp.md']],
  '.c': [['languages/c.md']],
  '.h': [['languages/c.md', 'languages/cpp.md']],
  '.cpp': [['languages/cpp.md']],
  '.cc': [['languages/cpp.md']],
  '.cxx': [['languages/cpp.md']],
  '.hpp': [['languages/cpp.md']],
  '.hh': [['languages/cpp.md']],
  '.hxx': [['languages/cpp.md']],
  '.rs': [['languages/rust.md']],
  '.sh': [['languages/shell.md']],
  '.bash': [['languages/shell.md']],
  '.zsh': [['languages/shell.md']],
  '.ps1': [['languages/powershell.md']],
  '.psm1': [['languages/powershell.md']],
  '.psd1': [['languages/powershell.md']]
};

// 无专属语言规范文件的常见编程语言，只要求读取 SKILL.md（及项目 standards/coding.md）。
const EXTRA_CODE_EXTENSIONS = new Set([
  '.go',
  '.kt',
  '.swift',
  '.rb',
  '.php',
  '.dart',
  '.lua',
  '.scala',
  '.r',
  '.m',
  '.mm'
]);

const READ_COMMAND = /(?:^|[|;&(\s])(?:cat|nl|Get-Content|gc|type)(?:\s|$)/i;
const TRUNCATE_COMMAND =
  /(?:^|[|;&(\s])(?:head|tail)(?:\s|$)|(?:^|[|;&(\s])sed\s+-n(?:\s|$)|Select-Object\s+-(?:First|Last)\b|-(?:TotalCount|First|Last|Tail)\b/i;
const BASH_READ_ERROR =
  /^(?:cat|nl|sed|head|tail|Get-Content): .*(?:No such file|cannot find|Is a directory|Permission denied)/im;
const CD_COMMAND = /^\s*(?:cd|pushd|Set-Location|sl)\s+("[^"]*"|'[^']*'|\S+)\s*$/i;
const SHELL_TOKEN = /"([^"]*)"|'([^']*)'|[^\s"'|;&()<>]+/g;
// Claude Code 的 Bash 工具把超过这个字符数的输出截断后才交给模型，可用环境变量 BASH_MAX_OUTPUT_LENGTH 调整。
// Hook 收到的 stdout 可能仍是截断前的全文，所以除了比对内容还要按长度判断。
const CLAUDE_SHELL_OUTPUT_LIMIT = Number(process.env.BASH_MAX_OUTPUT_LENGTH) || 30000;

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

/** 路径指向已知编程语言源码文件（非临时路径）时返回 true。 */
export function isCodeFile(filePath, tmpDir = os.tmpdir()) {
  if (!filePath || isTempPath(filePath, tmpDir)) return false;
  const ext = path.extname(filePath).toLowerCase();
  return Boolean(EXTENSION_DOCS[ext]) || EXTRA_CODE_EXTENSIONS.has(ext);
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

/** 从目标路径或 cwd 往上查找 `.project-memory/standards/coding.md`，存在时返回 true。 */
export function hasProjectCodingStandard(targetPaths = [], cwd) {
  const roots = [];
  for (const rawPath of targetPaths) {
    if (!rawPath) continue;
    if (path.isAbsolute(rawPath)) {
      roots.push(path.dirname(rawPath));
    } else if (cwd) {
      roots.push(path.resolve(cwd, path.dirname(rawPath)));
    }
  }
  if (cwd) roots.push(path.resolve(cwd));
  for (const startDir of roots) {
    let current = startDir;
    while (true) {
      const candidate = path.join(current, '.project-memory', 'standards', 'coding.md');
      if (fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) return true;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return false;
}

/** 返回单个源码文件要求读取的规范组列表；非源码或临时文件返回空数组。 */
export function requiredDocsForFile(filePath, { tmpDir = os.tmpdir(), hasProjectCoding = false } = {}) {
  if (!isCodeFile(filePath, tmpDir)) return [];
  const ext = path.extname(filePath).toLowerCase();
  const groups = [['SKILL.md'], ...(EXTENSION_DOCS[ext] ?? [])];
  if (hasProjectCoding) groups.push(['standards/coding.md']);
  return groups;
}

/** 返回本次写入工具调用涉及的全部必读规范组（去重）；不涉及源码时返回空数组。 */
export function requiredDocsForWrite(toolName, toolInput, { tmpDir = os.tmpdir(), cwd } = {}) {
  const rawPaths =
    toolName === 'apply_patch'
      ? parsePatchPaths(String(toolInput.command ?? ''))
      : [toolInput.file_path ?? toolInput.notebook_path ?? toolInput.Path ?? toolInput.path ?? ''];
  const codePaths = rawPaths.map(String).filter((filePath) => isCodeFile(filePath, tmpDir));
  if (!codePaths.length) return [];
  const hasProjectCoding = hasProjectCodingStandard(codePaths, cwd);
  const groups = [];
  const seen = new Set();
  for (const filePath of codePaths) {
    for (const group of requiredDocsForFile(filePath, { tmpDir, hasProjectCoding })) {
      const key = group.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        groups.push(group);
      }
    }
  }
  return groups;
}

function docKeyFromPath(filePath) {
  const normalized = toPosix(filePath);
  if (/(?:^|\/)coding-standards\/SKILL\.md$/i.test(normalized)) return 'SKILL.md';
  const ref = normalized.match(/(?:^|\/)coding-standards\/references\/(languages|frameworks)\/([a-z]+\.md)$/i);
  if (ref) return `${ref[1].toLowerCase()}/${ref[2].toLowerCase()}`;
  if (/(?:^|\/)\.project-memory\/standards\/coding\.md$/i.test(normalized)) return 'standards/coding.md';
  return null;
}

function commandText(toolInput) {
  const command = toolInput.command ?? toolInput.cmd ?? toolInput.CommandLine ?? '';
  return Array.isArray(command) ? command.join(' ') : String(command);
}

function isFailedBashResponse(toolResponse) {
  if (!toolResponse) return false;
  if (typeof toolResponse === 'object' && typeof toolResponse.exit_code === 'number' && toolResponse.exit_code !== 0) {
    return true;
  }
  const text = typeof toolResponse === 'string' ? toolResponse : String(toolResponse.output ?? toolResponse.stderr ?? '');
  return BASH_READ_ERROR.test(text);
}

function splitCommandSegments(command) {
  return command.replace(/\r\n/g, '\n').split(/\n|;|&&|\|\|/);
}

function unquote(value) {
  return value.replace(/^(["'])(.*)\1$/, '$2');
}

function resolveShellPath(token, baseDir, home) {
  let value = token.replace(/^(?:~|\$HOME|\$\{HOME\}|\$env:USERPROFILE)(?=$|[/\\])/i, home);
  // Git Bash 把盘符写成 /d/...，Node 在 Windows 上要换成 D:/... 才能定位文件。
  if (process.platform === 'win32') value = value.replace(/^\/([a-z])(?=\/|$)/i, (_, drive) => `${drive.toUpperCase()}:`);
  return path.resolve(baseDir, value);
}

function splitTextLines(text) {
  return text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).map((line) => line.trimEnd());
}

/**
 * 文件的每个非空行都按原顺序出现在输出中时返回 true。
 * 比较前统一 CRLF、CR 和 LF，并忽略 BOM 和行尾空白；输出行只要以文件行结尾即可，`cat -n`、`nl` 加的行号不影响结果。
 */
function isFileContentShown(fileText, outputText) {
  const outputLines = splitTextLines(outputText);
  let cursor = 0;
  for (const line of splitTextLines(fileText)) {
    if (!line) continue;
    while (cursor < outputLines.length && !outputLines[cursor].endsWith(line)) cursor += 1;
    if (cursor === outputLines.length) return false;
    cursor += 1;
  }
  return true;
}

// Claude Code 的 Shell 读取按实际输出核对：命令里出现的规范文件只有内容完整出现在输出里、且输出没有超出 outputLimit 时才算读完。
function inspectShellOutput(command, toolResponse, { cwd, home, outputLimit }) {
  const unlocked = new Set();
  const truncated = new Set();
  const stdout = toolResponse.stdout;
  const stderr = String(toolResponse.stderr ?? '');
  const isOverLimit = stdout.length + stderr.length > outputLimit;
  let baseDir = path.resolve(cwd ?? process.cwd());
  for (const segment of splitCommandSegments(command)) {
    const cd = segment.match(CD_COMMAND);
    if (cd) {
      baseDir = resolveShellPath(unquote(cd[1]), baseDir, home);
      continue;
    }
    const isTruncating = TRUNCATE_COMMAND.test(segment);
    if (!isTruncating && !READ_COMMAND.test(segment)) continue;
    for (const match of segment.matchAll(SHELL_TOKEN)) {
      const filePath = resolveShellPath(match[1] ?? match[2] ?? match[0], baseDir, home);
      const key = docKeyFromPath(filePath);
      if (!key) continue;
      let fileText;
      try {
        fileText = fs.readFileSync(filePath, 'utf8');
      } catch {
        // 命令里写的路径不存在或读不了时，这次调用不可能读到该文件，不记账。
        continue;
      }
      if (!isTruncating && !isOverLimit && isFileContentShown(fileText, stdout)) unlocked.add(key);
      else truncated.add(key);
    }
  }
  for (const doc of unlocked) truncated.delete(doc);
  return { unlocked: [...unlocked], truncated: [...truncated], usedSkillTool: false };
}

/**
 * 检查一次读取工具调用是否完整读取了 coding-standards 规范或项目 standards/coding.md。
 * 返回本次解锁的规范键、未能确认完整读取（截断命令、输出超限或输出与文件不一致）的规范键，以及是否经 Claude Code Skill 工具加载。
 * Claude Code 的 Bash 和 PowerShell 结果（toolResponse 带 stdout）按 cwd 解析命令里的相对路径，并按 outputLimit 判断输出是否被截断。
 */
export function inspectDocReads(
  toolName,
  toolInput,
  { toolResponse, toolError, cwd, home = os.homedir(), outputLimit = CLAUDE_SHELL_OUTPUT_LIMIT } = {}
) {
  const unlocked = new Set();
  const truncated = new Set();
  let usedSkillTool = false;

  if (toolError) return { unlocked: [], truncated: [], usedSkillTool: false };

  if (toolName === 'Skill') {
    const skill = String(toolInput.skill ?? '').trim();
    if (/(?:^|:)coding-standards$/i.test(skill)) {
      unlocked.add('SKILL.md');
      usedSkillTool = true;
    }
    return { unlocked: [...unlocked], truncated: [], usedSkillTool };
  }

  if (toolName === 'Read' || toolName === 'read_file') {
    const key = docKeyFromPath(String(toolInput.file_path ?? toolInput.path ?? toolInput.Path ?? ''));
    if (key) {
      const isTruncated =
        toolName === 'read_file'
          ? (toolInput.EndLine !== undefined && toolInput.EndLine !== null) ||
            (toolInput.StartLine !== undefined && toolInput.StartLine !== null && Number(toolInput.StartLine) > 1)
          : (toolInput.limit !== undefined && toolInput.limit !== null) ||
            (toolInput.offset !== undefined && toolInput.offset !== null && Number(toolInput.offset) > 1);
      if (isTruncated) truncated.add(key);
      else unlocked.add(key);
    }
    return { unlocked: [...unlocked], truncated: [...truncated], usedSkillTool: false };
  }

  if (toolName === 'Bash' || toolName === 'PowerShell') {
    if (isFailedBashResponse(toolResponse)) return { unlocked: [], truncated: [], usedSkillTool: false };
    const command = commandText(toolInput);
    if (!/(?:coding-standards|standards[/\\]coding\.md)/i.test(command)) {
      return { unlocked: [], truncated: [], usedSkillTool: false };
    }
    if (typeof toolResponse?.stdout === 'string') return inspectShellOutput(command, toolResponse, { cwd, home, outputLimit });
    // Codex 的读取结果没有可核对的 stdout，只按命令文本判断。
    for (const segment of splitCommandSegments(command)) {
      const normalized = toPosix(segment);
      const docs = new Set();
      if (/(?:^|[\s"'/=])(?:[^\s"'=]*\/)?coding-standards\/SKILL\.md(?=$|[\s"'|;)])/i.test(normalized) ||
          (/(?:^|[\s"'/=])SKILL\.md(?=$|[\s"'|;)])/i.test(normalized) && /coding-standards/i.test(command))) {
        docs.add('SKILL.md');
      }
      for (const match of normalized.matchAll(/(?:languages|frameworks)\/[a-z]+\.md/gi)) {
        docs.add(match[0].toLowerCase());
      }
      if (/(?:^|[\s"'/=])(?:[^\s"'=]*\/)?\.project-memory\/standards\/coding\.md(?=$|[\s"'|;)])/i.test(normalized)) {
        docs.add('standards/coding.md');
      }
      if (!docs.size) continue;
      if (TRUNCATE_COMMAND.test(segment)) {
        for (const doc of docs) truncated.add(doc);
      } else if (READ_COMMAND.test(segment)) {
        for (const doc of docs) unlocked.add(doc);
      }
    }
    for (const doc of unlocked) truncated.delete(doc);
  }

  return { unlocked: [...unlocked], truncated: [...truncated], usedSkillTool: false };
}

/** Claude Code 用户在提问里显式调用 `/coding-standards` 斜杠命令时返回 `['SKILL.md']`。 */
export function inspectPromptInvocation(prompt) {
  return /^\s*\/(?:[a-z0-9_-]+:)?coding-standards(?:\s|$)/i.test(String(prompt ?? '')) ? ['SKILL.md'] : [];
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

function defaultState() {
  return { unlocked: [], blocked: {}, truncated: [], usedSkillTool: false, wasCompacted: false };
}

function loadState(sessionId, stateDir) {
  const file = sessionStateFile(sessionId, stateDir);
  if (!fs.existsSync(file)) return defaultState();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
      blocked: parsed.blocked && typeof parsed.blocked === 'object' ? parsed.blocked : {},
      truncated: Array.isArray(parsed.truncated) ? parsed.truncated : [],
      usedSkillTool: Boolean(parsed.usedSkillTool),
      wasCompacted: Boolean(parsed.wasCompacted)
    };
  } catch {
    return defaultState();
  }
}

function saveState(sessionId, state, stateDir, now) {
  pruneOldState(stateDir, now);
  fs.writeFileSync(sessionStateFile(sessionId, stateDir), JSON.stringify(state), 'utf8');
}

/**
 * 清除会话的规范读取状态，使该会话下一次源码写入重新检查必读规范。
 * 上下文压缩重置时，保留压缩前是否经 Skill 工具加载过正文的标记，供 Claude Code 免重读 SKILL.md。
 */
export function resetSessionGate(sessionId, stateDir = STATE_DIR, { wasCompacted = false } = {}) {
  if (!wasCompacted) {
    fs.rmSync(sessionStateFile(sessionId, stateDir), { force: true });
    return;
  }
  const prev = loadState(sessionId, stateDir);
  const unlocked = prev.usedSkillTool ? ['SKILL.md'] : [];
  saveState(
    sessionId,
    { unlocked, blocked: {}, truncated: [], usedSkillTool: prev.usedSkillTool, wasCompacted: true },
    stateDir,
    Date.now()
  );
}

/** 记录本会话的完整读取、截断读取或 Skill 加载结果，返回更新后的状态。 */
export function recordReadOutcome(
  sessionId,
  { unlocked = [], truncated = [], usedSkillTool = false },
  stateDir = STATE_DIR,
  now = Date.now()
) {
  if (!unlocked.length && !truncated.length && !usedSkillTool) return loadState(sessionId, stateDir);
  const state = loadState(sessionId, stateDir);
  for (const doc of unlocked) {
    if (!state.unlocked.includes(doc)) state.unlocked.push(doc);
    state.truncated = state.truncated.filter((item) => item !== doc);
  }
  for (const doc of truncated) {
    if (!state.unlocked.includes(doc) && !state.truncated.includes(doc)) state.truncated.push(doc);
  }
  if (usedSkillTool) state.usedSkillTool = true;
  saveState(sessionId, state, stateDir, now);
  return state;
}

function formatDocName(doc) {
  if (doc === 'SKILL.md') return 'coding-standards/SKILL.md';
  if (doc === 'standards/coding.md') return '.project-memory/standards/coding.md';
  return `references/${doc}`;
}

function formatDocGroup(group) {
  return group.map(formatDocName).join(' 或 ');
}

function hasScriptCommand(entries, marker) {
  if (!Array.isArray(entries)) return false;
  return entries.some((entry) => {
    const handlers = Array.isArray(entry?.hooks) ? entry.hooks : [entry];
    return handlers.some((handler) => typeof handler?.command === 'string' && handler.command.includes(marker));
  });
}

/**
 * 本机配置里已注册本脚本的 PreToolUse、但尚未通过 npm run upgrade 同步 PostToolUse 时返回 true。
 * 配置文件不存在或已同步 PostToolUse 时返回 false。
 */
export function isStaleHookConfig(platform, home = os.homedir()) {
  if (platform === 'codex') return false;
  const marker = 'coding-standards-hook.mjs';
  try {
    if (platform === 'claude') {
      const configFile = path.join(home, '.claude', 'settings.json');
      if (!fs.existsSync(configFile)) return false;
      const hooks = JSON.parse(fs.readFileSync(configFile, 'utf8')).hooks ?? {};
      return hasScriptCommand(hooks.PreToolUse, marker) && !hasScriptCommand(hooks.PostToolUse, marker);
    }
    if (platform === 'agy') {
      const configFile = path.join(home, '.gemini', 'config', 'hooks.json');
      if (!fs.existsSync(configFile)) return false;
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      const groups = Object.values(config).filter((item) => item && typeof item === 'object' && !Array.isArray(item));
      const hasPre = groups.some((group) => hasScriptCommand(group.PreToolUse, marker));
      const hasPost = groups.some((group) => hasScriptCommand(group.PostToolUse, marker));
      return hasPre && !hasPost;
    }
  } catch {
    return false;
  }
  return false;
}

function buildBlockMessage(missingGroups, { platform, state, isStaleConfig = false }) {
  const list = missingGroups.map(formatDocGroup).join('、');
  const needsSkill = missingGroups.some((group) => group.includes('SKILL.md'));
  const staleNote = isStaleConfig ? '（本机 Hook 配置尚未同步 PostToolUse，请运行 npm run upgrade 并重启会话以启用严格验读。）' : '';
  const footer =
    `读完后重试本次写入即可放行${staleNote}；批量改完源码、报告完成或提交前，按技能“注释自检”核对 git diff HEAD 及新建源码文件的全部注释（可按文件筛选，禁止截断）。`;

  if (platform === 'claude') {
    const howToRead =
      '用 Read（不传 offset/limit）或 Bash 的 cat 完整读取（禁止用 head、tail、sed -n、grep 等截断或筛选，单次输出超过 Bash 输出上限时分开读）';
    if (state.wasCompacted && state.usedSkillTool) {
      return `编码与注释规范门禁（coding-standards 技能）：上下文刚压缩过。通过 Skill 工具调用过的 coding-standards 正文若已重新注入上下文可免重读（找不到时先用 Skill 工具调用它）；压缩不保留细则和项目约定，必须先${howToRead} ${list}。${footer}`;
    }
    if (needsSkill) {
      return `编码与注释规范门禁（coding-standards 技能）：修改源码前尚未完整加载 ${list}。请先用 Skill 工具调用 coding-standards（或完整读取 coding-standards/SKILL.md），其余缺失文件${howToRead}。${footer}`;
    }
    return `编码与注释规范门禁（coding-standards 技能）：修改源码前尚未完整读取 ${list}。请先${howToRead}上述文件。${footer}`;
  }

  const prefix = state.wasCompacted ? '上下文刚压缩过，必须重新完整读取' : '修改源码前尚未完整读取';
  if (platform === 'agy') {
    return `编码与注释规范门禁（coding-standards 技能）：${prefix} ${list}。请先用 read_file 完整读取上述文件（不要传 StartLine/EndLine 截断）。${footer}`;
  }
  return `编码与注释规范门禁（coding-standards 技能）：${prefix} ${list}。请先用 Bash 完整读取上述文件（禁止用 head、tail、sed -n 等截断）。${footer}`;
}

function buildTruncatedReminder(truncatedDocs) {
  const list = truncatedDocs.map(formatDocName).join('、');
  return `检测到截断读取规范（${list}），门禁未解锁：用了 head、tail、sed -n 或 limit/offset 等截断方式，或者输出被筛选、编码不对、超出 Bash 输出上限而没有显示完整文件。请完整读取（多个文件输出过长时分开读，或用 Skill 工具加载 coding-standards）后再修改源码。`;
}

/**
 * 判断一次源码写入是否应被拦截。
 * Claude Code 和 Antigravity 必须由观测到的完整读取解锁；
 * Codex 无专用读文件工具，在未检测到截断读取的前提下，同一缺失组连续拦截至少 fallbackAttempts 次且间隔达到 fallbackWindowMs 后才兜底放行。
 */
export function evaluateWriteGate(
  sessionId,
  requiredGroups,
  {
    platform = 'claude',
    isStrict = platform !== 'codex',
    isStaleConfig = false,
    stateDir = STATE_DIR,
    now = Date.now(),
    fallbackAttempts = CODEX_FALLBACK_ATTEMPTS,
    fallbackWindowMs = CODEX_FALLBACK_WINDOW_MS
  } = {}
) {
  if (!requiredGroups.length) return { shouldBlock: false, missingGroups: [], message: null };
  const state = loadState(sessionId, stateDir);
  const missingGroups = requiredGroups.filter((group) => !group.some((doc) => state.unlocked.includes(doc)));
  if (!missingGroups.length) return { shouldBlock: false, missingGroups: [], message: null };

  if (isStrict) {
    return { shouldBlock: true, missingGroups, message: buildBlockMessage(missingGroups, { platform, state, isStaleConfig }) };
  }

  const stillMissing = [];
  let changed = false;
  for (const group of missingGroups) {
    const key = group.join('|');
    const hasTruncated = group.some((doc) => state.truncated.includes(doc));
    const entry = state.blocked[key];
    if (hasTruncated) {
      if (!entry) {
        state.blocked[key] = { count: 1, firstBlockedAt: now };
        changed = true;
      }
      stillMissing.push(group);
      continue;
    }
    if (!entry) {
      state.blocked[key] = { count: 1, firstBlockedAt: now };
      changed = true;
      stillMissing.push(group);
    } else if (entry.count < fallbackAttempts || now - entry.firstBlockedAt < fallbackWindowMs) {
      entry.count += 1;
      changed = true;
      stillMissing.push(group);
    } else {
      for (const doc of group) {
        if (!state.unlocked.includes(doc)) state.unlocked.push(doc);
      }
      delete state.blocked[key];
      changed = true;
    }
  }
  if (changed) saveState(sessionId, state, stateDir, now);
  if (!stillMissing.length) return { shouldBlock: false, missingGroups: [], message: null };
  return { shouldBlock: true, missingGroups: stillMissing, message: buildBlockMessage(stillMissing, { platform, state, isStaleConfig }) };
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
  // Antigravity 的输入带 conversationId：无 toolCall 时为 SessionStart，hookEventName=PostToolUse 或 read_file 为读取记账，其余写入走 PreToolUse。
  if (input.conversationId !== undefined) {
    if (input.toolCall === undefined) {
      resetSessionGate(input.conversationId);
      process.stdout.write('{}');
      return;
    }
    if (input.hookEventName === 'PostToolUse' || input.toolCall.name === 'read_file') {
      const outcome = inspectDocReads(input.toolCall.name, input.toolCall.args ?? {}, { toolError: input.error });
      recordReadOutcome(input.conversationId, outcome);
      process.stdout.write('{}');
      return;
    }
    const cwd = input.cwd ?? input.workspacePaths?.[0];
    const required = requiredDocsForWrite(input.toolCall.name, input.toolCall.args ?? {}, { cwd });
    const stale = isStaleHookConfig('agy');
    const decision = evaluateWriteGate(input.conversationId, required, { platform: 'agy', isStrict: !stale, isStaleConfig: stale });
    process.stdout.write(
      JSON.stringify(decision.shouldBlock ? { decision: 'deny', reason: decision.message } : { decision: 'allow' })
    );
    return;
  }

  const sessionId = input.session_id ?? 'unknown';
  if (input.hook_event_name === 'SessionStart') {
    resetSessionGate(sessionId, STATE_DIR, { wasCompacted: input.source === 'compact' });
    return;
  }

  if (input.hook_event_name === 'UserPromptSubmit') {
    const unlocked = inspectPromptInvocation(input.prompt);
    if (unlocked.length) recordReadOutcome(sessionId, { unlocked });
    return;
  }

  if (input.hook_event_name === 'PostToolUse') {
    const outcome = inspectDocReads(input.tool_name, input.tool_input ?? {}, { toolResponse: input.tool_response, cwd: input.cwd });
    recordReadOutcome(sessionId, outcome);
    if (outcome.truncated.length) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: buildTruncatedReminder(outcome.truncated) }
        })
      );
    }
    return;
  }

  const platform = input.tool_name === 'apply_patch' ? 'codex' : 'claude';
  const required = requiredDocsForWrite(input.tool_name, input.tool_input ?? {}, { cwd: input.cwd });
  const stale = isStaleHookConfig(platform);
  const decision = evaluateWriteGate(sessionId, required, { platform, isStrict: platform !== 'codex' && !stale, isStaleConfig: stale });
  if (!decision.shouldBlock) return;
  // 退出码 2 让 Claude Code 和 Codex 拦下这次调用，并把 stderr 交给 Agent。
  process.stderr.write(decision.message);
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // 退出码 1 不拦截工具调用，错误显示给使用者。
    process.stderr.write(`coding-standards hook: ${error.message}\n`);
    process.exitCode = 1;
  });
}
