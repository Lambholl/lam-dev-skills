import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { hasCodeWrite, isCodeFile, isFirstCodeWrite, parsePatchPaths, resetSessionGate } from './coding-standards-hook.mjs';

const hookScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'coding-standards-hook.mjs');

function runHook(input) {
  return spawnSync(process.execPath, [hookScript], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true });
}

function patch(...lines) {
  return { command: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n') };
}

test('区分源码文件与文档、数据文件', () => {
  assert.equal(isCodeFile('src/app.ts'), true);
  assert.equal(isCodeFile('Main.java'), true);
  assert.equal(isCodeFile('script.py'), true);
  assert.equal(isCodeFile('Dockerfile'), true);
  assert.equal(isCodeFile('README.md'), false);
  assert.equal(isCodeFile('package.json'), false);
  assert.equal(isCodeFile('notes.txt'), false);
  assert.equal(isCodeFile(''), false);
});

test('识别各平台工具和 Codex 补丁里的源码写入', () => {
  assert.equal(hasCodeWrite('Write', { file_path: 'src/a.ts' }), true);
  assert.equal(hasCodeWrite('Edit', { file_path: 'docs/guide.md' }), false);
  assert.equal(hasCodeWrite('write_file', { Path: 'src/a.mjs' }), true);
  assert.equal(hasCodeWrite('apply_patch', patch('*** Update File: a.ts', '@@', '+const x = 1;')), true);
  assert.equal(hasCodeWrite('apply_patch', patch('*** Add File: a.md', '+hello')), false);
  assert.equal(hasCodeWrite('apply_patch', patch('*** Update File: a.txt', '*** Move to: a.ts', '@@', '+x')), true);
  assert.deepEqual(parsePatchPaths(patch('*** Delete File: a.ts').command), []);
});

test('同一会话只拦首次源码写入，resetSessionGate 后重新生效', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-hook-'));
  try {
    assert.equal(isFirstCodeWrite('s1', stateDir), true);
    assert.equal(isFirstCodeWrite('s1', stateDir), false);
    assert.equal(isFirstCodeWrite('s2', stateDir), true);
    resetSessionGate('s1', stateDir);
    assert.equal(isFirstCodeWrite('s1', stateDir), true);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('Claude Code 首次写源码拦下，重试放行，非源码不拦，SessionStart 后重置门禁', () => {
  const sessionId = `cs-claude-${process.pid}-${Date.now()}`;
  const md = runHook({ hook_event_name: 'PreToolUse', session_id: sessionId, tool_name: 'Write', tool_input: { file_path: 'README.md' } });
  assert.equal(md.status, 0);
  assert.equal(md.stderr, '');

  const codeInput = { hook_event_name: 'PreToolUse', session_id: sessionId, tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } };
  const first = runHook(codeInput);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /编码与注释规范门禁/);

  const second = runHook(codeInput);
  assert.equal(second.status, 0);
  assert.equal(second.stderr, '');

  const compact = runHook({ hook_event_name: 'SessionStart', source: 'compact', session_id: sessionId });
  assert.equal(compact.status, 0);
  assert.equal(compact.stdout, '');

  const afterCompact = runHook(codeInput);
  assert.equal(afterCompact.status, 2);
  assert.match(afterCompact.stderr, /coding-standards/);
});

test('Antigravity 首次写源码返回 deny JSON，重试返回 allow JSON，SessionStart 后重置门禁', () => {
  const conversationId = `cs-agy-${process.pid}-${Date.now()}`;
  const docEdit = runHook({ conversationId, toolCall: { name: 'edit_file', args: { Path: 'README.md' } } });
  assert.equal(docEdit.status, 0);
  assert.deepEqual(JSON.parse(docEdit.stdout), { decision: 'allow' });

  const codeInput = { conversationId, toolCall: { name: 'edit_file', args: { Path: 'src/a.ts' } } };
  const first = runHook(codeInput);
  assert.equal(first.status, 0);
  const firstOut = JSON.parse(first.stdout);
  assert.equal(firstOut.decision, 'deny');
  assert.match(firstOut.reason, /编码与注释规范门禁/);

  const retry = runHook(codeInput);
  assert.equal(retry.status, 0);
  assert.deepEqual(JSON.parse(retry.stdout), { decision: 'allow' });

  const reset = runHook({ conversationId, workspacePaths: ['.'] });
  assert.equal(reset.status, 0);
  assert.deepEqual(JSON.parse(reset.stdout), {});

  const afterReset = runHook(codeInput);
  assert.equal(JSON.parse(afterReset.stdout).decision, 'deny');
});

test('输入不是 JSON 时报错但不拦截', () => {
  const result = spawnSync(process.execPath, [hookScript], { input: 'not json', encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /coding-standards hook:/);
});
