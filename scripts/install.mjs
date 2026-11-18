#!/usr/bin/env node
// 把本仓库的技能链接到 Claude Code、Codex、Antigravity 的用户级技能目录，并把各技能的 Hook 合并进用户级配置。
// 用法：node scripts/install.mjs install|status|uninstall [--platform all|claude|codex|agy] [--dry-run]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ANTIGRAVITY_HOOK_KEY = 'lam-dev-skills';

export const PLATFORMS = {
  claude: {
    label: 'Claude Code',
    skillsDir: '.claude/skills',
    config: '.claude/settings.json',
    detect: (home) => fs.existsSync(path.join(home, '.claude'))
  },
  codex: {
    label: 'Codex',
    skillsDir: '.codex/skills',
    config: '.codex/hooks.json',
    detect: (home) => fs.existsSync(path.join(home, '.codex'))
  },
  agy: {
    label: 'Antigravity',
    skillsDir: '.gemini/config/skills',
    config: '.gemini/config/hooks.json',
    detect: (home) => fs.existsSync(path.join(home, '.gemini', 'config')) || fs.existsSync(path.join(home, '.gemini', 'antigravity'))
  }
};

const HOOK_TIMEOUT_SECONDS = 10;

function toPosix(value) {
  return value.replaceAll('\\', '/');
}

/** 列出仓库里的技能：`skills/` 下带 `SKILL.md` 的目录，连同它的 `hook-manifest.json`（没有时为 null）。 */
export function listSkills(repoRoot = REPO_ROOT) {
  const skillsRoot = path.join(repoRoot, 'skills');
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => {
      const dir = path.join(skillsRoot, entry.name);
      const manifestFile = path.join(dir, 'hook-manifest.json');
      const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
      return { name: entry.name, dir, manifest };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 选出要处理的平台。`all` 选中 home 下已有配置目录的平台；也支持逗号分隔多个平台名。
 *
 * @throws {Error} 平台名不认识时。
 */
export function selectPlatforms(value, home) {
  if (value === 'all') return Object.keys(PLATFORMS).filter((name) => PLATFORMS[name].detect(home));
  const selected = [];
  for (const name of String(value).split(',').map((item) => item.trim()).filter(Boolean)) {
    if (!PLATFORMS[name]) throw new Error(`不支持的平台：${name}，可选 all、${Object.keys(PLATFORMS).join('、')}`);
    if (!selected.includes(name)) selected.push(name);
  }
  if (!selected.length) throw new Error(`不支持的平台：${value}，可选 all、${Object.keys(PLATFORMS).join('、')}`);
  return selected;
}

function hookCommand(skill) {
  return `node "${toPosix(path.join(skill.dir, skill.manifest.script))}"`;
}

function hookHandler(platform, skill, event) {
  const command = hookCommand(skill);
  const handler = { type: 'command', command, timeout: HOOK_TIMEOUT_SECONDS };
  if (platform === 'codex') {
    // Codex 在 Windows 上用 PowerShell -Command 执行，外部程序的退出码 2 会变成 1，拦截就失效了，所以显式传回退出码。
    handler.commandWindows = `${command}; exit $LASTEXITCODE`;
    handler.statusMessage = event.statusMessage;
  }
  return handler;
}

function skillSupportsEvent(event, platform) {
  return !event.matcher || Boolean(event.matcher[platform]);
}

function skillSupportsPlatformHook(skill, platform) {
  if (!skill.manifest) return false;
  return (skill.manifest.events ?? []).some((event) => skillSupportsEvent(event, platform));
}

/** 本仓库技能的 Hook 条目：命令里的脚本路径在仓库内。 */
export function isOwnHandler(handler, repoRoot = REPO_ROOT) {
  const marker = toPosix(repoRoot).toLowerCase();
  return [handler?.command, handler?.commandWindows].some((value) => typeof value === 'string' && toPosix(value).toLowerCase().includes(marker));
}

function removeOwnAntigravityHooks(config, repoRoot) {
  const next = structuredClone(config);
  for (const [hookName, spec] of Object.entries(next)) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue;
    for (const [eventName, entries] of Object.entries(spec)) {
      if (!Array.isArray(entries)) continue;
      const cleaned = entries
        .map((entry) => {
          if (entry && Array.isArray(entry.hooks)) {
            return { ...entry, hooks: entry.hooks.filter((handler) => !isOwnHandler(handler, repoRoot)) };
          }
          return entry;
        })
        .filter((entry) => {
          if (entry && Array.isArray(entry.hooks)) return entry.hooks.length > 0;
          return !isOwnHandler(entry, repoRoot);
        });
      if (cleaned.length) spec[eventName] = cleaned;
      else delete spec[eventName];
    }
    const remainingEvents = Object.keys(spec).filter((key) => key !== 'enabled');
    if (!remainingEvents.length && (hookName === ANTIGRAVITY_HOOK_KEY || spec.enabled === undefined)) {
      delete next[hookName];
    }
  }
  return next;
}

/** 从配置里删掉本仓库的 Hook，其他 Hook 原样保留，返回新配置。 */
export function removeOwnHooks(config, repoRoot = REPO_ROOT, platform = 'claude') {
  if (platform === 'agy') return removeOwnAntigravityHooks(config, repoRoot);
  const next = structuredClone(config);
  const hooks = next.hooks ?? {};
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event]
      .map((group) => (Array.isArray(group.hooks) ? { ...group, hooks: group.hooks.filter((handler) => !isOwnHandler(handler, repoRoot)) } : group))
      .filter((group) => !Array.isArray(group.hooks) || group.hooks.length > 0);
    if (!hooks[event].length) delete hooks[event];
  }
  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

/** 先删掉本仓库已有的 Hook，再按各技能的 hook-manifest.json 加回，返回新配置。 */
export function mergeHooks(config, platform, skills, repoRoot = REPO_ROOT) {
  if (platform === 'agy') {
    const next = removeOwnAntigravityHooks(config, repoRoot);
    const spec = {};
    for (const skill of skills) {
      for (const event of skill.manifest?.events ?? []) {
        if (!skillSupportsEvent(event, platform)) continue;
        const eventName = event.platformEvent?.[platform] ?? event.event;
        const handler = hookHandler(platform, skill, event);
        if (event.matcher) {
          (spec[eventName] ??= []).push({ matcher: event.matcher[platform], hooks: [handler] });
        } else {
          (spec[eventName] ??= []).push(handler);
        }
      }
    }
    if (Object.keys(spec).length) next[ANTIGRAVITY_HOOK_KEY] = spec;
    return next;
  }
  const next = removeOwnHooks(config, repoRoot, platform);
  next.hooks ??= {};
  for (const skill of skills) {
    for (const event of skill.manifest?.events ?? []) {
      if (!skillSupportsEvent(event, platform)) continue;
      const hooks = [hookHandler(platform, skill, event)];
      (next.hooks[event.event] ??= []).push(event.matcher ? { matcher: event.matcher[platform], hooks } : { hooks });
    }
  }
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return next;
}

function readConfig(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`配置不是合法 JSON，没有改动：${file}\n${error.message}`);
  }
}

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// 内容没变时不写；文件已存在时先备份成 `<文件>.bak-<时间>`。返回是否改动。
function writeConfig(file, config, dryRun, log) {
  const current = readConfig(file);
  if (JSON.stringify(current) === JSON.stringify(config)) return false;
  if (dryRun) {
    const preview = config.hooks ?? config[ANTIGRAVITY_HOOK_KEY] ?? config;
    log(`  预览 ${file}：\n${JSON.stringify(preview, null, 2)}`);
    return true;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const backup = `${file}.bak-${timestamp()}`;
    fs.copyFileSync(file, backup);
    log(`  已备份 ${backup}`);
  }
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}

/**
 * 技能目录里的链接状态。
 *
 * @returns {'linked'|'missing'|'conflict'} conflict 表示同名路径已存在，但不是指向本仓库该技能的链接。
 */
export function linkState(link, target) {
  let stat;
  try {
    stat = fs.lstatSync(link);
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
  if (!stat.isSymbolicLink()) return 'conflict';
  try {
    return fs.realpathSync(link) === fs.realpathSync(target) ? 'linked' : 'conflict';
  } catch {
    // 链接指向的目录已经不在了，也当作冲突，交给使用者处理。
    return 'conflict';
  }
}

function skillsDir(home, platform) {
  return path.join(home, ...PLATFORMS[platform].skillsDir.split('/'));
}

function configFile(home, platform) {
  return path.join(home, ...PLATFORMS[platform].config.split('/'));
}

function collectHandlers(config, platform) {
  if (platform === 'agy') {
    const handlers = [];
    for (const spec of Object.values(config)) {
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue;
      for (const entries of Object.values(spec)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (entry && Array.isArray(entry.hooks)) handlers.push(...entry.hooks);
          else if (entry && typeof entry === 'object') handlers.push(entry);
        }
      }
    }
    return handlers;
  }
  return Object.values(config.hooks ?? {}).flat().flatMap((group) => group?.hooks ?? []);
}

/** 链接技能并合并 Hook。返回各平台是否改了 Hook 配置，以及有冲突的链接路径。 */
export function install({ home = os.homedir(), platforms, dryRun = false, repoRoot = REPO_ROOT, log = console.log }) {
  const skills = listSkills(repoRoot);
  const result = { conflicts: [], hooksChanged: {} };
  for (const platform of platforms) {
    log(`${PLATFORMS[platform].label}:`);
    for (const skill of skills) {
      const link = path.join(skillsDir(home, platform), skill.name);
      const state = linkState(link, skill.dir);
      if (state === 'linked') continue;
      if (state === 'conflict') {
        result.conflicts.push(link);
        log(`  冲突：${link} 已存在且不是本仓库的链接，没有改动。确认不再需要后删掉它，再运行 install`);
        continue;
      }
      if (!dryRun) {
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(skill.dir, link, 'junction');
      }
      log(`  ${dryRun ? '将链接' : '已链接'} ${link}`);
    }
    const file = configFile(home, platform);
    const changed = writeConfig(file, mergeHooks(readConfig(file), platform, skills, repoRoot), dryRun, log);
    result.hooksChanged[platform] = changed;
    log(`  Hook 配置${changed ? (dryRun ? '将更新' : '已更新') : '没有变化'}：${file}`);
  }
  if (result.hooksChanged.codex && !dryRun) log('\nCodex 的 Hook 改了，要在 Codex 里运行 /hooks 审阅并信任，之后才会执行。');
  return result;
}

/** 删掉指向本仓库的技能链接和本仓库的 Hook，其他内容不动。 */
export function uninstall({ home = os.homedir(), platforms, dryRun = false, repoRoot = REPO_ROOT, log = console.log }) {
  const skills = listSkills(repoRoot);
  for (const platform of platforms) {
    log(`${PLATFORMS[platform].label}:`);
    for (const skill of skills) {
      const link = path.join(skillsDir(home, platform), skill.name);
      if (linkState(link, skill.dir) !== 'linked') continue;
      if (!dryRun) fs.unlinkSync(link);
      log(`  ${dryRun ? '将删除' : '已删除'}链接 ${link}`);
    }
    const file = configFile(home, platform);
    if (!fs.existsSync(file)) continue;
    const changed = writeConfig(file, removeOwnHooks(readConfig(file), repoRoot, platform), dryRun, log);
    log(`  Hook 配置${changed ? (dryRun ? '将更新' : '已更新') : '没有本仓库的 Hook'}：${file}`);
  }
}

/** 列出各平台每个技能的链接和 Hook 状态，返回同样内容的结构化结果。 */
export function status({ home = os.homedir(), platforms, repoRoot = REPO_ROOT, log = console.log }) {
  const skills = listSkills(repoRoot);
  const result = {};
  for (const platform of platforms) {
    log(`${PLATFORMS[platform].label}:`);
    const handlers = collectHandlers(readConfig(configFile(home, platform)), platform);
    result[platform] = {};
    for (const skill of skills) {
      const link = linkState(path.join(skillsDir(home, platform), skill.name), skill.dir);
      const script = toPosix(path.join(skill.dir, skill.manifest?.script ?? '')).toLowerCase();
      let hook;
      if (!skill.manifest) hook = 'none';
      else if (!skillSupportsPlatformHook(skill, platform)) hook = 'unsupported';
      else hook = handlers.some((handler) => typeof handler.command === 'string' && toPosix(handler.command).toLowerCase().includes(script)) ? 'configured' : 'missing';
      result[platform][skill.name] = { link, hook };
      const linkText = { linked: '已链接', missing: '未链接', conflict: '冲突（同名目录不是本仓库的链接）' }[link];
      const hookText = {
        none: '无 Hook',
        unsupported: `${PLATFORMS[platform].label} 不支持这个 Hook 用的事件`,
        missing: 'Hook 未安装',
        configured: platform === 'codex' ? 'Hook 已写入配置，需在 Codex 里审阅信任' : 'Hook 已写入配置'
      }[hook];
      log(`  ${skill.name}：${linkText}；${hookText}`);
    }
  }
  return result;
}

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { platform: { type: 'string', default: 'all' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } }
  });
  const action = positionals[0];
  if (values.help || !['install', 'status', 'uninstall'].includes(action)) {
    console.log(`用法：node scripts/install.mjs install|status|uninstall [--platform all|${Object.keys(PLATFORMS).join('|')}] [--dry-run]`);
    return values.help ? 0 : 1;
  }
  const home = os.homedir();
  const platforms = selectPlatforms(values.platform, home);
  if (!platforms.length) {
    console.log('home 目录下没有 .claude、.codex 或 .gemini/config，没有可处理的平台，可用 --platform <名称> 指定。');
    return 1;
  }
  const options = { home, platforms, dryRun: values['dry-run'] };
  if (action === 'install') return install(options).conflicts.length ? 1 : 0;
  if (action === 'uninstall') uninstall(options);
  else status(options);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
