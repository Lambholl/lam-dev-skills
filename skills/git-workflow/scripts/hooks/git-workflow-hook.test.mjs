import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { commandText, commitIdentity, isCommitCommand, isFirstAttempt } from './git-workflow-hook.mjs';

const hookScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'git-workflow-hook.mjs');

function runHook(input) {
  return spawnSync(process.execPath, [hookScript], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true });
}

test('识别提交和 PR 命令', () => {
  assert.ok(isCommitCommand('git commit -m "feat: 标题"'));
  assert.ok(isCommitCommand('git -C "D:/my repo" commit -F msg.txt'));
  assert.ok(isCommitCommand('git --no-pager -c user.name=x commit -m x'));
  assert.ok(isCommitCommand('cd /repo && git add a.md && git commit -m x'));
  assert.ok(isCommitCommand('(cd repo; git commit -m x)'));
  assert.ok(isCommitCommand('GIT_AUTHOR_DATE=now git commit -m x'));
  assert.ok(isCommitCommand('gh pr create --title t --body b'));
  assert.ok(isCommitCommand('gh pr edit 12 --body b'));
});

test('不改信息的提交和其他命令不算', () => {
  assert.equal(isCommitCommand('git commit --amend --no-edit'), false);
  assert.equal(isCommitCommand('git status && git log'), false);
  assert.equal(isCommitCommand('git log --grep commit'), false);
  assert.equal(isCommitCommand('gh pr view 12'), false);
});

test('参数里出现 git-workflow 字样不算提交', () => {
  assert.equal(isCommitCommand("sed -i 's/`git-workflow` 各写一份/x/' docs/ledger.md"), false);
  assert.equal(isCommitCommand('ls skills/git-workflow && cat skills/git-workflow/SKILL.md'), false);
  assert.equal(isCommitCommand('echo "run git commit later"'), false);
});

test('heredoc 正文里以 git commit 开头的行不算提交', () => {
  assert.equal(isCommitCommand("cat > notes.md <<'EOF'\ngit commit -m example\nEOF"), false);
});

test('Codex 把命令写成参数数组', () => {
  assert.equal(commandText({ command: ['git', 'commit', '-m', 'x'] }), 'git commit -m x');
});

test('命令前后增减其他步骤时，提交身份不变', () => {
  const commit = "git commit -F - <<'EOF'\nfeat: 标题\n\n正文\nEOF";
  const identity = commitIdentity(commit);
  assert.equal(commitIdentity(`git add a.md && ${commit}`), identity);
  assert.equal(commitIdentity(`cd /repo && git add a.md && ${commit}\ngit status --short`), identity);
  assert.equal(commitIdentity(commit.replace(/\n/g, '\r\n')), identity);
  assert.notEqual(commitIdentity(commit.replace('正文', '改过的正文')), identity);
});

test('提交身份取自各种信息写法', () => {
  assert.equal(commitIdentity('git commit -m "feat: 标题"'), 'feat: 标题');
  assert.equal(commitIdentity("git commit -m 'feat: 标题'"), 'feat: 标题');
  assert.equal(commitIdentity('git commit -F msg.txt'), 'msg.txt');
  assert.ok(commitIdentity("git commit -F - @'\nfeat: 标题\n'@").startsWith('feat: 标题'));
  assert.equal(commitIdentity('gh pr create --title t --body b'), 't\0b');
  assert.equal(commitIdentity('git commit'), 'git commit');
});

test('同一会话里同一份信息只拦第一次，会话之间互不影响', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workflow-hook-'));
  assert.equal(isFirstAttempt('s1', 'feat: a', stateDir), true);
  assert.equal(isFirstAttempt('s1', 'feat: a', stateDir), false);
  assert.equal(isFirstAttempt('s1', 'feat: b', stateDir), true);
  assert.equal(isFirstAttempt('s2', 'feat: a', stateDir), true);
  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('首次提交被拦下，重试放行，非提交命令不输出', () => {
  const sessionId = `test-${process.pid}-${Date.now()}`;
  const input = { session_id: sessionId, tool_name: 'Bash', tool_input: { command: 'git commit -m "fix: x"' } };
  const first = runHook(input);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /提交信息自查/);
  assert.equal(runHook(input).status, 0);
  const other = runHook({ session_id: sessionId, tool_name: 'Bash', tool_input: { command: 'git status' } });
  assert.equal(other.status, 0);
  assert.equal(other.stderr, '');
});

test('输入不是 JSON 时报错但不拦截', () => {
  const result = spawnSync(process.execPath, [hookScript], { input: 'not json', encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /git-workflow hook:/);
});
