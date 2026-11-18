import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { findMemoryRoot } from './project-memory-hook.mjs';

const hookScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'project-memory-hook.mjs');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-hook-'));
  fs.mkdirSync(path.join(root, '.project-memory'));
  fs.mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
  return root;
}

function runHook(input) {
  return spawnSync(process.execPath, [hookScript], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true });
}

test('从子目录往上找到记忆目录', () => {
  const root = makeProject();
  assert.equal(findMemoryRoot(path.join(root, 'src', 'deep')), path.join(root, '.project-memory'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('会话开始注入协议，提问时注入短提醒', () => {
  const root = makeProject();
  const start = JSON.parse(runHook({ hook_event_name: 'SessionStart', cwd: path.join(root, 'src') }).stdout);
  assert.equal(start.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(start.hookSpecificOutput.additionalContext.includes(path.join(root, '.project-memory', 'INDEX.md')));
  assert.match(start.hookSpecificOutput.additionalContext, /只读/);
  const prompt = JSON.parse(runHook({ hook_event_name: 'UserPromptSubmit', cwd: root }).stdout);
  assert.equal(prompt.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  fs.rmSync(root, { recursive: true, force: true });
});

test('没有记忆目录或事件不支持时不输出', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-hook-empty-'));
  const none = runHook({ hook_event_name: 'SessionStart', cwd: empty });
  assert.equal(none.status, 0);
  assert.equal(none.stdout, '');
  const root = makeProject();
  assert.equal(runHook({ hook_event_name: 'PostToolUse', cwd: root }).stdout, '');
  fs.rmSync(empty, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
});

test('Antigravity SessionStart 和 PreInvocation 输出 injectSteps，多轮后续调用不重复注入', () => {
  const root = makeProject();
  const start = JSON.parse(runHook({ conversationId: 'c1', hookEventName: 'SessionStart', workspacePaths: [root] }).stdout);
  assert.ok(start.injectSteps[0].systemMessage.systemMessage.includes(path.join(root, '.project-memory', 'INDEX.md')));
  const firstTurn = JSON.parse(runHook({ conversationId: 'c1', hookEventName: 'PreInvocation', invocationNum: 1, cwd: root }).stdout);
  assert.match(firstTurn.injectSteps[0].systemMessage.systemMessage, /项目记忆入口/);
  const secondTurn = JSON.parse(runHook({ conversationId: 'c1', hookEventName: 'PreInvocation', invocationNum: 2, cwd: root }).stdout);
  assert.deepEqual(secondTurn, {});
  fs.rmSync(root, { recursive: true, force: true });
});
