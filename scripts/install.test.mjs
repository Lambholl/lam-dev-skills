import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { REPO_ROOT, install, listSkills, selectPlatforms, status, uninstall } from './install.mjs';

const SKILLS = ['coding-standards', 'dev-writing', 'git-workflow', 'project-memory'];
const FOREIGN_HOOK = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node other-hook.mjs' }] };

function withHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lam-install-'));
  try {
    fn(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function backups(dir) {
  return fs.readdirSync(dir).filter((name) => name.includes('.bak-'));
}

const quiet = () => {};

test('仓库里有四个技能，每个都带 Hook 清单，清单里的脚本存在', () => {
  const skills = listSkills();
  assert.deepEqual(skills.map((skill) => skill.name), SKILLS);
  for (const skill of skills) assert.ok(fs.existsSync(path.join(skill.dir, skill.manifest.script)), skill.name);
});

test('all 只选家目录下已有配置目录的平台', () => {
  withHome((home) => {
    assert.deepEqual(selectPlatforms('all', home), []);
    fs.mkdirSync(path.join(home, '.claude'));
    assert.deepEqual(selectPlatforms('all', home), ['claude']);
    assert.deepEqual(selectPlatforms('codex', home), ['codex']);
    assert.throws(() => selectPlatforms('codebuddy', home), /不支持的平台/);
  });
});

test('install 链接技能、合并 Hook、保留其他配置并先备份；重复运行不再改动', () => {
  withHome((home) => {
    const claudeDir = path.join(home, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({ model: 'x', hooks: { PreToolUse: [FOREIGN_HOOK] } }));

    const result = install({ home, platforms: ['claude', 'codex'], log: quiet });
    assert.deepEqual(result, { conflicts: [], hooksChanged: { claude: true, codex: true } });
    for (const name of SKILLS) {
      assert.equal(fs.realpathSync(path.join(claudeDir, 'skills', name)), fs.realpathSync(path.join(REPO_ROOT, 'skills', name)));
      assert.ok(fs.existsSync(path.join(home, '.codex', 'skills', name, 'SKILL.md')));
    }

    const claude = readJson(path.join(claudeDir, 'settings.json'));
    assert.equal(claude.model, 'x');
    assert.deepEqual(claude.hooks.PreToolUse[0], FOREIGN_HOOK);
    assert.equal(claude.hooks.PreToolUse[1].matcher, 'Bash|PowerShell');
    assert.match(claude.hooks.PreToolUse[1].hooks[0].command, /^node ".*\/skills\/git-workflow\/scripts\/hooks\/git-workflow-hook\.mjs"$/);
    assert.deepEqual(claude.hooks.PostToolUse.map((group) => group.matcher), ['Write|Edit|MultiEdit|NotebookEdit', 'Write|Edit|MultiEdit|NotebookEdit']);
    assert.equal(claude.hooks.SessionStart[0].matcher, undefined);
    assert.equal(claude.hooks.UserPromptSubmit.length, 1);
    assert.equal(backups(claudeDir).length, 1);

    const codex = readJson(path.join(home, '.codex', 'hooks.json'));
    const codexCommit = codex.hooks.PreToolUse[0];
    assert.equal(codexCommit.matcher, 'Bash');
    assert.equal(codexCommit.hooks[0].commandWindows, `${codexCommit.hooks[0].command}; exit $LASTEXITCODE`);
    assert.equal(codexCommit.hooks[0].statusMessage, 'Checking commit message');
    assert.equal(codex.hooks.PostToolUse[0].matcher, 'apply_patch');

    assert.deepEqual(install({ home, platforms: ['claude', 'codex'], log: quiet }).hooksChanged, { claude: false, codex: false });
    assert.equal(backups(claudeDir).length, 1);
  });
});

test('同名目录已存在时报冲突，不动它', () => {
  withHome((home) => {
    const existing = path.join(home, '.claude', 'skills', 'project-memory');
    fs.mkdirSync(existing, { recursive: true });
    fs.writeFileSync(path.join(existing, 'SKILL.md'), 'old');
    const result = install({ home, platforms: ['claude'], log: quiet });
    assert.deepEqual(result.conflicts, [existing]);
    assert.equal(fs.readFileSync(path.join(existing, 'SKILL.md'), 'utf8'), 'old');
    assert.equal(status({ home, platforms: ['claude'], log: quiet }).claude['project-memory'].link, 'conflict');
  });
});

test('dry-run 不写任何文件', () => {
  withHome((home) => {
    fs.mkdirSync(path.join(home, '.claude'));
    const result = install({ home, platforms: ['claude'], dryRun: true, log: quiet });
    assert.equal(result.hooksChanged.claude, true);
    assert.deepEqual(fs.readdirSync(path.join(home, '.claude')), []);
  });
});

test('status 列出链接和 Hook，Codex 标出要审阅信任', () => {
  withHome((home) => {
    const lines = [];
    assert.deepEqual(status({ home, platforms: ['claude'], log: quiet }).claude['git-workflow'], { link: 'missing', hook: 'missing' });
    install({ home, platforms: ['claude', 'codex'], log: quiet });
    const result = status({ home, platforms: ['claude', 'codex'], log: (line) => lines.push(line) });
    for (const name of SKILLS) assert.deepEqual(result.codex[name], { link: 'linked', hook: 'configured' });
    assert.ok(lines.some((line) => line.includes('git-workflow') && line.includes('需在 Codex 里审阅信任')));
  });
});

test('uninstall 只删本仓库的链接和 Hook', () => {
  withHome((home) => {
    const claudeDir = path.join(home, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [FOREIGN_HOOK] } }));
    install({ home, platforms: ['claude'], log: quiet });
    fs.mkdirSync(path.join(claudeDir, 'skills', 'other'));
    uninstall({ home, platforms: ['claude'], log: quiet });
    assert.deepEqual(fs.readdirSync(path.join(claudeDir, 'skills')), ['other']);
    assert.deepEqual(readJson(path.join(claudeDir, 'settings.json')), { hooks: { PreToolUse: [FOREIGN_HOOK] } });
    for (const name of SKILLS) assert.ok(fs.existsSync(path.join(REPO_ROOT, 'skills', name, 'SKILL.md')));
  });
});
